# Skygate v0.13.6 continuity checkpoint

**30 October 2026 (Asia/Jakarta)**

## Approved reference
- Screenshot approved by user: 9:16 Skygate 5000 with centered sapphire/gold WIN UP TO 1000x pill, symmetric matching BUY SPIN/CREDIT/BET frames and smaller gold circular spinner.
- Promotion slogan 1000x is a visual change, not a math cap change. Actual published round cap is governed by current Game Rules (currently 5000x) and remains unchanged.
- Reference screenshot is not embedded into the gameplay. UI elements remain real functional HTML controls.

## Changes
- `play/index.html`: accessible centered 1000x badge text and versioned cache token.
- `play/game.css`: 52%-wide x-centered pill, sapphire gems, bright antique-gold trim, smaller (60%) spinner and stationary ring.
- `play/release.js`: CREDIT and BET shells reuse the actual BUY SPIN image and crop, using Buy/Booster x/width and the shared controlboard y. Geometry safety fallback for edited Studio projects; published state untouched.
- `play/game.js`: home feature screen matches 1000x promo and directs viewers to Game Rules for actual cap.
- `studio/index.html`: same updated stylesheet via shared game preview.
- Regression tests cover exact frame reuse, symmetric geometry, popup text, banner centering and spinner functionality.

## Validation
- Node tests and Chromium 320/390/430 mobile browser smoke are mandatory on PR.
- Public game and Studio frame parity validated via common renderer and stylesheet.
- Native iPhone Safari/GPU not yet verified; user screenshot is the visual acceptance reference.

## Links
- Game: https://skygate-web-production.up.railway.app/play/
- Studio: https://skygate-web-production.up.railway.app/studio/
