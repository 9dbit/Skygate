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
  for(const file of ['play/config.js','play/engine.js'])vm.runInContext(read(file),context);
  window.SlotGameMath=context.SlotGameMath;
  if(project){
    vm.runInContext(read('play/studio_math.js'),context);window.SkygateStudioMath=context.SkygateStudioMath;
    window.SkygateActiveRelease={id:'test-snapshot',createdAt:'2026-10-28T00:00:00Z',project,overrides:{}};
    window.SkygateApplyLayout=()=>{};
  }
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
  assert.equal(first.credits,100000-20+round.winX*20);
  assert.equal(JSON.stringify(first.last.round),JSON.stringify(round));
  await ui.click('replay');
  assert.equal(ui.state().credits,first.credits);assert.equal(ui.state().rounds,1);
  await ui.click('spin');
  assert.equal(ui.state().last.round.winX,expected.playRound({trace:true}).winX);
  await ui.click('auto');
  assert.equal(ui.state().rounds,12);assert.equal(ui.state().auto,false);assert.equal(ui.state().busy,false);
});
test('interrupted animation does not lose virtual awards',async()=>{
  const ui=boot();let fail=true;const img=ui.nodes.get('reels').querySelector('.symbol');let src=img.src;
  Object.defineProperty(img,'src',{get:()=>src,set:v=>{if(fail){fail=false;throw Error('simulated renderer failure')}src=v;}});
  await ui.click('spin');
  const s=ui.state();assert.equal(s.busy,false);assert.equal(s.rounds,1);
  assert.equal(s.credits,100000-20+s.last.round.winX*20);
  await ui.click('replay');assert.equal(ui.state().credits,s.credits);
});
test('menu, rules, bet, sound and reset controls are wired',async()=>{
  const ui=boot();
  await ui.click('plus');assert.equal(ui.state().bet,25);
  await ui.click('minus');assert.equal(ui.state().bet,20);
  await ui.click('menu');assert.equal(ui.nodes.get('menuDialog').open,true);
  await ui.click('closeMenu');assert.equal(ui.nodes.get('menuDialog').open,false);
  for(const id of ['help','freeInfo','payInfo']){await ui.click(id);assert.equal(ui.nodes.get('modal').open,true);await ui.click('closeModal');}
  await ui.click('sound');assert.equal(ui.state().sound,true);assert.equal(ui.nodes.get('muteMark').hidden,true);
  await ui.click('sound');assert.equal(ui.state().sound,false);
  await ui.click('spin');await ui.click('reset');assert.equal(ui.state().credits,100000);assert.equal(ui.state().rounds,0);
  ui.nodes.get('seedInput').value='0';await ui.click('seedApply');assert.equal(ui.state().seed,20261027);
  ui.nodes.get('seedInput').value='42';await ui.click('seedApply');assert.equal(ui.state().seed,42);
});

test('seed 41 completes natural free spins and replay without a renderer error',async()=>{
  const ui=boot();ui.nodes.get('seedInput').value='41';await ui.click('seedApply');
  await ui.click('spin');const s=ui.state();assert.equal(s.last.round.bonus.triggered,true);assert.equal(s.last.round.bonus.spins.length,20);
  assert(!ui.nodes.get('status').textContent.includes('Error saat render'),ui.nodes.get('status').textContent);
  assert.equal(s.bonusRemaining,0);assert.equal(s.roundWin,s.last.round.winX*20);assert.equal(s.credits,100000-20+s.last.round.winX*20);
  await ui.click('replay');assert.equal(ui.state().credits,s.credits);assert.equal(ui.state().rounds,1);assert(!ui.nodes.get('status').textContent.includes('Error saat render'));
});
test('backgrounding cancels auto and stops sound without an automatic restart',async()=>{
  const ui=boot();await ui.click('sound');ui.document.hidden=true;ui.document.events.visibilitychange();assert.equal(ui.state().auto,false);
  ui.document.hidden=false;ui.window.events.pagehide();assert.equal(ui.state().auto,false);assert.equal(ui.state().credits,100000);
});

test('published settings drive bet, credits, bonus rules, math and virtual jackpot together',async()=>{
  const p=JSON.parse(read('studio/project.json'));p.bet=35;p.credit=50000;p.seed=41;p.math.bonus_start_spins=3;p.math.bonus_retrigger_add_spins=1;
  p.jackpot.enabled=true;p.jackpot.tiers.forEach((t,i)=>t.perMillion=i===0?1000000:0);
  const ui=boot(p);for(const name of ['ring','crown','hourglass','chalice'])assert(ui.nodes.get('reels').querySelectorAll('.symbol').some(n=>n.src.includes('symbols/'+name+'.png')),'published idle grid must retain '+name);assert.equal(ui.state().credits,50000);assert.equal(ui.state().bet,35);assert.match(ui.nodes.get('bonusRulesText').textContent,/3 free spins/);
  await ui.click('spin');const s=ui.state();assert(s.last.round.jackpot.hit);assert.equal(s.credits,50000-35+s.last.round.winX*35);assert(!ui.nodes.get('status').textContent.includes('Error saat render'));
  await ui.click('reset');assert.equal(ui.state().credits,50000);
});

test('all 10 auto rounds reuse the same reel DOM and release motion resources',async()=>{
  const ui=boot();const tiles=ui.nodes.get('reels').querySelectorAll('.tile'),created=ui.dom.created.length;
  await ui.click('auto');
  assert.deepEqual(ui.nodes.get('reels').querySelectorAll('.tile'),tiles);
  assert.equal(ui.dom.created.length,created,'no new elements while spinning');
  assert.equal(ui.dom.animations.length,0,'reduced motion skips reel animations');
  assert.equal(ui.state().rounds,10);
});
