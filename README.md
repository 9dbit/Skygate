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

### v0.6 Studio releases

Open **Preview & Publish** in Studio. Prepare a snapshot, inspect its private playable preview, then publish that exact snapshot. Layouts, shipped/custom images, audio mixes and uploads, math, virtual jackpot settings, seed, starting credit and bet are included. The live game loads one immutable release at page load. An ongoing session never changes math mid-round.

- Releases persist on the Railway volume mounted at `/data`. Local development uses `.local-data`; `SKYGATE_RELEASE_DIR` overrides the storage root. Production publishing fails closed without durable storage or Studio authentication.
- Draft previews and assets require the existing Studio login. Publishing deliberately makes the selected snapshot and its assets public. Editor-only metadata and arbitrary filesystem paths are excluded.
- **Rollback** switches to the preceding live snapshot (or the bundled game after the first release). Published asset URLs remain available for existing sessions. A version check rejects concurrent stale writes.
- **Load snapshot into editor** restores its configuration and custom assets in any authenticated browser. Editing remains local until the next explicit snapshot/publish. Export changes ZIP before replacing local work.
- Images are converted to PNG before upload (up to 4096 px, 6 MB each). Audio supports MP3/OGG/WAV (12 MB each); combined custom assets are limited to 24 MB per snapshot. Archive limits: 24 snapshots / 350 MB of uploaded data. Old versions are not silently deleted.
- Fixed game bindings (reels, spin, win, credit/bet and control ids) must remain visible inside the canvas. Their positions and sizes remain editable. Free Spins and Win Table open rules; bonus purchase/ante are not implemented.
- Seed 41 now completes its natural free-spin round and replay; the previous undefined variable in the bonus animation has been removed. Multiplier, big-win and virtual jackpot overlays respect reduced motion. Page hide stops Auto/audio; a fresh tap resumes sound.

Validation: automated HTTP publication/rollback, restart durability, draft isolation, auth/CSRF, schema/media limits, seeded bonus and published-game integration. Native iPhone Safari/audio hardware validation remains pending.

### v0.7 portrait UI redesign

The bundled `/play/` screen now uses a midnight palette, fine gold board edge, compact win card, and a symmetric Auto / Spin / Turbo dock. Secondary rules buttons use consistent vector icons. Balance and bet share a separate wallet row. Orb multipliers are rendered as circular live elements, while published Studio snapshots retain their custom sprite bindings.

The main screen shows short Indonesian round feedback; seed, round and tumble diagnostics remain in the menu. The redesigned sheets, reduced-motion support, safe-area sizing and non-scrolling portrait stage preserve existing controls and game outcomes. The clean spin SVG is an additional shipped asset, so older Studio layouts can keep their original spin artwork.

Validation: 36 automated checks pass, including deterministic spins, free spins, replay, virtual-credit accounting and the publication/authentication workflow. Browser visual verification is recorded separately from native iPhone testing.

### v0.8 Studio artwork skins

Temporary public Studio testing is an explicit opt-in: set `SKYGATE_STUDIO_PUBLIC_TESTING=true` on the Skygate service. This opens the editor, draft previews and publishing/rollback to anyone who can reach the URL. It does not change `NODE_ENV`, remove existing credentials, change persistent storage or disable same-origin/CSRF checks. Set it to `false` to restore the existing password protection. Use only while the owner intends the test editor to be public.

Studio imports can now set `presentation: "olympus-gold"`, use a shared image skin on independently editable circular controls, and retain normalized source-crop geometry without changing source image bytes. Optional `minusbtn` / `plusbtn` layers place functioning bet controls on the stage; older projects retain their menu bet controls. Auto/Turbo captions can be separate live text layers.

The Olympus preset is in `studio/themes/olympus-gold/project.json`. Its portable asset ZIP supplies the generated images, matching existing jewel sprites and vector control glyphs. Build the package with `scripts/build-olympus-package.py <asset-workspace>` (Pillow and CairoSVG required). A standalone playable review can be built with `node scripts/build-play-preview.mjs <output.html> <project.json> <source-paths.json>`.

40 automated tests cover skin/crop validation, live control bindings, legacy layouts, explicit public Studio testing and existing game/publication protections. The public-testing option preserves the configured password and requires an explicit service variable. Deploying the renderer does not itself publish the Olympus project or alter the active release; import and publication are separate Studio actions.
