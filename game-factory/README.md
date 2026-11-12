# Soft Tech Game Factory | Skygate Clone Template

**Status: isolated development template, not a deployed game or certified engine.**
This folder defines a repeatable way to make a new virtual-credit game without rewriting Skygate's engine. Source snapshot: `9dbit/Skygate@6a8aee9e3a0bebaa9552433ffe0051efe39d4a52` (v0.14.3). Development happens on `template/skygate-game-factory-legend-ball-x1000`; Skygate `main`, live Railway service, releases, volume and operator wallets are unchanged.

## Exact source mechanics

**The real Skygate board is 6 columns x 5 rows**, so use 6x5 for Legend Ball too. The **playable game** profile is `play/config.js`; `studio/math/base-config.js` is a different synthetic experiment preset. Do not accidentally swap them.

Keep the playable configuration unchanged while building a visual clone:

| Inherited feature | Skygate rule |
| --- | --- |
| Symbol wins | Pay-anywhere: 8+ matching ordinary symbols, tumbles |
| Scatter | 4+ triggers 15 Free Spins; 3+ during bonus adds 5 spins |
| Scatter award | 4: 3x, 5: 5x, 6+: 100x (base bet) |
| Orb multipliers | Keep the source 2–500x weighted table and bonus bank |
| Round cap | 5000x per game round (do not confuse with game title) |
| Other controls | Buy Free Spins 100x, Bonus Booster +25%, Auto, Normal/Quick/Turbo |
| Safety | Original round settlement, deterministic virtual-credit research RNG and interruption logic |

The **12/+6 Free Spins and cap 30** suggested earlier are not part of this template. Existing Skygate rules are source-locked, not certified for monetary play.

## Create an independent project

From a **local checkout** of this branch with the archived source files:

```sh
node game-factory/validate.mjs
node game-factory/create-game.mjs --profile game-factory/profiles/legend-ball-x1000.json --output ../legend-ball-x1000
cd ../legend-ball-x1000
npm test
```

For a future title, copy the profile JSON, replace its original IP and asset checklist, then invoke the same creator with that profile. The creator writes to a **new independent directory only**, refuses existing/non-empty destinations, doesn't change Skygate, and compares copied live math and engine bytes with source. It deliberately excludes `.git`, `.github`, `.env`, `railway.json` and existing release data. Connect each game to its own GitHub repository, separate Railway staging project, deployment credentials and release storage later. It doesn't create a Railway deployment.

## Legend Ball X1000 creative profile

`profiles/legend-ball-x1000.json` contains the mobile portrait brand brief, originally designed characters Aster Varn and Veylorn, and six unique rune-ball **art ideas** for Scatter. These are **art direction only**, not six new mathematical symbols. The current engine generates one `scatter` type **per board cell**. It can place several Scatter tiles in a single column. No present renderer guarantees one ball per column, and the six-color per-column skin map is **not yet wired**. If the art mapping is eventually implemented, it must not change symbol kind, frequencies or payouts.

Do not use Dragon Ball characters, likenesses, symbols, logos, costumes or audio in the independent IP.

## Asset replacements before any preview approval

Provide independently addressable original assets for logo, character, creature, intro/splash, background, frame, nine regular game symbols, Scatter, multiplier orbs, button states, panels, music/SFX, favicon, Apple Touch icon, PWA icons and Telegram/Open Graph image. The cloned source initially still contains Skygate branding and art. **It is not a finished or publishable Legend Ball game.**

The previous Skygate studio can edit layers, upload image/audio assets and preview layouts. Keep this rebranding in the independent clone and use the Universal Studio asset workflow after compatibility review, not Skygate's live Studio.

## Quality gates

1. Verify no math-engine diff or changed `play/config.js` before art-only approval.
2. Run `npm test`, browser regression on 320/390/430 portrait and tablet, and actual iPhone/Android touch + sound checks.
3. Inspect all 30 reel cells, responsiveness, rendering, spin/bonus animations and independent visual assets.
4. Verify free-spin triggering, retrigger, tumble, multipliers, Buy Spin, Bonus Booster, replay neutrality, interrupts and win cap in the independent virtual-credit clone.
5. Lock a version, run independent long-run math/RNG and security review, obtain separate release approvals. Production and wallet integrations remain disabled until qualification.

**Working status:** Only the template, starter profile and isolation checks are being developed. No Legend Ball gameplay has yet been deployed.
