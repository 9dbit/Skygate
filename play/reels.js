/* Persistent reel strips. Only transforms/opacity animate; outcomes stay in the
 * math engine. Six compositor tracks roll, then stable cells handle cascades. */
window.SkygateReels = class {
  constructor(root, {asset, art, label, legacyOrb = false}) {
    Object.assign(this, {root, asset, art, label, legacyOrb});
    this.animations = new Set();
    this.waiters = new Map();
    this.generation = 0;
    this.columns = [];
    this.cells = Array(30);
    root.replaceChildren();
    for (let column = 0; column < 6; column++) {
      const viewport = document.createElement('div'); viewport.className = 'reel-column';
      const track = document.createElement('div'); track.className = 'reel-track';
      const cells = [];
      for (let row = 0; row < 10; row++) {
        const tile = document.createElement('div'); tile.className = 'tile';
        const motion = document.createElement('div'); motion.className = 'symbol-motion';
        const img = document.createElement('img'); img.className = 'symbol'; img.alt = ''; img.draggable = false; img.decoding = 'async';
        const multiplier = document.createElement('b'); multiplier.className = 'orb-num'; multiplier.hidden = true;
        const scatter = document.createElement('small'); scatter.className = 'scatter-label'; scatter.textContent = 'SCATTER'; scatter.hidden = true;
        motion.append(img, multiplier, scatter); tile.append(motion); track.append(tile);
        if (row < 5) tile.setAttribute('aria-hidden', 'true');
        const cell = {tile, motion, img, multiplier, scatter, kind: null};
        cells.push(cell);
        if (row >= 5) {
          this.cells[(row - 5) * 6 + column] = cell;
          cell.fx = {};
          for (const name of ['edge','burst']) {
            const effect = document.createElement('img'); effect.className = 'cascade-fx fx-' + name;
            effect.src = window.SkygateCascadeArt[name]; effect.alt = ''; effect.draggable = false;
            effect.setAttribute('aria-hidden','true'); tile.append(effect); cell.fx[name] = effect;
          }
        }
      }
      viewport.append(track); root.append(viewport); this.columns.push({track, cells});
    }
    // One bounded overlay lets sparks cross cell borders without following sprite contours.
    this.fireworks=document.createElement('div');this.fireworks.className='fireworks-layer';
    this.fireworks.setAttribute('aria-hidden','true');this.sparks=[];
    for(let i=0;i<240;i++){const spark=document.createElement('i');spark.className='firework-spark spark-'+i%4;this.fireworks.append(spark);this.sparks.push(spark);}
    root.append(this.fireworks);
    // Decode each unique texture once before the first animated round.
    this.textures = [...new Set(Object.values(art))].map(sprite => {
      const img = document.createElement('img'); img.src = asset('symbols/' + sprite + '.png');
      return img;
    });
    this.ready = Promise.allSettled(this.textures.map(img => img.decode?.()));
  }
  update(cell, symbol, win = false) {
    const {tile, img, multiplier, scatter} = cell;
    if (cell.kind !== symbol.kind) {
      cell.kind = symbol.kind;
      img.src = this.asset('symbols/' + (this.art[symbol.kind] || 'ruby') + '.png');
      scatter.hidden = symbol.kind !== 'scatter';
    }
    const info = `${this.label[symbol.kind] || symbol.kind}${symbol.multiplier ? ' x' + symbol.multiplier : ''}`;
    if(cell.info!==info){tile.setAttribute('aria-label', info);tile.title = info;cell.info=info;}
    tile.classList.toggle('win', win);
    tile.classList.toggle('orb', this.legacyOrb && symbol.kind === 'orb');
    multiplier.hidden = !symbol.multiplier;
    if(cell.multiplierValue!==symbol.multiplier){multiplier.textContent = symbol.multiplier ? symbol.multiplier + '×' : '';cell.multiplierValue=symbol.multiplier;}
  }
  render(grid, marked = []) {
    if (!grid?.length) return;
    const wins = new Set(marked);
    this.grid = grid;
    this.columns.forEach(({cells}, col) => cells.forEach((cell, row) => {
      const i = (row % 5) * 6 + col;
      this.update(cell, grid[i], row >= 5 && wins.has(i));
    }));
  }
  wait(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {this.waiters.delete(timer); resolve();}, ms);
      this.waiters.set(timer, resolve);
    });
  }
  animate(node, frames, options) {
    const animation = node.animate(frames, options);
    this.animations.add(animation);
    return animation;
  }
  async finish(animation) {
    try {await animation.finished;} catch { /* visibility cancellation */ }
    finally {animation.cancel(); this.animations.delete(animation);}
  }
  cancel() {
    this.generation++;
    for (const [timer, resolve] of this.waiters) {clearTimeout(timer); resolve();}
    this.waiters.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.root.classList.remove('rolling');
    this.root.dataset.fxPhase = 'idle';
    if (this.target) this.render(this.target);
  }
  async spin(grid, {turbo = false, quick = false, reduced = false} = {}) {
    this.cancel(); this.target = grid;
    const generation = this.generation;
    if (reduced || !this.columns[0].track.animate) {this.render(grid); return;}
    await this.ready;
    if (generation !== this.generation) return;
    this.render(this.grid);
    this.root.classList.add('rolling');
    try {
      await Promise.all(this.columns.map(async ({track, cells}, col) => {
        const rolling = this.animate(track, [
          {transform: 'translate3d(0,-50%,0)'}, {transform: 'translate3d(0,0,0)'}
        ], {duration: turbo ? 240 : quick ? 360 : 480, iterations: Infinity, easing: 'linear'});
        await this.wait(turbo ? 320 + col * 35 : quick ? 700 + col * 65 : 1250 + col * 130);
        rolling.cancel(); this.animations.delete(rolling);
        if (generation !== this.generation) return;
        cells.forEach((cell, row) => this.update(cell, grid[(row % 5) * 6 + col]));
        await this.finish(this.animate(track, [
          {transform: 'translate3d(0,-62%,0)', offset: 0},
          {transform: 'translate3d(0,-49.3%,0)', offset: .78},
          {transform: 'translate3d(0,-50%,0)', offset: 1}
        ], {duration: turbo ? 200 : quick ? 320 : 480, easing: 'cubic-bezier(.16,.7,.28,1)'}));
      }));
    } finally {
      this.root.classList.remove('rolling'); this.render(grid); this.target = null;
    }
  }
  async shatter(positions, {turbo = false, quick = false, reduced = false} = {}) {
    const selected = [...new Set(positions)].filter(i => Number.isInteger(i) && i >= 0 && i < 30);
    if (!selected.length || reduced || !this.cells[0].motion.animate) return;
    const generation = this.generation, active = [];
    const play = (node, frames, duration, easing = 'ease-out') => {
      const animation = this.animate(node, frames, {duration, easing, fill:'forwards'});
      active.push(animation); return animation.finished.catch(() => {});
    };
    const clear = () => {for (const a of active) {a.cancel(); this.animations.delete(a);} active.length = 0;};
    try {
      this.root.dataset.fxPhase = 'charge';
      const chargeDuration=turbo ? 400 : quick ? 800 : 1250;
      await Promise.all(selected.flatMap(i => {
        const {motion,fx}=this.cells[i];
        return [
          play(fx.edge,[{opacity:0},{opacity:1,offset:.2},{opacity:.55,offset:.4},{opacity:1,offset:.6},{opacity:.65,offset:.8},{opacity:1}],chargeDuration,'linear'),
          play(motion,[{transform:'translate3d(0,0,0)'},{transform:'translate3d(-1.5px,1px,0)',offset:.15},{transform:'translate3d(1.5px,-1px,0)',offset:.3},{transform:'translate3d(-1.5px,-1px,0)',offset:.45},{transform:'translate3d(1.5px,1px,0)',offset:.6},{transform:'translate3d(-1px,0,0)',offset:.8},{transform:'translate3d(0,0,0)'}],chargeDuration,'linear')
        ];
      }));
      if (generation !== this.generation) return;
      clear();
      this.root.dataset.fxPhase = 'burst';
      const duration = turbo ? 500 : quick ? 850 : 1300;
      const fireworks=this.sparkAnimations(selected,duration,play);
      await Promise.all([...fireworks,...selected.flatMap(i => {
        const {motion, fx} = this.cells[i];
        return [
          play(motion,[{transform:'scale(1)',opacity:1},{transform:'scale(1.06)',opacity:1,offset:.25},{transform:'scale(.7)',opacity:.75,offset:.55},{transform:'scale(.12)',opacity:0,offset:.8},{transform:'scale(.12)',opacity:0}],duration),
          play(fx.edge,[{opacity:1},{opacity:.5,offset:.4},{opacity:0}],duration),
          play(fx.burst,[{transform:'scale(.12) rotate(-8deg)',opacity:0},{transform:'scale(.55) rotate(0deg)',opacity:1,offset:.18},{transform:'scale(1.12) rotate(12deg)',opacity:.75,offset:.55},{transform:'scale(1.45) rotate(20deg)',opacity:0}],duration),
        ];
      })]);
    } finally {clear();this.root.dataset.fxPhase = 'idle';}
  }
  sparkAnimations(selected,duration,play){
    const cw=(this.root.clientWidth||600)/6,ch=(this.root.clientHeight||500)/5,unit=Math.min(cw,ch);
    return selected.flatMap((cell,index)=>Array.from({length:8},(_,ray)=>{
      const node=this.sparks[index*8+ray],angle=ray*Math.PI/4+index*.37,reach=unit*(.8+(ray%3)*.24);
      node.style.left=((cell%6+.5)/6*100)+'%';node.style.top=((Math.floor(cell/6)+.5)/5*100)+'%';
      const dx=Math.cos(angle)*reach,dy=Math.sin(angle)*reach;
      return play(node,[
        {transform:'translate3d(0,0,0) scale(.25)',opacity:0},
        {transform:'translate3d(0,0,0) scale(.25)',opacity:0,offset:.22},
        {transform:`translate3d(${dx*.35}px,${dy*.35}px,0) scale(1)`,opacity:1,offset:.42},
        {transform:`translate3d(${dx}px,${dy+unit*.3}px,0) scale(.65)`,opacity:.8,offset:.75},
        {transform:`translate3d(${dx*1.15}px,${dy+unit*.65}px,0) scale(.15)`,opacity:0}
      ],duration,'linear');
    }));
  }
  async cascade(before, after, {turbo = false, quick = false, reduced = false} = {}) {
    this.target = after;
    this.render(after);
    if (reduced || !this.cells[0].motion.animate) {this.target = null; return;}
    const oldPositions = new Map(before.map((symbol, i) => [symbol.id, i]));
    try {
      await Promise.all(after.map((symbol, i) => {
        const old = oldPositions.get(symbol.id);
        const rows = old === undefined ? -(Math.floor(i / 6) + 1) : Math.floor(old / 6) - Math.floor(i / 6);
        if (!rows) return;
        return this.finish(this.animate(this.cells[i].motion, [
          {transform: `translate3d(0,${rows * 100}%,0)`, opacity: old === undefined ? .2 : 1},
          {transform: 'translate3d(0,0,0)', opacity: 1}
        ], {duration: turbo ? 220 : quick ? 420 : 650, delay: turbo ? 0 : (i % 6) * (quick ? 7 : 12),
          easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'backwards'}));
      }));
    } finally {this.target = null;}
  }
};
