import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createNative} from '../agency-runtime.mjs';
import {run,restoreFromRemote,decrypt,keyRing} from '../scripts/native-backup.mjs';

test('complete disposable native volume loss restores sessions, fixed outcomes and exactly-once settlement across key rotation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-volume-loss-')),volume=join(dir,'volume');await mkdir(volume);const path=join(volume,'native.sqlite');
 const old=randomBytes(32).toString('hex'),rotated=randomBytes(32).toString('hex'),objects=new Map(),rounds=new Map();let balance=100000n,lost=false,app;
 const env={AGENCY_WALLET_MODE:'sandbox',AGENCY_ENVIRONMENT:'preproduction',AGENCY_DEPLOYMENT_ID:'skygate-dr-deployment',AGENCY_CORE_DEPLOYMENT_ID:'core-dr-deployment',AGENCY_WALLET_SECRET:'q'.repeat(40),SKYGATE_AGENCY_DB_PATH:path,AGENCY_STUDIO_SYNC:'0',ENGINE_BACKUP_KEYS_JSON:JSON.stringify({old}),ENGINE_BACKUP_ACTIVE_KEY_ID:'old',ENGINE_BACKUP_S3_ENDPOINT:'https://storage.example',ENGINE_BACKUP_S3_BUCKET:'backups',ENGINE_BACKUP_S3_ACCESS_KEY_ID:'test',ENGINE_BACKUP_S3_SECRET_ACCESS_KEY:'test',ENGINE_RESTORE_OBJECT_KEY:'',ENGINE_RESTORE_CIPHERTEXT_SHA256:'',ENGINE_RESTORE_CONFIRM_DEPLOYMENT_ID:''};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const wallet={redeem:async()=>({provider:'soft-tech',game:'skygate-5000',tenant_id:'tenant',player_id:'player',session_id:'session',coin_scale:2,environment:'preproduction',deployment_id:'core-dr-deployment'}),status:async()=>({balance:String(balance),reserved:'0'}),reserve:async p=>{if(!rounds.has(p.round_ref)){rounds.set(p.round_ref,{...p,id:p.round_ref});balance-=BigInt(p.stake);}if(lost){lost=false;throw Error('simulated lost reserve response');}return rounds.get(p.round_ref);},settle:async p=>{const row=rounds.get(p.round_id);if(!row.settled){row.settled=true;balance+=BigInt(p.payout);}return {ok:true};}};
 const options={env,releases:{live:async()=>null},wallet};
 t.mock.method(globalThis,'fetch',async(url,options)=>{const key=new URL(url).pathname.slice(1);if(options.method==='PUT'){objects.set(key,Buffer.from(options.body));return new Response('',{status:200});}return new Response(objects.get(key),{status:200});});
 t.mock.method(console,'log',()=>{});
 try{
  app=createNative(options);const {cookie}=await app.test.redeem('t'.repeat(48));
  const first=await app.test.spin(cookie,{request_id:randomUUID(),bet:'2',ante:false,buy_bonus:false,release_id:'bundled'});
  lost=true;const pending={request_id:randomUUID(),bet:'2',ante:false,buy_bonus:false,release_id:'bundled'};await assert.rejects(app.test.spin(cookie,pending),/terputus/);
  let db=new DatabaseSync(path,{readOnly:true});const before=db.prepare("SELECT * FROM rounds WHERE state='intent'").get();db.close();
  const backup=await run();app.close();app=null;const lostAt=performance.now();await rm(volume,{recursive:true,force:true});await mkdir(volume);
  Object.assign(env,{ENGINE_BACKUP_KEYS_JSON:JSON.stringify({old,rotated}),ENGINE_BACKUP_ACTIVE_KEY_ID:'rotated',ENGINE_RESTORE_OBJECT_KEY:backup.object,ENGINE_RESTORE_CIPHERTEXT_SHA256:backup.ciphertext_sha256,ENGINE_RESTORE_CONFIRM_DEPLOYMENT_ID:'skygate-dr-deployment'});Object.assign(process.env,env);
  await restoreFromRemote();app=createNative(options);
  const [a,b]=await Promise.all([app.test.spin(cookie,pending),app.test.spin(cookie,pending)]);assert.deepEqual(a,b);assert.equal(a.id,before.id);
  db=new DatabaseSync(path,{readOnly:true});const after=db.prepare('SELECT * FROM rounds WHERE id=?').get(before.id),settled=db.prepare('SELECT * FROM rounds WHERE id=?').get(first.id);db.close();
  assert.equal(before.result_json,after.result_json);assert.equal(before.payout,after.payout);assert.equal(settled.state,'settled');assert.equal(after.state,'settled');assert.equal(rounds.size,2);assert.ok([...rounds.values()].every(x=>x.settled));
  assert.equal(balance,100000n-BigInt(settled.stake)-BigInt(after.stake)+BigInt(settled.payout)+BigInt(after.payout));
  const next=await run();assert.notEqual(next.object,backup.object);assert.equal(next.manifest.key_id,'rotated');
  assert.equal(decrypt(objects.get(backup.object),null,keyRing(env)).manifest.key_id,'old');assert.equal(decrypt(objects.get(next.object),null,keyRing(env)).manifest.key_id,'rotated');
  assert.throws(()=>decrypt(objects.get(backup.object),null,{rotated:Buffer.from(rotated,'hex')}),/unavailable/);
  assert.equal(await restoreFromRemote(),null);
  const report={game:'skygate',scenario:'disposable-native-volume-deleted-and-replaced',transport:'in-memory S3 double; actual native domain + game RNG + SQLite + AES-GCM',settled_rounds_preserved:1,pending_rounds_recovered:1,duplicate_debits:0,duplicate_credits:0,rpo_lost_committed_rounds:0,snapshot_age_seconds:Math.max(0,Date.now()/1000-backup.manifest.created_at),rto_seconds:(performance.now()-lostAt)/1000,old_and_new_keys_restore:true,production_certified:false};
  if(process.env.NATIVE_DR_EVIDENCE_PATH)await writeFile(process.env.NATIVE_DR_EVIDENCE_PATH,JSON.stringify(report,null,2)+'\n');
 }finally{app?.close();await rm(dir,{recursive:true,force:true});for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
