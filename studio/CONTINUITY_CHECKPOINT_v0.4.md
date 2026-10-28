# SKYGATE Studio v0.4 continuity checkpoint

> Historical preparation notes. Deployment status below is superseded by `studio/CONTINUITY_CHECKPOINT_v0.4.2.md` (or the adjacent file when reading inside `studio/`). v0.4.1 was subsequently deployed and its Studio password configured.
**28 October 2026 (Asia/Jakarta)**

## Deployed target

- GitHub `9dbit/Skygate`, branch `main`. Keep v0.3.1 commits as history.
- Railway project `Skygate` (`626b6a33-c7f1-4ec5-a9c7-6834349fa3bd`), service `skygate-web` (`fff3472b-24bb-418c-aa11-0f95cfd53390`), environment `production` (`588a155b-2cb3-4f42-b2fa-254a6aa3cd3c`).
- Studio `/studio/` supports HTTP Basic authentication from Railway secret variables, pending configuration. Until configured it remains public for v0.3 compatibility. Activate before sensitive production editing. Playable public `/play/` still uses v0.2 synthetic research mechanics.

## v0.4 implemented

- Persistent mobile dock, bottom-sheet inspector, mobile layer selector and mobile asset grid. Dynamic 9:16 stage scaling and reduced-motion animation opt-out.
- Original OGG assets retained; 13 MP3 fallback tracks encoded locally from original synthesized sounds. Web Audio unlock on user gesture, buffered playback, fades, seek, trim, looping and master/channel volume.
- Import ZIP of exported changes, including settings and uploaded image/audio blobs, checksummed ZIP entries and size/path guards. Browser localStorage + IndexedDB; no backend persistence.
- Studio private-route auth available in production (401 if unauthorized once enabled; 503 if `SKYGATE_STUDIO_REQUIRE_AUTH=true` and password not configured). `/play/` and `/health` public.
- Unit tests and headless Chromium browser checks. Physical iPhone Safari verification is still required; Chromium mobile emulation does not prove iOS audio.

## Follow-up

1. Test in native Safari on iPhone 15 Pro and iPhone 11 Pro, including music start, mute, trim, audio upload and app switching.
2. Polish high-resolution transparent sprites and full-screen play renderer (currently v0.2 visual proof of concept).
3. Consider cross-device encrypted project sync and role-based auth as a separately approved backend feature.
4. All probability, jackpots and RTP estimates use synthetic virtual-credit examples, not licensed proprietary math. No deposits, wallets or cash prizes.
