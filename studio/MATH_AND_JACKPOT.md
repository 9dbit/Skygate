# Synthetic Win/Jackpot configuration contract (v0.3)

## Primary source of truth

`project.json` → `math` and `jackpot`; JavaScript code in `math/engine.js` and `math/studio_math.js`.

## Base round / tumble

- Board 6 columns × 5 rows; minimum eight identical ordinary symbols anywhere in a board.
- Paytable tiers: 8–9 matches, 10–11, and >=12; each award is in *multiples of one paid stake*.
- Weighted symbol selection for each tile, including `scatter` and `orb`. Weights are relative, not directly percentages.
- Scatter trigger, free-spin count and retrigger, multiplier weights, round cap and safety caps are editable in the engine config.
- The v0.2 engine's orb timing/calculation is *a synthetic approximation*, not the original commercial supplier's unreleased math. It should be independently reviewed before relying on it for a production game.

## Synthetic fixed jackpot

`enabled=false` by default. Tier list is in priority order GRAND, MAJOR, MINOR, MINI. On each paid spin, the research wrapper obtains one independent seeded variate in `[0, 1,000,000)` and selects at most one tier by the cumulative `perMillion` weights. The player’s identity, balance, and previous results do not enter this decision.

Jackpot payout is capped: `award = min(configuredTierAwardX, max(0, maxRoundX - basePayoutX))`.

Uncapped expected jackpot return contribution in percent:

`100 × SUM( tierAwardX × tierChancePerMillion / 1,000,000 )`

This is a **ceiling** when the main round cap binds. With default rates (only if jackpot is explicitly enabled), the uncapped additional contribution is `0.70%`. This is not the total RTP; the base profile, caps, bonuses and rounding affect totals.

**Example rates in prototype (not provider odds):** GRAND 1 / million × 2000, MAJOR 4 / million × 500, MINOR 20 / million × 100, MINI 40 / million × 25.

## Win categories vs outcomes

Win presentation thresholds control **which animation and sound** plays after the deterministic result is generated. They do not affect a round's outcome:

- Small win (payout > 0)
- Big >= 10×
- Mega >= 25×
- Super >= 100×

A jackpot triggers an independent jackpot FX/audio layer. There is no forced win per user/account and no manipulation based on recent losses.

## RTP and operator-facing settings

`targetRTP` is a research metadata field only. It cannot be used to secretly change results. For any material adjustment to the symbol probabilities, bonus, payout or jackpot terms, rerun independent multi-seed simulations, check long-run theoretical consistency, tail distribution and maximum liability. If any money-backed mode is contemplated, stop at license and certified RNG testing first.
