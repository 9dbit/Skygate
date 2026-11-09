import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNative} from '../agency-runtime.mjs';
const within=async(p,ms)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Independent player blocked by slow wallet request')),ms);})]);}finally{clearTimeout(timer);}};
const close=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
test('real concurrent HTTP players progress independently while duplicate delayed requests settle once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-concurrency-')),rounds=new Map(),balances=new Map([['slow',100000n],['fast',100000n]]);let markEntered,release;
 const entered=new Promise(resolve=>{markEntered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const walletServer=createServer(async(req,res)=>{
  try{
   const parts=[];for await(const chunk of req)parts.push(chunk);const body=Buffer.concat(parts),p=JSON.parse(body),action=req.url.split('/').at(-1);
   const canonical=['agency.v2','preproduction','core-concurrency-test','POST',req.url,req.headers['x-agency-timestamp'],req.headers['x-agency-nonce'],createHash('sha256').update(body).digest('hex')].join('\n');
   assert.equal(req.headers['x-agency-version'],'2');assert.equal(req.headers['x-agency-audience'],'core-concurrency-test');assert.equal(req.headers['x-agency-signature'],createHmac('sha256','q'.repeat(40)).update(canonical).digest('hex'));
   let response;
   if(action==='redeem'){const player=p.token.startsWith('s')?'slow':'fast';response={provider:'soft-tech',game:'skygate-5000',environment:'preproduction',deployment_id:'core-concurrency-test',tenant_id:'tenant',player_id:player,session_id:player,coin_scale:0};}
   else if(action==='status')response={balance:String(balances.get(p.session_id)),reserved:'0'};
   else if(action==='reserve'){
    if(!rounds.has(p.round_ref)){rounds.set(p.round_ref,{...p,id:p.round_ref,debits:1,credits:0});balances.set(p.session_id,balances.get(p.session_id)-BigInt(p.stake));}
    if(p.session_id==='slow'){markEntered();await gate;}
    response=rounds.get(p.round_ref);
   }else if(action==='settle'){
    const r=rounds.get(p.round_id);if(!r.credits){r.credits=1;balances.set(r.session_id,balances.get(r.session_id)+BigInt(p.payout));}response={ok:true};
   }else throw Error('Unexpected wallet action');
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(response));
  }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}
 });walletServer.listen(0,'127.0.0.1');await once(walletServer,'listening');
 const app=createNative({env:{AGENCY_WALLET_MODE:'sandbox',AGENCY_ENVIRONMENT:'preproduction',AGENCY_DEPLOYMENT_ID:'skygate-concurrency-test',AGENCY_CORE_DEPLOYMENT_ID:'core-concurrency-test',AGENCY_WALLET_ORIGIN:`http://127.0.0.1:${walletServer.address().port}`,AGENCY_WALLET_KEY_ID:'test-engine',AGENCY_WALLET_SECRET:'q'.repeat(40),AGENCY_WALLET_LOCAL_QA:'1',SKYGATE_AGENCY_DB_PATH:join(dir,'native.sqlite')},releases:{live:async()=>null}});
 const nativeServer=createServer(async(req,res)=>{if(!await app.handle(req,res,new URL(req.url,'http://local').pathname)){res.writeHead(404);res.end();}});nativeServer.listen(0,'127.0.0.1');await once(nativeServer,'listening');const origin=`http://127.0.0.1:${nativeServer.address().port}`;
 const request=async(path,body,cookie)=>{const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json','X-Skygate-Client':'agency-ui',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});const json=await r.json();assert.equal(r.status,200,JSON.stringify(json));return {json,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 let slow,duplicate,fast;
 try{
  const a=await request('/api/agency/launch',{token:'s'.repeat(48)}),b=await request('/api/agency/launch',{token:'f'.repeat(48)});
  const payload={request_id:randomUUID(),bet:'2',ante:false,buy_bonus:false,release_id:'bundled'};let slowDone=false,duplicateDone=false;
  slow=request('/api/agency/spin',payload,a.cookie).then(x=>{slowDone=true;return x;});await within(entered,3000);
  duplicate=request('/api/agency/spin',payload,a.cookie).then(x=>{duplicateDone=true;return x;});fast=request('/api/agency/spin',{...payload,request_id:randomUUID()},b.cookie);
  const result=await within(fast,3000);assert.ok(result.json.id);assert.equal(slowDone,false);assert.equal(duplicateDone,false);
  release();const [first,replay]=await Promise.all([slow,duplicate]);assert.deepEqual(first.json,replay.json);
  assert.equal(rounds.size,2);assert.ok([...rounds.values()].every(x=>x.debits===1&&x.credits===1));assert.equal(app.health().pending_operation_queues,0);
 }finally{release();await Promise.allSettled([slow,duplicate,fast].filter(Boolean));await close(nativeServer);app.close();await close(walletServer);await rm(dir,{recursive:true,force:true});}
});
