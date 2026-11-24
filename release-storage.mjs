import {
  constants, closeSync, fchmodSync, fchownSync, fstatSync, fsyncSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

const snapshotName = /^(?:index|[a-f0-9-]{36})\.json$/;
const mediaName = /^[a-f0-9]{64}\.(?:png|webp|mp3|ogg|wav)$/;
const maxFiles = 4096;
const maxBytes = 400 * 1024 * 1024;
const maxJsonBytes = 4 * 1024 * 1024;
const mode = st => st.mode & 0o7777;
const identity = st => `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}`;

function inspect(path, directory) {
  const st = lstatSync(path);
  if (st.isSymbolicLink() || (directory ? !st.isDirectory() : !st.isFile() || st.nlink !== 1)) {
    throw Error('Unsafe release storage entry');
  }
  return st;
}

function opened(path, expected, directory, callback) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW |
    (directory ? constants.O_DIRECTORY : 0));
  try {
    const st = fstatSync(fd);
    if (identity(st) !== identity(expected) ||
        (directory ? !st.isDirectory() : !st.isFile() || st.nlink !== 1)) {
      throw Error('Release storage changed during ownership preparation');
    }
    return callback(fd);
  } finally { closeSync(fd); }
}

function hashFile(fd) {
  const hash = createHash('sha256'), chunk = Buffer.alloc(128 * 1024);
  let position = 0, count;
  while ((count = readSync(fd, chunk, 0, chunk.length, position)) > 0) {
    position += count;
    hash.update(chunk.subarray(0, count));
  }
  return hash.digest('hex');
}

function durableWrite(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

// Called only during the existing privileged startup, before serving requests.
// It migrates the fixed release store, never arbitrary descendants of /data.
// JSON content and original file metadata/hashes are durably saved first; media
// bytes remain in place, avoiding a second copy of a potentially 350 MB archive.
export function prepareReleaseOwnership(mountDirectory, { uid = 1000, gid = 1000 } = {}) {
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(gid) || gid < 1) {
    throw Error('Invalid release storage owner');
  }
  const mount = resolve(mountDirectory), root = join(mount, 'skygate-releases');
  inspect(mount, true);
  let rootInfo;
  try { rootInfo = inspect(root, true); }
  catch (error) { if (error.code === 'ENOENT') return { changed: 0, files: 0 }; throw error; }
  const entries = [{ path: '.', fullPath: root, directory: true, info: rootInfo }];
  let bytes = 0, files = 0, entriesSeen = 0;
  function names(path) {
    const values = readdirSync(path);
    entriesSeen += values.length;
    if (entriesSeen > maxFiles) throw Error('Release storage exceeds migration entry bounds');
    return values.sort();
  }
  for (const name of names(root)) {
    const fullPath = join(root, name);
    if (name === 'media') {
      const info = inspect(fullPath, true);
      entries.push({ path: name, fullPath, directory: true, info });
      for (const file of names(fullPath)) {
        if (!mediaName.test(file)) throw Error('Unexpected release media entry');
        addFile(join(fullPath, file), `media/${file}`, false);
      }
    } else {
      // Incomplete atomic writes are not live files and are left untouched.
      if (/^(?:index|[a-f0-9-]{36})\.json\.[a-f0-9-]{36}\.tmp$/.test(name)) {
        inspect(fullPath, false);
        continue;
      }
      if (!snapshotName.test(name)) throw Error('Unexpected release storage entry');
      addFile(fullPath, name, true);
    }
  }
  function addFile(fullPath, path, json) {
    const info = inspect(fullPath, false);
    bytes += info.size;
    if (++files > maxFiles || bytes > maxBytes || (json && info.size > maxJsonBytes)) {
      throw Error('Release storage exceeds migration bounds');
    }
    entries.push({ path, fullPath, directory: false, json, info });
  }
  const changes = entries.filter(entry => entry.info.uid !== uid || entry.info.gid !== gid ||
    mode(entry.info) !== (entry.directory ? 0o700 : 0o600));
  if (!changes.length) return { changed: 0, files };

  // Preflight every file before creating a backup or changing any ownership.
  for (const entry of entries) {
    if (!entry.directory) opened(entry.fullPath, entry.info, false, fd => {
      entry.sha256 = hashFile(fd);
      if (entry.json) entry.content = readFileSync(fd);
    });
  }
  const backupRoot = join(mount, 'skygate-release-migrations');
  try { mkdirSync(backupRoot, { mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const backupInfo = inspect(backupRoot, true);
  if (backupInfo.uid !== process.getuid() || mode(backupInfo) !== 0o700) {
    throw Error('Unsafe release migration backup directory');
  }
  const id = randomUUID(), backupDirectory = join(backupRoot, id);
  mkdirSync(backupDirectory, { mode: 0o700 });
  const manifest = Buffer.from(JSON.stringify({
    schema: 'skygate-release-ownership-v1', createdAt: new Date().toISOString(),
    target: { uid, gid }, store: 'skygate-releases',
    entries: entries.map(entry => ({ path: entry.path, type: entry.directory ? 'directory' : 'file',
      uid: entry.info.uid, gid: entry.info.gid, mode: mode(entry.info),
      size: entry.info.size, ...(entry.sha256 ? { sha256: entry.sha256 } : {}) })),
  }, null, 2));
  for (const entry of entries.filter(entry => entry.json)) durableWrite(join(backupDirectory, entry.path), entry.content);
  durableWrite(join(backupDirectory, 'manifest.json'), manifest);
  syncDirectory(backupDirectory); syncDirectory(backupRoot); syncDirectory(mount);

  // Validate the complete plan again after the backup, before applying it.
  for (const entry of entries) {
    const current = inspect(entry.fullPath, entry.directory);
    if (identity(current) !== identity(entry.info) || current.uid !== entry.info.uid ||
        current.gid !== entry.info.gid || mode(current) !== mode(entry.info)) {
      throw Error('Release storage changed during ownership backup');
    }
  }
  for (const entry of changes) opened(entry.fullPath, entry.info, entry.directory, fd => {
    fchownSync(fd, uid, gid);
    fchmodSync(fd, entry.directory ? 0o700 : 0o600);
    fsyncSync(fd);
  });
  durableWrite(join(backupDirectory, 'completed.json'), JSON.stringify({ completedAt: new Date().toISOString(), changed: changes.length }));
  syncDirectory(backupDirectory);
  return { changed: changes.length, files, backup: id,
    manifestSha256: createHash('sha256').update(manifest).digest('hex'),
    previousOwners: [...new Set(entries.map(entry => `${entry.info.uid}:${entry.info.gid}`))] };
}
