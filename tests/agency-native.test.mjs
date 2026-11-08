import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createNative,amountUnits,payoutUnits} from '../agency-runtime.mjs';
import transport from '../agency-wallet.cjs';
test('integer precision and one half-up rounding after the complete bonus',()=>{
 assert.equal(payoutUnits('2',.25,0),1n);assert.equal(payoutUnits('2',.2499999999,0),0n);
 assert.equal(payoutUnits('0.2',.125,2),3n);assert.equal(amountUnits('9007199254740993',0),9007199254740993n);
 assert.throws(()=>amountUnits('2.5',0),/presisi/);assert.equal(amountUnits('2.5',2),250n);
});
test('durable outcomes survive unknown reserve/settle responses and process restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sky-native-')),rounds=new Map();let balance=1000n,generate=0,failReserve=true,failSettle=true;
 const s={game:'skygate-5000',tenant_id:'tenant',player_id:'player',session_id:'session',coin_scale:0};
 const wallet={redeem:async()=>s,status:async()=>({balance:String(balance),reserved:'0'}),reserve:async p=>{
  if(!rounds.has(p.round_ref)){rounds.set(p.round_ref,{...p,id:p.round_ref});balance-=BigInt(p.stake);}
  if(failReserve){failReserve=false;throw Error('lost after reserve');}return rounds.get(p.round_ref);
 },settle:async p=>{const r=rounds.get(p.round_id);if(!r.settled){r.settled=true;balance+=BigInt(p.payout);}if(failSettle){failSettle=false;throw Error('lost after settlement');}return {ok:true};}};
 const opts={env:{AGENCY_WALLET_MODE:'sandbox',AGENCY_WALLET_SECRET:'q'.repeat(40),SKYGATE_AGENCY_DB_PATH:join(dir,'native.sqlite')},wallet,releases:{live:async()=>null},outcomeFactory:async()=>{generate++;return {winX:.25,bonus:{triggered:false}};}};
 let app=createNative(opts);try{
  const {cookie}=await app.test.redeem('x'.repeat(40));const p={request_id:randomUUID(),bet:'2',ante:false,buy_bonus:false,release_id:'bundled'};
  await assert.rejects(app.test.spin(cookie,{...p,payout:'9999'}),/Payload/);assert.equal(generate,0);
  await assert.rejects(app.test.spin(cookie,{...p,ante:true}),/presisi/);assert.equal(generate,0);
  await assert.rejects(app.test.spin(cookie,p),/terputus/);assert.equal(balance,998n);assert.equal(generate,1);
  app.close();app=createNative(opts);
  await assert.rejects(app.test.spin(cookie,p),/terputus/);assert.equal(balance,999n);assert.equal(generate,1);
  app.close();app=createNative(opts);const [a,b]=await Promise.all([app.test.spin(cookie,p),app.test.spin(cookie,p)]);
  assert.equal(a.id,b.id);assert.equal(a.payout,'1');assert.equal(a.state.balance,'999');assert.equal(generate,1);assert.equal(rounds.size,1);
  await assert.rejects(app.test.spin(cookie,{...p,bet:'4'}),/idempotency/);
  assert.equal((await app.test.state(cookie)).history.length,1);
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('real native engine accepts crypto RNG without seed-controlled outcomes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sky-engine-'));let payout;
 const app=createNative({env:{AGENCY_WALLET_MODE:'sandbox',AGENCY_WALLET_SECRET:'q'.repeat(40),SKYGATE_AGENCY_DB_PATH:join(dir,'native.sqlite')},releases:{live:async()=>null},wallet:{redeem:async()=>({game:'skygate-5000',tenant_id:'t',player_id:'p',session_id:'s',coin_scale:0}),status:async()=>({balance:'1000',reserved:'0'}),reserve:async()=>({id:'r'}),settle:async p=>{payout=p.payout;}}});
 try{const {cookie}=await app.test.redeem('x'.repeat(40));const r=await app.test.spin(cookie,{request_id:randomUUID(),bet:'2',ante:false,buy_bonus:false,release_id:'bundled'});assert.ok(r.round.base.initial.length);assert.equal(r.round.rngStateEnd,null);assert.equal(r.payout,payout);}finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
