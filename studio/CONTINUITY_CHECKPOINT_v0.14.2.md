# SKYGATE · Continuity Checkpoint v0.14.2

**Date:** 2026-10-31 · Asia/Jakarta
**Scope:** AUTO and NORMAL / spin-speed button circular geometry in portrait PWA.

## Reported issue
Physical iPhone screenshot `IMG_3630.png` shows the two flanking gold action rings stretched in portrait standalone mode. User specifically requests mathematically perfect 1:1 circles, not a replacement render or preview image.

## Root cause
The Olympus 1080×1920 authoring canvas is presented inside a full-viewport game shell. Published layer width is derived from screen width, but published layer height is derived from screen height. On tall PWAs, the round buttons inherit a non-square physical rectangle; the cropped gold ring and button are stretched along with it.

## Patch
- `play/release.js`: only `autobtn` and `turbobtn` in Olympus presentation get `published-mode-circle`. The physical diameter comes from layer width in `cqw` for both dimensions. `top` uses saved Y-center minus half diameter to keep the center in place.
- `play/game.css`: both control shell and interactive mode buttons are strictly 1:1 with `border-radius:50%`, without changing button artwork or the click target.
- `play/index.html`, `studio/index.html`, `package.json`: bump to v0.14.2 with cache-busting.
- `studio/tests/layout_skins.test.mjs`: verify source snapshot unchanged, size and center calculations, and respect manual Studio X/Y/W edits.
- `studio/tests/ci_browser_smoke.py`: measure actual layer and tap-target bounding boxes at 320×720, 390×844 and 430×932 in Chromium.

## Unchanged
Gold texture, icon art, button labels, spinner, bottom navigation, splash, reel assets, mathematics, credits, payouts, RNG, audio and published snapshot assets.

## Release gate
Run GitHub Actions Node tests and Chromium browser smoke on the pull request. Merge only after both pass, then verify Railway production commit and terminal `SUCCESS`. Physical iPhone display should be checked by user afterward.

## Links
- Game: https://skygate-web-production.up.railway.app/play/
- Studio: https://skygate-web-production.up.railway.app/studio/
- Repository: https://github.com/9dbit/Skygate
