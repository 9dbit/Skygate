# SKYGATE v0.5 — Portrait Game & Studio

Greek-mythology-inspired **virtual-credit** game development playground. Includes a layout studio, modular icon assets, original music and sound effects, math experimentation, free spins, and simulated jackpot controls. This is not connected to deposits, withdrawals, or real-money gambling.

- `/` or `/studio/` - studio editor (optional password protection) (mobile 9:16 preview, edit layers, asset swap, audio, math, win, jackpot settings)
- `/play/` - illustrated portrait game v0.5 (virtual credits)
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

### v0.4.2 route protection fix

- Decode and normalize URL paths **before** Studio authentication, so encoded separators or parent segments cannot bypass the private route boundary.
- Serve files only from the Studio and playable app directories; repository configuration and hidden files are not web routes.
- `npm test` includes 25 passing tests covering route protection, login, public endpoints, redirects, fail-closed configuration, and the existing game math.
- GitHub `main` is connected to the existing Railway `skygate-web` production service. Verify a release through the matching deployment commit and terminal `SUCCESS`; `/health` reports the runtime version.

Current handoff: `studio/CONTINUITY_CHECKPOINT_v0.5.md`. Previous v0.4/v0.4.1 deployment-status notes are historical; v0.4.1 at `8681099c` was confirmed deployed before this patch. Native iPhone Safari and authenticated browser UI checks are still pending.


### v0.5 illustrated playable game

`/play/` now uses the Skygate reference composition: illustrated guardian/logo header, burgundy/gold 6×5 board, separate jewel sprites, live win banner, purple spin control and compact mobile deck. The hero illustration is a composed scene; board symbols, numbers, animations and buttons are independent live elements. The main screen no longer displays the old research-demo header.

- Spin, tumble, free-spin outcomes, auto 10 / stop, turbo, bet controls, sound, rules/paytable, replay, JSON export and reset are wired.
- The two feature buttons open free-spin rules and the win table. Bonus purchase and ante betting are not implemented or advertised as functioning controls.
- Menu contains deterministic research controls. The synthetic math engine is unchanged; the virtual ledger settles before animation so a rendering interruption cannot lose awards.
- Sound uses the existing tap-activated Web Audio mixer and MP3 tracks. Auto stops and audio pauses when the page is hidden; returning requires a tap to restart sound.
- `npm start` / `npm test` prepare the public game asset bundle. Docker prepares it after archive extraction. Only an explicit list of shipped art/audio is copied; Studio routes and project files retain authentication.
- Game sessions start at 100,000 virtual credits / 20 bet. Reloading starts a new session. Studio browser-local edits do not publish to the public game automatically.
- Runtime version is 0.5.0; the Studio editor retains its independent v0.4.2 interface version.
