import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { makeDOM } from './dom-fixture.mjs';
const root=resolve(import.meta.dirname,'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
function boot(project=null){
  const dom=makeDOM();
  const nodes=new Map([...read('play/index.html').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new dom.Node()]));
  const document={hidden:false,events:{},body:{},documentElement:{},createElement:tag=>new dom.Node(tag),getElementById(id){assert(nodes.has(id),`Missing UI node ${id}`);return nodes.get(id);},addEventListener(k,fn){this.events[k]=fn;}};
  const window={events:{},matchMedia:()=>({matches:true}),addEventListener(k,fn){this.events[k]=fn;},SkyAudioMixer:class{unlock(){return Promise.resolve(true)}play(){return Promise.resolve(true)}stopAll(){}updateMix(){}isReady(){return true}isPlaying(){return true}}};
  const context=vm.createContext({window,document,console:{...console,error(){}},setTimeout:fn=>queueMicrotask(fn),clearTimeout:()=>{},URL,Blob});
  for(const file of ['play/settings-model.js','play/config.js','play/engine.js'])vm.runInContext(read(file),context);
  window.SlotGameMath=context.SlotGameMath;window.SkygateSettings=context.SkygateSettings;
  if(project){
    vm.runInContext(read('play/studio_math.js'),context);window.SkygateStudioMath=context.SkygateStudioMath;
    window.SkygateActiveRelease={id:'test-snapshot',createdAt:'2026-10-28T00:00:00Z',project,overrides:{}};
    window.SkygateApplyLayout=()=>{};
  }
  vm.runInContext(read('play/cascade-art.js'),context);
  vm.runInContext(read('play/reels.js'),context);
  vm.runInContext(read('play/game.js'),context);
  return {nodes,window,document,dom,state:()=>window.SlotGameTest.getState(),click:async id=>{nodes.get(id).events.click({target:nodes.get(id)});await new Promise(setImmediate);}};
}

test('public game uses standalone illustrated sprites and all assets exist',()=>{
  const ui=boot();
  const board=ui.nodes.get('reels');
  assert.equal(board.querySelectorAll('.tile').filter(n=>n.attributes['aria-hidden']!=='true').length,30);
  assert.equal(new Set(board.querySelectorAll('.symbol').map(n=>n.src)).size,9);
  for(const file of ['play/index.html','play/game.css', 'play/game.js']){
    const text=read(file);
    for(const match of text.matchAll(/(?:src="|href="|url\(')(assets\/[^"'`$]+?)(?:"|'|\))/g))assert(existsSync(resolve(root,'play',match[1].split('?')[0])),match[1]);
  }
  assert(!read('play/index.html').includes('/studio/'));
});
test('spin, replay and auto settle exactly once and preserve seeded outcomes',async()=>{
  const ui=boot();
  const expected=ui.window.SlotGameMath.createEngine(ui.window.SlotGameConfig,20261027);
  await ui.click('spin');
  const first=ui.state();const round=expected.playRound({trace:true});
  assert.equal(first.rounds,1);assert.equal(first.busy,false);assert(!ui.nodes.get('status').textContent.includes('Error saat render'));
  assert.equal(first.credits,Math.round((100000-2+round.winX*2)*100)/100);
  assert.equal(JSON.stringify(first.last.round),JSON.stringify(round));
  await ui.click('replay');
  assert.equal(ui.state().credits,first.credits);assert.equal(ui.state().rounds,1);
  await ui.click('spin');
  assert.equal(ui.state().last.round.winX,expected.playRound({trace:true}).winX);
  await ui.click('auto');ui.nodes.get('autoCount').value='0';ui.nodes.get('autoCount').events.input();await ui.click('autoStart');
  assert.equal(ui.state().rounds,12);assert.equal(ui.state().auto,false);assert.equal(ui.state().busy,false);
});
test('interrupted animation does not lose virtual awards',async()=>{
  const ui=boot();let fail=true;const img=ui.nodes.get('reels').querySelector('.symbol');let src=img.src;
  Object.defineProperty(img,'src',{get:()=>src,set:v=>{if(fail){fail=false;throw Error('simulated renderer failure')}src=v;}});
  await ui.click('spin');
  const s=ui.state();assert.equal(s.busy,false);assert.equal(s.rounds,1);
  assert.equal(s.credits,Math.round((100000-2+s.last.round.winX*2)*100)/100);
  await ui.click('replay');assert.equal(ui.state().credits,s.credits);
});
test('menu, rules, bet, sound and reset controls are wired',async()=>{
  const ui=boot();
  await ui.click('plus');assert.equal(ui.state().bet,2.4);
  await ui.click('minus');assert.equal(ui.state().bet,2);
  await ui.click('menu');assert.equal(ui.nodes.get('menuDialog').open,true);
  await ui.click('closeMenu');assert.equal(ui.nodes.get('menuDialog').open,false);
  for(const id of ['help','payInfo']){await ui.click(id);assert.equal(ui.nodes.get('modal').open,true);await ui.click('closeModal');}
  await ui.click('sound');assert.equal(ui.state().sound,true);assert.equal(ui.nodes.get('muteMark').hidden,true);
  await ui.click('sound');assert.equal(ui.state().sound,false);
  await ui.click('spin');await ui.click('reset');assert.equal(ui.state().credits,100000);assert.equal(ui.state().rounds,0);
  ui.nodes.get('seedInput').value='0';await ui.click('seedApply');assert.equal(ui.state().seed,20261027);
  ui.nodes.get('seedInput').value='42';await ui.click('seedApply');assert.equal(ui.state().seed,42);
});

test('seed 41 completes natural free spins and replay without a renderer error',async()=>{
  const ui=boot();const giftTitles=[];let title='';Object.defineProperty(ui.nodes.get('toastTitle'),'textContent',{get:()=>title,set:v=>{title=v;giftTitles.push(v);}});ui.nodes.get('seedInput').value='41';await ui.click('seedApply');
  await ui.click('spin');const s=ui.state();assert.equal(s.last.round.bonus.triggered,true);assert.equal(s.last.round.bonus.spins.length,15);
  assert(!ui.nodes.get('status').textContent.includes('Error saat render'),ui.nodes.get('status').textContent);
  assert(giftTitles.includes('HADIAH FREE SPINS'));assert(!ui.nodes.has('freeInfo'));assert(!ui.nodes.has('banner'));
  assert.equal(s.bonusRemaining,0);assert.equal(s.roundWin,s.last.round.winX*2);assert.equal(s.credits,Math.round((100000-2+s.last.round.winX*2)*100)/100);
  await ui.click('replay');assert.equal(ui.state().credits,s.credits);assert.equal(ui.state().rounds,1);assert(!ui.nodes.get('status').textContent.includes('Error saat render'));
});
test('backgrounding cancels auto and stops sound without an automatic restart',async()=>{
  const ui=boot();await ui.click('sound');ui.document.hidden=true;ui.document.events.visibilitychange();assert.equal(ui.state().auto,false);
  ui.document.hidden=false;ui.window.events.pagehide();assert.equal(ui.state().auto,false);assert.equal(ui.state().credits,100000);
});

test('published settings drive bet, credits, bonus rules, math and virtual jackpot together',async()=>{
  const p=JSON.parse(read('studio/project.json'));p.bet=40;p.credit=50000;p.seed=41;p.math.bonus_start_spins=3;p.math.bonus_retrigger_add_spins=1;
  p.jackpot.enabled=true;p.jackpot.tiers.forEach((t,i)=>t.perMillion=i===0?1000000:0);
  const ui=boot(p);for(const name of ['ring','crown','hourglass','chalice'])assert(ui.nodes.get('reels').querySelectorAll('.symbol').some(n=>n.src.includes('symbols/'+name+'.png')),'published idle grid must retain '+name);assert.equal(ui.state().credits,50000);assert.equal(ui.state().bet,40);assert.match(ui.nodes.get('bonusRulesText').textContent,/3 free spins/);
  await ui.click('spin');const s=ui.state();assert(s.last.round.jackpot.hit);assert.equal(s.credits,Math.round((50000-40+s.last.round.winX*40)*100)/100);assert(!ui.nodes.get('status').textContent.includes('Error saat render'));
  await ui.click('reset');assert.equal(ui.state().credits,50000);
});

test('all 10 auto rounds reuse the same reel DOM and release motion resources',async()=>{
  const ui=boot();const tiles=ui.nodes.get('reels').querySelectorAll('.tile'),created=ui.dom.created.length;
  await ui.click('auto');ui.nodes.get('autoCount').value='0';ui.nodes.get('autoCount').events.input();await ui.click('autoStart');
  assert.deepEqual(ui.nodes.get('reels').querySelectorAll('.tile'),tiles);
  assert.equal(ui.dom.created.length,created,'no new elements while spinning');
  assert.equal(ui.dom.animations.length,0,'reduced motion skips reel animations');
  assert.equal(ui.state().rounds,10);
});

test('autoplay opens settings before starting and honors selected count and exclusive speed',async()=>{
 const ui=boot();await ui.click('auto');assert(ui.nodes.get('autoDialog').open);assert.equal(ui.state().rounds,0);
 ui.nodes.get('autoQuick').checked=true;ui.nodes.get('autoQuick').events.change();assert.equal(ui.state().speed,'quick');assert(!ui.nodes.get('autoTurbo').checked);
 ui.nodes.get('autoTurbo').checked=true;ui.nodes.get('autoTurbo').events.change();assert.equal(ui.state().speed,'turbo');assert(!ui.nodes.get('autoQuick').checked);
 ui.nodes.get('autoCount').value='1';ui.nodes.get('autoCount').events.input();await ui.click('autoStart');assert.equal(ui.state().rounds,20);assert.equal(ui.state().history.length,20);
});
test('buy confirmation, cancel, ante lockout and 100x debit are functional',async()=>{
 const ui=boot();await ui.click('buyFeature');assert(ui.nodes.get('buyDialog').open);await ui.click('cancelBuy');assert.equal(ui.state().credits,100000);assert.equal(ui.state().rounds,0);
 await ui.click('anteFeature');assert(ui.state().ante);assert(ui.nodes.get('buyFeature').disabled);await ui.click('confirmBuy');assert.equal(ui.state().rounds,0);
 await ui.click('anteFeature');await ui.click('buyFeature');await ui.click('confirmBuy');const s=ui.state();assert.equal(s.rounds,1);assert.equal(s.last.cost,200);assert.equal(s.last.round.bonus.triggered,true);assert.equal(s.credits,Math.round((100000-200+s.last.round.winX*2)*100)/100);assert.equal(s.history.length,1);
});
test('all three speeds retain identical seed outcome; display mode and battery never change bet',async()=>{
 const ui=boot();await ui.click('spin');const result=JSON.stringify(ui.state().last.round);const credit=ui.state().credits;
 for(const speed of ['quick','turbo','normal']){await ui.click('turbo');assert.equal(ui.state().speed,speed);await ui.click('reset');await ui.click('spin');assert.equal(JSON.stringify(ui.state().last.round),result);assert.equal(ui.state().credits,credit);}
 await ui.click('credits');assert.match(ui.nodes.get('credits').textContent,/COINS/);assert.equal(ui.state().bet,2);
 ui.nodes.get('batterySetting').checked=true;ui.nodes.get('batterySetting').events.change();assert(ui.nodes.get('spin').classList.contains('battery-saver'));assert.equal(ui.state().bet,2);
});

test('credit is debited at start and award settled once only after presentation',async()=>{
 const ui=boot();let release;const gate=new Promise(r=>release=r);const proto=ui.window.SkygateReels.prototype,original=proto.spin;proto.spin=async function(...args){await gate;return original.apply(this,args);};
 ui.nodes.get('seedInput').value='41';await ui.click('seedApply');await ui.click('spin');assert.equal(ui.state().busy,true);assert.equal(ui.state().credits,99998);assert.equal(ui.state().paid,0);
 release();await new Promise(setImmediate);assert.equal(ui.state().busy,false);assert.equal(ui.state().credits,Math.round((99998+ui.state().last.round.winX*2)*100)/100);assert.equal(ui.state().history.length,1);
});
test('rules show actual current bet payouts and update with coin view',async()=>{
 const ui=boot();assert.match(ui.nodes.get('paytable').innerHTML,/>100.00</);await ui.click('plus');assert.match(ui.nodes.get('paytable').innerHTML,/>120.00</);await ui.click('credits');assert.match(ui.nodes.get('paytable').innerHTML,/COINS/);
});

test('manual bonus screens wait for Continue and settle only after the final screen',async()=>{
 const ui=boot();await ui.click('featureContinue');
 ui.nodes.get('autoSkip').checked=false;ui.nodes.get('autoSkip').events.change();
 await ui.click('buyFeature');await ui.click('confirmBuy');
 assert.equal(ui.nodes.get('featureTitle').textContent,'HADIAH FREE SPINS');
 assert(ui.nodes.get('featureDialog').open);assert(ui.state().busy);
 assert.equal(ui.state().credits,99800);assert.equal(ui.state().paid,0);
 await ui.click('featureContinue');
 assert.equal(ui.nodes.get('featureTitle').textContent,'FREE SPINS SELESAI');
 assert(ui.nodes.get('featureDialog').open);assert(ui.state().busy);
 assert.equal(ui.state().credits,99800);assert.equal(ui.state().history.length,0);
 const award=ui.window.SkygateSettings.money(ui.state().last.round.winX*2);
 await ui.click('featureContinue');
 assert(!ui.state().busy);assert(!ui.nodes.get('featureDialog').open);
 assert.equal(ui.state().credits,ui.window.SkygateSettings.money(99800+award));
 assert.equal(ui.state().paid,award);assert.equal(ui.state().history.length,1);
 await ui.click('featureContinue');assert.equal(ui.state().history.length,1);
});

test('background interruption releases a manual bonus screen and settles the complete result once',async()=>{
 for(const event of ['visibilitychange','pagehide']){
  const ui=boot();await ui.click('featureContinue');
  ui.nodes.get('autoSkip').checked=false;ui.nodes.get('autoSkip').events.change();
  await ui.click('buyFeature');await ui.click('confirmBuy');
  assert(ui.nodes.get('featureDialog').open);assert(ui.state().busy);
  const award=ui.window.SkygateSettings.money(ui.state().last.round.winX*2);
  if(event==='visibilitychange'){
   ui.document.hidden=true;ui.document.events.visibilitychange();
   ui.document.hidden=false;ui.document.events.visibilitychange();
  }else{ui.window.events.pagehide();ui.window.events.pageshow?.();}
  await new Promise(setImmediate);
  assert(!ui.state().busy,event);assert(!ui.nodes.get('featureDialog').open,event);
  assert.equal(ui.state().credits,ui.window.SkygateSettings.money(99800+award),event);
  assert.equal(ui.state().paid,award,event);assert.equal(ui.state().history.length,1,event);
  assert.equal(ui.state().bonusRemaining,0,event);
  await ui.click('home');assert(ui.nodes.get('featureDialog').open,event);
  await ui.click('featureContinue');assert.equal(ui.state().history.length,1,event);
 }
});

test('returning from background restores Home without starting audio or a round',async()=>{
 for(const lifecycle of ['visibility','pageshow']){
  const ui=boot();await ui.click('featureContinue');await ui.click('sound');
  let plays=0;ui.window.SkyAudioMixer.prototype.play=()=>{plays++;return Promise.resolve(true);};
  if(lifecycle==='visibility'){
   ui.document.hidden=true;ui.document.events.visibilitychange();
   ui.document.hidden=false;ui.document.events.visibilitychange();
  }else{ui.window.events.pagehide();ui.window.events.pageshow?.();}
  assert.equal(plays,0,lifecycle);assert.equal(ui.state().rounds,0,lifecycle);
  await ui.click('home');
  assert(ui.nodes.get('featureDialog').open,'Home must reopen after '+lifecycle);
  assert.equal(ui.nodes.get('featureTitle').textContent,'SKYGATE 5000');
  await ui.click('featureContinue');
  assert.equal(plays,0,lifecycle);assert.equal(ui.state().credits,100000,lifecycle);
 }
});

test('Bonus Booster label and accessible description agree with the unchanged +25% stake',async()=>{
  assert.match(read('play/index.html'),/Bonus Booster <b id="antePrice">/);
  assert.match(read('play/index.html'),/BONUS BOOSTER & BUY SPIN/);
  const ui=boot();
  await ui.click('anteFeature');
  assert.equal(ui.state().ante,true);
  assert.equal(ui.state().bet,2);
  assert.equal(ui.nodes.get('antePrice').textContent,'2.50');
  assert.match(ui.nodes.get('anteFeature').attributes['aria-label'],/Bonus Booster aktif/);
  assert(ui.nodes.get('buyFeature').disabled);
  assert.match(ui.nodes.get('anteRulesNote').textContent,/Bonus Booster/);
});

test('real high-resolution Zeus touch icon PNGs are installed for Safari, Android and PWA',()=>{
  const variants=[['48',48],['180',180],['192',192],['512',512],['maskable-512',512]];
  for(const [name,size] of variants){
    const filename=`skygate-touch-${name}-v0139.png`;
    const bytes=readFileSync(resolve(root,'play/icons',filename));
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],filename);
    assert.equal(bytes.readUInt32BE(16),size,filename+' width');
    assert.equal(bytes.readUInt32BE(20),size,filename+' height');
    assert(bytes.length>5000,'Unexpected placeholder image '+filename);
  }
  for(const path of ['apple-touch-icon.png','play/apple-touch-icon.png','studio/apple-touch-icon.png']){
    const bytes=readFileSync(resolve(root,path));
    assert.equal(bytes.readUInt32BE(16),180,path);
    assert.equal(bytes.readUInt32BE(20),180,path);
  }
  const game=read('play/index.html'),studio=read('studio/index.html');
  assert.match(game,/rel="apple-touch-icon" sizes="180x180" href="icons\/skygate-touch-180-v0139.png"/);
  const version=JSON.parse(read('package.json')).version;
  assert(game.includes(`rel="manifest" href="manifest.webmanifest?v=${version}"`));
  assert.match(studio,/rel="apple-touch-icon" sizes="180x180" href="\/play\/icons\/skygate-touch-180-v0139.png"/);
  assert(studio.includes(`rel="manifest" href="/studio/manifest.webmanifest?v=${version}"`));
  const gameManifest=JSON.parse(read('play/manifest.webmanifest'));
  assert.equal(gameManifest.id,'/play/');
  assert.equal(gameManifest.start_url,'/play/');
  assert(gameManifest.icons.some(icon=>icon.sizes==='192x192'&&icon.src.includes('192-v0139')));
  assert(gameManifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='any'));
  assert(gameManifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
  const studioManifest=JSON.parse(read('studio/manifest.webmanifest'));
  assert.equal(studioManifest.id,'/studio/');
  assert.equal(studioManifest.start_url,'/studio/');
  assert(studioManifest.icons.some(icon=>icon.sizes==='192x192'));
  assert(studioManifest.icons.some(icon=>icon.sizes==='512x512'));
});


test('Skygate splash PLAY is a true luminous SVG, not a Unicode play emoji',()=>{
  const html=read('play/index.html');
  const css=read('play/game.css');
  assert.match(html,/<button id="bootPlay"[^>]*><span class="splash-play-icon" aria-hidden="true"><svg/);
  assert.match(html,/<span class="splash-play-label">PLAY<\/span>/);
  assert(!html.includes('<span aria-hidden="true">▶</span> PLAY'));
  assert(css.includes('skygate-play-emissive'));
  assert(css.includes('.splash-play .splash-play-icon svg'));
  assert(css.includes('@media(prefers-reduced-motion:reduce)'));
});
