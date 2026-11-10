import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as pause} from 'node:timers/promises';
import vm from 'node:vm';
import {createNative} from '../agency-runtime.mjs';
import {makeDOM} from '../studio/tests/dom-fixture.mjs';

const root=resolve(import.meta.dirname,'..');
const read=name=>readFileSync(join(root,name),'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

async function provider(t,balance=1000n){
  const directory=mkdtempSync(join(tmpdir(),'skygate-provider-ui-'));
  const rounds=new Map();let reserveCalls=0,settleCalls=0;
  const session={provider:'soft-tech',game:'skygate-5000',environment:'sandbox',
    core_deployment_id:'core-ui-test',tenant_id:'genesis-test',player_id:'synthetic-player',session_id:'synthetic-session',coin_scale:0};
  const app=createNative({
    env:{AGENCY_WALLET_MODE:'sandbox',AGENCY_ENVIRONMENT:'sandbox',AGENCY_DEPLOYMENT_ID:'skygate-ui-test',
      AGENCY_CORE_DEPLOYMENT_ID:'core-ui-test',AGENCY_WALLET_SECRET:'test-only-'.repeat(5),SKYGATE_AGENCY_DB_PATH:join(directory,'native.sqlite')},
    releases:{live:async()=>null},
    wallet:{redeem:async()=>session,status:async()=>({balance:String(balance),reserved:'0'}),
      reserve:async payload=>{reserveCalls++;assert(balance>=BigInt(payload.stake));balance-=BigInt(payload.stake);const round={...payload,id:payload.round_ref};rounds.set(round.id,round);return round;},
      settle:async payload=>{settleCalls++;assert(rounds.has(payload.round_id));balance+=BigInt(payload.payout);return {ok:true};}}
  });
  t.after(()=>{app.close();rmSync(directory,{recursive:true,force:true});});
  const {cookie}=await app.test.redeem('test-only-launch-'.repeat(3));
  const api={state:await app.test.state(cookie),async spin(bet,ante,buy_bonus){
    const result=await app.test.spin(cookie,{request_id:randomUUID(),bet:String(bet),ante,buy_bonus,release_id:'bundled'});
    api.state=result.state;return result;
  }};
  return {app,api,counters:()=>({reserveCalls,settleCalls,balance})};
}

function boot(api){
  const dom=makeDOM(),messages=[];
  const nodes=new Map([...read('play/index.html').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new dom.Node()]));
  for(const id of ['status','playHint']){
    let value='';Object.defineProperty(nodes.get(id),'textContent',{get:()=>value,set:next=>{value=next;messages.push(String(next));}});
  }
  const seedLabel=new dom.Node('label'),seedDescription=new dom.Node('p');
  nodes.get('seedNote').closest=()=>({querySelector:selector=>{assert.equal(selector,'p.muted');return seedDescription;}});
  const document={hidden:false,body:{},documentElement:{},createElement:tag=>new dom.Node(tag),
    getElementById:id=>{assert(nodes.has(id),`Missing UI node ${id}`);return nodes.get(id);},
    querySelector:selector=>{assert.equal(selector,'label[for="seedInput"]');return seedLabel;},addEventListener(){}};
  const window={SkygateAgency:api,SoftTechNavigation:{canStart:()=>true},matchMedia:()=>({matches:true}),addEventListener(){},
    SkyAudioMixer:class{unlock(){return Promise.resolve(true)}play(){return Promise.resolve(true)}stopAll(){}updateMix(){}isReady(){return true}isPlaying(){return true}}};
  const errors=[];
  const context=vm.createContext({window,document,console:{...console,error:error=>errors.push(error)},
    setTimeout:fn=>queueMicrotask(fn),clearTimeout(){},URL,Blob});
  for(const name of ['play/settings-model.js','play/config.js','play/engine.js'])vm.runInContext(read(name),context,{filename:name});
  window.SlotGameMath=context.SlotGameMath;window.SkygateSettings=context.SkygateSettings;
  for(const name of ['play/cascade-art.js','play/reels.js','play/game.js'])vm.runInContext(read(name),context,{filename:name});
  return {nodes,messages,errors,state:()=>window.SlotGameTest.getState(),async click(id){
    nodes.get(id).events.click({target:nodes.get(id)});
    const deadline=Date.now()+10000;
    while(window.SlotGameTest.getState().busy){assert(Date.now()<deadline,'Provider presentation timed out');await pause(5);}
  }};
}

test('provider renderer labels its agency wallet through boot, settlement, history, replay and reload',async t=>{
  const native=await provider(t);
  assert.equal(native.app.health().provider,'soft-tech');
  assert.equal(native.api.state.coin_scale,0);
  const ui=boot(native.api);
  assert.equal(ui.nodes.get('status').textContent,'Wallet agen terhubung · sandbox');
  for(const id of ['reset','seedInput','seedApply','seedCurrent'])assert.equal(ui.nodes.get(id).hidden,true);
  await ui.click('spin');
  assert.equal(ui.errors.length,0);
  assert.equal(ui.state().rounds,1);
  assert.match(ui.nodes.get('playHint').textContent,/^Wallet agen: /);
  assert.equal(ui.state().credits,Number(native.counters().balance));
  assert.equal(ui.state().history.length,1);
  assert.equal(ui.state().history[0].time,'Wallet agen');
  assert.equal(native.counters().reserveCalls,1);assert.equal(native.counters().settleCalls,1);
  const settled=native.counters();
  await ui.click('replay');
  assert.deepEqual(native.counters(),settled,'UI replay must not debit or settle again');
  assert.equal(ui.nodes.get('playHint').textContent,'Replay selesai · saldo tetap');
  await ui.click('reset');
  assert.equal(ui.nodes.get('status').textContent,'Saldo dikelola agen; reset lokal dinonaktifkan');
  assert.deepEqual(native.counters(),settled,'Hidden reset remains a local no-op');
  const reloaded=boot(native.api);
  assert.equal(reloaded.state().history.length,1);assert.equal(reloaded.state().history[0].time,'Wallet agen');
  assert.equal(reloaded.state().credits,Number(settled.balance));
  for(const text of [...ui.messages,...reloaded.messages])assert.doesNotMatch(text,/playground/i);
});

test('provider insufficient balance retains the agency label and sends no wallet operation',async t=>{
  const native=await provider(t,1n),ui=boot(native.api);
  await ui.click('spin');
  assert.equal(ui.nodes.get('status').textContent,'Saldo wallet agen tidak cukup. Kembali ke website agen.');
  assert.deepEqual(native.counters(),{reserveCalls:0,settleCalls:0,balance:1n});
  assert.equal(ui.state().rounds,0);
  for(const text of ui.messages)assert.doesNotMatch(text,/playground/i);
});

async function server(t){
  const directory=mkdtempSync(join(tmpdir(),'skygate-provider-assets-'));
  // An explicit local-only environment cannot inherit remote wallet, backup or heartbeat configuration.
  const env={PATH:process.env.PATH,PORT:'0',NODE_ENV:'test',AGENCY_WALLET_MODE:'sandbox',
    AGENCY_ENVIRONMENT:'sandbox',AGENCY_DEPLOYMENT_ID:'skygate-asset-test',AGENCY_CORE_DEPLOYMENT_ID:'core-asset-test',
    AGENCY_WALLET_ORIGIN:'http://127.0.0.1:1',AGENCY_WALLET_LOCAL_QA:'1',AGENCY_WALLET_KEY_ID:'local-ui-test',
    AGENCY_WALLET_SECRET:'test-only-'.repeat(5),SKYGATE_AGENCY_DB_PATH:join(directory,'native.sqlite'),SKYGATE_RELEASE_DIR:join(directory,'releases')};
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{
    if(child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill();await exit;}
    rmSync(directory,{recursive:true,force:true});
  });
  return new Promise((resolve,reject)=>{
    let output='',errors='';const timer=setTimeout(()=>reject(Error('Local provider did not start: '+errors)),5000);
    const fail=error=>{clearTimeout(timer);reject(error);};
    child.once('error',fail);child.once('exit',code=>fail(Error(`Local provider exited ${code}: ${errors}`)));
    child.stderr.on('data',chunk=>{errors+=chunk;});
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/listening on (\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});
  });
}

test('provider splash references the shipped PNG with exact bytes while private media stays protected',async t=>{
  const origin=await server(t);
  assert.equal((await fetch(origin+'/api/agency/mode').then(r=>r.json())).agency,true);
  const page=await fetch(origin+'/play/');assert.equal(page.status,200);
  const html=await page.text(),src=html.match(/<header class="splash-title">[\s\S]*?<img src="([^"]+)"/)?.[1];
  assert.equal(src,'assets/scene/logo.png');
  const url=new URL(src,origin+'/play/'),asset=await fetch(url);
  assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/png');
  assert.equal(asset.headers.get('x-content-type-options'),'nosniff');
  const bytes=Buffer.from(await asset.arrayBuffer()),shipped=readFileSync(join(root,'studio/assets/scene/logo.png'));
  assert.deepEqual(bytes.subarray(0,8),Buffer.from('89504e470d0a1a0a','hex'));
  assert.equal(sha(bytes),sha(shipped));assert.equal(bytes.length,shipped.length);
  const head=await fetch(url,{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'image/png');
  assert.equal(Number(head.headers.get('content-length')),bytes.length);assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await fetch(url,{method:'POST'})).status,405);
  for(const path of ['/studio/','/studio/assets/scene/logo.png','/studio/api/releases','/play/media/533512288c10cf9bfb7ed7cfaa7123d4d1151bf2ba25d5755eb1d8d18235d0c2.png','/play/assets/project.json','/SOFTTECH_PROVIDER_SOURCE_LOCK.json']){
    assert.equal((await fetch(origin+path)).status,404,path);
  }
  assert.equal((await fetch(origin+'/studio/api/publish',{method:'POST'})).status,404);
});
