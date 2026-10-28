# Skygate reference rules v1

User sources: IMG_3483, 3484, 3486–3498.PNG, supplied 2026-10-28. The new request supersedes removal of the Buy Free Spins button. All transactions use fictional credits.

Implemented: 6×5 pay-anywhere, 8–9/10–11/12–30 tiers for nine symbols; SCATTER pays 3×/5×/100× for 4/5/6+; tumble until no win or 5000× round cap; complete 2–500 orb list, summed after tumbles; bonus multiplier bank only grows/applies on winning spins containing a new orb; 4+ scatter awards 15 free spins, 3+ in bonus retriggers 5; separate bonus weights; Buy Free Spins costs 100× base bet and guarantees an actual 4-SCATTER entry board; Ante 25× costs +25% and disables purchase. No jackpot in this reference preset.

Controls: Normal/Quick/Turbo cycle and press-hold turbo, autoplay count 10–1000 with default 100, exclusive Quick/Turbo and Skip Screens toggles, confirmation/cancel purchase panel, Bet/coin value/total/max controls, 20×/25× arithmetic, sound, battery saver, movable/locked spin button, promo badge, home/intro, session history, coin/value display toggle, scrolling rules. Unshown slider ranges and coin denominations are Skygate defaults, not asserted as identical to the reference.

Round accounting: cost is debited once when a valid result is generated; award is credited once after all presentation completes, including error/background cancellation. Replay never debits or credits. Each full bonus cycle produces one history row. Hard safety watchdog failure voids the round instead of returning a truncated payable result. The watchdog is not a game feature limit.

Not inferable from screenshots: proprietary reel strips, RNG outcome weights, multiplier probabilities, exact Ante bonus frequency, certified RTP/volatility. Skygate uses explicit synthetic weights, disclosed in rules. Do not describe this as a certified 96.50% RTP clone or claim exact 2× natural bonus frequency. A 100,000-round sample at seed 874021 produced 141 normal bonuses and 300 Ante bonuses with the current 1.25 scatter-weight adjustment; this is a sample, not a guarantee.

New raster asset: studio/assets/ui/confirmation-panel-v1.png. Built-in imagegen, exact edit source image-edit-target-6137f3b2e7db444b.png. Prompt: derive a standalone front-facing Greek beveled gold rectangular panel from the selected screenshot; transparent exterior, dark burgundy-black center, subtle laurel corners, empty interior, no text or controls. This panel is used behind live HTML in the purchase confirmation.

Validation: npm test; reference paytable arithmetic, guaranteed purchase trigger, no ante purchase, scatter/orb separation, bank accumulation, cap and watchdog, cent precision and bet limits, all speeds preserve deterministic results, autoplay count, renderer cancellation, buy/cancel ledger and pooled FX.
