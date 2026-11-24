import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReleaseOwnership } from '../release-storage.mjs';

const uid = process.getuid(), gid = process.getgid();
const snapshot = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const mount = mkdtempSync(join(tmpdir(), 'sky-ownership-'));
  t.after(() => rmSync(mount, { recursive: true, force: true }));
  const root = join(mount, 'skygate-releases');
  mkdirSync(join(root, 'media'), { recursive: true, mode: 0o755 }); chmodSync(root, 0o755);
  writeFileSync(join(root, 'index.json'), '{"active":null,"previous":null,"revisions":[]}');
  writeFileSync(join(root, snapshot), '{"fixture":"snapshot bytes must remain exact"}');
  const bytes = Buffer.from('fixture media bytes'), media = `${hash(bytes)}.png`;
  writeFileSync(join(root, 'media', media), bytes);
  for (const path of [join(root, 'index.json'), join(root, snapshot), join(root, 'media', media)]) chmodSync(path, 0o644);
  return { mount, root, media, bytes };
}

test('ownership preparation saves original bytes/modes/hashes, repairs only the release store and is idempotent', t => {
  const f = fixture(t), unrelated = join(f.mount, 'unrelated-wallet.json');
  writeFileSync(unrelated, 'must not change', { mode: 0o640 });
  const before = readFileSync(join(f.root, 'index.json'));
  const result = prepareReleaseOwnership(f.mount, { uid, gid });
  assert.equal(result.changed, 5); assert.equal(result.files, 3);
  assert.deepEqual(readFileSync(join(f.root, 'index.json')), before);
  assert.deepEqual(readFileSync(join(f.root, 'media', f.media)), f.bytes);
  const backup = join(f.mount, 'skygate-release-migrations', result.backup);
  assert.deepEqual(readFileSync(join(backup, 'index.json')), before);
  assert.deepEqual(readFileSync(join(backup, snapshot)), readFileSync(join(f.root, snapshot)));
  const manifestBytes = readFileSync(join(backup, 'manifest.json'));
  assert.equal(hash(manifestBytes), result.manifestSha256);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.entries.find(e => e.path === 'index.json').mode, 0o644);
  assert.equal(manifest.entries.find(e => e.path === `media/${f.media}`).sha256, hash(f.bytes));
  assert.equal(statSync(f.root).mode & 0o777, 0o700);
  assert.equal(statSync(join(f.root, 'media')).mode & 0o777, 0o700);
  assert.equal(statSync(join(f.root, 'index.json')).mode & 0o777, 0o600);
  assert.equal(statSync(unrelated).mode & 0o777, 0o640);
  assert.equal(readFileSync(unrelated, 'utf8'), 'must not change');
  assert.deepEqual(prepareReleaseOwnership(f.mount, { uid, gid }), { changed: 0, files: 3 });
  assert.equal(readdirSync(join(f.mount, 'skygate-release-migrations')).length, 1);
});

test('unsafe symlinks, hardlinks and unexpected entry types fail before any migration', async t => {
  for (const kind of ['symlink', 'hardlink', 'directory', 'unknown']) await t.test(kind, t => {
    const f = fixture(t), external = join(f.mount, 'external');
    writeFileSync(external, 'outside release store', { mode: 0o640 });
    const target = join(f.root, 'index.json'); rmSync(target);
    if (kind === 'symlink') symlinkSync(external, target);
    if (kind === 'hardlink') linkSync(external, target);
    if (kind === 'directory') mkdirSync(target);
    if (kind === 'unknown') { writeFileSync(target, '{}'); mkdirSync(join(f.root, 'unexpected-subtree')); }
    assert.throws(() => prepareReleaseOwnership(f.mount, { uid, gid }), /Unsafe|Unexpected/);
    assert.equal(statSync(f.root).mode & 0o777, 0o755);
    assert.equal(statSync(external).mode & 0o777, 0o640);
    assert.equal(readFileSync(external, 'utf8'), 'outside release store');
    assert.equal(readdirSync(f.mount).includes('skygate-release-migrations'), false);
  });
});

test('migration refuses an unsafe backup location before changing store permissions', t => {
  const f = fixture(t), outside = join(f.mount, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(f.mount, 'skygate-release-migrations'));
  assert.throws(() => prepareReleaseOwnership(f.mount, { uid, gid }), /Unsafe/);
  assert.equal(statSync(f.root).mode & 0o777, 0o755);
  assert.equal(statSync(join(f.root, 'index.json')).mode & 0o777, 0o644);
});

test('incomplete atomic files also count toward the bounded scan', t => {
  const f = fixture(t);
  for (let i = 0; i < 4096; i++) writeFileSync(join(f.root, `index.json.${randomUUID()}.tmp`), '');
  assert.throws(() => prepareReleaseOwnership(f.mount, { uid, gid }), /entry bounds/);
  assert.equal(statSync(f.root).mode & 0o777, 0o755);
  assert.equal(readdirSync(f.mount).includes('skygate-release-migrations'), false);
});
