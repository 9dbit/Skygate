'use strict';

// Server-side Core callbacks only. One bounded pool per configured origin;
// no redirect, automatic retry, credential logging, or TLS verification bypass.
const https = require('node:https');
const http = require('node:http');
const {lookup: systemLookup} = require('node:dns');
const {createSecureContext} = require('node:tls');
const {createHistogram, performance} = require('node:perf_hooks');

const REQUEST_TIMEOUT_MS = 12000;
const MAX_REQUEST_BYTES = 65536; // The receiving Core readBody limit.
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_INFLIGHT = 64;
const MAX_PENDING = 1024;
const MAX_ORIGINS = 4;
const PATH = /^\/api\/v4\/agency-game\/(redeem|status|reserve|settle|void|studio-sync)$/;
let sharedContext;

class TransportError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
const fault = (code, status) => new TransportError(code, status);
const rounded = n => Math.round(n * 1000) / 1000;

class Timing {
  constructor() {
    this.histogram = createHistogram({lowest: 1, highest: 3600000000, figures: 3});
    this.count = 0; this.sum = 0; this.max = 0;
  }
  record(ms) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.count++; this.sum += ms; this.max = Math.max(this.max, ms);
    this.histogram.record(Math.min(3600000000, Math.max(1, Math.round(ms * 1000))));
  }
  snapshot() {
    return {count: this.count, mean_ms: this.count ? rounded(this.sum / this.count) : null,
      p50_ms: this.count ? rounded(this.histogram.percentile(50) / 1000) : null,
      p95_ms: this.count ? rounded(this.histogram.percentile(95) / 1000) : null,
      p99_ms: this.count ? rounded(this.histogram.percentile(99) / 1000) : null,
      max_ms: this.count ? rounded(this.max) : null};
  }
}

function newMetrics() {
  return {counts: {requests: 0, completed: 0, failures: 0, timeouts: 0, backpressure: 0,
    inflight: 0, pending: 0, retiring: 0, max_inflight: 0, max_pending: 0, max_retiring: 0,
    dns_inflight: 0, max_dns_inflight: 0, sockets_started: 0,
    reused_socket_requests: 0, dns_lookups: 0, dns_errors: 0, tcp_connected: 0,
    tls_connected: 0, request_sent: 0, response_headers: 0},
    timings: Object.fromEntries(['pool_wait', 'dns_lookup', 'socket_to_tcp', 'tcp_to_tls',
      'request_to_sent', 'sent_to_headers', 'headers_to_body', 'total'].map(k => [k, new Timing()]))};
}
function snapshotMetrics(metrics) {
  return {counts: {...metrics.counts}, timings: Object.fromEntries(
    Object.entries(metrics.timings).map(([key, timing]) => [key + '_ms', timing.snapshot()]))};
}

function originURL(origin, allowLocal) {
  const url = new URL(origin);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    !(url.protocol === 'https:' || allowLocal && url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw fault('AGENCY_TRANSPORT_ORIGIN_INVALID', 422);
  }
  return url;
}

class VerifiedTransport {
  constructor(origin, {allowLocal = false, maxInflight = MAX_INFLIGHT, maxPending = MAX_PENDING,
    timeoutMs = REQUEST_TIMEOUT_MS, metrics = newMetrics(), lookup = systemLookup} = {}) {
    if (!Number.isInteger(maxInflight) || maxInflight < 1 || maxInflight > 64 ||
      !Number.isInteger(maxPending) || maxPending < 0 || maxPending > MAX_PENDING ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > REQUEST_TIMEOUT_MS || typeof lookup !== 'function') {
      throw fault('AGENCY_TRANSPORT_POLICY_INVALID', 422);
    }
    this.url = originURL(origin, allowLocal);
    this.metrics = metrics; this.maxInflight = maxInflight; this.maxPending = maxPending;
    this.resolveHostname = lookup;
    this.timeoutMs = timeoutMs; this.queue = []; this.active = new Set(); this.closed = false;
    const options = {keepAlive: true, maxSockets: maxInflight, maxTotalSockets: maxInflight,
      maxFreeSockets: maxInflight, maxCachedSessions: maxInflight, scheduling: 'lifo',
      rejectUnauthorized: true};
    this.secure = this.url.protocol === 'https:';
    // The process's normal trust roots (including supported Node extra CAs) are
    // loaded once. SNI and hostname checks still use the actual request hostname.
    if (this.secure) options.secureContext = sharedContext ??= createSecureContext();
    this.agent = this.secure ? new https.Agent(options) : new http.Agent(options);
    this.observedSockets = new WeakSet();
  }

  post(path, body, headers = {}, started = performance.now()) {
    const metrics = this.metrics, counts = metrics.counts;
    counts.requests++;
    return new Promise((resolve, reject) => {
      const op = {path, body, headers, started, deadline: started + this.timeoutMs,
        resolve, reject, done: false, admitted: false, queued: false, request: null,
        response: null, timer: null, sent: null, headersAt: null, pendingDNS: 0,
        constructing: false, requestClosed: false, awaitClose: false, retiring: false, retired: false};
      const refuse = error => this.finish(op, error);
      if (this.closed) return refuse(fault('AGENCY_TRANSPORT_CLOSED'));
      if (typeof path !== 'string' || !PATH.test(path)) return refuse(fault('AGENCY_TRANSPORT_PATH_INVALID', 422));
      if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_REQUEST_BYTES) return refuse(fault('AGENCY_REQUEST_TOO_LARGE', 413));
      if (Object.keys(headers).some(key => /^(host|connection|transfer-encoding|content-length)$/i.test(key))) {
        return refuse(fault('AGENCY_TRANSPORT_HEADERS_INVALID', 422));
      }
      if (this.active.size >= this.maxInflight && this.queue.length >= this.maxPending) {
        counts.backpressure++; return refuse(fault('AGENCY_TRANSPORT_QUEUE_FULL'));
      }
      const remaining = op.deadline - performance.now();
      if (remaining <= 0) return refuse(fault('AGENCY_TRANSPORT_DEADLINE'));
      op.timer = setTimeout(() => this.finish(op, fault('AGENCY_TRANSPORT_DEADLINE')), remaining);
      op.queued = true; this.queue.push(op); counts.pending++;
      counts.max_pending = Math.max(counts.max_pending, counts.pending);
      this.pump();
    });
  }

  pump() {
    while (!this.closed && this.active.size < this.maxInflight && this.queue.length) {
      const op = this.queue.shift();
      if (op.done) continue;
      op.queued = false; this.metrics.counts.pending--;
      if (performance.now() >= op.deadline) { this.finish(op, fault('AGENCY_TRANSPORT_DEADLINE')); continue; }
      this.start(op);
    }
  }

  start(op) {
    op.admitted = true; this.active.add(op);
    const {counts, timings} = this.metrics;
    counts.inflight++; counts.max_inflight = Math.max(counts.max_inflight, counts.inflight);
    timings.pool_wait.record(performance.now() - op.started);
    op.constructing = true;
    try {
      const url = new URL(op.path, this.url);
      const req = (this.secure ? https : http).request(url, {agent: this.agent, method: 'POST',
        lookup: (host, options, callback) => this.lookup(op, host, options, callback),
        maxHeaderSize: 16384, headers: {...op.headers, 'Content-Length': Buffer.byteLength(op.body),
          'Accept': 'application/json', 'Accept-Encoding': 'identity'}}, res => {
        if (op.done) { res.destroy(); return; }
        op.response = res; op.headersAt = performance.now(); counts.response_headers++;
        if (op.sent !== null) timings.sent_to_headers.record(op.headersAt - op.sent);
        if (res.statusCode >= 300 && res.statusCode < 400) return this.finish(op, fault('AGENCY_REDIRECT_REJECTED', 502));
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') return this.finish(op, fault('AGENCY_RESPONSE_ENCODING_INVALID', 502));
        const advertised = Number(res.headers['content-length']);
        if (Number.isFinite(advertised) && advertised > MAX_RESPONSE_BYTES) return this.finish(op, fault('AGENCY_RESPONSE_TOO_LARGE', 502));
        const chunks = []; let length = 0;
        res.on('data', chunk => {
          if (op.done) return;
          length += chunk.length;
          if (length > MAX_RESPONSE_BYTES) return this.finish(op, fault('AGENCY_RESPONSE_TOO_LARGE', 502));
          chunks.push(chunk);
        });
        res.once('aborted', () => this.finish(op, fault('AGENCY_RESPONSE_INTERRUPTED')));
        res.once('error', () => this.finish(op, fault('AGENCY_RESPONSE_INTERRUPTED')));
        res.once('end', () => {
          if (op.done) return;
          if (!res.complete) return this.finish(op, fault('AGENCY_RESPONSE_INTERRUPTED'));
          let data;
          try { data = JSON.parse(Buffer.concat(chunks, length).toString('utf8')); }
          catch { return this.finish(op, fault('AGENCY_INVALID_RESPONSE', 502)); }
          if (performance.now() >= op.deadline) return this.finish(op, fault('AGENCY_TRANSPORT_DEADLINE'));
          this.finish(op, null, {status: res.statusCode, data});
        });
      });
      op.request = req;
      req.once('close', () => {
        op.requestClosed = true;
        if (!op.done) this.finish(op, fault('AGENCY_OUTCOME_UNKNOWN'));
        this.retire(op);
      });
      req.once('socket', socket => {
        if (this.observedSockets.has(socket)) { counts.reused_socket_requests++; return; }
        this.observedSockets.add(socket); counts.sockets_started++;
        const created = performance.now(); let connected;
        socket.once('connect', () => { connected = performance.now(); counts.tcp_connected++;
          timings.socket_to_tcp.record(connected - created); });
        socket.once('secureConnect', () => { counts.tls_connected++;
          if (connected !== undefined) timings.tcp_to_tls.record(performance.now() - connected); });
      });
      req.once('finish', () => { op.sent = performance.now(); counts.request_sent++;
        timings.request_to_sent.record(op.sent - op.started); });
      req.once('error', () => this.finish(op, fault('AGENCY_OUTCOME_UNKNOWN')));
      op.constructing = false;
      if (op.done) req.destroy();
      else if (performance.now() >= op.deadline) this.finish(op, fault('AGENCY_TRANSPORT_DEADLINE'));
      else req.end(op.body);
      this.retire(op);
    } catch {
      op.constructing = false;
      this.finish(op, fault('AGENCY_OUTCOME_UNKNOWN'));
      this.retire(op);
    }
  }

  lookup(op, host, options, callback) {
    const {counts, timings} = this.metrics, started = performance.now();
    op.pendingDNS++; counts.dns_lookups++; counts.dns_inflight++;
    counts.max_dns_inflight = Math.max(counts.max_dns_inflight, counts.dns_inflight);
    let completed = false;
    const complete = (...args) => {
      if (completed) return;
      completed = true;
      if (args[0]) counts.dns_errors++;
      if (!op.done && performance.now() >= op.deadline) this.finish(op, fault('AGENCY_TRANSPORT_DEADLINE'));
      try {
        // A resolver cannot be cancelled by destroying a ClientRequest. Always
        // settle Node's callback, but never hand a late successful address to
        // an expired/closed request, even if its timer was delayed by the loop.
        if (op.done) callback(fault('AGENCY_TRANSPORT_CLOSED'));
        else callback(...args);
      } finally {
        op.pendingDNS--; counts.dns_inflight--;
        timings.dns_lookup.record(performance.now() - started);
        this.retire(op);
      }
    };
    try { this.resolveHostname(host, options, complete); }
    catch (error) { complete(error); }
  }

  retire(op) {
    if (!op.done || !op.admitted || op.retired || op.constructing || op.pendingDNS ||
      op.awaitClose && op.request && !op.requestClosed) return;
    op.retired = true; this.active.delete(op); this.metrics.counts.inflight--;
    if (op.retiring) this.metrics.counts.retiring--;
    this.pump();
    if (this.closed && !this.active.size) this.onRetired?.();
  }

  finish(op, error, result) {
    if (op.done) return;
    op.done = true; clearTimeout(op.timer);
    const {counts, timings} = this.metrics, ended = performance.now();
    if (op.queued) {
      const index = this.queue.indexOf(op); if (index >= 0) this.queue.splice(index, 1);
      op.queued = false; counts.pending--; timings.pool_wait.record(ended - op.started);
    }
    if (op.admitted && error) {
      op.awaitClose = true; op.retiring = true; counts.retiring++;
      counts.max_retiring = Math.max(counts.max_retiring, counts.retiring);
    }
    if (op.headersAt !== null) timings.headers_to_body.record(ended - op.headersAt);
    timings.total.record(ended - op.started);
    if (error || result?.status < 200 || result?.status >= 300) counts.failures++;
    else counts.completed++;
    if (error?.code === 'AGENCY_TRANSPORT_DEADLINE') counts.timeouts++;
    if (error) { op.response?.destroy(); op.request?.destroy(); op.reject(error); }
    else op.resolve(result);
    this.retire(op);
    this.pump();
  }

  snapshot() { return snapshotMetrics(this.metrics); }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const op of [...this.queue, ...this.active]) this.finish(op, fault('AGENCY_TRANSPORT_CLOSED'));
    this.agent.destroy();
    if (!this.active.size) this.onRetired?.();
  }
}

const pools = new Map(), cumulative = newMetrics();
function transportForOrigin(origin, {allowLocal = false} = {}) {
  const key = originURL(origin, allowLocal).origin;
  if (pools.has(key)) return pools.get(key);
  if (pools.size >= MAX_ORIGINS) throw fault('AGENCY_TRANSPORT_ORIGIN_LIMIT');
  const transport = new VerifiedTransport(key, {allowLocal, metrics: cumulative});
  transport.onRetired = () => { if (pools.get(key) === transport) pools.delete(key); };
  pools.set(key, transport); return transport;
}
function transportMetrics() {
  return {schema_version: 1, implementation: 'bounded_verified_https', timeout_ms: REQUEST_TIMEOUT_MS,
    max_inflight_per_origin: MAX_INFLIGHT, max_pending_per_origin: MAX_PENDING,
    max_origins: MAX_ORIGINS, active_origins: pools.size, shared_tls_contexts: sharedContext ? 1 : 0,
    request_bytes_limit: MAX_REQUEST_BYTES, response_bytes_limit: MAX_RESPONSE_BYTES,
    histogram_precision_significant_digits: 3, ...snapshotMetrics(cumulative)};
}
function closeTransport() {
  // A closed pool with unresolved DNS still owns admissions. Keep its registry
  // entry until retirement so reopening the same origin cannot evade the bound.
  for (const [key, pool] of pools) { pool.close(); if (!pool.active.size) pools.delete(key); }
}

module.exports = {VerifiedTransport, TransportError, transportForOrigin, transportMetrics, closeTransport,
  REQUEST_TIMEOUT_MS, MAX_INFLIGHT, MAX_PENDING, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES};
