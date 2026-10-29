# Skygate v0.13.7 continuity checkpoint

**30 October 2026 (Asia/Jakarta)**

## User-directed changes (implementation directly, no visual preview)
- Remove visible CREDIT label, show a small sculpted gold stack-of-coins emblem inside the left margin of the existing CREDIT pill.
- Remove visible BET label, show a gold/navy poker-chip emblem to the left of live bet value (after the minus control so they do not overlap).
- Move [-] from historical x643 to x577 in the 1080px coordinate system, giving a 26px left inset exactly matching the existing [+] right inset of 26px.
- Keep original symmetric Buy Spin/CREDIT/BET gold artwork, Zeus scene, spinner, 1000x promotional label, audio, math and live numbers.

## Implementation details
- `play/release.js`: original 80x80 inline SVG icons mounted in both existing panel shells. Decorative `aria-hidden` SVGs; accessible CREDIT/BET text hidden visually and retained for screen readers. Existing numeric DOM nodes and button handlers are reused.
- `play/game.css`: emblem positions and sizes scale proportionally with game canvas.
- `studio/themes/olympus-gold/project.json`: source Studio preset minusbtn.x is now 577; old published snapshots are not rewritten.
- Existing Live snapshots with historical left inset 92px get a runtime symmetric correction; designer-custom minus positions remain editable, with panel fallback if custom geometry would overlap the poker icon.
- Source game and Studio editor preview both use `SkygateApplyLayout`; no standalone mock image or preview file.

## Validation gates
- `studio/tests/layout_skins.test.mjs`: icon SVG and accessible text, exact minus symmetry, original source immutability, old Live and custom Studio fallbacks.
- `studio/tests/ci_browser_smoke.py`: real Chromium renders Olympus preset on 390px viewport, checks visible emblems, balanced button margins, poker chip clearance, and live minus/plus event handlers. Existing 320/390/430 responsive and Studio workflow tests must pass.
- Do not merge until both Node + Chromium jobs pass.
- Check production Railway deployment terminal SUCCESS and replica status.
- Physical iPhone Safari GPU check remains pending.

## GitHub and Railway
- Repository: https://github.com/9dbit/Skygate
- Game: https://skygate-web-production.up.railway.app/play/
- Studio: https://skygate-web-production.up.railway.app/studio/
