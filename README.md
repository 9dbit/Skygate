# SKYGATE — Portrait Game & Studio

### v0.13.9 — Apple Touch Icon white-screen repair

- Fixed the old 48px favicon incorrectly used as an iPhone icon: the user-approved Zeus / SKYGATE 5000 artwork now has real 180×180 Apple Touch, 192×192 PWA, and 512×512 PWA + maskable PNG files.
- Each icon has a new v0139 filename to avoid Safari's sticky Home Screen caching. Game and Studio have separate manifests and explicit Apple icon metadata, while fallback /apple-touch-icon.png routes cover implicit device discovery.
- Game credits, reels, probability/math, saved Live releases, audio and editor state are unchanged.
- QA verifies binary PNG dimensions, file contents, metadata, network delivery and responsive gameplay. After this release installs, any existing white Home Screen shortcut should be deleted and added again using Safari.


### v0.13.8 — Zeus 5000 touch icon

- Added Zeus / Skygate 5000 artwork as the app icon, updated Play and Studio icon links and provided an installable PWA manifest with a consistent Home Screen identity. The latest GitHub embedded asset is a compact 48px derivative; keep the full-resolution 180/192/512px source outputs for a future asset-quality upgrade.
- No changes to gameplay, user credits, studio release, or runtime math.


### v0.13.7 — gold credit stack, poker chip and balanced BET steppers

- On the existing Olympus gold pill-shaped panels, the visible CREDIT label becomes a glossy stack of gold coins at the left edge. The visible BET label becomes an original illustrated gold/navy poker chip, positioned left of the live bet amount.
- The minus button mirrors the plus button's 26px inset from the respective left/right ends of the BET panel. Existing published layouts with legacy minus x=643 are corrected at render time; the imported Olympus Studio preset now has x=577, and designer-moved controls remain editable.
- Decorative SVGs are inline and aria-hidden. Screen-reader-only captions still identify both credit and bet values, preserving the actual live numeric DOM and control handlers.
- Both panels continue using the real BUY SPIN image and crop. The UI patch does not alter credits, round math, buy/spin operations, popup mechanics, audio, or published snapshot data.
- QA covers Olympus renderer structure, clipping, matching inset, legacy fallback, accessible labels, and Chromium mobile rendering with working bet steppers.


### v0.13.6 — approved UI preview: sapphire 1000x pill and matching metallic panels

- WIN UP TO 1000x promo banner is centered (52% width), enlarged, with sapphire gems and double antique-gold edges. This changes promotional text only; the published game's actual 5000x round cap remains defined by Game Rules.
- CREDIT and BET use the **exact same BUY SPIN frame artwork and image crop**, aligned at identical widths and symmetric x positions. Their live amounts, +/- buttons and original Studio geometry remain independent and functional.
- The stationary gold spinner ring is reduced to 60% of its previous diameter, retains its center and its independent rotating inner symbol. Battery Saver and reduced-motion support remain intact.
- Changes run through the shared Game/Studio Live and Draft renderer. No changes to published snapshots, uploaded assets, probability/math, purchase cost, credit settlement, or audio.
- QA: new Node regression checks and Chromium 390px responsive banner centering. Physical iPhone Safari QA remains a separate checkpoint.


### v0.13.5 — luminous storm cloud, idle spinner, split control panels

- Layered sapphire/indigo volumetric cloud mist and synchronized thunder glow behind Zeus, linked to the existing guardian geometry and never overlapping its silhouette.
- Only the inner spinner medallion rotates slowly (17 s idle, 1.8 s during spin). A simpler fixed rustic-gold frame replaces the heavy animated-ring appearance; reduced motion and Battery Saver stop all rotor motion.
- CREDIT and BET use distinct static metallic panels aligned to their existing editable Game/Studio layers; original shared backdrop is concealed only when the layout can safely split. Saved artwork, math, credits and published snapshots are not modified.
- Gameplay and Studio use the same renderer and responsive CSS. Regression tests cover geometry, z-index, touch controls, motion preferences, and seeded settlement; native iPhone QA remains separate.


### v0.13.4 — Zeus lightning behind character

The common Game/Studio renderer now adds forked blue-white lightning and a subtle storm halo **behind Zeus**, following the existing guardian layer's geometry and z-index. It leaves the published snapshot, selected logo, 50% background opacity, spin controls, credit ledger, math, audio, and image assets untouched. Battery Saver and reduced-motion preferences suppress the FX. Regressions for z-order, alignment, artwork integrity and visibility are included. Native iPhone/GPU testing remains pending.

Greek-mythology-inspired **virtual-credit** game development playground. Includes a layout studio, modular icon assets, original music and sound effects, math experimentation, free spins, and simulated jackpot controls. This is not connected to deposits, withdrawals, or real-money gambling.

### Current release: v0.13.0 — Bonus Booster and Studio-editable spin timing

- Gameplay's Ante Bet feature is now branded **Bonus Booster** across the controls, help, history and accessible labels. The underlying +25% spin cost, bonus math, and Buy Spin restriction have not changed.
- Default reel animation targets are faster: NORMAL **1,800 ms** (was ~2,550 ms), QUICK **1,150 ms** (was ~1,645 ms), TURBO **650 ms** (was ~745 ms). These are reel-only timings, not tumble or win effects.
- In **Studio → Preview & Tests → Spin Speed**, edit NORMAL / QUICK / TURBO sliders. A draft's test renderer uses the edited timings. The server validates timings and includes them in a published snapshot; older snapshots get safe defaults.
- Reel transforms and stepwise deceleration remain unchanged. Timing has no influence on predetermined math outcomes or virtual-credit settlement.
- Full regression test and responsive Chromium QA are required for this release.

### Previous release: v0.12.1 — fast first paint, fixed spinner frame and smooth reel stops

- Studio opens the current Live snapshot in the same gameplay renderer. Edit/Playtest also use that renderer with local draft data; selection handles are the only editor overlay.
- Live and local Draft are labeled separately. Edit Live exports an existing draft ZIP before restoring the published project/assets; opening Studio never overwrites local work. Publish remains explicit.
- The spinner artwork is split into a stationary frame and a clipped rotating center. Studio crop/asset changes apply to both; battery saver and reduced motion stop the rotor.
- Normal reels settle in about 2.55 s. Each of six persistent strips completes identical banks, inserts the result offscreen and decelerates into view without an arbitrary transform reset. Web Animations use only transforms; temporary will-change, paint containment, predecoded textures and removing symbol filters during scrolling reduce rendering work.
- Winning cells charge for 1.25 s, burst for 1.30 s, and tumble for 650 ms. Fireworks use two waves of up to 20 sparks per winning cell and large radial trail sprites. Total pools remain bounded at 240 sparks and 30 flares, with no per-round DOM allocation.
- Purchase controls, popup and history now say BUY SPIN. The popup explains the Free Spins package and price. Ante shows BET +25%, a dynamic accessible cost label, and a rules explanation; costs, probability settings and purchase restrictions are unchanged.
- Shared obsidian/gold panels with sapphire actions across rules, settings, bet, autoplay, purchase, history and bonus screens.
- Main-screen Menu / Bet / Volume / Rules controls have labeled 44×46 px touch targets.
- A bottom fade overlays the background with black at up to 30% opacity, beneath functional controls.
- The existing gold wordmark is paired with a live sapphire-blue 5000 submark.
- Winning symbols vibrate during the lightning charge. Lightning is anchored to the cell perimeter and stretched to its rectangular geometry; it does not scale or vibrate with the artwork.
- Reduced motion skips the charge/vibration/burst sequence. Existing game math and settlement are preserved.

Validation for v0.12.0 (prior release): 73 automated tests pass, including offscreen reel-bank handoff, spark-pool cancellation, reduced motion, seeded outcomes and settlement. Chromium checks 320/390/430 px layouts, stationary spinner frame/rotating center, six transform-promoted strips, 180 sparks and 9 flares on a nine-cell win, and shared Studio renderer/draft preservation. Physical iPhone/GPU frame-rate and audio testing remains pending.

### v0.12.1 loading improvement

- The boot splash gates Play on critical first-paint scene art only. Preloading extra symbol textures no longer delays the initial Play button. Hidden reel banks, cascade lightning, and dormant fireworks are loaded outside that critical path.
- Preserve fail/retry on missing foreground artwork. Full Node and browser checks are required before deployment.

### v0.9.0 behavior — 29 October 2026 (Asia/Jakarta)

- Reference rules and controls are implemented: nine-symbol paytable, SCATTER awards, 15 free spins with retriggers, 2–500× orbs, a 5000× round cap, Buy Free Spins at 100× base bet, and +25% Ante that disables purchase.
- Normal / Quick / Turbo, autoplay 10–1000, purchase confirmation, bet/coin controls, session history and settings are available. Paytable amounts follow the selected base bet and coin display.
- Winning symbols use lightning, fireworks and tumble motion. Virtual credits are debited once before presentation and awards settle once after presentation, including interruption; replay never changes the ledger.
- `/health` reads the version from `package.json`. Verify the deployed Git commit in Railway as well; the immutable Studio artwork snapshot has a separate release ID.
- Home opens again after returning from background. Interrupted rounds remain suppressed until settlement; returning does not restart audio or autoplay.
- Validation: 64 automated tests pass, including manual bonus confirmation and background interruption. Native iPhone Safari/audio checks remain pending. Proprietary outcome weights, certified RTP and exact Ante frequency are **not** established by the reference screenshots; see [reference rules and limitations](docs/reference-rules-v1.md).

The v0.4–v0.8 sections below describe historical changes. Older statements that Buy/Ante are unavailable, Auto is fixed at 10, or settlement happens before animation are superseded by this section. Studio access is controlled by the current Railway environment; earlier checkpoints do not prove the current access mode.

- `/` or `/studio/` - studio editor (optional password protection) (mobile 9:16 preview, edit layers, asset swap, audio, math, win, jackpot settings)
- `/play/` - illustrated portrait game (virtual credits)
- `/health` - Railway liveness endpoint

### Run

Production uses `Dockerfile` on Railway. It unpacks `media_assets.tar.gz` and `audio_mp3.tar.gz` into the matching `studio/assets/...` paths, preserving **separate files** for every image and audio track.

For local development:

```bash
mkdir -p .tmp
# The media archive paths are relative to this repository root.
tar --no-same-owner -xzf media_assets.tar.gz
tar --no-same-owner -xzf audio_mp3.tar.gz
npm test
npm start
```

Go to `http://localhost:3000` after starting the server. `npm start` requires Node 20+; no NPM dependencies are needed.

### Source and asset editing

All logic is readable/editable in `studio/*.js`, `studio/math/`, `studio/index.html` and `studio/studio.css`. Individual PNG, SVG, JPEG, OGG and MP3 files load from `studio/assets/`. PNG/JPEG/OGG masters are collected in a **lossless tar archive** and iPhone-compatible MP3 backups in `audio_mp3.tar.gz` for the initial repository handoff; extracting it restores individual files. SVG assets and JSON manifests remain directly browsable on GitHub.

The editor saves customizations in local browser storage. Live loads the published snapshot across browsers; unpublished drafts remain local and are clearly labeled. Export JSON or ZIP to move your project changes. Studio settings are for **synthetic, auditable game math**, not per-player outcome manipulation. Real-money uses require legal review, licensing, independent game-math/RNG certification and server-side financial accounting.

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


### v0.10.1 — splash and first-paint loading

The supplied storm guardian and Soft Tech artwork form the loading screen, with soft logo zoom and gold lightning (disabled for reduced motion). The game stays hidden and inert from the initial HTML until the current release is applied and scene/symbol images have decoded. Play then reveals the latest scene directly, without a second intro. Snapshot, image, stylesheet, or startup failures retain the splash with Retry; late completion cannot unlock a timed-out load. Studio previews enter automatically after readiness. Home and bonus Continue dialogs are retained.

Validation: 68 tests pass. Chromium checks cover 320×568, 390×844, 430×932 and 844×390, delayed snapshots/assets, fetch/image failures, successful retry, reduced motion and automatic Studio preview entry. Physical iOS testing is still pending.


### v0.10.2 — gameplay artwork throughout the UI

Splash uses the same published Skygate logo/crop as gameplay. Splash Play and popup primary actions reuse the published Buy Free Spins panel artwork; all dialogs, toggles and celebration cards use dark/gold surfaces. Initial splash references the immutable media already retained by the active release, and syncs to the current published logo/button assets during startup. Soft Tech remains below with gentle zoom.

Normal spin now ends around 1.38 s, followed by a 750 ms winning-cell lightning charge and a 680 ms particle burst. The symbol remains visible for the first quarter of the burst and fades over its following 55%. Quick/Turbo remain faster but readable. Cascading symbols fall over 440 ms in Normal. Lightning is stationary at the rectangular cell boundary. Removed the spiral lightning texture and winning-symbol highlight contours. No math, credits or payout changes.

Validation: 68 unit tests; browser checks for splash readiness, delayed/failing requests, retry, reduced motion and Studio preview; popup checks at 320/390/430 px and landscape splash. Physical iOS/audio testing remains outstanding.
