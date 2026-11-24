# Public release storage recovery — 24 November 2026

## Incident and scope

The public game shell returned 200 while `/play/release.json` and published media
returned 500. Runtime logs showed `EACCES` reading
`/data/skygate-releases/index.json`. The security-hardened process dropped to
UID/GID 1000 after changing ownership of `/data` only; snapshots created by the
older root process remained root-owned 0600. The old `/health` checked the process
and native adapter but never read the public release store.

This change preserves the existing active release, immutable snapshot bytes,
published artwork, Studio authentication, virtual-credit rules and wallet mode.

## Bounded startup ownership migration

On the existing root startup path, when Railway mounts `/data` and that is the
selected release directory, `prepareReleaseOwnership` inspects only:

- `/data/skygate-releases` and its `media` directory;
- `index.json` and UUID-named immutable JSON snapshots;
- content-addressed PNG/WebP/MP3/OGG/WAV media files.

It refuses symlinks, hardlinked files, non-file entries, unknown paths, more than
4096 entries, over 400 MiB of live files or individual JSON files over 4 MiB.
Incomplete atomic `.tmp` files count toward the traversal bound and are left
untouched. Unrelated volume contents are never traversed or changed.

Before changing any release ownership, it writes and fsyncs a root-only backup
under `/data/skygate-release-migrations/<migration-id>/` containing:

- exact original `index.json` and immutable snapshot bytes;
- `manifest.json` with original UID/GID, modes, sizes and SHA256 file hashes;
- a completion record written only after the migration finishes.

Media bytes are hashed but not duplicated, so a near-full 512 MiB volume does not
need a second copy of the archive. The migration opens files with `O_NOFOLLOW`,
checks inode identity, and validates the whole plan again after the backup.
Changed release directories receive 0700 and files 0600, owned by UID/GID 1000.
Subsequent starts are no-ops when ownership and modes are already correct.
Startup logs contain only file counts, previous owner IDs, migration ID and the
backup-manifest SHA256; they do not contain release data or credentials.

The process clears supplementary groups, sets GID/UID 1000, verifies the resulting
identity and then starts serving. It never serves requests as root.

## Readiness versus liveness

- `GET/HEAD /health`: readiness, HTTP 200 only when the native adapter (if
  enabled), active public release and public dependencies are readable. An
  invalid/unreadable/missing active index, snapshot, media, script, stylesheet or
  shipped asset yields HTTP 503. The public JSON contract stays
  `{ok, service, version}`; private paths and storage metadata are not exposed.
- `GET/HEAD /livez`: process-only HTTP 200. It is not the deployment readiness
  gate. Railway remains configured to use `/health`.
- GameOps already reads `/health`, so failed public readiness now reports a
  degraded heartbeat without changing its signing or receiver protocol.

A deliberately unpublished `active:null` release can use the bundled game. A
brand-new empty store can do the same. A missing index in an archive that already
contains snapshots or media is an error, not a bundled fallback. Probes share
in-flight work and cache results for at most one second.

The initial splash uses bundled logo artwork until `release.js` applies the
published logo. This avoids a production-only media hash in a fresh bundled
game; the published scene and logo are unchanged after release loading.

## Verification and recovery

`npm test` covers real EACCES reads, invalid/lost indexes, missing snapshots/media,
missing CSS, HTTP 503 readiness with HTTP 200 liveness, protected Studio, recovery
without restart, backup integrity, idempotence, unsafe links and traversal caps.
The security CI job additionally runs the root-only fixture with sudo Node 24:
it proves root-owned 0600 files fail under UID 1000 before migration and become
readable after migration while their bytes remain unchanged.

Before production cutover, require that root fixture and the existing Node,
security and browser jobs succeed. After deployment inspect the ownership log,
verify `/health`, `/play/release.json`, and published media, then complete the
XDPLAY launcher smoke test.

If migration preflight fails, it fails before ownership changes. A partial
filesystem failure retains the durable backup and manifest for inspection.
Recovery must use the exact logged migration ID: stop the affected process,
verify snapshot/media checksums against the manifest, and restore only the
recorded metadata or JSON bytes if required. Do not replace the active artwork
with a bundled fallback or run a recursive permission change over `/data`.
