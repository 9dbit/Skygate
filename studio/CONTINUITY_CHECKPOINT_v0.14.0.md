# SKYGATE · Continuity Checkpoint v0.14.0

**Date:** 2026-10-31 · Asia/Jakarta

## User request
Fix installed iPhone PWA splash and gameplay blank bands. Artwork/background must reach top and bottom end-to-end. Gameplay should take advantage of the vertical room while retaining native iOS safe-area clearance. Replace emoji/Unicode play symbol with a vivid emissive metallic icon. Patch engine directly without preview.

Reference screenshots supplied: `IMG_3625.jpeg` (splash), `IMG_3626.jpeg` (gameplay).

## Implementation
- `play/game.css`: mobile portrait `body` and `.game` fill `100dvh` and `100vw`, never center a 9:16 card or leave outside letterbox bands; safe-area inset stage preserves iPhone status bar and home gesture clearance.
- The full-screen Olympus backdrop uses the existing release snapshot `sky` asset with `object-fit:cover` behind published layers. No duplicated or rewritten customer artwork.
- `#bootSplash` and `.splash-art` fill dynamic visual viewport from top through bottom. Top and footer contents separately use iOS safe-area insets.
- `play/index.html`: original emissive cyan-sapphire / antique-gold vector Play icon replaces the text glyph `▶`. PLAY label, a11y semantics and JS click target unchanged.
- `play/release.js`: existing shared Game/Studio Olympus scene renderer gets one decorative viewport backdrop sourced from the published sky layer. No changes to Live JSON, RNG, credits, reel timing, payouts or audio.
- Desktop / landscape keeps the existing framed 9:16 stage.
- `studio/index.html`, bundle version, QA version markers updated to v0.14.0.

## QA gates
- GitHub Node test suite and Chromium smoke must both pass before merge.
- Chromium in 320×720, 390×844 and 430×932 mobile portrait viewports asserts splash and gameplay bounds fill the viewport, Play uses SVG instead of Unicode, and sky backdrop image loads when published Olympus scene exists.
- Studio Live/Editor preview remains the shared renderer; iOS Safari physical PWA still needs user verification.

## Release links
- **Game:** https://skygate-web-production.up.railway.app/play/
- **Studio:** https://skygate-web-production.up.railway.app/studio/
- **Repository:** https://github.com/9dbit/Skygate

## Rollout
Merge PR to main after green CI; Railway source-linked automatic build; verify terminal SUCCESS with running 1/1 replica before reporting production.
