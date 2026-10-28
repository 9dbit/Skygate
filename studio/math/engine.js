/* Skygate demo research engine v0.2: deterministic, fictional credits, not secure RNG. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.SlotGameMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'slot-game/round-v0.2';
  function uint32(seed) { const n = Number(seed); if (!Number.isFinite(n)) throw Error('Invalid seed'); return (Math.trunc(n) >>> 0) || 0x9e3779b9; }
  function createRng(seed) {
    let state = uint32(seed);
    return {
      next() {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 4294967296;
      },
      state() { return state >>> 0; }
    };
  }
  function validateConfig(cfg) {
    if (!cfg || cfg.grid_columns !== 6 || cfg.grid_rows !== 5 || cfg.min_match !== 8) throw Error('Expected synthetic 6x5, 8+ model');
    const weights = Object.entries(cfg.symbol_weights || {});
    if (!weights.length || !weights.some(([s]) => s === 'scatter') || !weights.some(([s]) => s === 'orb')) throw Error('Missing symbol weights');
    if (weights.some(([, w]) => !(Number.isFinite(w) && w > 0))) throw Error('Invalid symbol weight');
    if (Object.keys(cfg.paytable).some(s => !(s in cfg.symbol_weights) || s === 'scatter' || s === 'orb')) throw Error('Invalid paytable symbols');
    for (const values of Object.values(cfg.paytable)) if (values.length !== 3 || values.some(v => !(Number.isFinite(v) && v >= 0))) throw Error('Invalid paytable tier');
    if (cfg.multiplier_weights.length !== cfg.multiplier_values.length || cfg.multiplier_weights.some(v => !Number.isFinite(v) || v <= 0)) throw Error('Multiplier configuration mismatch');
    if (!Number.isFinite(cfg.round_max_win_x) || cfg.round_max_win_x <= 0) throw Error('Invalid cap');
    if (!Number.isInteger(cfg.safety_max_tumbles) || cfg.safety_max_tumbles < 1) throw Error('Invalid tumble safety cap');
    if (!Number.isInteger(cfg.safety_max_bonus_spins) || cfg.safety_max_bonus_spins < 1) throw Error('Invalid bonus safety cap');
    return cfg;
  }
  function weightedChoice(rng, pairs) {
    const total = pairs.reduce((acc, [, weight]) => acc + weight, 0);
    let roll = rng.next() * total;
    for (const [item, weight] of pairs) { roll -= weight; if (roll < 0) return item; }
    return pairs[pairs.length - 1][0];
  }
  function evaluateBoard(grid, cfg) {
    const counts = Object.create(null);
    grid.forEach(tile => { counts[tile.kind] = (counts[tile.kind] || 0) + 1; });
    const groups = [];
    let awardX = 0;
    for (const [kind, tiers] of Object.entries(cfg.paytable)) {
      const count = counts[kind] || 0;
      if (count >= cfg.min_match) {
        const tierIndex = count <= 9 ? 0 : count <= 11 ? 1 : 2;
        const positions = [];
        grid.forEach((t, i) => { if (t.kind === kind) positions.push(i); });
        groups.push({kind, count, positions, awardX: tiers[tierIndex]});
        awardX += tiers[tierIndex];
      }
    }
    return { groups, awardX: Number(awardX.toFixed(10)), counts };
  }
  function applyTumble(grid, winGroups, cfg, drawTile) {
    const toRemove = new Set(winGroups.flatMap(group => group.positions));
    const next = Array(grid.length);
    const newPositions = [];
    for (let col = 0; col < cfg.grid_columns; col++) {
      const survivors = [];
      for (let row = 0; row < cfg.grid_rows; row++) {
        const i = row * cfg.grid_columns + col;
        if (!toRemove.has(i)) survivors.push(grid[i]);
      }
      const incoming = Array.from({length: cfg.grid_rows - survivors.length}, drawTile);
      const settled = incoming.concat(survivors);
      for (let row = 0; row < cfg.grid_rows; row++) {
        const i = row * cfg.grid_columns + col;
        next[i] = settled[row];
        if (row < incoming.length) newPositions.push(i);
      }
    }
    return { grid: next, newPositions };
  }
  function sumOrbs(grid) {
    return grid.reduce((total, tile) => total + (tile.kind === 'orb' ? tile.multiplier : 0), 0);
  }
  function countKind(grid, kind) { return grid.reduce((s, tile) => s + (tile.kind === kind ? 1 : 0), 0); }
  function resolvePayout(symbolWinX, orbX, previousBankX, free) {
    const eligibleOrb = symbolWinX > 0 && orbX > 0;
    const nextBankX = free && eligibleOrb ? previousBankX + orbX : previousBankX;
    const appliedMultiplierX = eligibleOrb ? (free ? nextBankX : orbX) : 1;
    return { payoutX: Number((symbolWinX * appliedMultiplierX).toFixed(10)), nextBankX, appliedMultiplierX };
  }
  function createEngine(config, initialSeed = 20261027) {
    const cfg = validateConfig(config);
    const rng = createRng(initialSeed);
    const symbols = Object.entries(cfg.symbol_weights);
    const multipliers = cfg.multiplier_values.map((v, i) => [v, cfg.multiplier_weights[i]]);
    let tileId = 0, paidIndex = 0;
    let activeSymbols = symbols;
    function drawTile() {
      const kind = weightedChoice(rng, activeSymbols);
      const tile = { id: ++tileId, kind };
      if (kind === 'orb') tile.multiplier = weightedChoice(rng, multipliers);
      return tile;
    }
    function oneSpin(mode, bank, trace, options = {}, budget = cfg.round_max_win_x) {
      activeSymbols = Object.entries(mode === 'bonus' && cfg.bonus_symbol_weights ? cfg.bonus_symbol_weights : cfg.symbol_weights)
        .map(([kind, weight]) => [kind, weight * (kind === 'scatter' && mode === 'base' && options.ante ? cfg.ante_scatter_weight_multiplier || 1 : 1)]);
      let grid = Array.from({length: cfg.grid_rows * cfg.grid_columns}, drawTile);
      if (options.buyBonus && mode === 'base') {
        // A purchased feature starts with four real SCATTER tiles, then follows
        // exactly the same tumble and bonus resolver as a natural trigger.
        for (let i=0;i<grid.length;i++) if(grid[i].kind==='scatter') {
          const kind=weightedChoice(rng,activeSymbols.filter(([s])=>s!=='scatter'&&s!=='orb'));
          grid[i]={id:++tileId,kind};
        }
        const columns=[0,1,2,3,4,5];
        for(let n=0;n<4;n++){const col=columns.splice(Math.floor(rng.next()*columns.length),1)[0];grid[Math.floor(rng.next()*5)*6+col]={id:++tileId,kind:'scatter'};}
      }
      const initial = trace ? grid.map(t => ({...t})) : undefined;
      const cascades = trace ? [] : undefined;
      let totalSymbolWinX = 0, tumbles = 0;
      let maxScatters = countKind(grid, 'scatter');
      for (let step = 0; step < cfg.safety_max_tumbles; step++) {
        const evaluated = evaluateBoard(grid, cfg);
        if (!evaluated.groups.length) break;
        totalSymbolWinX += evaluated.awardX;
        tumbles++;
        const before = trace ? grid.map(t => ({...t})) : undefined;
        if(cfg.reference_rules && resolvePayout(totalSymbolWinX,sumOrbs(grid),bank,mode==='bonus').payoutX >= budget){
          if(trace)cascades.push({step:step+1,before,winning:evaluated.groups,awardX:evaluated.awardX,removedPositions:evaluated.groups.flatMap(g=>g.positions),newPositions:[],after:before});
          break;
        }
        const tumble = applyTumble(grid, evaluated.groups, cfg, drawTile);
        grid = tumble.grid;
        maxScatters = Math.max(maxScatters, countKind(grid, 'scatter'));
        if (trace) cascades.push({step: step + 1, before, winning: evaluated.groups, awardX: evaluated.awardX, removedPositions: evaluated.groups.flatMap(g => g.positions), newPositions: tumble.newPositions, after: grid.map(t => ({...t}))});
      }
      const safetyTruncated = tumbles >= cfg.safety_max_tumbles && evaluateBoard(grid, cfg).groups.length > 0;
      const orbSumX = sumOrbs(grid);
      const payout = resolvePayout(Number(totalSymbolWinX.toFixed(10)), orbSumX, bank, mode === 'bonus');
      const scatterWinX=cfg.scatter_paytable?.[Math.min(maxScatters,6)] || 0;
      const capped=cfg.reference_rules && payout.payoutX+scatterWinX>=budget;
      if(cfg.reference_rules && safetyTruncated && !capped)throw Error('Round void: tumble safety watchdog');
      const result = {mode, symbolWinX: Number(totalSymbolWinX.toFixed(10)), orbSumX, scatters: maxScatters, tumbles, payoutX: cfg.reference_rules?Math.min(budget,payout.payoutX+scatterWinX):payout.payoutX, appliedMultiplierX: payout.appliedMultiplierX, bankAfterX: payout.nextBankX, safetyTruncated: capped?false:safetyTruncated,...(cfg.reference_rules?{scatterWinX,capHit:capped}:{})};
      if (trace) { result.initial = initial; result.cascades = cascades; result.final = grid.map(t => ({...t})); }
      return result;
    }
    function playRound(options = {}) {
      const trace = !!options.trace;
      if(options.ante && options.buyBonus)throw Error('Buy Free Spins is unavailable during Ante Bet');
      const beforeRng = rng.state();
      const index = ++paidIndex;
      const base = oneSpin('base', 0, trace, options);
      const triggered = base.scatters >= cfg.bonus_trigger_scatters;
      let totalX = base.payoutX;
      let bank = 0, freeSpinsRemaining = triggered ? cfg.bonus_start_spins : 0;
      let extraSpins = 0, retriggers = 0, allTumbles = base.tumbles;
      const bonusSpins = trace ? [] : undefined;
      let bonusSpinsPlayed = 0, safetyTruncated = base.safetyTruncated;
      while (freeSpinsRemaining > 0 && bonusSpinsPlayed < cfg.safety_max_bonus_spins && totalX < cfg.round_max_win_x) {
        const leftBefore = freeSpinsRemaining--;
        bonusSpinsPlayed++;
        const spin = oneSpin('bonus', bank, trace, {}, cfg.round_max_win_x-totalX);
        bank = spin.bankAfterX;
        totalX += spin.payoutX;
        allTumbles += spin.tumbles;
        const retriggered = totalX < cfg.round_max_win_x && spin.scatters >= cfg.bonus_retrigger_scatters;
        if (retriggered) { retriggers++; freeSpinsRemaining += cfg.bonus_retrigger_add_spins; extraSpins += cfg.bonus_retrigger_add_spins; }
        safetyTruncated = safetyTruncated || spin.safetyTruncated;
        if (trace) bonusSpins.push({...spin, index: bonusSpinsPlayed, leftBefore, leftAfter: freeSpinsRemaining, retriggered});
      }
      if (freeSpinsRemaining > 0 && totalX < cfg.round_max_win_x) safetyTruncated = true;
      if(cfg.reference_rules && safetyTruncated)throw Error('Round void: bonus safety watchdog');
      const capHit = totalX >= cfg.round_max_win_x;
      return {
        schema: SCHEMA,
        profileId: cfg.profile_id,
        initialSeed: uint32(initialSeed),
        paidIndex: index,
        rngStateStart: beforeRng,
        rngStateEnd: rng.state(),
        base,
        bonus: {triggered, spinsPlayed: bonusSpinsPlayed, retriggers, extraSpins, bankEndX: bank, ...(trace ? {spins: bonusSpins} : {})},
        winX: Math.min(cfg.round_max_win_x, Number(totalX.toFixed(10))),
        capHit,
        safetyTruncated,
        totalTumbles: allTumbles
      };
    }
    return {playRound, getState: () => ({seed: uint32(initialSeed),rngState:rng.state(),paidIndex,tileId})};
  }
  return { SCHEMA, uint32, createRng, validateConfig, evaluateBoard, applyTumble, resolvePayout, createEngine };
});
