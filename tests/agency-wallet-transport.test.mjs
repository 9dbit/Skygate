import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync, fork} from 'node:child_process';
import {once} from 'node:events';
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

const secret = 'synthetic-fixture-secret-not-a-live-credential-0000';
const keyId = 'synthetic-fixture-engine', audience = 'synthetic-core-deployment';
let directory, cert, trusted, untrusted, origins, socketSequence = 0, redirectRequests = 0;
const state = new Map(), nonces = new Set(), sockets = new Set(), liveTimers = new Set();
function record(label) {
  if (!state.has(label)) state.set(label, {requests: 0, active: 0, max_active: 0,
    redirect_requests: 0, nonces: new Set(), debits: 0, balance: 1000, committed: new Set()});
  return state.get(label);
}
function certificate(name) {
  const key = join(directory, name + '.key'), crt = join(directory, name + '.crt');
  const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-days', '1', '-keyout', key, '-out', crt, '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost'], {encoding: 'utf8'});
  assert.equal(result.status, 0, 'Could not generate synthetic test certificate');
  return {key: readFileSync(key), cert: readFileSync(crt), path: crt};
}
async function serve(credentials) {
  const server = https.createServer(credentials, async (req, res) => {
    if (req.url === '/redirect-target') { redirectRequests++; res.writeHead(200); res.end('{}'); return; }
    let bytes = ''; for await (const part of req) bytes += part;
    let payload; try { payload = JSON.parse(bytes); } catch { res.writeHead(400); res.end(); return; }
    const observed = record(payload.case || 'unknown'); observed.requests++;
    const h = req.headers, nonce = h['x-agency-nonce'], version = h['x-agency-version'] || '1';
    const prefix = version === '2' ? ['agency.v2', h['x-agency-environment'], h['x-agency-audience']] : ['agency.v1'];
    const expected = createHmac('sha256', secret).update([...prefix, 'POST', req.url,
      h['x-agency-timestamp'], nonce, createHash('sha256').update(bytes).digest('hex')].join('\n')).digest('hex');
    const supplied = String(h['x-agency-signature'] || '');
    if (req.method !== 'POST' || h['x-agency-key'] !== keyId ||
      version === '2' && (h['x-agency-environment'] !== 'preproduction' || h['x-agency-audience'] !== audience) ||
      version === '1' && (h['x-agency-environment'] || h['x-agency-audience']) ||
      supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) || nonces.has(nonce)) {
      res.writeHead(401, {'Content-Type': 'application/json'}); res.end('{"code":"BAD_FIXTURE_SIGNATURE"}'); return;
    }
    nonces.add(nonce); observed.nonces.add(nonce); observed.active++;
    observed.max_active = Math.max(observed.max_active, observed.active);
    let ended = false, timer;
    const finish = () => { if (ended) return; ended = true; observed.active--;
      if (timer) { clearTimeout(timer); clearInterval(timer); liveTimers.delete(timer); } };
    res.once('finish', finish); res.once('close', finish);
    // Count unfinished handler work, not delayed ServerResponse 'finish' events:
    // the client can receive a complete TLS record before that event runs here.
    const respond = extra => { finish(); res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true, socket_id: req.socket.fixtureId, request_nonce: nonce,
        signature_version: version, ...extra})); };
    if (payload.scenario === 'delay') {
      timer = setTimeout(() => respond(), payload.delay_ms); liveTimers.add(timer); return;
    }
    if (payload.scenario === 'http-error') { res.writeHead(409, {'Content-Type': 'application/json'}); res.end('{"code":"EXPECTED_CONFLICT"}'); return; }
    if (payload.scenario === 'redirect') { res.writeHead(302, {'Location': origins.trusted + '/redirect-target'}); res.end('{}'); return; }
    if (payload.scenario === 'invalid-json') { res.writeHead(200); res.end('{invalid'); return; }
    if (payload.scenario === 'oversized-content-length') { res.writeHead(200, {'Content-Length': 1048577}); res.write('x'); return; }
    if (payload.scenario === 'oversized-chunked') { res.writeHead(200); res.end(JSON.stringify({value: 'x'.repeat(1048576)})); return; }
    if (payload.scenario === 'partial-body') { res.writeHead(200, {'Content-Length': 128}); res.write('{');
      timer = setTimeout(() => req.socket.destroy(), 20); liveTimers.add(timer); return; }
    if (payload.scenario === 'slow-body') {
      res.writeHead(200, {'Content-Type': 'application/json'}); res.write('{');
      timer = setInterval(() => res.write(' '), 25); liveTimers.add(timer); return;
    }
    if (payload.scenario === 'slow-header-bytes') {
      req.socket.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Slow: ');
      timer = setInterval(() => req.socket.write('x'), 25); liveTimers.add(timer); return;
    }
    if (payload.scenario === 'commit-disconnect') {
      if (!observed.committed.has(payload.round_ref)) {
        observed.committed.add(payload.round_ref); observed.debits++; observed.balance -= Number(payload.stake);
        req.socket.destroy(); return;
      }
      respond({balance: observed.balance, debits: observed.debits}); return;
    }
    respond();
  });
  server.on('connection', socket => { sockets.add(socket); socket.setNoDelay(true); socket.once('close', () => sockets.delete(socket)); });
  server.on('secureConnection', socket => { socket.fixtureId = ++socketSequence; });
  server.on('tlsClientError', () => {});
  server.keepAliveTimeout = 5000;
  server.listen({port: 0, host: '127.0.0.1', backlog: 1024}); await once(server, 'listening');
  return server;
}
before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'skygate-agency-tls-'));
  const good = certificate('trusted'), bad = certificate('untrusted'); cert = good.path;
  trusted = await serve(good); untrusted = await serve(bad);
  origins = {trusted: `https://localhost:${trusted.address().port}`, untrusted: `https://localhost:${untrusted.address().port}`};
});
after(async () => {
  for (const timer of liveTimers) { clearTimeout(timer); clearInterval(timer); }
  for (const socket of sockets) socket.destroy();
  await Promise.all([trusted, untrusted].filter(Boolean).map(server => new Promise(resolve => server.close(resolve))));
  if (directory) rmSync(directory, {recursive: true, force: true});
});
async function run(mode) {
  const child = fork(new URL('./helpers/agency-transport-client.mjs', import.meta.url),
    [mode, JSON.stringify(origins)], {env: {...process.env, NODE_EXTRA_CA_CERTS: cert}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  child.on('message', message => {
    if (message.inspect) {
      const r = record(message.inspect);
      child.send({inspection: {...r, redirect_requests: redirectRequests, nonces: r.nonces.size, committed: r.committed.size}});
    }
  });
  const timer = setTimeout(() => child.kill(), 20000);
  const [code] = await once(child, 'exit'); clearTimeout(timer);
  assert.equal(code, 0, stderr); return JSON.parse(stdout.trim());
}

test('actual default TLS path preserves signatures, trust, scope, response limits and safe reuse', async () => {
  const result = await run('contracts'); assert.equal(result.checks.length, 11);
});
test('333 concurrent callbacks use bounded sockets and observed DNS/TCP/TLS timing', async t => {
  const result = await run('concurrency');
  t.diagnostic(JSON.stringify({classification: result.classification, measurements: result.measurements}));
});
test('queue deadlines expire before admission and bounded backpressure releases every slot', async () => { await run('queuedDeadline'); });
test('header drips and delayed DNS share the deadline; close releases active and queued work', async () => { await run('headerDNSAndClose'); });
test('four DNS-timeout waves retain at most 64 admissions until callbacks retire and never send expired work', async t => {
  const result = await run('repeatedDNSTimeouts'); t.diagnostic(JSON.stringify(result));
});
test('closing and reopening an origin cannot evade admissions held by unresolved DNS', async () => { await run('closeDuringDNS'); });
test('the production 12-second deadline interrupts a continuously dripping body', {timeout: 18000}, async () => { await run('wholeBodyDeadline'); });
test('committed disconnect is never retried automatically; explicit fresh-nonce retry charges once', async () => { await run('disconnect'); });
