import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../play/boot.js',import.meta.url),'utf8');
function fixture(preview=false){
  let timeout,cleared=false,reloaded=false,focused=false;
  const nodes=Object.fromEntries(['bootSplash','bootPlay','bootRetry','bootStatus','bootProgress','gameStyles','spin'].map(id=>[id,{hidden:id==='bootRetry',disabled:id==='bootPlay',sheet:{},addEventListener(k,fn){this[k]=fn},focus(){focused=true}}]));
  const game={inert:true},root={dataset:{boot:'loading'}};
  const window={SkygatePreview:preview,location:{reload(){reloaded=true}}};
  vm.runInNewContext(code,{window,document:{documentElement:root,getElementById:id=>nodes[id],querySelector:()=>game,fonts:{ready:Promise.resolve()}},Image:class{decode(){return Promise.resolve()}},setTimeout:fn=>(timeout=fn,1),clearTimeout:()=>{cleared=true},console:{error(){}}});
  return {window,nodes,game,root,expire:()=>timeout(),get cleared(){return cleared},get reloaded(){return reloaded},get focused(){return focused}};
}
test('Play cannot reveal game until decoding finishes; entry is explicit and inert is removed',async()=>{
 const f=fixture();let decode;const pending=new Promise(r=>decode=r);
 const ready=f.window.SkygateBoot.ready([{decode:()=>pending}]);
 f.nodes.bootPlay.click();assert.equal(f.root.dataset.boot,'loading');assert(f.game.inert);
 decode();await ready;assert.equal(f.root.dataset.boot,'ready');assert(!f.nodes.bootPlay.disabled);assert(f.game.inert);assert(f.cleared);
 f.nodes.bootPlay.click();assert.equal(f.root.dataset.boot,'entered');assert(f.nodes.bootSplash.hidden);assert(!f.game.inert);assert(f.focused);
});
test('failed images keep game concealed and expose a retry instead of legacy layout',async()=>{
 const f=fixture();await f.window.SkygateBoot.ready([{decode:()=>Promise.reject(Error('missing asset'))}]).catch(f.window.SkygateBoot.fail);
 assert.equal(f.root.dataset.boot,'error');assert(f.game.inert);assert(!f.nodes.bootRetry.hidden);assert(f.nodes.bootPlay.hidden);
 f.nodes.bootPlay.click();assert.equal(f.root.dataset.boot,'error');f.nodes.bootRetry.click();assert(f.reloaded);
});
test('watchdog failure cannot be reversed by late success, and CSS failure blocks entry',async()=>{
 const f=fixture();let decode;const ready=f.window.SkygateBoot.ready([{decode:()=>new Promise(r=>decode=r)}]);
 f.expire();decode();await assert.rejects(ready,/expired/);assert.equal(f.root.dataset.boot,'error');assert(f.game.inert);
 const css=fixture();css.nodes.gameStyles.sheet=null;await assert.rejects(css.window.SkygateBoot.ready([]),/stylesheet/);
});
test('Studio preview enters automatically only after successful decoding',async()=>{
 const f=fixture(true);await f.window.SkygateBoot.ready([]);assert.equal(f.root.dataset.boot,'entered');assert(!f.game.inert);assert(!f.focused);
});
