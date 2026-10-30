# SKYGATE · Continuity Checkpoint v0.14.1

**Date:** 2026-10-31 · Asia/Jakarta
**Scope:** iPhone PWA splash / gameplay viewport and persistent UI alignment.

## User screenshots
- `IMG_3628.png`: splash Zeus darkens into an empty strip at the bottom.
- `IMG_3629.png`: game footer background stops short, 1000x pill floats above WIN panel, BET setting sits below MENU/VOLUME/RULES.

## Root causes
1. `100dvh` on iPhone standalone can be smaller than the physical display; the fixed splash and game stage then leave a dark bottom zone.
2. Splash gradient faded to an opaque near-black at 100% height and obscured the background artwork.
3. `#promoBadge` and `#betMenu` were children of the outer game viewport, while WIN banner and the other footer controls were inside the safe-area-offset published scene.

## Patch
- `play/index.html`: early, standalone-only physical-height measurement (screen.height clamped against visual viewport), updated on resize/orientation/page restore; cached CSS and scripts use v0.14.1 query strings.
- `play/game.css`: use `--sg-pwa-full-height` on portrait PWA stage and splash, fallback to dynamic viewport; use `100lvh` for standalone CSS fallback; preserve the lower splash artwork with a translucent fade.
- `play/release.js`: reparent the 1000x promo pill and BET button into the same published scene as the WIN panel and MENU; WIN pill Y derives from the editable `winbanner` layer with a 0.2%-height overlap. Preserve the published layout JSON.
- `studio/index.html`: shared Studio version and cache-busting updated.
- No changes to RNG, spin motion, artwork assets, payouts, virtual credit amounts, media storage or audio.

## Regression gates
- Node tests verify promo follows Studio winbanner Y edits, BET is in the same scene as MENU, and source snapshots remain unchanged.
- Chromium checks horizontal center, WIN-frame attachment, BET/MENU baseline and interactive pointer events on 390px viewports.
- Standalone simulated with screen.height=932 and viewport innerHeight=844 checks splash artwork and gameplay both reach 932px.
- Real iPhone standalone physical visual QA remains to be confirmed by user after deploy.

## Production
- Game: https://skygate-web-production.up.railway.app/play/
- Studio: https://skygate-web-production.up.railway.app/studio/
- Repository: https://github.com/9dbit/Skygate
- Deploy method: GitHub PR -> green CI -> main -> Railway source-linked automatic deployment, verified SUCCESS.
