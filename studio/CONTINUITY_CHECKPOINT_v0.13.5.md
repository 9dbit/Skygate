# Skygate v0.13.5 · continuity checkpoint

**30 October 2026 (Asia/Jakarta)**

## UI changes
- Three multi-gradient cloud mist and lightning-flash layers are inserted into the existing Zeus FX wrapper before the guardian, sharing x/y/size/rotation and lower z-index. No new project asset required.
- The central medallion spins at idle at 17s per revolution and during active spin at 1.8s. Static simplified rustic-gold frame, static CSS gradient shell; Battery Saver and reduced-motion turn motion off.
- The CREDIT and BET panels are split into two discrete metallic capsules derived from existing editable control-layer bounds, with z below labels and +/- controls. The previous merged panel stays in DOM but is hidden only if the split geometry fits, avoiding data mutation.
- The same shared renderer serves Game, Live Studio preview and Studio draft preview; source art, logo, virtual credits, RNG, payouts and durable published snapshots unchanged.

## Validation
- Node test coverage in `layout_skins.test.mjs` added for geometry, visibility, Zeus layering, idle/frame/battery animation; the CI browser smoke checks rotor motion and battery-saver state.
- GitHub Actions QA workflow runs `npm test`, git diff check, and Chromium 320/390/430 mobile tests on pull request. Confirm its completion before merging.
- Native iPhone Safari and physical GPU/audio tests remain unverified.

## Target
- GitHub `9dbit/Skygate` `main`; Railway Skygate production environment service `skygate-web`.
- Game: https://skygate-web-production.up.railway.app/play/
- Studio: https://skygate-web-production.up.railway.app/studio/
