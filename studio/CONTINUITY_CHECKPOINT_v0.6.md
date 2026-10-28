# Skygate v0.6 — Studio release workflow

28 October 2026 (Asia/Jakarta). Base commit e72576a. Owner authorized continuing the mobile / Studio publication / animation roadmap and existing public GitHub/Railway deployment.

## Implementation

- `release-store.mjs`: allowlisted project projection, bounded media validation, immutable snapshot files, serialized atomic active-pointer writes, optimistic version checks, rollback. Persist on `RAILWAY_VOLUME_MOUNT_PATH` / `SKYGATE_RELEASE_DIR` outside web roots.
- `server.mjs`: authenticated `/studio/api/*` and `/studio/preview/`, same-origin + CSRF protected writes; public active manifest `/play/release.json` and published-only media. Draft hashes are not public. Production auth and storage both fail closed for publishing.
- `studio/publish.js`: prepare snapshot → private playable iframe → publish; history, rollback, restore snapshot into browser editor. PNG conversion on image uploads. This is deliberate publishing, not automatic cloud editing sync.
- `play/release.js`: one release per navigation, Studio layout renderer with live controls bound to stable layer ids. Default bundled game remains until the owner publishes a snapshot. Public game never reads browser-local Studio storage.
- `play/game.js`: published math/audio/settings, virtual jackpot wrapper, bug fix for natural free spins, accessible win overlays and pagehide handling.
- `scripts/prepare-play.mjs`: expands known shipped assets to 40, copies existing Studio math wrapper. No arbitrary Studio path alias.

## Infrastructure

Project 626b6a33-c7f1-4ec5-a9c7-6834349fa3bd; service fff3472b-24bb-418c-aa11-0f95cfd53390; production 588a155b-2cb3-4f42-b2fa-254a6aa3cd3c.
Volume `skygate-releases`, id 3e11d591-11f7-4590-91c5-b4878f40006d, 512 MB, mounted `/data`, created this turn. Existing authentication variables preserved. One replica.

Public game: https://skygate-web-production.up.railway.app/play/
Studio: https://skygate-web-production.up.railway.app/studio/

## Validation and boundaries

Automated tests cover real HTTP staging → publish → rollback, persistent restart, draft-media isolation, stale/concurrent writes, auth/CSRF, path/schema/media rejection, seed-41 natural free spins, published bet/credit/math/jackpot integration. Browser verification and matching Railway SUCCESS must be recorded separately; code completion is not deployment proof.

Native iPhone hardware/audio verification remains pending. Browser cloud disallows file URLs; do not work around that boundary. Use the authorized HTTPS site for live visual checks. Access to Studio requires its existing login; never disable authentication to inspect it.

Limits: 24 snapshots, 24 MB custom assets per snapshot, 350 MB cumulative upload budget; no silent archive deletion. No real-money functions, account balances, automatic cross-device draft sync or certified RNG. Shipped hero remains composed artwork. Published Studio layouts use the individual existing image layers.

## Initial deployment evidence

Commit 7862b69 deployed successfully as c7137f74-722f-44bd-9ca2-67d719645a67. Railway confirmed the volume mount and runtime startup. Live Chrome loaded v0.6 with no broken images and completed seed 41 (20 bonus spins / 26 tumbles / 2,388.44 virtual credits), without app console errors.

A visual follow-up replaces the stage's scrollable hidden overflow with clip and bounds the decorative background. Chrome focus restoration after closing a dialog had scrolled the stage internally by 47 px; root viewport dimensions alone did not catch it. It also refreshes release state after a stale write/session error.

Studio browser navigation returned ERR_INVALID_AUTH_CREDENTIALS, so live authenticated panel QA requires owner sign-in. No credentials were retrieved, printed or changed; protection remains enabled.
