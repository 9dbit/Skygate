import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeDOM} from './dom-fixture.mjs';
const source=readFileSync(new URL('../../play/reels.js',import.meta.url),'utf8');
function setup(motion=null){
  const dom=makeDOM(),window={},timers=new Map();let id=0;
  vm.runInNewContext(readFileSync(new URL('../../play/cascade-art.js',import.meta.url),'utf8'),{window});
  vm.runInNewContext(source,{window,document:{createElement:t=>new dom.Node(t)},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  const root=new dom.Node(),renderer=new window.SkygateReels(root,{asset:p=>p,art:{ruby:'ruby',emerald:'emerald',orb:'orb'},label:{ruby:'Ruby',emerald:'Emerald',orb:'Orb'},motion});
  const before=Array.from({length:30},(_,i)=>({id:i+1,kind:i%2?'emerald':'ruby'}));renderer.render(before);
  return {...dom,window,renderer,root,before,timers};
}
test('six persistent strips stagger their stops, animate compositor properties and clean up',async()=>{
  const t=setup(),after=t.before.map(s=>({...s,kind:'orb',multiplier:4}));
  await t.renderer.ready;const count=t.created.length;
  const playing=t.renderer.spin(after);await Promise.resolve();
  assert.equal(t.root.classList.contains('rolling'),true);
  const timing=t.window.SkygateSpinTiming('normal');
  assert.deepEqual(t.animations.map(a=>a.options.delay),Array.from({length:6},(_,i)=>i*timing.staggerMs));
  assert(t.animations.every(a=>a.options.duration===timing.rollMs&&a.options.iterations===2));
  assert(Math.abs(timing.rollMs*2+timing.staggerMs*5+timing.settleMs-1800)<=6);
  assert.equal(t.animations.length,6);
  for(const timer of [...t.timers.values()])timer.fn();
  await playing;
  assert.equal(t.animations.length,12);
  for(const a of t.animations){assert(a.cancelled);for(const frame of a.frames)assert(Object.keys(frame).every(k=>['transform','opacity','offset'].includes(k)));}
  assert.equal(t.created.length,count);
  assert.equal(t.renderer.animations.size,0);assert.equal(t.renderer.waiters.size,0);
  assert.equal(t.root.classList.contains('rolling'),false);
  assert(t.renderer.cells.every(c=>c.multiplier.textContent==='4×'&&!c.multiplier.hidden));
});
test('background cancellation releases pending stops and displays the selected result',async()=>{
  const t=setup(),after=t.before.map(s=>({...s,kind:'emerald'}));await t.renderer.ready;
  const playing=t.renderer.spin(after);await Promise.resolve();t.renderer.cancel();await playing;
  assert.equal(t.timers.size,0);assert.equal(t.renderer.animations.size,0);
  assert(t.renderer.cells.every(c=>c.kind==='emerald'));
  assert(t.animations.every(a=>a.cancelled));
});
test('cascades move surviving symbols from their previous row and retain orb labels',async()=>{
  const t=setup(),after=t.before.map(s=>({...s}));
  after[6]=t.before[0];after[0]={id:31,kind:'orb',multiplier:50};
  const playing=t.renderer.cascade(t.before,after);await playing;
  assert.equal(t.animations.length,2);
  assert.equal(t.animations[0].frames[0].transform,'translate3d(0,-100%,0)');
  assert.equal(t.animations[1].frames[0].transform,'translate3d(0,-100%,0)');
  assert.equal(t.renderer.cells[0].multiplier.textContent,'50×');
  assert(t.animations.every(a=>a.cancelled));
});
test('turbo shortens presentation without changing the grid; reduced motion creates no animations',async()=>{
  const t=setup();await t.renderer.ready;const playing=t.renderer.spin(t.before,{turbo:true});await Promise.resolve();
  const timing=t.window.SkygateSpinTiming('turbo');
  assert.deepEqual(t.animations.map(a=>a.options.delay),Array.from({length:6},(_,i)=>i*timing.staggerMs));
  assert(t.animations.every(a=>a.options.duration===timing.rollMs&&a.options.iterations===1));
  for(const timer of [...t.timers.values()])timer.fn();await playing;
  const count=t.animations.length;await t.renderer.spin(t.before,{reduced:true});await t.renderer.cascade(t.before,t.before,{reduced:true});
  assert.equal(t.animations.length,count);assert.equal(t.renderer.grid,t.before);
});

test('only winning cells charge before bursting and all effect nodes are reused',async()=>{
  const t=setup(),selected=[0,2,5,7,12,18,23,29],created=t.created.length;
  const playing=t.renderer.shatter(selected);
  assert.equal(t.root.dataset.fxPhase,'charge');
  assert.equal(t.animations.length,selected.length*2);
  assert(t.animations.every(a=>selected.some(i=>t.renderer.cells[i].fx.edge===a.node||t.renderer.cells[i].motion===a.node)));
  assert.equal(t.renderer.grid,t.before,'symbols remain until the charge completes');
  assert(t.animations.every(a=>a.options.duration===1250),'normal charge stays visible before burst');
  assert(t.renderer.cells.every(c=>!c.fx.spiral),'no lightning texture around the artwork');
  const edges=t.animations.filter(a=>selected.some(i=>t.renderer.cells[i].fx.edge===a.node));
  assert(edges.every(a=>a.frames.every(f=>!('transform' in f))),'lightning stays fixed on cell borders');
  const vibrations=t.animations.filter(a=>selected.some(i=>t.renderer.cells[i].motion===a.node));
  assert.equal(vibrations.length,selected.length);
  assert(vibrations.every(a=>a.frames.some(f=>f.transform.includes('-1.5px'))));
  await playing;
  assert.equal(t.animations.length,selected.length*26);
  assert.equal(t.created.length,created);
  assert.equal(t.root.dataset.fxPhase,'idle');
  assert.equal(t.renderer.animations.size,0);
  assert(t.animations.every(a=>a.cancelled));
  for(const a of t.animations){
    assert(selected.some(i=>Object.values(t.renderer.cells[i].fx).includes(a.node)||t.renderer.cells[i].motion===a.node)||t.renderer.sparks.includes(a.node)||t.renderer.flares.includes(a.node));
    for(const frame of a.frames)assert(Object.keys(frame).every(k=>['transform','opacity','offset'].includes(k)));
  }
});
test('cancel during lightning prevents the burst; reduced motion skips both phases',async()=>{
  const t=setup();const playing=t.renderer.shatter([0,1,2]);
  t.renderer.cancel();await playing;
  assert.equal(t.animations.length,6);assert.equal(t.root.dataset.fxPhase,'idle');
  assert.equal(t.renderer.animations.size,0);
  await t.renderer.shatter([0,1,2],{reduced:true});
  assert.equal(t.animations.length,6);
});
test('one full-board win has a bounded effect pool and turbo retains both phases',async()=>{
  const t=setup(),all=Array.from({length:30},(_,i)=>i),created=t.created.length;
  assert.equal(t.root.querySelectorAll('.cascade-fx').length,60);
  await t.renderer.shatter(all,{turbo:true});
  assert.equal(t.animations.length,420);
  assert.equal(t.created.length,created);
  assert(t.animations.slice(0,60).every(a=>a.options.duration===400));
  assert(t.animations.slice(60).every(a=>a.options.duration===500));
});

test('text fitting keeps long amounts and caption stacks inside the same bounds at phone widths',()=>{
  const window={};vm.runInNewContext(readFileSync(new URL('../../play/text-fit.js',import.meta.url),'utf8'),{window});
  for(const stage of [320,375,390,430,600])for(const [w,h,naturalW,naturalH] of [[620,62,980,70],[460,70,510,79],[33,52,33,70]]){
    const content={offsetWidth:naturalW*stage/1080,offsetHeight:naturalH*stage/1080,style:{}};
    const box={clientWidth:w*stage/1080,clientHeight:h*stage/1080,querySelector:()=>content};
    window.SkygateTextFit.fit({querySelectorAll:()=>[box]});
    const scale=Number(content.style.transform.match(/[\d.]+/)[0]);
    assert(content.offsetWidth*scale<=box.clientWidth+.02);
    assert(content.offsetHeight*scale<=box.clientHeight+.02);
  }
});

test('fireworks pool emits only selected-cell sparks and releases them on cancel',async()=>{
 const t=setup();assert.equal(t.renderer.sparks.length,240);
 const active=t.renderer.shatter([0,29]);
 for(let i=0;i<12&&t.root.dataset.fxPhase!=='burst';i++)await Promise.resolve();
 assert.equal(t.root.dataset.fxPhase,'burst');
 const sparks=t.animations.filter(a=>t.renderer.sparks.includes(a.node)||t.renderer.flares.includes(a.node));assert.equal(sparks.length,42);
 assert(sparks.every(a=>a.frames.at(-1).opacity===0));assert(Math.abs(parseFloat(t.renderer.sparks[0].style.left)-100/12)<1e-9);
 t.renderer.cancel();await active;assert.equal(t.renderer.animations.size,0);assert(sparks.every(a=>a.cancelled));
});

test('reel stop introduces results offscreen and preserves the visible bank at each handoff',async()=>{
 const t=setup();await t.renderer.ready;const pending=[],original=t.Node.prototype.animate;
 t.Node.prototype.animate=function(frames,options){const a=original.call(this,frames,options);let resolve;a.finished=new Promise(r=>resolve=r);const cancel=a.cancel.bind(a);a.cancel=()=>{cancel();resolve();};pending.push({a,resolve});return a;};
 const after=t.before.map(s=>({...s,kind:'orb',multiplier:7})),playing=t.renderer.spin(after);await Promise.resolve();
 const first=t.renderer.columns[0];assert(first.cells.every(c=>c.kind==='ruby'));
 pending[0].resolve();for(let i=0;i<12&&pending.length===6;i++)await Promise.resolve();
 assert.equal(pending.length,7);assert(first.cells.slice(0,5).every(c=>c.kind==='orb'));assert(first.cells.slice(5).every(c=>c.kind==='ruby'),'visible bank stays intact while the result enters');
 assert.equal(pending[6].a.frames[0].transform,pending[0].a.frames[0].transform);assert.equal(pending[6].a.frames.at(-1).transform,'translate3d(0,0,0)');
 pending[6].resolve();for(let i=0;i<5;i++)await Promise.resolve();assert(first.cells.every(c=>c.kind==='orb'),'both banks match before filled transform is released');assert(pending[6].a.cancelled);
 t.renderer.cancel();await playing;assert.equal(t.renderer.animations.size,0);
});

test('Studio duration override changes only reel timeline while preserving a fixed result',async()=>{
  const motion={normalMs:2200,quickMs:1300,turboMs:600};
  const t=setup(motion),after=t.before.map(x=>({...x,kind:'emerald'}));
  const plan=t.window.SkygateSpinTiming('normal',motion);
  const total=plan.rollMs*plan.iterations+5*plan.staggerMs+plan.settleMs;
  assert(Math.abs(total-motion.normalMs)<6);
  const play=t.renderer.spin(after);await Promise.resolve();
  assert(t.animations.every(a=>a.options.duration===plan.rollMs));
  for(const tick of [...t.timers.values()])tick.fn();
  await play;
  assert(t.renderer.cells.every(c=>c.kind==='emerald'));
  assert(t.animations.every(a=>a.cancelled));
  assert.equal(t.renderer.animations.size,0);
  assert(t.window.SkygateSpinTiming('normal').rollMs<t.window.SkygateSpinTiming('normal',motion).rollMs);
  assert(t.window.SkygateSpinTiming('normal',{normalMs:'not a number'}).rollMs===t.window.SkygateSpinTiming('normal').rollMs);
});
