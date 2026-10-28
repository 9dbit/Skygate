/* Skygate portrait renderer v0.5. All outcomes come from the unchanged synthetic engine. */
(() => {
  'use strict';
  const cfg = window.SlotGameConfig;
  const MathEngine = window.SlotGameMath;
  if (!cfg || !MathEngine) throw new Error('Missing research math engine / browser config');
  const E = id => document.getElementById(id);
  const art = {ruby:'ruby', sapphire:'sapphire', emerald:'emerald', amethyst:'amethyst', topaz:'topaz', amber:'ring', pearl:'chalice', scatter:'crown', orb:'orb'};
  const label = {ruby:'Ruby', sapphire:'Sapphire', emerald:'Emerald', amethyst:'Amethyst', topaz:'Topaz', amber:'Ring', pearl:'Chalice', scatter:'Scatter Crown', orb:'Multiplier Orb'};
  const initialSeed = 20261027;
  const state = {seed:initialSeed, credits:100000, bet:20, rounds:0, spent:0, paid:0, hits:0, bonuses:0,
    busy:false, auto:false, turbo:false, sound:false, roundWin:0, cascade:0, orbTotal:0, bonusRemaining:0,
    bonusMultiplier:0, last:null};
  let engine = MathEngine.createEngine(cfg, state.seed);
  const audioSettings={muted:true,master:70};
  const audioTracks=Object.fromEntries(['bgm_celestial_loop','spin_start','reel_stop','tumble','symbol_win','multiplier','bonus_intro','free_spin_start','big_win','mega_win','ui_click'].map(id=>[id,{id,loop:id==='bgm_celestial_loop',volume:id==='bgm_celestial_loop'?35:70,fade:id==='bgm_celestial_loop'?600:0}]));
  const mixer=new window.SkyAudioMixer({resolve:id=>'assets/audio/'+id+'.mp3',track:id=>audioTracks[id],settings:()=>audioSettings,onError:()=>status('Suara belum tersedia. Ketuk ikon suara untuk mencoba lagi.')});
  let displayGrid=[];
  const credit = n => Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const isReduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = ms => new Promise(ok => setTimeout(ok, isReduced() ? 0 : state.turbo ? Math.min(40,ms) : ms));
  function sound(kind='tick') {
    if (!state.sound || document.hidden) return;
    const id=({tick:'spin_start',win:'symbol_win',tumble:'tumble',bonus:'bonus_intro',free:'free_spin_start',stop:'reel_stop',big:'big_win',mega:'mega_win',orb:'multiplier'})[kind]||'ui_click';
    void mixer.play(id);
  }
  async function toggleSound() {
    if(state.sound){state.sound=false;audioSettings.muted=true;mixer.stopAll();mixer.updateMix();refresh();return;}
    const ready=await mixer.unlock();
    if(!ready){status('Ketuk ikon suara lagi untuk mengaktifkan audio.');return;}
    state.sound=true;audioSettings.muted=false;mixer.updateMix();refresh();
    void mixer.play('bgm_celestial_loop');
  }
  function render(grid,marked=[],fresh=[]) {
    const wins = new Set(marked), newCells = new Set(fresh);
    if (!grid || !grid.length) return;
    displayGrid=grid;
    E('reels').innerHTML=grid.map((t,i)=>{
      const classes=['tile',wins.has(i)?'win':'',newCells.has(i)?'fresh':''].filter(Boolean).join(' ');
      const sprite=art[t.kind]||'ruby';
      const info=`${label[t.kind]||t.kind}${t.multiplier?' x'+t.multiplier:''}`;
      return `<div class="${classes}" title="${info}" aria-label="${info}"><img class="symbol" src="assets/symbols/${sprite}.png" alt="" draggable="false">${t.multiplier?`<b class="orb-num">${t.multiplier}×</b>`:''}${t.kind==='scatter'?'<small class="scatter-label">SCATTER</small>':''}</div>`;
    }).join('');
  }
  function idleBoard() {
    const types=['emerald','amber','ruby','scatter','sapphire','topaz','amethyst','pearl','sapphire','emerald','pearl','ruby','scatter','topaz','orb','amethyst','amber','emerald','sapphire','ruby','pearl','amber','topaz','scatter','emerald','amethyst','topaz','amber','sapphire','pearl'];
    return Array.from({length:cfg.grid_rows*cfg.grid_columns},(_,i)=>{
      const kind=types[i%types.length];
      return {id:i+1,kind,...(kind==='orb'?{multiplier:2}:{})};
    });
  }
  function refresh() {
    E('credits').textContent=credit(state.credits);
    E('betLabel').textContent=credit(state.bet);
    E('betText').textContent=state.bet;
    E('rounds').textContent=state.rounds;
    E('win').textContent=credit(state.roundWin);
    E('tumbles').textContent=state.cascade;
    E('orbTotal').textContent='×'+(state.orbTotal||1);
    E('bonusCount').textContent=state.bonusRemaining?`×${state.bonusMultiplier} / ${state.bonusRemaining} LEFT`:'READY';
    E('turbo').classList.toggle('selected',state.turbo);
    E('auto').classList.toggle('selected',state.auto);
    E('spin').classList.toggle('busy',state.busy || state.auto);
    E('spin').disabled=state.busy || state.auto;
    for(const id of ['minus','plus','reset','seedApply','seedInput','replay'])E(id).disabled=state.busy || state.auto || (id==='replay'&&!state.last);
    E('export').disabled=!state.last || state.busy || state.auto;
    E('seedCurrent').textContent=state.seed.toString();
    E('rtpObserved').textContent=state.rounds?`${(state.paid/state.spent*100).toFixed(2)}%`:'–';
    E('hitObserved').textContent=state.rounds?`${(state.hits/state.rounds*100).toFixed(1)}%`:'–';
    E('bonusObserved').textContent=String(state.bonuses);
    E('paidRounds').textContent=String(state.rounds);
    E('auto').setAttribute('aria-pressed',String(state.auto));
    E('turbo').setAttribute('aria-pressed',String(state.turbo));
    E('sound').setAttribute('aria-pressed',String(state.sound));
    E('sound').setAttribute('aria-label',state.sound?'Matikan suara':'Aktifkan suara');
    E('muteMark').hidden=state.sound;
    E('bonusRibbon').hidden=!state.bonusRemaining;
    E('bonusRibbon').textContent=`FREE SPINS · ${state.bonusRemaining} LEFT · ×${state.bonusMultiplier||1}`;
    E('auto').querySelector('small').textContent=state.auto?'STOP':'AUTO';
  }
  function status(msg){E('status').textContent=msg;}
  async function presentSpin(spin, bet, context) {
    state.orbTotal=0;
    render(spin.initial,[],Array.from({length:30},(_,i)=>i));
    E('banner').textContent=context==='base'?'TUMBLE WIN':'FREE SPIN WIN';
    status(context==='base'?'BASE SPIN · Seeking 8+ symbols':'FREE SPIN · Multiplier bank growing on qualifying orb wins');
    refresh(); await delay(240);
    for(const tumble of spin.cascades) {
      state.cascade++;
      render(tumble.before,tumble.removedPositions,[]);
      const winSummary=tumble.winning.map(g=>`${label[g.kind]} (${g.count})`).join(' + ');
      status(`TUMBLE ${tumble.step} · ${winSummary} · +${credit(tumble.awardX*bet)} demo credits`);
      state.roundWin=Math.min(cfg.round_max_win_x*bet,state.roundWin+tumble.awardX*bet);
      sound('win');refresh();
      await delay(310);
      render(tumble.after,[],tumble.newPositions);sound('tumble');
      await delay(210);
    }
    render(spin.final);sound('stop');
    state.orbTotal=spin.orbSumX;
    status(spin.symbolWinX>0
      ?`${context==='bonus'?'FREE SPIN':'SPIN'} · Symbol win ×${spin.symbolWinX.toFixed(3)} · applied orb ×${spin.appliedMultiplierX}`
      :`${context==='bonus'?'FREE SPIN':'SPIN'} · No symbol combination`);
    refresh();
    await delay(220);
  }
  async function animateRound(round, bet) {
    state.roundWin=0;state.cascade=0;state.orbTotal=0;state.bonusMultiplier=0;state.bonusRemaining=0;
    await presentSpin(round.base,bet,'base');
    let runningTotal=round.base.payoutX;
    state.roundWin=runningTotal*bet;refresh();
    if (round.bonus.triggered) {
      state.bonusRemaining=cfg.bonus_start_spins;
      status('BONUS TRIGGER · 15 FREE SPINS (virtual)');
      state.roundWin=Math.min(cfg.round_max_win_x*bet,state.roundWin+tumble.awardX*bet);
      sound('bonus');refresh();await delay(520);
      for(const spin of round.bonus.spins) {
        state.bonusRemaining=spin.leftBefore;
        state.bonusMultiplier=spin.bankAfterX;
        sound('free');await presentSpin(spin,bet,'bonus');
        runningTotal+=spin.payoutX;
        state.roundWin=Math.min(cfg.round_max_win_x,runningTotal)*bet;
        state.bonusRemaining=spin.leftAfter;
        if(spin.retriggered)status('RETRIGGER · +5 FREE SPINS (virtual)');
        refresh();await delay(170);
      }
      state.bonusRemaining=0;
    }
    state.roundWin=round.winX*bet;
    E('banner').textContent=round.bonus.triggered?'BONUS ROUND TOTAL':'ROUND TOTAL';
    refresh();
  }
  async function runRound(replay=false) {
    if (state.busy) return;
    if (!replay && state.credits<state.bet) {status('Kredit demo tidak cukup. Tekan reset.');return;}
    if (replay && !state.last) {status('Belum ada ronde untuk replay.');return;}
    state.busy=true;
    const bet=replay?state.last.bet:state.bet;
    let round;
    if (replay) round=state.last.round;
    else {
      // Outcome is generated once, BEFORE graphics/speed decisions.
      round=engine.playRound({trace:true});
      state.last={round,bet};
      state.rounds++;
      state.spent+=bet;
      // Settle the virtual ledger exactly once before presentation, so an
      // interrupted animation cannot lose or duplicate the award.
      const award=round.winX*bet;
      state.credits+=award-bet;state.paid+=award;
      if(award>0)state.hits++;
      if(round.bonus.triggered)state.bonuses++;
    }
    refresh();
    try {
      await animateRound(round,bet);
      if(round.winX>=25)sound('mega');else if(round.winX>=10)sound('big');
      status(`${replay?'REPLAY (tanpa debit)':'ROUND '+state.rounds} · ${credit(round.winX*bet)} kredit virtual · ${round.totalTumbles} tumbles · seed ${state.seed}`);
    } catch(e) {console.error(e);status(`Error saat render: ${String(e.message||e)}`);}
    finally {state.busy=false;refresh();}
  }
  function resetGame(seed=state.seed) {
    if (state.busy) return;
    state.auto=false;
    state.seed=MathEngine.uint32(seed);
    engine=MathEngine.createEngine(cfg,state.seed);
    Object.assign(state,{credits:100000,rounds:0,spent:0,paid:0,hits:0,bonuses:0,roundWin:0,cascade:0,orbTotal:0,bonusRemaining:0,bonusMultiplier:0,last:null});
    E('seedInput').value=String(state.seed);
    E('banner').textContent='TUMBLE WIN';
    render(idleBoard());refresh();
    status('Tekan SPIN · 8+ simbol yang sama untuk menang');
  }
  async function runAutoTen() {
    if(state.auto) {state.auto=false;status('AUTO akan berhenti setelah ronde berjalan.');refresh();return;}
    if(state.busy)return;
    state.auto=true;refresh();
    for(let i=0; i<10 && state.auto; i++) {
      if(state.credits<state.bet){status('AUTO: kredit demo tidak cukup');break;}
      await runRound();
      await delay(100);
    }
    state.auto=false;refresh();
  }
  function exportLast() {
    if(!state.last) return;
    const obj={...state.last.round,virtualBet:state.last.bet,exportedFor:'local synthetic research only'};
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`skygate_seed-${state.seed}_round-${obj.paidIndex}.json`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  E('spin').addEventListener('click',()=>{sound('tick');void runRound();});
  E('replay').addEventListener('click',()=>{E('menuDialog').close();sound('tick');void runRound(true);});
  E('export').addEventListener('click',exportLast);
  E('minus').addEventListener('click',()=>{if(!state.busy)state.bet=Math.max(1,state.bet>=20?state.bet-5:state.bet-1);refresh();});
  E('plus').addEventListener('click',()=>{if(!state.busy)state.bet=Math.min(200,state.bet>=20?state.bet+5:state.bet+1);refresh();});
  E('auto').addEventListener('click',()=>void runAutoTen());
  E('turbo').addEventListener('click',()=>{state.turbo=!state.turbo;refresh();status('Turbo '+(state.turbo?'on':'off')+' · payout tidak berubah');});
  E('reset').addEventListener('click',()=>{resetGame();E('menuDialog').close();});
  E('seedApply').addEventListener('click',()=>{
    if(state.busy || state.auto)return;
    const n=Number(E('seedInput').value);
    if(!Number.isSafeInteger(n)||n<1||n>4294967295){status('Seed harus berupa bilangan bulat 1 hingga 4294967295.');return;}
    resetGame(n);E('menuDialog').close();
  });
  E('sound').addEventListener('click',()=>void toggleSound());
  const openRules = section => {
    E('modal').showModal();
    if(section)E(section).scrollIntoView({block:'start'});
  };
  E('help').addEventListener('click',()=>openRules());
  E('freeInfo').addEventListener('click',()=>openRules('bonusRules'));
  E('payInfo').addEventListener('click',()=>openRules('payRules'));
  E('closeModal').addEventListener('click',()=>E('modal').close());
  E('menu').addEventListener('click',()=>E('menuDialog').showModal());
  E('closeMenu').addEventListener('click',()=>E('menuDialog').close());
  for(const id of ['modal','menuDialog'])E(id).addEventListener('click',e=>{if(e.target===E(id)){const r=E(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)E(id).close();}});
  E('fullscreen').addEventListener('click',async()=>{
    if(!document.documentElement.requestFullscreen){E('menuStatus').textContent='Layar sudah menyesuaikan ukuran iPhone. Untuk ruang lebih luas, buka di Safari lalu tambahkan ke Layar Utama.';return;}
    try{E('menuDialog').close();if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{status('Layar penuh tidak tersedia di browser ini.');}
  });
  window.addEventListener('keydown',e=>{
    if(e.key==='Enter' && document.activeElement===document.body && !state.busy && !state.auto && !E('modal').open && !E('menuDialog').open){e.preventDefault();sound('tick');void runRound();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){state.auto=false;mixer.stopAll();refresh();}});
  document.addEventListener('pointerdown',()=>{
    if(state.sound&&!document.hidden&&(!mixer.isReady()||!mixer.isPlaying('bgm_celestial_loop'))){void mixer.unlock().then(ready=>{if(ready&&state.sound&&!document.hidden)void mixer.play('bgm_celestial_loop');});}
  });
  E('paytable').innerHTML=Object.entries(cfg.paytable).map(([kind,values])=>`<tr><td><img src="assets/symbols/${art[kind]}.png" alt="">${label[kind]}</td>${values.map(n=>`<td>${n}×</td>`).join('')}</tr>`).join('');
  E('seedInput').value=String(state.seed);
  resetGame(initialSeed);
  window.SlotGameTest={getState:()=>({...state,last:state.last?{round:state.last.round,bet:state.last.bet}:null}),getGrid:()=>displayGrid,engineProfile:cfg.profile_id};
})();
