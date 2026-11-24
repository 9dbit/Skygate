import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReleaseOwnership } from '../release-storage.mjs';

// Run separately under sudo in CI. This reproduces the actual root-owned 0600
// archive left by an older deployment, then reads it with the app's UID 1000.
test('root-owned release archive survives backup/migration and is readable after UID/GID drop', { skip: process.getuid?.() !== 0 }, t => {
  const mount = mkdtempSync(join(tmpdir(), 'sky-root-owned-')); chmodSync(mount, 0o755);
  t.after(() => rmSync(mount, { recursive: true, force: true }));
  const store = join(mount, 'skygate-releases'); mkdirSync(join(store, 'media'), { recursive: true, mode: 0o700 }); chmodSync(store, 0o700);
  const index = join(store, 'index.json'), snapshot = join(store, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json');
  const mediaBytes = Buffer.from('root-owned published media'), name = createHash('sha256').update(mediaBytes).digest('hex') + '.png';
  const media = join(store, 'media', name);
  writeFileSync(index, '{"active":"fixture"}', { mode: 0o600 });
  writeFileSync(snapshot, '{"fixture":true}', { mode: 0o600 });
  writeFileSync(media, mediaBytes, { mode: 0o600 });
  const reader = `const fs=require('node:fs');try{for(const p of process.argv.slice(1))fs.readFileSync(p);process.stdout.write('readable');}catch(e){process.stdout.write(e.code);process.exitCode=1;}`;
  const before = spawnSync(process.execPath, ['-e', reader, index, snapshot, media], { uid: 1000, gid: 1000, encoding: 'utf8' });
  assert.equal(before.status, 1); assert.equal(before.stdout, 'EACCES');
  const result = prepareReleaseOwnership(mount);
  assert.deepEqual(result.previousOwners, ['0:0']);
  assert.equal(result.changed, 5);
  for (const path of [store, join(store, 'media'), index, snapshot, media]) { const st = statSync(path); assert.equal(st.uid, 1000); assert.equal(st.gid, 1000); }
  const after = spawnSync(process.execPath, ['-e', reader, index, snapshot, media], { uid: 1000, gid: 1000, encoding: 'utf8' });
  assert.equal(after.status, 0); assert.equal(after.stdout, 'readable');
  const backup = join(mount, 'skygate-release-migrations', result.backup);
  assert.equal(statSync(backup).uid, 0);
  assert.equal(statSync(backup).mode & 0o777, 0o700);
  assert.deepEqual(readFileSync(join(backup, 'index.json')), readFileSync(index));
  assert.deepEqual(readFileSync(media), mediaBytes);
  assert.equal(prepareReleaseOwnership(mount).changed, 0);
});
