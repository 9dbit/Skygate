import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../publish.js',import.meta.url),'utf8');
const live='b3cc22d5-1111-4222-8333-444444444444';
const staged='a1b2c3d4-1111-4222-8333-444444444444';
async function settle(){for(let n=0;n<160;n++)await Promise.resolve();}

function fixture(){
  class Node{
    constructor(id){this.id=id;this.disabled=false;this.hidden=id==='releaseFrame';this.src='about:blank';this.open=false;this.textContent='';this.children=[];this.listeners={};this.contentDocument={querySelector:()=>({})};}
    showModal(){this.open=true;}
    close(){this.open=false;}
    addEventListener(type,cb){this.listeners[type]=cb;}
    append(...children){this.children.push(...children);}
    replaceChildren(){this.children=[];}
    send(type,details={}){return this.listeners[type]?.(details);}
  }
  const ids=['releaseBtn','releaseDialog','releaseStatus','prepareRelease','publishRelease','rollbackRelease','loadRelease','closeRelease','releaseFrame','previewLabel','liveRelease','releaseHistory'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const requests=[],posted=[],callbacks={},timers=new Map();
  let nextTimer=0,active=live,events=0;
  nodes.releaseFrame.contentWindow={postMessage:(msg,origin)=>posted.push({msg,origin})};
  const document={getElementById:id=>nodes[id],createElement:tag=>new Node(tag)};
  const inventory=()=>({active,previous:null,available:true,csrf:'test-csrf',revisions:[{id:active,name:'SKYGATE',published:true,createdAt:'2026-10-29T16:00:00Z'}]});
  async function fetch(path,opts={}){
    requests.push({path,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null});
    let data,code=200;
    if(path==='/studio/api/releases'&&(!opts.method||opts.method==='GET'))data=inventory();
    else if(path==='/studio/api/releases'&&opts.method==='POST'){data={id:staged};code=201;}
    else if(path==='/studio/api/publish'&&opts.method==='POST'){active=JSON.parse(opts.body).id;data=inventory();}
    else throw Error('Unexpected fake request '+path);
    return {ok:true,status:code,json:async()=>data};
  }
  const window={
    SKYGATE_STUDIO:{ready:Promise.resolve(),getPreviewData:()=>({project:{schema:'skygate/studio-v0.3'},assets:{}}),getPublishBundle:async()=>({project:{schema:'skygate/studio-v0.3'},overrides:[]})},
    addEventListener:(type,cb)=>{callbacks[type]=cb;},dispatchEvent:()=>{events++;},
  };
  const context={document,window,fetch,location:{origin:'https://sky.example'},URL,Image:class{},FileReader:class{},console,
    Event:class{constructor(type){this.type=type;}},setTimeout:(fn)=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(code,context);
  return {nodes,requests,posted,timers,events:()=>events,
    receive:(data,source=nodes.releaseFrame.contentWindow)=>callbacks.message({origin:'https://sky.example',source,data}),
    expire:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}}};
}

test('opening Publish immediately shows playable Draft, does not stage a snapshot',async()=>{
  const f=fixture();f.nodes.releaseBtn.onclick();
  assert.equal(f.nodes.releaseDialog.open,true);
  assert.equal(f.nodes.releaseFrame.hidden,false);
  assert.match(f.nodes.releaseFrame.src,/^\/studio\/editor-preview\/\?publish-draft=/);
  await settle();
  assert.equal(f.nodes.liveRelease.textContent,'Live: '+live.slice(0,8));
  assert.equal(f.requests.filter(x=>x.method==='POST').length,0,'Opening is read-only');
  f.receive({type:'skygate-editor-request'});await settle();
  assert.equal(f.posted.length,1);
  assert.equal(f.posted[0].msg.type,'skygate-editor-state');
  assert.equal(f.posted[0].msg.project.schema,'skygate/studio-v0.3');
  f.receive({type:'skygate-preview-ready',id:'editor-draft'});
  assert.match(f.nodes.releaseStatus.textContent,/Draft siap/);
  assert.equal(f.nodes.publishRelease.disabled,true,'Draft alone is not publishable');
  f.nodes.closeRelease.onclick();
  assert.equal(f.nodes.releaseFrame.src,'about:blank');
  assert.equal(f.nodes.releaseFrame.hidden,true);
  assert.equal(f.nodes.releaseDialog.open,false);
});

test('prepare explicitly stages snapshot, validates preview READY, then enables Publish',async()=>{
  const f=fixture();f.nodes.releaseBtn.onclick();await settle();
  f.nodes.prepareRelease.onclick();await settle();
  assert.equal(f.requests.filter(x=>x.path==='/studio/api/releases'&&x.method==='POST').length,1);
  assert.equal(f.nodes.releaseFrame.src,'/studio/preview/?revision='+staged);
  assert.equal(f.nodes.publishRelease.disabled,true);
  f.receive({type:'skygate-preview-ready',id:'editor-draft'});
  assert.equal(f.nodes.publishRelease.disabled,true,'Stale draft reply cannot publish snapshot');
  f.receive({type:'skygate-preview-ready',id:staged});
  assert.equal(f.nodes.publishRelease.disabled,false);
  assert.equal(f.nodes.loadRelease.disabled,false);
  f.nodes.publishRelease.onclick();await settle();
  const call=f.requests.find(x=>x.path==='/studio/api/publish');
  assert.deepEqual(JSON.parse(JSON.stringify(call.body)),{id:staged,expectedActive:live});
  assert.equal(f.events(),1);
  assert.equal(f.nodes.publishRelease.disabled,true,'Already live cannot be published again');
});

test('preview failure and load timeout show actionable errors, without enabling Publish',async()=>{
  const f=fixture();f.nodes.releaseBtn.onclick();await settle();
  f.receive({type:'skygate-preview-error',message:'Image could not decode'});
  assert.match(f.nodes.releaseStatus.textContent,/Preview gagal/);
  assert.equal(f.nodes.publishRelease.disabled,true);
  f.nodes.releaseFrame.contentDocument={querySelector:()=>null};
  f.nodes.releaseFrame.send('load');
  assert.match(f.nodes.releaseStatus.textContent,/Halaman preview tidak tersedia/);
  f.nodes.releaseFrame.contentDocument={querySelector:()=>({})};
  f.nodes.releaseBtn.onclick();await settle();f.expire();
  assert.match(f.nodes.releaseStatus.textContent,/Preview belum siap/);
});
