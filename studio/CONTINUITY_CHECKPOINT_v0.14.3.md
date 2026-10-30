# SKYGATE · Continuity Checkpoint v0.14.3

**Date:** 2026-10-31 · Asia/Jakarta  
**Scope:** responsive and physically circular central SPIN button.

## Physical iPhone feedback
- `IMG_3631.png` shows the AUTO and NORMAL gold rings are fixed but the central SPIN ring remains vertically stretched in standalone portrait PWA.
- Requirement: true 1:1 SPIN circle on different viewport heights, without changing its approved visual size, layout, labels or core engine.

## Root cause
- Olympus live/Studio published layers used width % relative to the screen width and height % relative to the screen height. The central `spinbutton` layer (unlike AUTO/NORMAL after v0.14.2) still inherited these nonuniform dimensions. Its child `#spin` was 60% by 60% of that non-square parent, so `border-radius:50%` produced an ellipse.

## Patch
- `play/release.js`: extend the existing Olympus 1:1 circle layout calculation to `spinbutton`. Its source layer width determines a physical square via `cqw`; its vertical center comes from the stored editable layer geometry. Neither live snapshots nor Studio source data are changed.
- `play/game.css`: apply square geometry to both the SPIN wrapper and interactive button while preserving its previous 60% diameter, ring art and rotor.
- Game and Studio version/cache keys advance to v0.14.3; no image files are rewritten.
- `studio/tests/layout_skins.test.mjs`: verify frame, center and edited Studio layer geometry, and unchanged snapshot.
- `studio/tests/ci_browser_smoke.py`: assert real DOM bounding box physical W/H for all three controls at 320×720, 390×844 and 430×932, including an iPhone standalone physical-height simulation.

## No changes
- RNG, paytable, payout, credit, spin animations, settings behavior, artwork, approved gold frame design, labels and PWA splash remain intact.

## Deployment gate
1. GitHub Actions Node tests and Chromium smoke pass on PR.
2. Merge only green PR into `main` and verify Railway source-linked deploy terminal `SUCCESS` and replicas online.
3. User verifies on actual Home Screen iPhone PWA.

## Links
- Game: https://skygate-web-production.up.railway.app/play/
- Studio: https://skygate-web-production.up.railway.app/studio/
- Source: https://github.com/9dbit/Skygate
