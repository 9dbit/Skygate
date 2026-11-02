import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../play/boot.js',import.meta.url),'utf8');

function fixture({preview=false,on=false,missing=false,broken=false}={}){
  let calls=0,insideGesture=false,unlockedInGesture=false;
  const game={inert:true},root={dataset:{boot:'loading'}};
  const nodes=Object.fromEntries(['bootSplash','bootPlay','bootRetry','bootStatus',
    'bootProgress','gameStyles','spin'].map(id=>[id,{
      hidden:false,disabled:id==='bootPlay',sheet:{},focus(){},
      addEventListener(kind,handler){this[kind]=handler;}
    }]));
  if(!missing)nodes.sound={disabled:false,
    getAttribute(name){assert.equal(name,'aria-pressed');return String(on);},
    click(){
      calls++;unlockedInGesture=insideGesture;
      assert.equal(game.inert,false,'game must be usable before audio activation');
      if(broken)throw Error('audio unavailable');
      on=!on;
    }
  };
  const window={SkygatePreview:preview,location:{reload(){}}};
  vm.runInNewContext(code,{window,document:{documentElement:root,
    getElementById:id=>nodes[id],querySelector:()=>game,fonts:{ready:Promise.resolve()}},
    Image:class{decode(){return Promise.resolve();}},setTimeout:()=>1,clearTimeout(){},console:{error(){}}});
  return {nodes,game,root,window,
    tap(trusted=true){insideGesture=true;nodes.bootPlay.click({isTrusted:trusted});insideGesture=false;},
    get calls(){return calls},get on(){return on},get unlockedInGesture(){return unlockedInGesture}};
}

test('PLAY activates sound in the same real gesture, only after boot is ready',async()=>{
  const f=fixture();f.tap();assert.equal(f.calls,0);assert(f.game.inert);
  await f.window.SkygateBoot.ready([]);
  assert.equal(f.calls,0,'loading alone must never start audio');
  f.tap();assert.equal(f.calls,1);assert(f.on);assert(f.unlockedInGesture);
  assert.equal(f.root.dataset.boot,'entered');
  f.tap();assert.equal(f.calls,1,'repeat entry must not toggle sound off');
});
test('already enabled audio is never toggled off by PLAY',async()=>{
  const f=fixture({on:true});await f.window.SkygateBoot.ready([]);f.tap();
  assert.equal(f.calls,0);assert(f.on);
});
test('automatic Studio entry and synthetic PLAY do not attempt autoplay',async()=>{
  const p=fixture({preview:true});await p.window.SkygateBoot.ready([]);
  assert.equal(p.root.dataset.boot,'entered');assert.equal(p.calls,0);
  const f=fixture();await f.window.SkygateBoot.ready([]);f.tap(false);
  assert.equal(f.calls,0);assert.equal(f.root.dataset.boot,'entered');
});
test('missing/failed audio does not block entry or spin focus',async()=>{
  for(const options of [{missing:true},{broken:true}]){
    const f=fixture(options);await f.window.SkygateBoot.ready([]);f.tap();
    assert.equal(f.root.dataset.boot,'entered');assert(!f.game.inert);
  }
});
test('manual sound toggle still controls mute after splash activation',async()=>{
  const f=fixture();await f.window.SkygateBoot.ready([]);f.tap();assert(f.on);
  f.nodes.sound.click();assert(!f.on);f.nodes.sound.click();assert(f.on);
});
