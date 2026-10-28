# SKYGATE Studio Editor v0.3

**Project:** Slot Game / SKYGATE  
**Date:** 27 October 2026 (Asia/Jakarta)  
**Status:** Functional local editor / virtual credits prototype. NOT an online casino, not a production RNG.

## Quick start

**Option A: easiest:** Open `SKYGATE_Studio_Standalone_v0.3.html` in a modern browser. All **built-in** artwork, music, sound effects and code are embedded. No internet, server, login, or dependencies required.

**Option B: editable modular source:** Extract the full ZIP, open `05-Studio-Editor/index.html` within the `Slot_Game` folder. Asset files stay separate for replacement. Alternatively run `python3 -m http.server 8000` from `05-Studio-Editor`, then visit `http://localhost:8000/index.html` in your browser.

**Note:** Studio changes are saved to this browser's local storage, and replacement image/audio files to IndexedDB where supported. For portability, use **Export JSON** for settings and **Export changes ZIP** to include replacement uploads. The complete supplied source ZIP contains all default built-in assets. Neither JSON nor exported changes ZIP alone contains those unchanged built-in files.

## Implemented editor panels

1. **Layout & Layers:** 1080 × 1920 reference coordinates, 23 default layers; select, drag to reposition, X/Y/W/H, rotation, opacity, z-index, rename, show/hide, lock, duplicate and delete. The original reference JPEG can be overlaid for alignment.
2. **Asset Library:** 13 named symbol tiles (regular + special), character, logo, sky and columns, gold frame and button SVGs, four tier banners; files independently replaceable. PNG images include separately addressable transparency.
3. **Music & SFX:** 13 original synthesized `.ogg` audio files (24-second BGM + 12 SFX). Supports play, stop, upload/restore, master and channel volume, fade-in/out, looping, playback speed and trim in/out, seek waveform and mute. Browser audio requires a user click or tap.
4. **Math & Wins:** editable synthetic weights for ordinary symbols, scatter and multiplier orbs; 7×3 paytable (8–9, 10–11, 12+ matches), free-spin trigger/retrigger, max win, multiplier weights, Big/Mega/Super celebration thresholds and informational research RTP target.
5. **Jackpot Studio:** OFF by default; four independently adjustable **fixed demo** jackpot tiers. Awards in virtual bet multiples and stated expected triggers per 1 million paid spins. FX-only previews never change credits.
6. **Preview & Tests:** one-click deterministic spin with virtual credits, free-spin and tumble traces, bonus and jackpot outcome events; 1k/10k/100k sample simulations; observed return/hit/profit/bonus metrics, seed, replay with no balance change and JSON trace export.

## Engine design and key caveats

- `math/engine.js` reuses the tested **v0.2 synthetic** outcome model, not real Pragmatic Play data. `math/studio_math.js` adds an independent seeded fixed-jackpot stream with a maximum per-round payout cap.
- `project.json` is the source of truth for current editable defaults; the full browser build loads the generated `project-data.js`.
- The displayed **Target RTP** input is a *design goal only*. It does not alter the RNG or force wins. Changing payout/weights requires new independent simulations. Reported v0.2 RTP estimates do not carry over once edited.
- The simple per-million jackpot add-on is an **uncapped expected-return component**; real total RTP is affected by overlapping base payouts, total-win caps and variability.
- Jackpot outcomes in demo are determined by the published configured rates and independent seeded RNG, not individual player identity, balance or previous losses. There are no real deposits, cashouts, withdrawals, monetary rewards or player accounts.
- The inherited demo math engine is not a certified implementation of all commercial rules. Results must not be sold as exact Gates of Olympus odds, RNG fairness certification or guaranteed operator hold.
- Free Spins purchase/Ante Bet UI elements are *visual placeholders* in v0.3. They have no purchase flow or independent math mode.

## Asset provenance

The supplied **original Skygate mobile JPEG was flattened**. We made individual PNG cut-outs for symbols, character and logo, added original vector SVG overlays, and built a separate background. These are useful for editing but **do not restore authentic layered source artwork**. Some extracted PNGs retain halo or texture from the original composite; regenerate/polish key sprites before any polished game release. All original game IP and audiovisual assets of Pragmatic Play/PG Soft are excluded from the project.

Audio in `assets/audio/` is original procedurally synthesized music/SFX generated within this project, not commercial game recordings. For a released product, perform an independent IP, UX, mathematical and legal review.

## QA performed

- Node unit tests for jackpot RTP-component bounds, seed determinism, disabled jackpot, max-win clipping and win-class labeling: 6/6 passed.
- In a Chromium isolated DOM harness: 23 layers rendered; 13 audio channels, jackpot panel, win table, 1,000-round simulation, audio upload and **ZIP content integrity** tested. Changing layer/Undo, paytable edits, replay-neutral credit and no page JS errors passed.
- At a simulated 390 px mobile viewport: **no horizontal overflow** detected. Isolated browser QA used embedded local artwork because administrative policies blocked navigation to `localhost`/`file://` in the sandbox.
- **Not yet verified on a physical iPhone/Android device.** Need physical-device touch/audio/scroll/performance QA.

## Files

- `index.html`, `studio.css`, `studio.js`: modular editor.
- `SKYGATE_Studio_Standalone_v0.3.html`: full one-file offline editor.
- `project.json`, `project-data.js`: layer, audio, math and jackpot profile.
- `math/engine.js`, `math/studio_math.js`, `math/base-config.json`: deterministic research math model.
- `assets/symbols/*.png`, `assets/scene/*`, `assets/ui/*.svg`: individual visual files.
- `assets/audio/*.ogg`, `assets/audio/manifest.json`: music/SFX.
- `tests/`: unit tests and browser interaction QA.
- `previews/`: desktop editor, audio editor, jackpot/win settings and 9:16 game preview JPEGs.

## Next checkpoint after v0.3

1. User approves updated layout and assets; refine questionable cutout edges and re-render higher-resolution transparent masters.
2. Polish animation timeline, reel tumble physics and audio synchronization in the actual game renderer.
3. Implement separately configured features only after validating math fairness and an appropriate legal review.
4. Physical-device QA on iPhone/Android and build a deployed preview if authorized.
