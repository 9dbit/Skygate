import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {DurableWrites} from '../durable-writes.mjs';
import {createNative} from '../agency-runtime.mjs';
import transport from '../agency-wallet.cjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const payload=()=>({request_id:randomUUID(),bet:'2',ante:false,buy_bonus:false,release_id:'bundled'});

function queueFixture(options={}){
 const dir=mkdtempSync(join(tmpdir(),'sky-durable-')),path=join(dir,'journal.sqlite');
 const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE writes(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
 const reader=new DatabaseSync(path,{readOnly:true}),queue=new DurableWrites(db,options);
 return {db,reader,queue,close(){queue.close();reader.close();db.close();rmSync(dir,{recursive:true,force:true});}};
}

test('group commit becomes visible to an independent SQLite reader before any promise resolves',async()=>{
 const f=queueFixture({maxBatch:8,maxPending:32,delayMs:1000});
 try{
  assert.equal(f.db.prepare('PRAGMA synchronous').get().synchronous,2);
  const promises=Array.from({length:8},(_,i)=>f.queue.run(()=>{
   f.db.prepare('INSERT INTO writes VALUES(?,?)').run(i,'durable');
   assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM writes').get().n,0);
   return i;
  }).then(value=>{assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM writes').get().n,8);return value;}));
  assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM writes').get().n,0);
  f.queue.flush();assert.deepEqual(await Promise.all(promises),[0,1,2,3,4,5,6,7]);
  assert.equal(f.queue.status().commits,1);assert.equal(f.queue.status().operations,8);
 }finally{f.close();}
});

test('one rejected operation rolls back its own writes while independent operations commit',async()=>{
 const f=queueFixture({delayMs:1000});
 try{
  const promises=[
   f.queue.run(()=>f.db.prepare('INSERT INTO writes VALUES(?,?)').run(1,'first')),
   f.queue.run(()=>{f.db.prepare('INSERT INTO writes VALUES(?,?)').run(2,'rolled-back');throw Error('operation fault');}),
   f.queue.run(()=>f.db.prepare('INSERT INTO writes VALUES(?,?)').run(3,'third'))
  ];
  const completion=Promise.allSettled(promises);f.queue.flush();const outcomes=await completion;
  assert.deepEqual(outcomes.map(x=>x.status),['fulfilled','rejected','fulfilled']);
  assert.match(outcomes[1].reason.message,/operation fault/);
  assert.deepEqual(f.reader.prepare('SELECT id FROM writes ORDER BY id').all().map(x=>x.id),[1,3]);
  assert.equal(f.queue.status().rejected_operations,1);
 }finally{f.close();}
});

test('an outer commit failure rejects the entire batch and later work can recover',async()=>{
 const f=queueFixture({delayMs:1000});
 try{
  let fail=true;f.queue.db={exec(sql){if(sql==='COMMIT'&&fail){fail=false;throw Error('injected fsync failure');}return f.db.exec(sql);}};
  const completion=Promise.allSettled([1,2].map(i=>f.queue.run(()=>f.db.prepare('INSERT INTO writes VALUES(?,?)').run(i,'not committed'))));
  f.queue.flush();assert.ok((await completion).every(x=>x.status==='rejected'&&/fsync failure/.test(x.reason.message)));
  assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM writes').get().n,0);
  assert.equal(f.queue.status().failed_commits,1);assert.equal(f.queue.status().commits,0);
  const recovered=f.queue.run(()=>f.db.prepare('INSERT INTO writes VALUES(?,?)').run(3,'committed'));
  f.queue.flush();await recovered;assert.equal(f.reader.prepare('SELECT value FROM writes WHERE id=3').get().value,'committed');
 }finally{f.close();}
});

test('bounds, close and asynchronous or nested callbacks fail without leaking partial writes',async()=>{
 const f=queueFixture({maxBatch:2,maxPending:2,delayMs:1000});
 try{
  await assert.rejects(f.queue.run(async()=>{}),/Synchronous durable callback/);
  await assert.rejects(f.queue.run(function*(){}),/Synchronous durable callback/);
  const a=f.queue.run(()=>{f.db.prepare('INSERT INTO writes VALUES(1,?)').run('rolled back');return Promise.resolve();});
  const b=f.queue.run(()=>{f.db.prepare('INSERT INTO writes VALUES(2,?)').run('rolled back');f.queue.run(()=>{});});
  await assert.rejects(f.queue.run(()=>{}),/JOURNAL_BACKPRESSURE/);
  const completion=Promise.allSettled([a,b]);f.queue.flush();
  const failures=await completion;assert.ok(failures.every(x=>x.status==='rejected'));
  assert.match(failures[0].reason.message,/Asynchronous durable operation/);assert.match(failures[1].reason.message,/Nested durable queue/);
  assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM writes').get().n,0);
  const pending=f.queue.run(()=>f.db.prepare('INSERT INTO writes VALUES(3,?)').run('never runs'));
  const closing=assert.rejects(pending,/JOURNAL_CLOSED/);f.queue.close();await closing;
  await assert.rejects(f.queue.run(()=>{}),/JOURNAL_CLOSED/);assert.equal(f.queue.status().pending,0);
  assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM writes').get().n,0);
 }finally{f.close();}
});

function nativeFixture({reserveError=null}={}){
 const dir=mkdtempSync(join(tmpdir(),'sky-native-journal-')),path=join(dir,'native.sqlite'),rounds=new Map(),balances=new Map();
 let app,reader,generated=0,reserves=0,settles=0;
 const session=player=>({game:'skygate-5000',tenant_id:'tenant',player_id:player,session_id:player,coin_scale:0});
 const row=id=>reader.prepare('SELECT * FROM rounds WHERE id=?').get(id);
 const wallet={
  redeem:async token=>{if(!balances.has(token))balances.set(token,10000n);return session(token);},
  status:async p=>({balance:String(balances.get(p.session_id)),reserved:'0'}),
  reserve:async p=>{
   reserves++;const persisted=row(p.round_ref);assert.equal(persisted.state,'intent');assert.equal(persisted.stake,p.stake);assert.ok(JSON.parse(persisted.result_json).round);
   if(reserveError)throw new transport.AgencyWalletError(reserveError,'injected reservation rejection');
   if(!rounds.has(p.round_ref)){rounds.set(p.round_ref,{...p,id:p.round_ref,debits:1,credits:0,result_json:persisted.result_json});balances.set(p.session_id,balances.get(p.session_id)-BigInt(p.stake));}
   return rounds.get(p.round_ref);
  },
  settle:async p=>{
   settles++;const persisted=row(p.round_id);assert.equal(persisted.state,'reserved');assert.equal(persisted.central_id,p.round_id);assert.equal(persisted.payout,p.payout);
   const r=rounds.get(p.round_id);assert.equal(persisted.result_json,r.result_json);
   if(!r.credits){r.credits=1;balances.set(r.session_id,balances.get(r.session_id)+BigInt(p.payout));}return {ok:true};
  }
 };
 const options={env:{AGENCY_WALLET_MODE:'sandbox',AGENCY_WALLET_SECRET:'q'.repeat(40),SKYGATE_AGENCY_DB_PATH:path},wallet,releases:{live:async()=>null},outcomeFactory:async()=>{generated++;return {winX:.25,bonus:{triggered:false}};}};
 const start=()=>{app=createNative(options);};start();reader=new DatabaseSync(path,{readOnly:true});
 return {get app(){return app;},reader,row,rounds,balances,get generated(){return generated;},get reserves(){return reserves;},get settles(){return settles;},
  restart(){app.close();start();},
  failCommitWhen(predicate){const db=app.test.journal.db;let failed=false;app.test.journal.db={exec(sql){if(sql==='COMMIT'&&!failed&&predicate(db)){failed=true;throw Error('injected durable commit failure');}return db.exec(sql);}};return ()=>failed;},
  close(){app.close();reader.close();rmSync(dir,{recursive:true,force:true});}};
}

test('real HTTP concurrent players persist launch, intent, reservation and settlement before outward effects or success',async()=>{
 const f=nativeFixture();
 const server=createServer(async(req,res)=>{if(!await f.app.handle(req,res,new URL(req.url,'http://local').pathname)){res.writeHead(404);res.end();}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,cookie)=>{const response=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json','x-skygate-client':'agency-ui',...(cookie?{cookie}:{})},body:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const sessions=await Promise.all(Array.from({length:16},(_,i)=>request('/api/agency/launch',{token:`player-${i}`.padEnd(40,'x')})));
  for(const s of sessions)assert.ok(f.reader.prepare('SELECT 1 FROM launches WHERE cookie_hash=?').get(sha(s.cookie.split('=')[1])));
  const completed=await Promise.all(sessions.map(async s=>{const p=payload();const [a,b]=await Promise.all([request('/api/agency/spin',p,s.cookie),request('/api/agency/spin',p,s.cookie)]);assert.deepEqual(a.value,b.value);assert.equal(f.row(a.value.id).state,'settled');return a.value;}));
  assert.equal(completed.length,16);assert.equal(f.generated,16);assert.equal(f.rounds.size,16);
  assert.ok([...f.rounds.values()].every(r=>r.debits===1&&r.credits===1));
  const metrics=f.app.health().durable_journal;assert.equal(metrics.operations,64);assert.ok(metrics.commits<metrics.operations);assert.ok(metrics.max_batch>1);assert.equal(metrics.pending,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.close();}
});

test('launch commit failure returns no session cookie and leaves no reusable local session',async()=>{
 const f=nativeFixture();
 try{
  const failed=f.failCommitWhen(db=>db.prepare('SELECT COUNT(*) AS n FROM launches').get().n===1);
  await assert.rejects(f.app.test.redeem('x'.repeat(40)),/durable commit failure/);assert.equal(failed(),true);
  assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM launches').get().n,0);assert.equal(f.reserves,0);
  f.restart();const result=await f.app.test.redeem('x'.repeat(40));assert.equal(typeof result.cookie,'string');assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM launches').get().n,1);
 }finally{f.close();}
});

test('an uncommitted outcome cannot reach reserve or settle',async()=>{
 const f=nativeFixture();
 try{
  const {cookie}=await f.app.test.redeem('x'.repeat(40));const p=payload();
  f.failCommitWhen(db=>db.prepare("SELECT 1 FROM rounds WHERE state='intent'").get());
  await assert.rejects(f.app.test.spin(cookie,p),/durable commit failure/);assert.equal(f.reserves,0);assert.equal(f.settles,0);
  assert.equal(f.reader.prepare('SELECT COUNT(*) AS n FROM rounds').get().n,0);
  f.restart();const result=await f.app.test.spin(cookie,p);assert.equal(f.row(result.id).state,'settled');assert.equal(f.rounds.size,1);
 }finally{f.close();}
});

for(const stage of ['reserved','settled'])test(`failed ${stage} commit replays the original durable outcome across restart without a second debit or credit`,async()=>{
 const f=nativeFixture();
 try{
  const {cookie}=await f.app.test.redeem('x'.repeat(40)),p=payload();
  const failed=f.failCommitWhen(db=>db.prepare('SELECT 1 FROM rounds WHERE state=?').get(stage));
  await assert.rejects(f.app.test.spin(cookie,p),/durable commit failure/);assert.equal(failed(),true);
  const persisted=f.reader.prepare('SELECT * FROM rounds WHERE request_id=?').get(p.request_id),beforeHash=sha(persisted.result_json);
  assert.equal(persisted.state,stage==='reserved'?'intent':'reserved');assert.equal(f.generated,1);
  assert.equal(f.rounds.get(persisted.id).debits,1);assert.equal(f.rounds.get(persisted.id).credits,stage==='reserved'?0:1);
  f.restart();const [a,b]=await Promise.all([f.app.test.spin(cookie,p),f.app.test.spin(cookie,p)]);
  assert.deepEqual(a,b);assert.equal(a.id,persisted.id);assert.equal(sha(f.row(a.id).result_json),beforeHash);assert.equal(f.generated,1);
  assert.equal(f.row(a.id).state,'settled');assert.equal(f.rounds.size,1);assert.equal(f.rounds.get(a.id).debits,1);assert.equal(f.rounds.get(a.id).credits,1);
  assert.equal(a.state.balance,'9999');
 }finally{f.close();}
});

test('definitive reservation rejection is durable and does not retry a wallet operation after restart',async()=>{
 const f=nativeFixture({reserveError:409});
 try{
  const {cookie}=await f.app.test.redeem('x'.repeat(40)),p=payload();
  await assert.rejects(f.app.test.spin(cookie,p),e=>e.status===409);
  const persisted=f.reader.prepare('SELECT * FROM rounds WHERE request_id=?').get(p.request_id);assert.equal(persisted.state,'failed');assert.equal(persisted.error_status,409);
  f.restart();await assert.rejects(f.app.test.spin(cookie,p),e=>e.status===409);assert.equal(f.reserves,1);assert.equal(f.settles,0);assert.equal(f.generated,1);
 }finally{f.close();}
});
