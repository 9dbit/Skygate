# SKYGATE Studio Editor v0.4.1

Greek-mythology-inspired **virtual-credit** game development playground. Includes a layout studio, modular icon assets, original music and sound effects, math experimentation, free spins, and simulated jackpot controls. This is not connected to deposits, withdrawals, or real-money gambling.

- `/` or `/studio/` - studio editor (optional password protection) (mobile 9:16 preview, edit layers, asset swap, audio, math, win, jackpot settings)
- `/play/` - virtual-credit playable proof-of-concept v0.2
- `/health` - Railway liveness endpoint

### Run

Production uses `Dockerfile` on Railway. It unpacks `media_assets.tar.gz` and `audio_mp3.tar.gz` into the matching `studio/assets/...` paths, preserving **separate files** for every image and audio track.

For local development:

```bash
mkdir -p .tmp
# The media archive paths are relative to this repository root.
tar -xzf media_assets.tar.gz
tar -xzf audio_mp3.tar.gz
npm test
npm start
```

Go to `http://localhost:3000` after starting the server. `npm start` requires Node 20+; no NPM dependencies are needed.

### Source and asset editing

All logic is readable/editable in `studio/*.js`, `studio/math/`, `studio/index.html` and `studio/studio.css`. Individual PNG, SVG, JPEG, OGG and MP3 files load from `studio/assets/`. PNG/JPEG/OGG masters are collected in a **lossless tar archive** and iPhone-compatible MP3 backups in `audio_mp3.tar.gz` for the initial repository handoff; extracting it restores individual files. SVG assets and JSON manifests remain directly browsable on GitHub.

The editor saves customizations in local browser storage; the demo does not synchronize project changes between browsers. Export JSON or ZIP to move your project changes. Studio settings are for **synthetic, auditable game math**, not per-player outcome manipulation. Real-money uses require legal review, licensing, independent game-math/RNG certification and server-side financial accounting.

Documentation: `studio/README_STUDIO.md`, `studio/ASSET_CATALOG.md`, `studio/MATH_AND_JACKPOT.md`, `studio/CONTINUITY_CHECKPOINT_v0.3.md`.

### v0.4 mobile and privacy

- **Mobile editor dock:** Canvas / Layers / Assets / Sound / Wins / Jackpot / Test, with a bottom-sheet inspector and direct layer picker; tested at 320/375/390 px Chromium emulation.
- **Mobile sound:** an explicit audio unlock and a Web Audio mixer keep delayed win/jackpot events audible after a user tap. 13 original MP3 fallback tracks for Safari (OGG source masters retained). No autoplay.
- **Portable backups:** exported changes ZIP now imports the full edited project JSON **and** custom image/audio overrides back into IndexedDB. JSON alone includes configuration only. No server database or cross-device sync.
- **Production studio protection:** only `/studio/` and `/` require HTTP Basic auth under `NODE_ENV=production`. Set environment variables `SKYGATE_STUDIO_USER` and `SKYGATE_STUDIO_PASSWORD` in Railway before deployment. With `SKYGATE_STUDIO_REQUIRE_AUTH=true`, a missing password fails closed (503); without that switch, protection activates as soon as a password is supplied. Until configured, the Studio stays public like v0.3, so do not store sensitive project data there. `/play/` and `/health` remain public. Do not commit credentials.
- **Limitations:** Native iPhone Safari hardware/audio testing remains pending. Virtual credits only, no real-money features.

Continuity: `studio/CONTINUITY_CHECKPOINT_v0.4.md`.

### v0.4.1 audio regression fix

- Resume Web Audio after iOS WebKit suspends an audio context during an app switch: a **new user gesture** unlocks it again. No audio starts automatically on return.
- Disconnect completed or replaced buffer sources and gain nodes, avoiding lingering audio graph connections during rapid SFX replacement.
- Added a simulated suspension/resume regression test in Chromium. This is **not** physical iPhone Safari certification.

Deployment from GitHub is pending connector write access; production remains at v0.3.1 until an authorized commit is pushed.
