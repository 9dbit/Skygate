# Native provider UI: wallet labels and bundled splash logo

The Genesis native UI integration exposed two presentation defects in source
`ae916b4d8348288fc5fe28e8592d7a44cd782235`: the agency renderer identified an
external operator wallet as Playground, and the splash referenced an uploaded
media digest absent from a clean provider release store.

## Change and boundaries

The existing `window.SkygateAgency` branches now use **Wallet agen** wording for
boot, balance errors, round completion, history and the disabled local reset.
This describes the agency wallet without assigning a different operator's name.
No new operator-name field, account metadata or HTML injection is introduced.
Standalone Studio preview continues through its existing non-agency branch.

The splash now references `assets/scene/logo.png`. That file already belongs to
`shippedAssets`; `node scripts/prepare-play.mjs` copies it from the checked-in
asset archive to the existing public asset directory. The production Dockerfile
already runs this preparation. No new asset, media fallback, route or permission
is needed. Published release overrides continue through the existing release
mechanism. The obsolete uploaded-media URL is not made public by this change.

There are no changes to server routing, Studio protection, release validation,
native identity, launch validation, wallet accounting, durability, callbacks,
RNG/math, source locks, worker limits or deployment configuration. The existing
provider CI workflow also accepts the exact review branch and prepares the
bundled assets before its tests; existing image and mount gates remain required.

## Validation

Run `npm test` from a clean checkout; its existing `pretest` prepares the assets.
For a focused run, use:

```sh
node scripts/prepare-play.mjs
node --test tests/provider-ui.test.mjs
```

The added tests execute the renderer with state from the real native engine and
a synthetic integer-precision agency wallet. They cover boot, one real-engine
round, settled balance/history, UI replay without another wallet operation,
reload, disabled local reset and insufficient balance. DOM/audio are isolated
test doubles; this is not a browser-audio or Genesis end-to-end acceptance claim.

A separate isolated local native process serves the referenced logo. The test
checks GET and HEAD, `image/png`, PNG signature, content length and SHA-256
equality with the shipped file. It also checks that POST, native Studio routes,
private/unpublished media and repository files remain inaccessible. The local
process has no remote wallet, backup or heartbeat configuration.

The initial local validation used Node v24.22.1: 3 focused tests passed and the
full `npm test` suite passed 180 tests with no failures or skips. The bundled
logo remains 74,085 bytes, SHA-256
`9153e5f3b1a9614168cc9691758a1a5bc1213a01c6a6ac82831d416f3bf72653`.
All three approved source-lock entries and 21 protected source/archive files
were verified against the exact base commit. Full logs and source receipts are
recorded separately in `skygate-genesis-ui-20261110` evidence.

The unchanged Genesis native UI suite must be rerun with the new exact local
commit while retaining previous failed attempts. Local validation does not
authorize or prove a hosted deployment, a load/soak result, or a completed
Genesis production integration.
