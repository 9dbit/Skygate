import assert from 'node:assert/strict';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import {once} from 'node:events';
import wallet from '../../agency-wallet.cjs';
import transport from '../../agency-transport.cjs';

const [mode, encoded] = process.argv.slice(2), origins = JSON.parse(encoded);
const secret = 'synthetic-fixture-secret-not-a-live-credential-0000';
const keyId = 'synthetic-fixture-engine', audience = 'synthetic-core-deployment';
const options = {origin: origins.trusted, keyId, secret, audience, environment: 'preproduction'};
const path = '/api/v4/agency-game/status';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function signed(body, action = 'status') {
  const timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(16).toString('hex');
  const endpoint = '/api/v4/agency-game/' + action;
  const signature = createHmac('sha256', secret).update(['agency.v2', 'preproduction', audience,
    'POST', endpoint, timestamp, nonce, createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
  return {'Content-Type': 'application/json', 'X-Agency-Key': keyId, 'X-Agency-Timestamp': timestamp,
    'X-Agency-Nonce': nonce, 'X-Agency-Signature': signature, 'X-Agency-Version': '2',
    'X-Agency-Environment': 'preproduction', 'X-Agency-Audience': audience};
}
async function inspect(label) {
  process.send({inspect: label});
  const [message] = await once(process, 'message');
  return message.inspection;
}
async function post(pool, payload) {
  const body = JSON.stringify(payload);
  return pool.post(path, body, signed(body));
}
function clean(metrics) {
  assert.equal(metrics.counts.inflight, 0); assert.equal(metrics.counts.pending, 0);
  assert.equal(metrics.counts.retiring, 0); assert.equal(metrics.counts.dns_inflight, 0);
  const encoded = JSON.stringify(metrics);
  for (const forbidden of [origins.trusted, secret, keyId, audience, 'private-payload-marker',
    'session_id', 'X-Agency-', 'localhost', '127.0.0.1']) assert.ok(!encoded.includes(forbidden), forbidden);
  assert.ok(encoded.length < 15000, 'Telemetry must remain fixed-size');
}
async function retired(pool, timeoutMs = 2000) {
  const deadline = performance.now() + timeoutMs;
  while (pool.snapshot().counts.inflight && performance.now() < deadline) await delay(5);
  clean(pool.snapshot());
}

async function contracts() {
  const a = wallet.createAgencyWallet(options), b = wallet.createAgencyWallet(options);
  const first = await a.status({case: mode, marker: 'private-payload-marker'});
  const second = await b.status({case: mode});
  assert.equal(first.socket_id, second.socket_id, 'Fresh clients must share the same retained connection');
  assert.notEqual(first.request_nonce, second.request_nonce, 'Each call must be freshly signed');
  const v1 = wallet.createAgencyWallet({origin: origins.trusted, keyId, secret});
  assert.equal((await v1.status({case: mode})).signature_version, '1');
  const beforeProduction = (await inspect(mode)).requests;
  const production = wallet.createAgencyWallet({...options, environment: 'production'});
  await assert.rejects(production.status({case: mode}), e => e.status === 423);
  assert.equal((await inspect(mode)).requests, beforeProduction);
  await assert.rejects(a.status({case: mode, data: 'x'.repeat(65536)}), e => e.code === 'AGENCY_REQUEST_TOO_LARGE');
  assert.equal((await inspect(mode)).requests, beforeProduction, 'Oversized request cannot reach HTTP');
  for (const bad of [origins.trusted + '/wrong', origins.trusted + '/?query=x',
    origins.trusted.replace('https://', 'https://user@')]) assert.throws(() => wallet.createAgencyWallet({...options, origin: bad}));
  const scoped = transport.transportForOrigin(origins.trusted);
  await assert.rejects(scoped.post(origins.untrusted + path, '{}', {}), /PATH_INVALID/);
  await assert.rejects(scoped.post('//foreign.example' + path, '{}', {}), /PATH_INVALID/);
  await assert.rejects(scoped.post(path, '{}', {Host: 'foreign.example'}), /HEADERS_INVALID/);
  await assert.rejects(a.status({case: mode, scenario: 'http-error'}), e => e.status === 409 && e.code === 'EXPECTED_CONFLICT');
  await assert.rejects(a.status({case: mode, scenario: 'redirect'}), e => e.code === 'AGENCY_REDIRECT_REJECTED');
  assert.equal((await inspect(mode)).redirect_requests, 0);
  for (const [scenario, codes] of [['invalid-json', ['AGENCY_INVALID_RESPONSE']],
    ['oversized-content-length', ['AGENCY_RESPONSE_TOO_LARGE']],
    ['oversized-chunked', ['AGENCY_RESPONSE_TOO_LARGE']],
    ['partial-body', ['AGENCY_RESPONSE_INTERRUPTED', 'AGENCY_OUTCOME_UNKNOWN']]]) {
    await assert.rejects(a.status({case: mode, scenario}), e => codes.includes(e.code));
    assert.equal((await a.status({case: mode})).ok, true, 'A failed response must release its slot');
  }
  const beforeTLS = (await inspect(mode)).requests;
  const wrongHost = wallet.createAgencyWallet({...options, origin: origins.trusted.replace('localhost', '127.0.0.1')});
  await assert.rejects(wrongHost.status({case: mode}), e => e.code === 'AGENCY_OUTCOME_UNKNOWN');
  const untrusted = wallet.createAgencyWallet({...options, origin: origins.untrusted});
  await assert.rejects(untrusted.status({case: mode}), e => e.code === 'AGENCY_OUTCOME_UNKNOWN');
  assert.equal((await inspect(mode)).requests, beforeTLS, 'Bad chain/hostname must fail before HTTP');
  let slowFinished = false;
  const slow = a.status({case: mode, scenario: 'delay', delay_ms: 400}).then(value => { slowFinished = true; return value; });
  const fast = await b.status({case: mode});
  assert.equal(fast.ok, true); assert.equal(slowFinished, false, 'One slow player must not serialize others');
  await slow;
  const metrics = wallet.transportMetrics(); clean(metrics);
  assert.equal(metrics.timeout_ms, 12000); assert.equal(metrics.shared_tls_contexts, 1);
  assert.ok(metrics.counts.reused_socket_requests >= 2);
  assert.ok(metrics.counts.tcp_connected >= 1); assert.ok(metrics.counts.tls_connected >= 1);
  assert.ok(metrics.timings.tcp_to_tls_ms.count >= 1, 'Real TLS event timing must be observed');
  return {checks: ['shared keepalive', 'fresh v1/v2 HMAC', 'production quarantine', 'origin binding',
    'request/response bounds', 'HTTP rejection', 'no redirects', 'invalid/truncated body',
    'verified CA/hostname', 'no slow-player serialization', 'bounded sanitized telemetry'], metrics};
}

async function concurrency() {
  const measurements = [];
  for (const limit of [40, 64]) {
    const pool = new transport.VerifiedTransport(origins.trusted, {maxInflight: limit});
    try {
      await Promise.all(Array.from({length: 13}, () => post(pool, {case: `concurrency-${limit}`, scenario: 'delay', delay_ms: 10})));
      const before = pool.snapshot(), start = performance.now();
      const times = await Promise.all(Array.from({length: 333}, async () => {
        const began = performance.now();
        assert.equal((await post(pool, {case: `concurrency-${limit}`, scenario: 'delay', delay_ms: 100})).data.ok, true);
        return performance.now() - began;
      }));
      times.sort((a, b) => a - b); const metrics = pool.snapshot(); clean(metrics);
      assert.equal(metrics.counts.completed, 346); assert.equal(metrics.counts.failures, 0);
      assert.equal(metrics.counts.max_inflight, limit);
      assert.ok(metrics.counts.sockets_started <= limit);
      assert.equal(metrics.counts.tcp_connected, metrics.counts.sockets_started);
      assert.equal(metrics.counts.tls_connected, metrics.counts.sockets_started);
      assert.equal(metrics.timings.tcp_to_tls_ms.count, metrics.counts.sockets_started);
      const server = await inspect(`concurrency-${limit}`);
      assert.equal(server.requests, 346); assert.ok(server.max_active <= limit, JSON.stringify({limit, server, counts: metrics.counts}));
      measurements.push({max_inflight: limit, sessions: 333, mock_handler_ms: 100,
        p95_ms: times[Math.ceil(times.length * .95) - 1], elapsed_ms: performance.now() - start,
        cold_sockets_during_burst: metrics.counts.sockets_started - before.counts.sockets_started,
        total_sockets: metrics.counts.sockets_started, server_max_active: server.max_active});
    } finally { pool.close(); }
  }
  // Verify the actual createAgencyWallet default path as well as the parameter comparison.
  await Promise.all(Array.from({length: 167}, () => wallet.createAgencyWallet(options).status(
    {case: 'concurrency-default', scenario: 'delay', delay_ms: 50})));
  const metrics = wallet.transportMetrics(); clean(metrics);
  assert.equal(metrics.counts.completed, 167); assert.equal(metrics.counts.failures, 0);
  assert.equal(metrics.counts.max_inflight, transport.MAX_INFLIGHT);
  assert.equal(metrics.counts.sockets_started, transport.MAX_INFLIGHT);
  assert.ok((await inspect('concurrency-default')).max_active <= transport.MAX_INFLIGHT);
  return {classification: 'synthetic_local_tls_capacity_comparison', measurements, default_metrics: metrics};
}

async function queuedDeadline() {
  const pool = new transport.VerifiedTransport(origins.trusted, {maxInflight: 1, maxPending: 2, timeoutMs: 160});
  try {
    // Complete the trust handshake first so the experiment measures the deadline
    // on admitted HTTP and queued work, independently of fixture startup speed.
    await post(pool, {case: mode});
    const start = performance.now();
    const work = [1, 2, 3, 4].map((_, i) => {
      const body = JSON.stringify({case: mode, scenario: 'delay', delay_ms: 800});
      // Two queued callers have already spent 80ms of their total budget before
      // admission. Their expiry is therefore independent of the active timer.
      return pool.post(path, body, signed(body), start - (i === 1 || i === 2 ? 80 : 0));
    });
    const result = await Promise.allSettled(work);
    assert.ok(result.every(x => x.status === 'rejected'));
    assert.equal(result.filter(x => x.reason.code === 'AGENCY_TRANSPORT_DEADLINE').length, 3);
    assert.equal(result.filter(x => x.reason.code === 'AGENCY_TRANSPORT_QUEUE_FULL').length, 1);
    assert.ok(performance.now() - start < 600, 'Queued deadlines must run from entry, not admission');
    await delay(30);
    assert.equal((await inspect(mode)).requests, 2, 'Expired queued work cannot later reach HTTP');
    clean(pool.snapshot());
    assert.equal((await post(pool, {case: mode})).data.ok, true);
    const metrics = pool.snapshot(); clean(metrics);
    assert.equal(metrics.counts.timeouts, 3); assert.equal(metrics.counts.backpressure, 1);
    return {metrics};
  } finally { pool.close(); }
}

async function wholeBodyDeadline() {
  const a = wallet.createAgencyWallet(options);
  await a.status({case: mode});
  const start = performance.now();
  await assert.rejects(a.status({case: mode, scenario: 'slow-body'}), e => e.code === 'AGENCY_TRANSPORT_DEADLINE');
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 11500 && elapsed < 14000, `The real 12s deadline must include continuous body drips: ${elapsed}`);
  await delay(30); const observed = await inspect(mode);
  assert.equal(observed.requests, 2); assert.equal(observed.active, 0);
  assert.equal((await a.status({case: mode})).ok, true);
  const metrics = wallet.transportMetrics(); clean(metrics); assert.equal(metrics.counts.timeouts, 1);
  return {elapsed_ms: elapsed, continuous_drip_before_timeout: true, metrics};
}

async function headerDNSAndClose() {
  const headerPool = new transport.VerifiedTransport(origins.trusted, {timeoutMs: 180});
  try {
    await post(headerPool, {case: mode});
    const before = headerPool.snapshot(), start = performance.now();
    await assert.rejects(post(headerPool, {case: mode, scenario: 'slow-header-bytes'}), /DEADLINE/);
    assert.ok(performance.now() - start < 600);
    assert.equal(headerPool.snapshot().counts.response_headers, before.counts.response_headers);
    await retired(headerPool);
  } finally { headerPool.close(); }

  const dnsPool = new transport.VerifiedTransport(origins.trusted, {timeoutMs: 140,
    lookup: (_host, options, callback) => setTimeout(() => {
      if (options.all) callback(null, [{address: '127.0.0.1', family: 4}]);
      else callback(null, '127.0.0.1', 4);
    }, 450)});
  try {
    const before = (await inspect(mode)).requests, start = performance.now();
    await assert.rejects(post(dnsPool, {case: mode}), /DEADLINE/);
    assert.ok(performance.now() - start < 400);
    await delay(500);
    assert.equal((await inspect(mode)).requests, before, 'A DNS result after expiry cannot issue HTTP');
    clean(dnsPool.snapshot());
  } finally { dnsPool.close(); }

  const closingPool = new transport.VerifiedTransport(origins.trusted, {maxInflight: 1, maxPending: 4});
  const completion = Promise.allSettled(Array.from({length: 4}, () => post(closingPool,
    {case: mode, scenario: 'delay', delay_ms: 1000})));
  await delay(40); closingPool.close();
  assert.ok((await completion).every(x => x.status === 'rejected' && x.reason.code === 'AGENCY_TRANSPORT_CLOSED'));
  await retired(closingPool);
  await assert.rejects(post(closingPool, {case: mode}), /CLOSED/);
  return {header_deadline: true, dns_deadline: true, expired_dns_no_http: true, close_releases_all: true};
}

async function repeatedDNSTimeouts() {
  assert.equal(transport.MAX_INFLIGHT, 64); assert.equal(transport.MAX_PENDING, 1024);
  assert.equal(transport.REQUEST_TIMEOUT_MS, 12000);
  let outstanding = 0, peak = 0, started = 0, completed = 0, delayLookups = true;
  const pool = new transport.VerifiedTransport(origins.trusted, {timeoutMs: 100,
    lookup: (_host, options, callback) => {
      outstanding++; started++; peak = Math.max(peak, outstanding);
      setTimeout(() => {
        outstanding--; completed++;
        if (options.all) callback(null, [{address: '127.0.0.1', family: 4}]);
        else callback(null, '127.0.0.1', 4);
      }, delayLookups ? 1000 : 0);
    }});
  try {
    const waves = [];
    for (let wave = 0; wave < 4; wave++) {
      const began = performance.now();
      const results = await Promise.allSettled(Array.from({length: 64}, () => post(pool, {case: mode})));
      assert.ok(results.every(x => x.status === 'rejected' && x.reason.code === 'AGENCY_TRANSPORT_DEADLINE'));
      assert.ok(performance.now() - began < 600, 'Caller deadlines must not wait for an uncancellable resolver');
      assert.equal(started, 64, 'A timed-out lookup must retain admission until its callback settles');
      assert.equal(outstanding, 64); assert.equal(peak, 64);
      const metrics = pool.snapshot();
      assert.equal(metrics.counts.inflight, 64); assert.equal(metrics.counts.retiring, 64);
      assert.equal(metrics.counts.dns_inflight, 64); assert.equal(metrics.counts.pending, 0);
      waves.push({wave, outstanding_dns: outstanding, started_dns: started, retiring: metrics.counts.retiring});
    }
    assert.equal((await inspect(mode)).requests, 0);
    await retired(pool);
    assert.equal(outstanding, 0); assert.equal(completed, 64);
    assert.equal((await inspect(mode)).requests, 0, 'Neither expired queued work nor late DNS may issue HTTP');
    assert.equal(pool.snapshot().counts.max_dns_inflight, 64);
    delayLookups = false;
    assert.equal((await post(pool, {case: mode})).data.ok, true, 'Capacity returns after resource retirement');
    assert.equal((await inspect(mode)).requests, 1); clean(pool.snapshot());
    return {waves, peak_outstanding_dns: peak, late_expired_http_requests: 0, recovered: true};
  } finally { pool.close(); }
}

async function closeDuringDNS() {
  const pool = transport.transportForOrigin(origins.trusted);
  let outstanding = 0, peak = 0, lookups = 0;
  pool.resolveHostname = (_host, options, callback) => {
    outstanding++; lookups++; peak = Math.max(peak, outstanding);
    setTimeout(() => {
      outstanding--;
      if (options.all) callback(null, [{address: '127.0.0.1', family: 4}]);
      else callback(null, '127.0.0.1', 4);
    }, 350);
  };
  const first = wallet.createAgencyWallet(options);
  const completion = Promise.allSettled(Array.from({length: 64}, () => first.status({case: mode})));
  await delay(20);
  assert.equal(outstanding, 64);
  wallet.closeTransport();
  assert.ok((await completion).every(x => x.status === 'rejected' && x.reason.code === 'AGENCY_TRANSPORT_CLOSED'));
  const reopenedEarly = wallet.createAgencyWallet(options);
  await assert.rejects(reopenedEarly.status({case: mode}), e => e.code === 'AGENCY_TRANSPORT_CLOSED');
  assert.equal(lookups, 64); assert.equal(peak, 64);
  assert.equal(wallet.transportMetrics().active_origins, 1, 'A closing pool still owns its unresolved DNS');
  await retired(pool);
  assert.equal(outstanding, 0); assert.equal(wallet.transportMetrics().active_origins, 0);
  assert.equal((await inspect(mode)).requests, 0);
  const reopened = wallet.createAgencyWallet(options);
  assert.equal((await reopened.status({case: mode})).ok, true);
  assert.equal((await inspect(mode)).requests, 1);
  clean(wallet.transportMetrics());
  return {peak_outstanding_dns: peak, closed_origin_cannot_bypass_admission: true, recovered: true};
}

async function disconnect() {
  const a = wallet.createAgencyWallet(options);
  const payload = {case: mode, scenario: 'commit-disconnect', round_ref: 'synthetic-round-once', stake: '10'};
  await assert.rejects(a.reserve(payload));
  await delay(100);
  let observed = await inspect(mode);
  assert.equal(observed.requests, 1, 'A committed disconnect must not be retried by transport');
  assert.equal(observed.debits, 1); assert.equal(observed.balance, 990);
  const retry = await a.reserve(payload);
  assert.equal(retry.balance, 990); assert.equal(retry.debits, 1);
  observed = await inspect(mode); assert.equal(observed.requests, 2); assert.equal(observed.debits, 1);
  assert.equal(observed.nonces, 2, 'Explicit retry reuses the business ID but signs a fresh nonce');
  clean(wallet.transportMetrics());
  return {requests: observed.requests, authoritative_debits: observed.debits, balance: observed.balance};
}

try {
  const run = {contracts, concurrency, queuedDeadline, wholeBodyDeadline, headerDNSAndClose,
    repeatedDNSTimeouts, closeDuringDNS, disconnect}[mode];
  if (!run) throw Error('Unknown synthetic test mode');
  const result = await run(); console.log(JSON.stringify(result));
} finally { wallet.closeTransport(); }
