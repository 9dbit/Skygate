# Skygate v0.13.4 · continuity checkpoint

**30 October 2026 (Asia/Jakarta)**

## Scope
- Separate blue-white electric bolts and gentle sky flash behind guardian / Zeus. Alignment follows x, y, width, height, rotation, and z-index of current Live or Draft guardian.
- Only source/runtime files changed. Existing published snapshot on Railway volume and in-browser draft data untouched. In particular the approved logo and 50% background opacity are preserved.
- No real-money gaming, credits, math, autoplay, buy-spin or audio changes.
- Respects reduced motion and Battery Saver.

## Changed code
- `play/release.js` render layer.
- `play/game.css` timing/effects.
- `play/index.html` versioned cache tokens.
- `studio/tests/layout_skins.test.mjs` regressions.
- `package.json`, `studio/index.html`, `README.md` release metadata.

## Testing
- V8 parsing and mocked DOM renderer behavior checked.
- Node test file updated, full CI, browser pixels and physical iPhone tests remain to be validated.

## Links
- Game: https://skygate-web-production.up.railway.app/play/
- Studio: https://skygate-web-production.up.railway.app/studio/
