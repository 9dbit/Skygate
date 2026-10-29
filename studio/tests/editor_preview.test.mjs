import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../play/release.js',import.meta.url),'utf8');
test('editor bridge accepts only its same-origin parent and installs one immutable draft',async()=>{
 const events=new Map(),sent=[],parent={postMessage:(...args)=>sent.push(args)},window={parent,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const origin='http://localhost:3000';
 vm.runInNewContext(source,{window,location:{pathname:'/studio/editor-preview/',origin}});
 assert.equal(window.SkygatePreview,true);assert.equal(sent[0][0].type,'skygate-editor-request');assert.equal(sent[0][1],origin);
 const data={type:'skygate-editor-state',project:{layers:[],math:{}},assets:{'assets/logo.png':'blob:local'}};
 const receive=events.get('message');receive({source:parent,origin:'https://other.invalid',data});receive({source:{},origin,data});receive({source:parent,origin,data:{...data,project:null}});
 assert.equal(window.SkygateActiveRelease,undefined);
 receive({source:parent,origin,data});await window.SkygateReleaseReady;
 assert.equal(window.SkygateActiveRelease.project,data.project);assert.equal(window.SKY_PREVIEW_ASSETS,data.assets);assert.equal(events.has('message'),false);
});
test('bundled Live preview uses the public release endpoint and enters preview mode',async()=>{
 let requested;const window={};
 vm.runInNewContext(source,{window,location:{pathname:'/studio/preview/',search:'?live=1'},URLSearchParams,AbortSignal,fetch:async url=>{requested=url;return {ok:true,json:async()=>null}}});
 await window.SkygateReleaseReady;assert.equal(requested,'/play/release.json');assert.equal(window.SkygatePreview,true);assert.equal(window.SkygateActiveRelease,null);
});
