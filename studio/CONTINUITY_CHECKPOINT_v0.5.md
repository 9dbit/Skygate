# Skygate v0.5 — playable portrait renderer

28 October 2026, Asia/Jakarta. Continues `b0dd02e` (v0.4.2).

## Scope

The user reported that `/play/` still showed the generic v0.2 research UI instead of Skygate's illustrated reference. Replaced that UI with an interactive portrait implementation using the existing reference hero scene, separate symbol sprites and live controls. Original reference: `studio/assets/scene/reference_original.jpg`.

Public route: https://skygate-web-production.up.railway.app/play/
Repository: `9dbit/Skygate`, `main`.
Railway project `626b6a33-c7f1-4ec5-a9c7-6834349fa3bd`, service `fff3472b-24bb-418c-aa11-0f95cfd53390`, environment `588a155b-2cb3-4f42-b2fa-254a6aa3cd3c`.

## Architecture

- `play/index.html`, `game.css`: portrait 9:16 composition, reference-scene header, live burgundy/gold board, gold win banner, purple spin and compact deck. Desktop centers the same portrait composition; landscape can scroll.
- `play/engine.js` / `config.js`: extracted unchanged from the old playable page. Regular amber/pearl outcomes use ring/chalice artwork; crown is the clearly labeled scatter.
- `play/game.js`: presentation and controls, actual multiplier overlay, auto stop, audio recovery, accessible modal menus, virtual accounting settled once before rendering.
- `scripts/prepare-play.mjs`: explicit allowlist of 26 shipped game assets plus the existing audio mixer, copied to the public play directory. No route aliases into protected Studio files.
- Docker runs preparation after extracting the two existing media archives. Generated public assets are gitignored and reproducible.

## Validation

- 29 automated tests: existing math, route protection/public assets, functional UI wiring in a Node DOM harness, seeded round/replay neutrality, auto count, and interrupted-render accounting.
- Syntax checked with Node.
- Inspect the deployment matching this source commit before reporting production completion; a source checkpoint does not prove deployment success.
- Browser visual/interaction QA is separate from these tests. Physical iPhone Safari/audio testing is not claimed by Node or Chromium checks.

## Remaining scope

- Studio local edits are not automatically published to the public game. Cross-device sync and publishing changes need a deliberate backend/design workflow.
- Hero is an assembled scene from the existing reference, not recovered editable source layers. Existing extracted icon quality remains the source quality.
- Feature buttons are Free Spins information and Win Table; no unimplemented Buy/Ante toggle is displayed.
- No real-money functionality. Session credits reset on reload; no financial ledger or remote user database.

## Release handoff

The owner explicitly authorized publication to the public `9dbit/Skygate` repository and deployment to the existing Railway service on 28 October 2026. A self-contained review HTML was built from the game sources. Rebuild using `node scripts/build-play-preview.mjs /absolute/output.html` after asset preparation. Verify the matching Railway deployment and the public game in-browser before reporting completion.


## Deployment and browser verification

Deployment `009dd8f0-aa57-4fd7-a513-a0568ceb01f2` at commit `e4bf9a1` reached SUCCESS. The public game was opened in Chrome: all 39 rendered images loaded, the illustrated portrait board fit the viewport without horizontal overflow, a spin settled and returned control, and Auto produced live tumble results. A final visual follow-up cleans the shared spin vector and fits win text inside the gold banner. Native iPhone hardware/audio verification remains separate.
