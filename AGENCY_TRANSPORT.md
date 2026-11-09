# Native Core callback transport

The default `createAgencyWallet` path uses a shared, verified HTTPS transport in
`agency-transport.cjs`. The configured Core origin is fixed for each pool. The
only request paths are the six existing agency actions. Absolute URLs, alternate
Host headers and redirects are rejected. The explicit `fetchImpl` injection is
retained for isolated signer/domain tests; it is not selected by runtime
environment variables.

## Bounds and accounting behavior

Each origin has at most **64 active requests/connections** and **1,024 queued
requests**. At most four configured origins can exist in a process. A full queue
fails without sending HTTP. The implementation shares one normal-trust TLS
context across pools and retains certificate chain, hostname and SNI checks.
It does not use a custom certificate verifier or disable validation. A call to
`closeTransport()` destroys idle connections and rejects active/queued work.
Node's system DNS lookup cannot be cancelled by destroying its HTTP request.
Therefore a timed-out or closed request retains its admission until its DNS
callback settles and its failed request closes. A closing origin remains in the
registry until these resources retire, so reopening it cannot bypass the bound.

The unchanged **12-second wall-clock deadline** begins at the wallet method
entry, before serialization and signing. It includes queue admission, DNS,
TCP/TLS, request transmission, headers, the entire response body, and JSON
decoding. Queued work expires without later issuing HTTP. Timeout, disconnect,
invalid JSON, truncated/oversized responses and redirects release the admission
slot after pending resources retire. The caller's rejection still occurs at
its deadline even if DNS remains outstanding. Ambiguous network outcomes are returned to the existing durable native
round flow. The transport never retries a request. An explicit later retry
keeps the business identifier and generates a new nonce/signature.

Request bodies are limited to **65,536 bytes**, matching Core's receiving limit.
Response bodies are limited to **1 MiB**, including chunked responses, and headers
to 16 KiB. The client requests identity encoding and rejects an unexpected
encoding. Non-success HTTP JSON responses preserve the existing status/code
contract. Invalid or incomplete responses cannot become successful receipts.

## Why the connection bound is 64

The local TLS fixture compares bounds of 40 and 64 with 333 simultaneous
synthetic callbacks, 13 retained setup connections, and a 100 ms synthetic Core
handler. One run measured p95 847 ms with 40 connections and 608 ms with 64;
observed active handler work and physical connections stayed within each bound.
These are local transport measurements, not deployed qualification results.
The larger bound reduces queued waves while keeping a fixed socket ceiling.
The fixture emits new measurements on every test run without a fragile
wall-clock performance assertion.

## Observations

Native health exposes `callback_transport` with fixed-size cumulative counters
and three-significant-digit latency histograms. It records request, failure,
timeout, backpressure, inflight/queued peak, new/reused socket, DNS, TCP and TLS
counts. Timing summaries cover admission, DNS, socket-to-TCP, TCP-to-TLS,
request-entry-to-send, send-to-headers, headers-to-body and the full call.
`inflight` includes expired admissions whose resources are retiring; `retiring`
and `dns_inflight` expose that distinction. DNS timing is recorded when the
resolver callback finishes, which can be later than the caller's timeout.

No origin, address, URL, header, cookie, signature, nonce, body or exception text
is retained in these observations. DNS and connection timings include local
event-loop scheduling, so they do not by themselves identify network RTT.
Statistics are never subtracted from request latency or used to relax gates.

## Verification

Run `node --test tests/agency-wallet-transport.test.mjs` for real local TLS tests
of CA and hostname verification, v1/v2 HMAC freshness, shared connection reuse,
333 concurrent requests, bounded queues, expiration before admission, delayed
DNS, incomplete headers, continuously dripping bodies, invalid/oversized JSON,
redirect rejection, production quarantine, and committed-disconnect recovery.
Four repeated DNS-timeout waves at the real 64-slot bound also prove that
uncancellable lookups cannot accumulate beyond the bound, including when a
closing origin is requested again. Expired queued work never reaches HTTP.
The body-deadline case uses the actual production 12-second limit. A separate
synthetic server retains one authoritative debit across an explicit retry and
proves that the transport itself sends no automatic retry.

The qualification workflow already runs `node --test tests/*.test.mjs`, so the
new file is included without changing the workflow or any workload threshold.
