/* Skygate portrait renderer v0.9. Outcomes are independent of animation timing. */
function startSkygate() {
  'use strict';
  const release=window.SkygateActiveRelease;
  const published=release?.project;
  const cfg = published?.math || window.SlotGameConfig;
  const MathEngine = window.SlotGameMath;
  const Settings=window.SkygateSettings;
  let saved={};try{saved=JSON.parse(window.localStorage?.getItem('skygate-settings-v1')||'{}');}catch{}
  const preferences=Settings.normalize(saved);
  const savePreferences=()=>{try{window.localStorage?.setItem('skygate-settings-v1',JSON.stringify(preferences));}catch{}};
  if (!cfg || !MathEngine) throw new Error('Missing research math engine / browser config');
  const E = id => document.getElementById(id);
  const asset=path=>window.SKY_PREVIEW_ASSETS?.['assets/'+path] || (release?.overrides?.['asset:'+path]? (window.SkygatePreview?'/studio/api/media/':'/play/media/')+release.overrides['asset:'+path].file:'assets/'+path);
  if(published)window.SkygateApplyLayout(published,asset);
  const art = {ruby:'ruby', sapphire:'sapphire', emerald:'emerald', amethyst:'amethyst', topaz:'topaz', amber:'ring', pearl:'chalice', scatter:'crown', orb:'orb'};
  Object.assign(art,{ring:'ring',crown:'crown',hourglass:'hourglass',chalice:'chalice'});
  if(published)Object.assign(art,{amber:'amber',pearl:'pearl',scatter:'scatter'});
  const label = {ruby:'Ruby', sapphire:'Sapphire', emerald:'Emerald', amethyst:'Amethyst', topaz:'Topaz', amber:'Ring', pearl:'Chalice', scatter:'Scatter Crown', orb:'Multiplier Orb'};
  Object.assign(label,{ring:'Ring',crown:'Crown',hourglass:'Hourglass',chalice:'Chalice'});
  if(published)Object.assign(label,{amber:'Amber',pearl:'Pearl'});
  const reels=new window.SkygateReels(E('reels'),{asset,art,label,legacyOrb:!published});
  const initialSeed = published?.seed || 20261027;
  const startingCredit=published?.credit || 100000;
  const thresholds=published?.winPresentation || {bigX:10,megaX:25,superX:100};
  const state = {seed:initialSeed, credits:startingCredit, bet:published?.bet || 2, rounds:0, spent:0, paid:0, hits:0, bonuses:0,
    busy:false, auto:false, turbo:false, sound:false, roundWin:0, cascade:0, orbTotal:0, bonusRemaining:0,
    bonusMultiplier:0, last:null, ante:false, speed:preferences.speed, autoRemaining:0, history:[], level:1, coin:.1};
  Object.assign(state,Settings.fromBase(state.bet));
  const totalBet=()=>Settings.total(state.level,state.coin,state.ante);
  let heldTurbo=false,holdTimer=null,suppressClick=false;
  const locked=()=>state.busy||state.auto||heldTurbo;
  const speed=()=>heldTurbo?'turbo':state.speed;
  const displayMoney=n=>preferences.coinsView?Settings.money(n/state.coin).toLocaleString('en-US')+' COINS':credit(n);
  const makeEngine=seed=>published?window.SkygateStudioMath.createStudioEngine(cfg,published.jackpot,seed):MathEngine.createEngine(cfg,seed);
  let engine = makeEngine(state.seed);
  const audioSettings={muted:true,master:published?.audio.master ?? 70};
  const audioTracks=Object.fromEntries(['bgm_celestial_loop','spin_start','reel_stop','tumble','symbol_win','multiplier','bonus_intro','free_spin_start','big_win','mega_win','ui_click'].map(id=>[id,{id,loop:id==='bgm_celestial_loop',volume:id==='bgm_celestial_loop'?35:70,fade:id==='bgm_celestial_loop'?600:0}]));
  if(published)for(const track of published.tracks)audioTracks[track.id]=track;
  const mixer=new window.SkyAudioMixer({resolve:id=>release?.overrides?.['audio:'+id]?(window.SkygatePreview?'/studio/api/media/':'/play/media/')+release.overrides['audio:'+id].file:asset('audio/'+id+'.mp3'),track:id=>audioTracks[id],settings:()=>audioSettings,onError:()=>status('Suara belum tersedia. Ketuk ikon suara untuk mencoba lagi.')});
  let displayGrid=[];
  const credit = n => Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const isReduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let suspended=false;
  const waiting=new Map();
  const motionOptions=()=>({turbo:speed()==='turbo',quick:speed()==='quick',battery:preferences.battery,reduced:preferences.battery||isReduced()||suspended||document.hidden});
  const delay = (ms,turboMs=40) => new Promise(ok => {
    if(motionOptions().reduced){ok();return;}
    const timer=setTimeout(()=>{waiting.delete(timer);ok();},speed()==='turbo'?Math.min(turboMs,ms):speed()==='quick'?ms*.55:ms);
    waiting.set(timer,ok);
  });
  function sound(kind='tick') {
    if (!state.sound || document.hidden) return;
    const id=({tick:'spin_start',win:'symbol_win',tumble:'tumble',bonus:'bonus_intro',free:'free_spin_start',stop:'reel_stop',big:'big_win',mega:'mega_win',orb:'multiplier',jackpot:'jackpot'})[kind]||'ui_click';
    void mixer.play(id);
  }
  async function toggleSound() {
    if(state.sound){state.sound=false;audioSettings.muted=true;mixer.stopAll();mixer.updateMix();refresh();return;}
    const ready=await mixer.unlock();
    if(!ready){status('Ketuk ikon suara lagi untuk mengaktifkan audio.');return;}
    state.sound=true;audioSettings.muted=false;mixer.updateMix();refresh();
    void mixer.play('bgm_celestial_loop');
  }
  function render(grid,marked=[]) {
    if (!grid || !grid.length) return;
    displayGrid=grid;
    reels.render(grid,marked);
  }
  function idleBoard() {
    const types=['emerald','amber','ruby','scatter','sapphire','topaz','amethyst','pearl','sapphire','emerald','pearl','ruby','scatter','topaz','orb','amethyst','amber','emerald','sapphire','ruby','pearl','amber','topaz','scatter','emerald','amethyst','topaz','amber','sapphire','pearl'];
    return Array.from({length:cfg.grid_rows*cfg.grid_columns},(_,i)=>{
      const kind=published?.grid[i] || types[i%types.length];
      return {id:i+1,kind,...(kind==='orb'?{multiplier:2}:{})};
    });
  }
  function refresh() {
    E('credits').textContent=displayMoney(state.credits);
    E('betLabel').textContent=credit(totalBet());
    E('betText').textContent=displayMoney(totalBet());
    E('rounds').textContent=state.rounds;
    E('win').textContent=credit(state.roundWin);
    E('tumbles').textContent=state.cascade;
    E('orbTotal').textContent='×'+(state.orbTotal||1);
    E('bonusCount').textContent=state.bonusRemaining?`×${state.bonusMultiplier} / ${state.bonusRemaining} LEFT`:'READY';
    state.turbo=speed()==='turbo';
    E('turbo').classList.toggle('selected',speed()!=='normal');
    E('turboStatus').textContent=speed().toUpperCase();
    E('turbo').setAttribute('aria-label','Kecepatan spin: '+speed());
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
    E('autoStatus').textContent=state.auto?'STOP '+state.autoRemaining:'AUTO';
    E('auto').setAttribute('aria-label',state.auto?'Hentikan autoplay':'Pengaturan autoplay');
    refreshSettings();
    window.SkygateRefitText?.();
  }
  function status(msg,hint=msg){E('status').textContent=msg;E('playHint').textContent=hint;}
  async function presentSpin(spin, bet, context) {
    state.orbTotal=0;
    status(context==='base'?'BASE SPIN · Seeking 8+ symbols':'FREE SPIN · Multiplier bank growing on qualifying orb wins',context==='base'?'Cari 8+ simbol yang sama':`${state.bonusRemaining} free spins tersisa`);
    refresh();
    await reels.spin(spin.initial,motionOptions());displayGrid=spin.initial;
    for(const tumble of spin.cascades) {
      state.cascade++;
      render(tumble.before,tumble.removedPositions,[]);
      const winSummary=tumble.winning.map(g=>`${label[g.kind]} (${g.count})`).join(' + ');
      status(`TUMBLE ${tumble.step} · ${winSummary} · +${credit(tumble.awardX*bet)} demo credits`,`+${credit(tumble.awardX*bet)} kredit · simbol baru jatuh`);
      state.roundWin=Math.min(cfg.round_max_win_x*bet,state.roundWin+tumble.awardX*bet);
      sound('win');refresh();
      await reels.shatter(tumble.removedPositions,motionOptions());
      if(spin.capHit && tumble===spin.cascades.at(-1))break;
      sound('tumble');await reels.cascade(tumble.before,tumble.after,motionOptions());displayGrid=tumble.after;
    }
    render(spin.final);sound('stop');
    state.orbTotal=spin.orbSumX;
    status(spin.symbolWinX>0
      ?`${context==='bonus'?'FREE SPIN':'SPIN'} · Symbol win ×${spin.symbolWinX.toFixed(3)} · applied orb ×${spin.appliedMultiplierX}`
      :`${context==='bonus'?'FREE SPIN':'SPIN'} · No symbol combination`,spin.symbolWinX>0?`Kemenangan simbol${spin.appliedMultiplierX>1?' · pengali ×'+spin.appliedMultiplierX:''}`:'Belum ada kombinasi kemenangan');
    if(spin.symbolWinX>0 && spin.appliedMultiplierX>1){sound('orb');celebrate('MULTIPLIER','×'+spin.appliedMultiplierX,'multiplier');}
    refresh();
    await delay(220);
  }
  async function animateRound(round, bet) {
    state.roundWin=0;state.cascade=0;state.orbTotal=0;state.bonusMultiplier=0;state.bonusRemaining=0;
    await presentSpin(round.base,bet,'base');
    let runningTotal=round.base.payoutX;
    state.roundWin=runningTotal*bet;refresh();
    if (round.bonus.triggered && !round.base.capHit) {
      state.bonusRemaining=cfg.bonus_start_spins;
      status(`BONUS TRIGGER · ${cfg.bonus_start_spins} FREE SPINS (virtual)`,`${cfg.bonus_start_spins} free spins dimulai`);
      celebrate('HADIAH FREE SPINS',`${cfg.bonus_start_spins} PUTARAN`, 'bonus');
      sound('bonus');refresh();await featureScreen('HADIAH FREE SPINS',cfg.bonus_start_spins+' PUTARAN','Multiplier dikumpulkan selama bonus.');
      for(const spin of round.bonus.spins) {
        state.bonusRemaining=spin.leftBefore;
        state.bonusMultiplier=spin.bankAfterX;
        sound('free');await presentSpin(spin,bet,'bonus');
        runningTotal+=spin.payoutX;
        state.roundWin=Math.min(cfg.round_max_win_x,runningTotal)*bet;
        state.bonusRemaining=spin.leftAfter;
        if(spin.retriggered){status(`RETRIGGER · +${cfg.bonus_retrigger_add_spins} FREE SPINS (virtual)`,`+${cfg.bonus_retrigger_add_spins} free spins tambahan`);celebrate('HADIAH TAMBAHAN',`+${cfg.bonus_retrigger_add_spins} FREE SPINS`,'bonus');}
        refresh();await delay(170);
      }
      state.bonusRemaining=0;
      await featureScreen('FREE SPINS SELESAI',credit(round.winX*bet),'Total kemenangan seluruh siklus bonus.');
    }
    state.roundWin=round.winX*bet;
    refresh();
  }
  async function runRound(replay=false,buyBonus=false) {
    if (state.busy) return;
    const cost=buyBonus?Settings.money(state.bet*100):totalBet();
    if(buyBonus && state.ante){status('Matikan Ante Bet untuk membeli Free Spins.');return;}
    if (!replay && state.credits<cost) {status('Kredit tidak cukup. Reset kredit melalui menu.');return;}
    if (replay && !state.last) {status('Belum ada ronde untuk replay.');return;}
    state.busy=true;suspended=document.hidden;
    const bet=replay?state.last.bet:state.bet;
    let round;
    if (replay) round=state.last.round;
    else {
      // Outcome is generated once, BEFORE graphics/speed decisions.
      try{round=engine.playRound({trace:true,ante:state.ante,buyBonus});}catch(error){state.busy=false;status('Ronde dibatalkan; kredit tidak dipotong. '+error.message);refresh();return;}
      state.last={round,bet,cost,buyBonus,ante:state.ante};
      state.rounds++;
      state.spent+=cost;
      // Debit once now; settle once in finally, after the whole presentation.
      state.credits=Settings.money(state.credits-cost);
      if(round.bonus.triggered)state.bonuses++;
    }
    refresh();
    try {
      await animateRound(round,bet);
      if(round.jackpot?.hit){sound('jackpot');celebrate(round.jackpot.tier.toUpperCase()+' JACKPOT',credit(round.jackpot.awardX*bet),'jackpot');}
      else if(round.winX>=thresholds.bigX){const big=round.winX>=thresholds.superX?'SUPER WIN':round.winX>=thresholds.megaX?'MEGA WIN':'BIG WIN';sound(round.winX>=thresholds.megaX?'mega':'big');celebrate(big,credit(round.winX*bet),'win');}
      status(`${replay?'REPLAY (tanpa debit)':'ROUND '+state.rounds} · ${credit(round.winX*bet)} kredit virtual · ${round.totalTumbles} tumbles · seed ${state.seed}`,replay?'Replay selesai · saldo tetap':round.winX>0?`+${credit(round.winX*bet)} kredit virtual`:'Ronde selesai · coba spin lagi');
    } catch(e) {console.error(e);status(`Error saat render: ${String(e.message||e)}`,'Animasi terhenti · hasil tersimpan di menu');}
    finally {
      if(!replay){const award=Settings.money(round.winX*bet);state.credits=Settings.money(state.credits+award);state.paid=Settings.money(state.paid+award);if(award>0)state.hits++;
        state.history.unshift({round:state.rounds,baseBet:bet,cost,award,bonus:round.bonus.triggered,buy:buyBonus,ante:state.ante,time:new Date().toLocaleTimeString('id-ID')});state.history.length=Math.min(100,state.history.length);}
      reels.cancel();state.busy=false;refresh();
    }
  }
  function resetGame(seed=state.seed) {
    if (state.busy) return;
    state.auto=false;
    state.seed=MathEngine.uint32(seed);
    engine=makeEngine(state.seed);
    Object.assign(state,{credits:startingCredit,rounds:0,spent:0,paid:0,hits:0,bonuses:0,roundWin:0,cascade:0,orbTotal:0,bonusRemaining:0,bonusMultiplier:0,last:null,history:[]});
    E('seedInput').value=String(state.seed);
    render(idleBoard());refresh();
    status('Tekan SPIN · 8+ simbol yang sama untuk menang','Cocokkan 8+ simbol di mana saja');
  }
  async function runAutoplay() {
    if(locked())return;
    E('autoDialog').close();state.auto=true;state.autoRemaining=preferences.autospins;refresh();
    while(state.auto && state.autoRemaining>0){
      if(state.credits<totalBet()){status('AUTO: kredit tidak cukup');break;}
      const before=state.rounds;await runRound();if(state.rounds===before)break;
      state.autoRemaining--;refresh();await delay(100);
    }
    state.auto=false;state.autoRemaining=0;refresh();
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
  let celebrationTimer;
  function celebrate(title,amount,kind){
    const box=E('winToast');clearTimeout(celebrationTimer);box.hidden=false;box.dataset.kind=kind;E('toastTitle').textContent=title;E('toastAmount').textContent=amount;
    celebrationTimer=setTimeout(()=>{box.hidden=true;},speed()==='turbo'?500:1600);
  }
  let paytableKey='';
  function refreshPaytable(){
    const key=state.bet+':'+state.coin+':'+preferences.coinsView;if(key===paytableKey)return;paytableKey=key;
    E('paytable').innerHTML=Object.entries(cfg.paytable).map(([kind,values])=>`<tr><td><img src="${asset('symbols/'+art[kind]+'.png')}" alt="">${label[kind]}</td>${values.map(n=>`<td>${displayMoney(n*state.bet)}</td>`).join('')}</tr>`).join('');
    if(cfg.scatter_paytable)E('paytable').innerHTML+=`<tr><td>SCATTER</td><td colspan="3">${[4,5,6].map(n=>n+(n===6?'+':'')+' = '+displayMoney(cfg.scatter_paytable[n]*state.bet)).join(' · ')}</td></tr>`;
  }
  let finishFeature=null;
  function refreshSettings(){
    const base=Settings.money(state.level*state.coin*20);state.bet=base;refreshPaytable();
    E('betTitle').textContent='BET MULTIPLIER '+(state.ante?25:20)+'×';
    E('betLevel').textContent=state.level;E('coinValue').textContent=credit(state.coin);
    for(const id of ['totalBet','settingsTotal'])E(id).textContent=credit(totalBet());
    E('buyBaseBet').textContent=credit(base);E('buyPrice').textContent=credit(base*100);E('confirmBuyPrice').textContent=credit(base*100);
    E('antePrice').textContent=credit(Settings.total(state.level,state.coin,true));E('anteState').textContent=state.ante?'ON':'OFF';
    E('anteFeature').setAttribute('aria-pressed',String(state.ante));E('anteFeature').classList.toggle('selected',state.ante);
    E('buyFeature').disabled=locked()||state.ante;E('anteFeature').disabled=locked();E('betMenu').disabled=locked();
    E('confirmBuy').disabled=locked()||state.ante||state.credits<base*100;
    E('buyMessage').textContent=state.ante?'Buy Free Spins tidak tersedia ketika Ante ON.':state.credits<base*100?'Kredit tidak cukup untuk pembelian ini.':'';
    for(const id of ['levelMinus','levelPlus','coinMinus','coinPlus','totalMinus','totalPlus','settingsMinus','settingsPlus','buyMinus','buyPlus','betMax'])E(id).disabled=locked();
    E('levelMinus').disabled=locked()||state.level<=1;
    E('levelPlus').disabled=locked()||state.level>=10||Settings.total(state.level+1,state.coin,state.ante)>300;
    E('coinMinus').disabled=locked()||Settings.coins.indexOf(state.coin)<=0;
    E('coinPlus').disabled=locked()||Settings.coins.indexOf(state.coin)>=Settings.coins.length-1||Settings.total(state.level,Settings.coins[Settings.coins.indexOf(state.coin)+1],state.ante)>300;
    E('autoTurbo').checked=state.speed==='turbo';E('autoQuick').checked=state.speed==='quick';E('autoSkip').checked=preferences.skipScreens;
    E('autoCount').value=Math.max(0,Settings.autoCounts.indexOf(preferences.autospins));E('autoCountValue').textContent=preferences.autospins;E('autoStart').textContent='START AUTOPLAY ('+preferences.autospins+')';
    E('batterySetting').checked=preferences.battery;E('soundSetting').checked=state.sound;E('lockSetting').checked=preferences.spinLocked;E('promoSetting').checked=preferences.promotions;E('introSetting').checked=preferences.intro;
    E('promoBadge').hidden=!preferences.promotions;E('spin').classList.toggle('battery-saver',preferences.battery);
  }
  function setBet(next){if(locked()||!next)return;state.level=next.level;state.coin=next.coin;state.bet=Settings.total(next.level,next.coin);refresh();}
  function changeTotal(direction){setBet(Settings.step(state.bet,direction,state.ante));}
  function setSpeed(next){state.speed=next;preferences.speed=next;savePreferences();refresh();status(next.toUpperCase()+' SPINS ENABLED');celebrate(next.toUpperCase()+' SPINS','ENABLED','speed');}
  async function featureScreen(title,amount,description,manual=false){
    if(suspended||document.hidden)return;
    E('featureTitle').textContent=title;E('featureAmount').textContent=amount;E('featureDescription').textContent=description;
    E('featureDialog').showModal();
    if(preferences.skipScreens&&!manual){await delay(1200,450);E('featureDialog').close();return;}
    await new Promise(resolve=>{finishFeature=()=>{E('featureDialog').close();finishFeature=null;resolve();};});
  }
  async function showHome(){E('menuDialog').close();await featureScreen('SKYGATE','WIN UP TO 5000×','8+ simbol membayar di mana saja. 4+ SCATTER memberi 15 Free Spins. Semua nilai adalah kredit virtual.',true);}
  function setupSettings(){
    for(const [button,dialog] of [['closeAuto','autoDialog'],['closeBet','betDialog'],['closeBuy','buyDialog'],['cancelBuy','buyDialog'],['closeHistory','historyDialog']])E(button).addEventListener('click',()=>E(dialog).close());
    E('featureContinue').addEventListener('click',()=>finishFeature?.());
    E('featureDialog').addEventListener('cancel',()=>finishFeature?.());
    E('autoStart').addEventListener('click',()=>void runAutoplay());
    E('autoCount').addEventListener('input',()=>{preferences.autospins=Settings.autoCounts[Number(E('autoCount').value)]||100;savePreferences();refreshSettings();});
    for(const [id,mode] of [['autoTurbo','turbo'],['autoQuick','quick']])E(id).addEventListener('change',()=>setSpeed(E(id).checked?mode:'normal'));
    E('autoSkip').addEventListener('change',()=>{preferences.skipScreens=E('autoSkip').checked;savePreferences();});
    E('betMenu').addEventListener('click',()=>{if(!locked()){refreshSettings();E('betDialog').showModal();}});
    for(const [minus,plus] of [['totalMinus','totalPlus'],['settingsMinus','settingsPlus'],['buyMinus','buyPlus']]){E(minus).addEventListener('click',()=>changeTotal(-1));E(plus).addEventListener('click',()=>changeTotal(1));}
    for(const [id,direction] of [['levelMinus',-1],['levelPlus',1]])E(id).addEventListener('click',()=>{const level=state.level+direction;if(level>=1&&level<=10&&Settings.total(level,state.coin,state.ante)<=300)setBet({level,coin:state.coin});});
    for(const [id,direction] of [['coinMinus',-1],['coinPlus',1]])E(id).addEventListener('click',()=>{const coin=Settings.coins[Settings.coins.indexOf(state.coin)+direction];if(coin&&Settings.total(state.level,coin,state.ante)<=300)setBet({level:state.level,coin});});
    E('betMax').addEventListener('click',()=>setBet(Settings.combinations(state.ante).sort((a,b)=>b.total-a.total)[0]));
    E('anteFeature').addEventListener('click',()=>{if(locked())return;state.ante=!state.ante;const next=Settings.fromBase(state.bet,state.ante);setBet(next);});
    E('buyFeature').addEventListener('click',()=>{if(!locked()&&!state.ante){refreshSettings();E('buyDialog').showModal();}});
    E('confirmBuy').addEventListener('click',()=>{if(locked()||state.ante||state.credits<state.bet*100)return;E('buyDialog').close();void runRound(false,true);});
    E('batterySetting').addEventListener('change',()=>{preferences.battery=E('batterySetting').checked;savePreferences();refresh();});
    E('soundSetting').addEventListener('change',()=>void toggleSound());
    E('lockSetting').addEventListener('change',()=>{preferences.spinLocked=E('lockSetting').checked;savePreferences();refresh();});
    E('promoSetting').addEventListener('change',()=>{preferences.promotions=E('promoSetting').checked;savePreferences();refresh();});
    E('introSetting').addEventListener('change',()=>{preferences.intro=E('introSetting').checked;savePreferences();});
    E('home').addEventListener('click',()=>void showHome());E('promoBadge').addEventListener('click',()=>{if(!locked())void showHome();});
    E('history').addEventListener('click',()=>{E('menuDialog').close();E('historyRows').innerHTML=state.history.length?state.history.map(h=>`<article class="history-entry"><b>ROUND ${h.round} · ${h.buy?'BUY FREE SPINS':h.ante?'ANTE BET':'BASE SPIN'}</b><small>${h.time}${h.bonus?' · FREE SPINS':''}</small><span>BET ${credit(h.cost)} · WIN ${credit(h.award)}</span></article>`).join(''):'Belum ada putaran.';E('historyDialog').showModal();});
    for(const id of ['credits','betText']){const node=E(id);node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-label','Ganti tampilan kredit atau koin');const toggle=()=>{preferences.coinsView=!preferences.coinsView;savePreferences();refresh();};node.addEventListener('click',toggle);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});}
    let drag=null;
    E('spin').addEventListener('pointerdown',e=>{
      if(locked())return;
      if(!preferences.spinLocked){const node=E('spin'),r=node.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,dx:Number(node.dataset.dx||0),dy:Number(node.dataset.dy||0),rect:r};node.setPointerCapture?.(e.pointerId);return;}
      holdTimer=setTimeout(async()=>{heldTurbo=true;suppressClick=true;while(heldTurbo&&!document.hidden&&state.credits>=totalBet()){const before=state.rounds;await runRound();if(state.rounds===before)break;}heldTurbo=false;refresh();},400);
    });
    E('spin').addEventListener('pointermove',e=>{if(!drag)return;const node=E('spin'),stage=node.closest('.game').getBoundingClientRect();const dx=Math.max(stage.left-drag.rect.left,Math.min(stage.right-drag.rect.right,e.clientX-drag.x));const dy=Math.max(stage.top-drag.rect.top,Math.min(stage.bottom-drag.rect.bottom,e.clientY-drag.y));node.style.transform=`translate3d(${drag.dx+dx}px,${drag.dy+dy}px,0)`;node.dataset.dx=drag.dx+dx;node.dataset.dy=drag.dy+dy;if(Math.abs(dx)+Math.abs(dy)>5)suppressClick=true;});
    const releaseHold=()=>{clearTimeout(holdTimer);heldTurbo=false;drag=null;refresh();};
    E('spin').addEventListener('pointerup',releaseHold);E('spin').addEventListener('pointercancel',releaseHold);document.addEventListener('pointerup',releaseHold);
  }
  E('spin').addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}sound('tick');void runRound();});
  E('replay').addEventListener('click',()=>{E('menuDialog').close();sound('tick');void runRound(true);});
  E('export').addEventListener('click',exportLast);
  E('minus').addEventListener('click',()=>changeTotal(-1));
  E('plus').addEventListener('click',()=>changeTotal(1));
  E('auto').addEventListener('click',()=>{if(state.auto){state.auto=false;refresh();return;}if(!state.busy){refreshSettings();E('autoDialog').showModal();}});
  E('turbo').addEventListener('click',()=>setSpeed(Settings.speeds[(Settings.speeds.indexOf(state.speed)+1)%3]));
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
    if((e.key==='Enter'||e.key===' ') && document.activeElement===document.body && !state.busy && !state.auto && !E('modal').open && !E('menuDialog').open && !['autoDialog','betDialog','buyDialog','featureDialog','historyDialog'].some(id=>E(id).open)){e.preventDefault();sound('tick');void runRound();}
  });
  function suspend(){
    suspended=true;state.auto=false;heldTurbo=false;clearTimeout(holdTimer);finishFeature?.();reels.cancel();mixer.stopAll();
    for(const [timer,resolve] of waiting){clearTimeout(timer);resolve();}waiting.clear();refresh();
  }
  window.addEventListener('pagehide',suspend);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
  document.addEventListener('pointerdown',()=>{
    if(state.sound&&!document.hidden&&(!mixer.isReady()||!mixer.isPlaying('bgm_celestial_loop'))){void mixer.unlock().then(ready=>{if(ready&&state.sound&&!document.hidden)void mixer.play('bgm_celestial_loop');});}
  });
  setupSettings();
  E('paytable').innerHTML=Object.entries(cfg.paytable).map(([kind,values])=>`<tr><td><img src="${asset('symbols/'+art[kind]+'.png')}" alt="">${label[kind]}</td>${values.map(n=>`<td>${n}×</td>`).join('')}</tr>`).join('');
  E('bonusRulesText').textContent=`Hadiah ${cfg.bonus_start_spins} free spins diperoleh dari hasil spin dengan ${cfg.bonus_trigger_scatters}+ SCATTER dan berjalan otomatis. Di dalam bonus, ${cfg.bonus_retrigger_scatters}+ SCATTER memberi tambahan ${cfg.bonus_retrigger_add_spins} putaran. Orb mengalikan kemenangan simbol; pengalinya terkumpul selama bonus hanya pada putaran menang dengan orb baru. Pengali tersimpan diterapkan lagi jika putaran menang juga memunculkan orb baru. Bonus memakai bobot simbol terpisah.`;
  E('orbRules').textContent='Nilai orb: '+cfg.multiplier_values.map(n=>n+'×').join(', ')+'.';
  E('anteRulesNote').textContent=cfg.reference_rules?'Referensi menyebut peluang bonus Ante 2× dan RTP 96,50%. Bobot asli tidak disediakan; frekuensi Ante dan RTP Skygate belum terverifikasi.':'Profil peluang ditetapkan di Studio.';
  if(cfg.scatter_paytable)E('paytable').innerHTML+=`<tr><td>SCATTER</td><td colspan="3">4 = 3× · 5 = 5× · 6+ = 100×</td></tr>`;
  E('capText').textContent=`Maksimum ${cfg.round_max_win_x.toLocaleString('id-ID')}× base bet per ronde. Saat batas tercapai, ronde langsung berakhir dan sisa fitur dibatalkan. Total bet 0,20–300,00 kredit virtual. Gangguan perhitungan membatalkan ronde; gangguan animasi tetap membayar hasil yang telah dihitung. Kecepatan dan autoplay tidak mengubah peluang. Tidak ada deposit atau penarikan.`;
  E('releaseInfo').textContent=release?`Versi ${release.id.slice(0,8)} · ${new Date(release.createdAt).toLocaleDateString('id-ID')}`:'SKYGATE v0.8 · Original celestial artwork';
  E('previewBadge').hidden=!window.SkygatePreview;
  E('seedInput').value=String(state.seed);
  resetGame(initialSeed);
  if(preferences.intro && !window.SkygatePreview){let seen=false;try{seen=window.sessionStorage?.getItem('skygate-intro-seen');window.sessionStorage?.setItem('skygate-intro-seen','1');}catch{}if(!seen)void showHome();}
  if(window.SkygatePreview){
    Promise.all(Array.from(document.images).map(img=>img.decode())).then(()=>{
      window.parent.postMessage({type:'skygate-preview-ready',id:release.id},location.origin);
    }).catch(()=>status('Ada gambar yang gagal dimuat. Perbaiki aset di Studio lalu siapkan preview baru.'));
  }
  window.SlotGameTest={getState:()=>({...state,last:state.last?{...state.last}:null}),getGrid:()=>displayGrid,engineProfile:cfg.profile_id};
}
if(window.SkygateReleaseReady){window.SkygateReleaseReady.then(startSkygate).catch(error=>{document.getElementById('status').textContent=error.message;document.getElementById('playHint').textContent=error.message;document.getElementById('spin').disabled=true;});}
else startSkygate();
