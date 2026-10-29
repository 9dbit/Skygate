# Skygate v0.13.9 · App Touch Icon Hotfix

**2026-10-30 · Asia/Jakarta**

## Diagnosis

The published v0.13.8 Apple Touch icon points at a tiny 48×48 PNG. That is inadequate for iPhone Home Screen installation and can show as a blank/white placeholder, especially with Safari's icon cache. The original supplied image is valid and not white.

## Fix

- Imported high-resolution PNG assets derived from the approved 1254×1254 Zeus/SKYGATE 5000 artwork:
  - `play/icons/skygate-touch-48-v0139.png` (48×48 favicon)
  - `play/icons/skygate-touch-180-v0139.png` (180×180 Apple Touch)
  - `play/icons/skygate-touch-192-v0139.png` (192×192 Android/PWA)
  - `play/icons/skygate-touch-512-v0139.png` (512×512 Android/PWA)
  - `play/icons/skygate-touch-maskable-512-v0139.png` (512×512 maskable)
- All PNG assets are physically checked in to GitHub; runtime does not require remote image downloads or resize libraries.
- Added `/apple-touch-icon.png`, `/play/apple-touch-icon.png` and `/studio/apple-touch-icon.png` fallback paths from the same real 180×180 PNG.
- Updated Game and Studio HTML `apple-touch-icon` and `icon` links to new filenames, with explicit `sizes`.
- Updated `/play/manifest.webmanifest` and created `/studio/manifest.webmanifest`, with valid 192, 512, maskable sizes and separate scopes.
- Updated code version to 0.13.9 and asset cache keys to bypass the old icons.
- Math, RNG, credits, sounds, reels, promo, Studio draft and published Live release files are not touched.

## QA

- Node regression validates PNG magic, actual embedded IHDR dimensions, all fallback assets, manifest contents and links.
- Python Chromium smoke additionally fetches every icon over HTTP, asserts 200, image/png MIME, PNG signature, correct dimension and 192/512 PWA manifests.
- GitHub Actions Node and Chromium jobs must pass before merge.
- Railway production must report terminal SUCCESS and 1/1 running replica after merge.
- Manual iPhone Safari Home Screen visual verification requires removing the old white shortcut and re-adding after deployment; native iOS cannot be simulated by Chromium.

## Checkpoint links

**Game:** https://skygate-web-production.up.railway.app/play/

**Studio:** https://skygate-web-production.up.railway.app/studio/

**Repo:** https://github.com/9dbit/Skygate
