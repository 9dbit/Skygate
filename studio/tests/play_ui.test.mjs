import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
const root=resolve(import.meta.dirname,'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
function boot(){
  const nodes=new Map([...read('play/index.html').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{
    innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,open:false,events:{},attributes:{},
    classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},
    addEventListener(k,fn){this.events[k]=fn;},querySelector(){return this.small??=( {textContent:''});},
    showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){},
  }]));
  const document={hidden:false,events:{},body:{},documentElement:{},getElementById(id){assert(nodes.has(id),`Missing UI node ${id}`);return nodes.get(id);},addEventListener(k,fn){this.events[k]=fn;}};
  const window={events:{},matchMedia:()=>({matches:true}),addEventListener(k,fn){this.events[k]=fn;},SkyAudioMixer:class{unlock(){return Promise.resolve(true)}play(){return Promise.resolve(true)}stopAll(){}updateMix(){}isReady(){return true}isPlaying(){return true}}};
  const context=vm.createContext({window,document,console:{...console,error(){}},setTimeout:fn=>queueMicrotask(fn),URL,Blob});
  for(const file of ['play/config.js','play/engine.js'])vm.runInContext(read(file),context);
  window.SlotGameMath=context.SlotGameMath;
  vm.runInContext(read('play/game.js'),context);
  return {nodes,window,document,state:()=>window.SlotGameTest.getState(),click:async id=>{nodes.get(id).events.click({target:nodes.get(id)});await new Promise(setImmediate);}};
}

test('public game uses standalone illustrated sprites and all assets exist',()=>{
  const ui=boot();
  const board=ui.nodes.get('reels').innerHTML;
  assert.equal((board.match(/class="symbol"/g)||[]).length,30);
  assert.equal(new Set([...board.matchAll(/src="([^"]+)"/g)].map(m=>m[1])).size,9);
  for(const file of ['play/index.html','play/game.css', 'play/game.js']){
    const text=read(file);
    for(const match of text.matchAll(/(?:src="|href="|url\(')(assets\/[^"'`$]+?)(?:"|'|\))/g))assert(existsSync(resolve(root,'play',match[1])),match[1]);
  }
  assert(!read('play/index.html').includes('/studio/'));
});
test('spin, replay and auto settle exactly once and preserve seeded outcomes',async()=>{
  const ui=boot();
  const expected=ui.window.SlotGameMath.createEngine(ui.window.SlotGameConfig,20261027);
  await ui.click('spin');
  const first=ui.state();const round=expected.playRound({trace:true});
  assert.equal(first.rounds,1);assert.equal(first.busy,false);
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
  const ui=boot();let fail=true;let html=ui.nodes.get('reels').innerHTML;
  Object.defineProperty(ui.nodes.get('reels'),'innerHTML',{get:()=>html,set:v=>{if(fail){fail=false;throw Error('simulated renderer failure')}html=v;}});
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
