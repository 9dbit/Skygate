import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const authorization = 'Basic ' + Buffer.from('qa:test-only-do-not-use').toString('base64');

async function start(t, overrides = {}) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: '0', NODE_ENV: 'production',
      SKYGATE_STUDIO_USER: 'qa', SKYGATE_STUDIO_PASSWORD: 'test-only-do-not-use',
      SKYGATE_STUDIO_REQUIRE_AUTH: 'true', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on (\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
}

// Raw HTTP preserves encoded dot segments instead of normalizing them in a client.
function get(port, path, { method = 'GET', auth } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method,
      headers: auth ? { authorization: auth } : {}, timeout: 4000 }, res => {
      const chunks = [];
      res.on('data', data => chunks.push(data));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}

test('protected Studio uses the resolved path for authentication', async t => {
  const port = await start(t);
  const routes = [
    '/', '/studio', '/studio/', '/studio/project.json',
    '/studio/assets/audio/manifest.json',
    '/play/..%2fstudio/project.json',
    '/play/%2e%2e%2fstudio/project.json',
    '/play/%2e%2e%2fstudio%2fassets%2faudio%2fmanifest.json',
    '/%2fstudio/project.json', '/play/..%2f',
  ];
  for (const path of routes) await t.test(`requires auth: ${path}`, async () => {
    const response = await get(port, path);
    assert.equal(response.status, 401);
    assert.match(response.headers['www-authenticate'], /^Basic /);
    assert.equal(response.headers['cache-control'], 'no-store');
  });
  await t.test('wrong or malformed credentials remain rejected', async () => {
    for (const auth of ['Bearer invalid', 'Basic invalid',
      'Basic ' + Buffer.from('qa:wrong-password').toString('base64'),
      'Basic ' + Buffer.from('other:test-only-do-not-use').toString('base64')]) {
      assert.equal((await get(port, '/studio/', { auth })).status, 401);
    }
  });
  await t.test('authorized editor, assets and encoded paths load without cache', async () => {
    for (const path of ['/studio/', '/studio/studio.js', '/studio/assets/audio/manifest.json',
      '/play/..%2fstudio/project.json']) {
      const res = await get(port, path, { auth: authorization });
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'private, no-store');
      assert.match(res.headers['x-robots-tag'], /noindex/);
    }
  });
  await t.test('root and app redirects preserve relative asset paths', async () => {
    for (const [path, target] of [['/', '/studio/'], ['/studio', '/studio/'], ['/play', '/play/']]) {
      const res = await get(port, path, { auth: authorization });
      assert.equal(res.status, 308);
      assert.equal(res.headers.location, target);
    }
  });
  await t.test('public play and health stay available, including HEAD', async () => {
    const health = await get(port, '/health');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).version, '0.5.0');
    assert.equal((await get(port, '/play/')).status, 200);
    for (const path of ['/play/game.js', '/play/assets/symbols/ruby.png', '/play/assets/audio/bgm_celestial_loop.mp3', '/play/assets/scene/hero_composite_reference.jpg']) assert.equal((await get(port, path)).status, 200, path);
    assert.equal((await get(port, '/play/assets/project.json')).status, 404);
    for (const path of ['/health', '/play/', '/studio/']) {
      const res = await get(port, path, { method: 'HEAD', auth: authorization });
      assert.equal(res.status, 200);
      assert.equal(res.body, '');
    }
    assert.equal((await get(port, '/studio/', { method: 'HEAD' })).status, 401);
  });
  await t.test('repository files and traversal targets are not served', async () => {
    for (const path of ['/package.json', '/README.md', '/railway.json',
      '/play/..%2fpackage.json', '/studio/..%2fpackage.json', '/studio/.env',
      '/play/.git/config', '/play/%252e%252e%252fstudio/project.json']) {
      assert.equal((await get(port, path, { auth: authorization })).status, 404, path);
    }
  });
  await t.test('malformed paths and unsupported methods fail cleanly', async () => {
    for (const path of ['/studio/%ZZ', '/studio/%00', '/play/..%5cstudio/project.json']) {
      assert.equal((await get(port, path)).status, 400);
    }
    for (const path of ['/health', '/play/', '/studio/']) {
      const res = await get(port, path, { method: 'POST', auth: authorization });
      assert.equal(res.status, 405);
      assert.equal(res.headers.allow, 'GET, HEAD');
    }
  });
});

test('missing required password fails closed for canonical and encoded Studio routes', async t => {
  const port = await start(t, { SKYGATE_STUDIO_PASSWORD: '' });
  for (const path of ['/', '/studio/', '/play/..%2fstudio/project.json']) {
    assert.equal((await get(port, path)).status, 503);
  }
  for (const path of ['/health', '/play/']) assert.equal((await get(port, path)).status, 200);
});

test('unconfigured local development still loads Studio', async t => {
  const port = await start(t, { NODE_ENV: 'development', SKYGATE_STUDIO_PASSWORD: '',
    SKYGATE_STUDIO_REQUIRE_AUTH: '' });
  assert.equal((await get(port, '/studio/')).status, 200);
});
