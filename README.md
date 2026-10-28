# SKYGATE Studio Editor v0.3.1

Greek-mythology-inspired **virtual-credit** game development playground. Includes a layout studio, modular icon assets, original music and sound effects, math experimentation, free spins, and simulated jackpot controls. This is not connected to deposits, withdrawals, or real-money gambling.

- `/` or `/studio/` - studio editor (mobile 9:16 preview, edit layers, asset swap, audio, math, win, jackpot settings)
- `/play/` - virtual-credit playable proof-of-concept v0.2
- `/health` - Railway liveness endpoint

### Run

Production uses `Dockerfile` on Railway. It unpacks `media_assets.tar.gz` into the matching `studio/assets/...` paths, preserving **separate files** for every image and audio track.

For local development:

```bash
mkdir -p .tmp
# The media archive paths are relative to this repository root.
tar -xzf media_assets.tar.gz
npm test
npm start
```

Go to `http://localhost:3000` after starting the server. `npm start` requires Node 20+; no NPM dependencies are needed.

### Source and asset editing

All logic is readable/editable in `studio/*.js`, `studio/math/`, `studio/index.html` and `studio/studio.css`. Individual PNG, SVG, JPEG and OGG files load from `studio/assets/`. PNG/JPEG/OGG binaries are collected in a **lossless tar archive** for the initial repository handoff; extracting it restores individual files. SVG assets and JSON manifests remain directly browsable on GitHub.

The editor saves customizations in local browser storage; the demo does not synchronize project changes between browsers. Export JSON or ZIP to move your project changes. Studio settings are for **synthetic, auditable game math**, not per-player outcome manipulation. Real-money uses require legal review, licensing, independent game-math/RNG certification and server-side financial accounting.

Documentation: `studio/README_STUDIO.md`, `studio/ASSET_CATALOG.md`, `studio/MATH_AND_JACKPOT.md`, `studio/CONTINUITY_CHECKPOINT_v0.3.md`.
