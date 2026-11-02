# Skygate: music starts from splash PLAY

Date: 2026-11-03 (Asia/Jakarta)
Base: main 546c25f9f0175454de44a371b7a424882c5c4932, including Playground heartbeat.

## User report
An edited background music track was silent on gameplay entry until the Sound control was pressed. The user requires music to activate from the splash PLAY tap.

## Root cause and fix
The splash entry handler only revealed the game. The existing game initialized sound=false and the mixer muted=true; only the Sound handler performed the required synchronous user-gesture AudioContext unlock and then started bgm_celestial_loop.

The splash handler now invokes that existing audio control once, synchronously inside a trusted PLAY tap, after removing game inertness. It does not await network/decoding before unlocking. It does not create a second player or bypass the published track resolver. Sound already ON is left ON, duplicate entry cannot toggle audio OFF, and automatic Studio preview remains silent. Audio failure does not block entry; the existing Sound control remains available for retry.

Only boot logic and its script cache key change in production. Gameplay layout, circular controls, animation, mathematics, uploaded assets, published volume/loop/fade settings, live release store, and Playground heartbeat are preserved. The underlying app remains v0.14.3; this is a narrowly scoped audio hotfix identified by its commit.

## Verification
- Local boot unit tests: trusted tap synchronous start, no loading autoplay, duplicate tap safety, already-on preservation, silent Studio preview, synthetic-event safety, failure isolation, and manual mute/unmute. The original loader fails the new activation tests; the patched loader passes.
- GitHub general QA must pass.
- New audio QA runs actual Web Audio in Chromium with user-gesture-required autoplay policy and in WebKit.
- Browser QA uploads a generated WAV through local Studio stage/publish APIs into a disposable release store, then verifies public game plays that media path with custom master volume, track volume, loop and fade preserved.
- Verify non-zero audio signal, exactly one active BGM channel, mute/unmute, and silent automatic Studio preview.
- Existing release validation publishes track id/name/loop/volume/fade only; rate and trim are not in that schema. QA uses the actual public contract and checks default full-file timing. This hotfix does not change that schema or claim to add rate/trim publication.
- Native iPhone speaker/PWA verification remains a physical-device check after rollout.

## Delivery gates
Merge only after all required QA passes, then confirm Railway production deployment SUCCESS for the merged commit. Do not replace or republish the owner's stored Studio project. Final CI/deploy evidence can be recorded in the pull-request rollout comment without redeploying for documentation alone.

Game: https://skygate-web-production.up.railway.app/play/
Studio: https://skygate-web-production.up.railway.app/studio/
