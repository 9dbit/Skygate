import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeDOM} from './dom-fixture.mjs';
const source=readFileSync(new URL('../../play/reels.js',import.meta.url),'utf8');
function setup(){
  const dom=makeDOM(),window={},timers=new Map();let id=0;
  vm.runInNewContext(readFileSync(new URL('../../play/cascade-art.js',import.meta.url),'utf8'),{window});
  vm.runInNewContext(source,{window,document:{createElement:t=>new dom.Node(t)},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  const root=new dom.Node(),renderer=new window.SkygateReels(root,{asset:p=>p,art:{ruby:'ruby',emerald:'emerald',orb:'orb'},label:{ruby:'Ruby',emerald:'Emerald',orb:'Orb'}});
  const before=Array.from({length:30},(_,i)=>({id:i+1,kind:i%2?'emerald':'ruby'}));renderer.render(before);
  return {...dom,renderer,root,before,timers};
}
test('six persistent strips stagger their stops, animate compositor properties and clean up',async()=>{
  const t=setup(),after=t.before.map(s=>({...s,kind:'orb',multiplier:4}));
  await t.renderer.ready;const count=t.created.length;
  const playing=t.renderer.spin(after);await Promise.resolve();
  assert.equal(t.root.classList.contains('rolling'),true);
  assert.deepEqual([...t.timers.values()].map(t=>t.ms),[660,740,820,900,980,1060]);
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
  assert.deepEqual([...t.timers.values()].map(t=>t.ms),[180,204,228,252,276,300]);
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
  assert(t.animations.every(a=>a.options.duration===750),'normal charge stays visible before burst');
  assert(t.renderer.cells.every(c=>!c.fx.spiral),'no lightning texture around the artwork');
  const edges=t.animations.filter(a=>selected.some(i=>t.renderer.cells[i].fx.edge===a.node));
  assert(edges.every(a=>a.frames.every(f=>!('transform' in f))),'lightning stays fixed on cell borders');
  const vibrations=t.animations.filter(a=>selected.some(i=>t.renderer.cells[i].motion===a.node));
  assert.equal(vibrations.length,selected.length);
  assert(vibrations.every(a=>a.frames.some(f=>f.transform.includes('-1.5px'))));
  await playing;
  assert.equal(t.animations.length,selected.length*5);
  assert.equal(t.created.length,created);
  assert.equal(t.root.dataset.fxPhase,'idle');
  assert.equal(t.renderer.animations.size,0);
  assert(t.animations.every(a=>a.cancelled));
  for(const a of t.animations){
    assert(selected.some(i=>Object.values(t.renderer.cells[i].fx).includes(a.node)||t.renderer.cells[i].motion===a.node));
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
  assert.equal(t.animations.length,150);
  assert.equal(t.created.length,created);
  assert(t.animations.slice(0,60).every(a=>a.options.duration===220));
  assert(t.animations.slice(60).every(a=>a.options.duration===280));
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
