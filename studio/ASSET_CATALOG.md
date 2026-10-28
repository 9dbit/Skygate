# Separated Asset Catalog · SKYGATE Studio v0.3

The screenshot `SKYGATE_Mobile_UI_Preview_v1.jpg` was a **flattened JPEG**. This directory provides separate **replacement-ready cutouts and vector components**. Individual masks may retain color halos from the original. No editable PSD/Blender layered source was available or recovered.

## Independent reel symbol PNGs

`assets/symbols/`

- `ruby.png`, `sapphire.png`, `emerald.png`, `amethyst.png`, `topaz.png`, `amber.png`, `pearl.png` (seven independent regular-icon slots)
- `ring.png`, `crown.png`, `chalice.png`, `hourglass.png` (ornamental themed symbols)
- `orb.png` (lightning multiplier)
- `scatter.png` (bonus scatter icon)

All are standalone transparent PNG cutouts from the concept/asset reference, rather than true vector or 3D masters. In `project.json`, art can be replaced by file without editing the math config.

## Scene and UI

`assets/scene/`: `guardian.png`, `logo.png`, `column_left.png`, `column_right.png`, `sky_background.jpg`. `reference_original.jpg` is the original flattened image, used for side-by-side alignment and not for game source composition.

`assets/ui/`: `reel_frame.svg`, `gold_banner.svg`, `blue_button.svg`, `spin_button.svg`, `jackpot_mini.svg`, `jackpot_minor.svg`, `jackpot_major.svg`, `jackpot_grand.svg`. SVGs are independent original vector assets with editable gradients and geometry. UI labels and dynamic values are separate live text layers, not baked into the SVGs.

## Audio assets

`assets/audio/`: 24-second `bgm_celestial_loop.ogg` plus twelve SFX tracks for `spin_start`, `reel_stop`, `tumble`, `symbol_win`, `multiplier`, `bonus_intro`, `free_spin_start`, `big_win`, `mega_win`, `jackpot`, `ui_click`, `ambient_thunder`.

All are original procedural synth compositions and sound effects. Upload custom sounds in the editor and export a changes ZIP to preserve binary replacements.

## Source art limits

Original screenshot style was Greek mythology, purple clouds, glowing gold frame and 6×5 gem board. This prototype takes the mood and UI hierarchy but does not duplicate third-party commercial source code, symbols, licensed audio or artwork. Before shipping, the per-symbol PNG edges and native 3D renders should be refined.
