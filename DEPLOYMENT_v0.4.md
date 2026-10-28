# SKYGATE Studio v0.4 | Deploy checkpoint

**Prepared:** 28 October 2026 (Asia/Jakarta)  
**Previous live commit:** `5203d1e3c990fc624acb66573731eb8832070091` (`main`)  
**Repository:** <https://github.com/9dbit/Skygate>  
**Railway project:** `626b6a33-c7f1-4ec5-a9c7-6834349fa3bd`  
**Production environment:** `588a155b-2cb3-4f42-b2fa-254a6aa3cd3c`  
**Web service:** `fff3472b-24bb-418c-aa11-0f95cfd53390`

## Status

v0.4 local changes and tests complete. **GitHub write was blocked by connector safety checks. No v0.4 commit or deployment is claimed.** The v0.3.1 production deployment remains the verified live release until a subsequent authorized push. Do not confuse the prepared ZIP with a GitHub commit.

## Changes

- Mobile bottom navigation with persistent 7-tab dock, reachable inspector sheet, per-layer mobile picker and asset grid.
- Viewport scaling for 320, 375, 390 px mobile, tablet and desktop. No observed horizontal overflow in Chromium QA.
- New Web Audio mixer, explicit tap-to-enable, original MP3 fallback files for 13 tracks (existing OGG originals retained). No automatic autoplay.
- Portable JSON + custom media ZIP import and export with integrity/path/size guards.
- Optional HTTP Basic studio access: when `SKYGATE_STUDIO_PASSWORD` is present, `/studio/` and its assets require credentials. `SKYGATE_STUDIO_REQUIRE_AUTH=true` fails closed while password is missing. Public `/play/` and `/health` unaffected.
- Unit tests 6/6, browser QA covering five viewports, MP3 playback and ZIP round-trip.

## Apply patch to existing clone (not yet executed)

1. Ensure `9dbit/Skygate` branch `main` is at the expected base commit, or review and merge any intervening commits.
2. Extract `Skygate_v0.4_Studio_Patch.zip` **over the cloned repository**, preserving its existing `media_assets.tar.gz` (the v0.3 OGG and visual archive). The patch adds `audio_mp3.tar.gz` and updates source files; it does not require destructive deletion.
3. Run `npm test` and `node --check studio/studio.js`. Confirm `tar -tzf audio_mp3.tar.gz` lists 13 MP3 files.
4. Commit and push only after verifying the diff: `git add -A`, `git commit -m "feat: Skygate Studio v0.4 mobile editing and iOS audio"`, `git push origin main`. **Do not force push.**
5. Railway is connected to `9dbit/Skygate` `main` and normally deploys on push. Verify a new deployment reaches `SUCCESS` with the new commit SHA.
6. Recommended before private editing: configure `SKYGATE_STUDIO_USER` and a strong `SKYGATE_STUDIO_PASSWORD` in Railway service variables. To require protection even when the password is absent, set `SKYGATE_STUDIO_REQUIRE_AUTH=true`. Avoid putting secrets in GitHub, ZIPs, public tickets, logs, or screenshots.
7. Verify `/health`, `/studio/`, `/studio/assets/audio/bgm_celestial_loop.mp3` (under auth if enabled), and `/play/`. In physical iPhone Safari, test audio unlock, BGM, SFX, asset upload, backup ZIP and keyboard safe-area.

## Important limits

- Gameplay uses fictional, virtual-credit mathematics and is **not** a licensed real-money slot or certified RNG.
- Editor project changes persist in **that browser's** localStorage and IndexedDB. There is no server-side project database or multi-device collaboration.
- Mobile Chromium emulation does not verify physical Safari sound, audio focus handling, or app-switch recovery.
- The legacy commercial-game artwork is **not** included, and flattened screenshot cutouts are not native PSD layers.
