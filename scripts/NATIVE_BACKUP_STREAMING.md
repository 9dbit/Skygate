# Native backup streaming review

This change bounds the memory used by Skygate backup, remote readback, restore,
and retention verification. It does not change game rules, RNG, financial
settlement, release gates, network deadlines, or the retention policy.

## Archive compatibility and publication

The v1 archive remains byte-for-byte compatible in its layout:

1. Four-byte unsigned big-endian JSON header length.
2. Original JSON manifest as AES-GCM additional authenticated data.
3. Twelve-byte nonce.
4. AES-256-GCM ciphertext.
5. Sixteen-byte authentication tag.

The manifest fields and their construction order remain unchanged. Active-key
selection and old named keys remain supported; archives without a key ID use
`legacy`. The existing `encrypt`, `decrypt`, and `snapshot` byte APIs remain for
small fixtures and compatibility. Production paths use `snapshotFile`,
`encryptFile`, `decryptFile`, and `restoreFileToPath` instead.

The snapshot is verified with SQLite before encryption, and its deployment
identity is read from that same snapshot. Hashing and cryptographic processing
use 64 KiB read buffers. Ciphertext has a streaming SHA-256, which signs the S3
request and must match the complete remote readback. PUT includes the exact
archive Content-Length. Both plaintext and ciphertext sizes are available in
the sanitized `engine.backup.remote_verified` event as `size_bytes` and
`encrypted_size_bytes`; the latter includes the envelope header, nonce and tag.

Decryption writes only into a private temporary directory, with file mode 0600.
SQLite does not open the plaintext until GCM authentication and plaintext
hash/length checks succeed. Manifest identity and the identity inside the
restored SQLite database must both match. A verified database is fsynced and
published with a hard link that cannot overwrite an existing destination.
Existing files, dangling links, WAL, SHM, and rollback-journal sidecars prevent
publication. Two concurrent publishers can produce only one successful link.
Temporary files are removed on normal completion and exceptions. Abrupt process
or machine termination is not an exception-cleanup guarantee.

Restore still requires an empty replacement volume and the existing deployment
confirmation, expected ciphertext hash, and restart marker. It does not overwrite
the original live database. Temporary storage can reach approximately twice the
archive size during a stage, so disk headroom remains necessary.

## Retention and transport

Production retention downloads one object to a private file, hashes the actual
file, authenticates and verifies its SQLite contents, and removes its temporary
files before downloading the next proof. Only compact digest/ETag proofs remain
in memory. The downloader returns `{path, sha256, size, etag, cleanup}`; the policy
also supports the existing small `{bytes, etag}` fixture interface.

Every required proof is verified before any candidate deletion. The independent
conditional-delete canary, stale valid ETag rejection, final absence check,
strict If-Match, deletion cap, protected snapshots and fail-closed policy are
unchanged. Canary responses are capped at 8 KiB; other control responses are
capped at 1 MiB. Archive downloads use streaming files. Failed responses are
cancelled, partial files removed, and upload streams destroyed.

Signed S3 requests use `redirect: 'error'`. Besides keeping a signed request bound
to its configured endpoint, this matters for memory: the inspected Node 24
Undici implementation clones a request for its default redirect behavior. The
clone tees a streaming body and can retain an entire archive in the unread
branch. A streamed body alone did not solve this problem.

Primary references: [Node crypto authentication semantics](https://nodejs.org/docs/latest-v24.x/api/crypto.html#deciphersetauthtagbuffer-encoding)
and [Undici streaming request documentation](https://github.com/nodejs/undici#requestduplex).

## Reproducible local evidence

Run the focused regressions:

```sh
node --test --test-concurrency=1 tests/native-backup-stream.test.mjs tests/native-backup.test.mjs tests/native-dr.test.mjs tests/native-retention.test.mjs tests/provider-isolation.test.mjs
```

Run a synthetic measurement separately:

```sh
node tests/helpers/backup-memory-worker.mjs 64
node tests/helpers/backup-memory-worker.mjs 128
```

The worker creates a disposable SQLite fixture and a real local HTTP server with
file-backed object storage. It exercises upload, readback, authenticated restore,
retention proof and conditional-delete probe, then restores onto an empty
replacement directory. The storage server is inside the measured process. It
does not contact an external service and does not change a live volume. There is
no forced garbage collection or reduced V8 heap setting.

One measured Node 24.22.1 run produced these process maxima:

| Implementation and fixture | Snapshot | Peak RSS | Increment over starting RSS |
| --- | ---: | ---: | ---: |
| Initial streaming, default redirect clone | 64 MiB | 181,596 KiB | 140,828 KiB |
| Initial streaming, default redirect clone | 128 MiB | 251,156 KiB | 210,312 KiB |
| Streaming with redirects rejected | 64 MiB | 137,940 KiB | 96,952 KiB |
| Streaming with redirects rejected | 128 MiB | 137,232 KiB | 96,432 KiB |

The initial implementation failed its memory regression and was corrected. A
preliminary 96 MiB incremental target was also too close to Node/Undici allocator
variation: corrected runs observed approximately 94–101 MiB. The committed
Node-specific regression budget is therefore 128 MiB incremental RSS, with less
than 32 MiB extra peak RSS when the archive doubles. Both bounds are required.
These are new synthetic test budgets; no existing project gate was weakened.

The original disk-only fixture transport at 128 MiB with retention measured
99,312 KiB peak RSS and 59,524 KiB incremental RSS after this change. Its lower
number excludes the real HTTP client/server overhead and should not be compared
as if the transport were identical.

These measurements demonstrate local bounded-memory behavior, not a live service
capacity result. Different Node versions, allocators, TLS, host limits and game
traffic can change process RSS. Source-bound remote backup verification and the
final live capacity/soak qualification remain required after deployment.
