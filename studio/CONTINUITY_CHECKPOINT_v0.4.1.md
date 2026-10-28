# SKYGATE Studio v0.4.1 | Continuity checkpoint

> Historical preparation notes. Deployment status below is superseded by `studio/CONTINUITY_CHECKPOINT_v0.4.2.md` (or the adjacent file when reading inside `studio/`). v0.4.1 was subsequently deployed and its Studio password configured.
**Prepared:** 28 October 2026, Asia/Jakarta  
**Base repo:** `9dbit/Skygate` branch `main`, expected production commit `5203d1e3c990fc624acb66573731eb8832070091`.  
**Railway:** project `626b6a33-c7f1-4ec5-a9c7-6834349fa3bd`, service `fff3472b-24bb-418c-aa11-0f95cfd53390`, environment `588a155b-2cb3-4f42-b2fa-254a6aa3cd3c`.

## Current status

- Version v0.4.1 is **built and locally QA-verified**, not pushed and not deployed. Last verified production remains v0.3.1 / commit `5203d1e3`.
- Earlier GitHub connector writes and Railway environment-variable writes were rejected by safety checks. **Do not bypass those restrictions** or claim a production update until authorized actions and deployment verification succeed.
- Full overlay patch includes v0.4 and this v0.4.1 follow-up. Apply to an existing checkout only after checking the branch head and reviewing diff.

## Changes v0.4

Mobile dock / inspector, portrait viewport scaling, 13 MP3 fallback tracks, audio tap-to-enable, full ZIP export/import with binary asset override restore, optional server-side Studio HTTP Basic authentication. Mathematical engine and virtual-credit rules are unchanged.

## Changes v0.4.1

- If iOS suspends AudioContext after an app switch, `pointerdown` now tries user-gesture-based resume again without touching an already running context.
- `SkyAudioMixer.play()` checks suspended context and attempts re-unlock before decoding/starting sound.
- `AudioBufferSourceNode` and `GainNode` are disconnected when an ended/replaced source completes, preventing connection accumulation.
- Health report displays v0.4.1. Added audio suspend/resume regression and private-route smoke checks.

## Local QA

- `npm test`: 6/6 passed; `node --check` passed.
- Viewports 320, 375, 390, 768, 1440px: no horizontal overflow or JS errors in headless Chromium.
- Browser editor flows: audio unlock, MP3 playback, upload, math edit, ZIP export/import, deterministic virtual-credit spin and replay neutrality passed.
- Simulated `AudioContext.suspend()` and re-enable on a fresh tap passed. **Not an actual iPhone Safari hardware test.**
- Auth smoke: 7/7 checks with password, 3/3 fail-closed/public-route checks without required password.

## Deploy gates

1. Authorized GitHub write path must be available. Expected base commit `5203d1e3...`, do not force push.
2. Set Railway `SKYGATE_STUDIO_USER`, strong `SKYGATE_STUDIO_PASSWORD` and `SKYGATE_STUDIO_REQUIRE_AUTH=true` securely. Never commit credentials.
3. Push verified patch; Railway auto-deploy on `main`. Poll until newest deployment shows `SUCCESS` and commit matches.
4. Confirm `GET /health` reports `0.4.1`; unauthenticated `/studio/` and media return 401; authenticated requests 200; `/play/` remains 200.
5. Test actual Safari on physical iPhone (sound unlock, mute, trim, app switching, import ZIP and layout), then approve production.

All outcomes remain fictional **virtual-credit** demonstration only; no deposits, payout rails, cash-out or real-money operator integration.
