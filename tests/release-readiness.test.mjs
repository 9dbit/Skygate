import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReleaseStore } from '../release-store.mjs';
import { createReadinessProbe } from '../release-readiness.mjs';

const repository = new URL('../', import.meta.url);
const project = JSON.parse(await readFile(new URL('studio/project.json', repository), 'utf8'));
const png = { mime: 'image/png', data: (await readFile(new URL('studio/assets/symbols/ruby.png', repository))).toString('base64') };

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'sky-ready-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createReleaseStore(directory);
  const { id } = await store.stage({ project, overrides: { 'asset:symbols/ruby.png': png } });
  await store.activate({ id, expectedActive: null });
  const root = join(directory, 'skygate-releases'), doc = await store.live();
  return { directory, root, store, id, index: join(root, 'index.json'), snapshot: join(root, `${id}.json`),
    media: join(root, 'media', doc.overrides['asset:symbols/ruby.png'].file) };
}

test('readiness accepts an intact published release and intentional bundled mode', async t => {
  const f = await fixture(t);
  await f.store.readiness();
  await f.store.activate({ expectedActive: f.id }, true);
  await f.store.readiness();
  await createReleaseStore(null).readiness();
  await createReleaseStore(join(f.directory, 'new-store')).readiness();
});

test('readiness rejects missing/corrupt indexes and inconsistent active release pointers', async t => {
  for (const [name, mutate] of [
    ['lost index', f => rm(f.index)],
    ['malformed JSON', f => writeFile(f.index, '{')],
    ['invalid active id', f => writeFile(f.index, JSON.stringify({ active: '../../secret', revisions: [] }))],
    ['unpublished active revision', async f => { const index = JSON.parse(await readFile(f.index)); index.revisions[0].published = false; await writeFile(f.index, JSON.stringify(index)); }],
    ['missing active snapshot', f => rm(f.snapshot)],
    ['invalid project', async f => { const doc = JSON.parse(await readFile(f.snapshot)); doc.project.virtualCreditsOnly = false; await writeFile(f.snapshot, JSON.stringify(doc)); }],
  ]) await t.test(name, async t => { const f = await fixture(t); await mutate(f); await assert.rejects(f.store.readiness()); });
});

test('readiness really reads protected index and media instead of relying on stat', { skip: process.getuid?.() === 0 }, async t => {
  const f = await fixture(t);
  for (const path of [f.index, f.snapshot, f.media]) {
    await chmod(path, 0o000);
    try { await assert.rejects(f.store.readiness(), error => error.code === 'EACCES'); }
    finally { await chmod(path, 0o600); }
    await f.store.readiness();
  }
});

test('missing or empty published media makes the release unready', async t => {
  const f = await fixture(t);
  await writeFile(f.media, '');
  await assert.rejects(f.store.readiness(), /media is unavailable/);
  await rm(f.media);
  await assert.rejects(f.store.readiness(), error => error.code === 'ENOENT');
});

test('public readiness catches absent script/CSS/art dependencies as well as release failures', async t => {
  const f = await fixture(t), play = join(f.directory, 'play');
  await cp(new URL('play/', repository), play, { recursive: true });
  const probe = createReadinessProbe({ releases: f.store, playDirectory: play, maxAgeMs: 0 });
  await probe();
  const css = await readFile(join(play, 'game.css'));
  await rm(join(play, 'game.css'));
  await assert.rejects(probe(), error => error.code === 'ENOENT');
  await writeFile(join(play, 'game.css'), css);
  await probe();
  await rm(f.media);
  await assert.rejects(probe(), error => error.code === 'ENOENT');
});

test('HTTP readiness returns 503 without private details while liveness and Studio protection remain intact', async t => {
  const f = await fixture(t);
  await rm(f.media);
  const child = spawn(process.execPath, ['server.mjs'], { cwd: repository, env: {
    PATH: process.env.PATH, NODE_ENV: 'production', PORT: '0', AGENCY_WALLET_MODE: '', GAMEOPS_BRIDGE_ENABLED: '',
    SKYGATE_RELEASE_DIR: f.directory, SKYGATE_STUDIO_USER: 'qa', SKYGATE_STUDIO_PASSWORD: 'qa-readiness-only',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } });
  const port = await new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => reject(Error('Readiness server did not start: ' + stderr)), 5000);
    child.stderr.on('data', bytes => stderr += bytes);
    child.stdout.on('data', bytes => { stdout += bytes; const match = stdout.match(/listening on (\d+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(Error('Readiness server exited: ' + code)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(base + '/health');
  assert.equal(health.status, 503);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const body = await health.json();
  assert.deepEqual(Object.keys(body).sort(), ['ok', 'service', 'version']);
  assert.equal(body.ok, false);
  assert.equal((await fetch(base + '/livez')).status, 200);
  assert.equal((await fetch(base + '/studio/')).status, 401);
  const head = await fetch(base + '/health', { method: 'HEAD' });
  assert.equal(head.status, 503); assert.equal(await head.text(), '');
  await writeFile(f.media, Buffer.from(png.data, 'base64'), { mode: 0o600 });
  // Bounded result caching must recover without a process restart.
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await fetch(base + '/health')).status, 200);
});
