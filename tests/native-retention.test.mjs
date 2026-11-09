import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {retentionPlan,enforceRetention,RETENTION_POLICY} from '../scripts/native-retention.mjs';
import {encrypt,decrypt,parseObjectList} from '../scripts/native-backup.mjs';
const NOW=Date.parse('2026-11-10T12:00:00Z')/1000,DAY=86400,key=randomBytes(32),identity={environment:'preproduction',deployment_id:'native-fixture',core_deployment_id:'core-fixture',game_id:'skygate-5000',identity_version:1};
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const objects=new Map(),deleted=[],events=[];let n=0;
 const add=(age,who=identity)=>{const {manifest,payload}=encrypt(Buffer.from('fixture sqlite bytes'),'skygate',key,NOW-age,{key_id:'test',deployment_identity:who});const object=`native/skygate/${manifest.created_at}-${manifest.sha256.slice(0,16)}-${String(++n).padStart(16,'0')}.aesgcm`;objects.set(object,{bytes:payload,etag:'"'+hash(payload)+'"'});return object;};
 const current=add(0),second=add(3600),old=[];for(let i=0;i<14;i++)old.push(add((400+i)*DAY));
 const legacy='native/skygate/1000000000-abcdefabcdefabcd.aesgcm';objects.set(legacy,{bytes:Buffer.from('legacy never delete')});
 const options={game:'skygate',identity,currentObject:current,currentCiphertextSha256:hash(objects.get(current).bytes),now:NOW,mode:'apply',list:async()=>({keys:[...objects.keys()],nextToken:null}),download:async k=>objects.get(k),remove:async(k,etag)=>{assert.equal(objects.get(k).etag,etag);objects.delete(k);deleted.push(k);},verify:async bytes=>decrypt(bytes,key).manifest,logger:e=>events.push(e)};
 return {objects,deleted,events,options,current,second,old,legacy,add};
}
test('calendar policy retains all young snapshots, latest two, weekly/monthly representatives and current restore',()=>{
 const keys=[];for(let days=0;days<400;days++)for(let h=0;h<2;h++)keys.push(`native/skygate/${NOW-days*DAY-h*3600}-aaaaaaaaaaaaaaaa-${String(days*2+h).padStart(16,'0')}.aesgcm`);
 const restore=keys.at(-1),plan=retentionPlan(keys,{game:'skygate',now:NOW,restoringObject:restore,maxDeletes:10});
 assert.ok(plan.keep.includes(keys[0])&&plan.keep.includes(keys[1])&&plan.keep.includes(restore));
 for(const k of keys.slice(0,14))assert.ok(plan.keep.includes(k));
 assert.equal(plan.candidates.length,10);assert.ok(plan.candidates.every(x=>NOW-x.created_at>=7*DAY));
 const months=new Set(plan.keep.filter(k=>NOW-Number(k.split('/')[2].split('-')[0])>=7*DAY).map(k=>new Date(Number(k.split('/')[2].split('-')[0])*1000).toISOString().slice(0,7)));assert.ok(months.size>=11);
});
test('dry-run authenticates and plans with no deletions, apply deletes at most five old matching objects',async()=>{
 const f=fixture();let report=await enforceRetention({...f.options,mode:'dry-run'});assert.equal(report.verified,true);assert.equal(report.deleted_count,0);assert.equal(report.eligible_count,5);assert.equal(f.deleted.length,0);
 report=await enforceRetention(f.options);assert.equal(report.policy,RETENTION_POLICY);assert.equal(report.verified,true);assert.equal(report.deleted_count,5);assert.equal(f.deleted.length,5);
 for(const k of [f.current,f.second,f.legacy])assert.ok(f.objects.has(k));assert.equal(f.events[0].event,'engine.backup.retention_plan');
});
test('tampered, unknown-key and foreign-identity candidate proofs block all deletion',async()=>{
 for(const kind of ['tampered','unknown-key','foreign']){
  const f=fixture();const target=f.old.at(-1);
  if(kind==='tampered')f.objects.get(target).bytes[f.objects.get(target).bytes.length-1]^=1;
  if(kind==='unknown-key')f.options.verify=async bytes=>decrypt(bytes,null,{}).manifest;
  if(kind==='foreign'){const original=decrypt(f.objects.get(target).bytes,key);f.objects.get(target).bytes=encrypt(original.plaintext,'skygate',key,original.manifest.created_at,{key_id:'test',deployment_identity:{...identity,environment:'production'}}).payload;}
  const report=await enforceRetention(f.options);assert.equal(report.verified,false,kind);assert.equal(f.deleted.length,0,kind);
 }
});
test('stale current proof, incomplete inventory and changing ETag fail closed',async()=>{
 let f=fixture(),report=await enforceRetention({...f.options,now:NOW+26*3600});assert.equal(report.verified,false);assert.equal(f.deleted.length,0);
 f=fixture();report=await enforceRetention({...f.options,list:async()=>({keys:[...f.objects.keys()],nextToken:'loop'})});assert.equal(report.error_code,'RETENTION_PAGINATION_LOOP');assert.equal(f.deleted.length,0);
 f=fixture();report=await enforceRetention({...f.options,remove:async()=>{throw Error('HTTP 412');}});assert.equal(report.verified,false);assert.equal(report.deleted_count,0);assert.equal(f.deleted.length,0);
 f=fixture();report=await enforceRetention({...f.options,maxObjects:1});assert.equal(report.error_code,'RETENTION_INVENTORY_LIMIT');assert.equal(f.deleted.length,0);
});
test('S3 listing parser preserves continuation tokens and rejects unsupported XML declarations',()=>{
 assert.deepEqual(parseObjectList(Buffer.from('<ListBucketResult><Contents><Key>native/skygate/a</Key></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;b</NextContinuationToken></ListBucketResult>')),{keys:['native/skygate/a'],nextToken:'a&b'});
 assert.throws(()=>parseObjectList(Buffer.from('<!DOCTYPE x><ListBucketResult/>')),/INVALID/);
 assert.throws(()=>parseObjectList(Buffer.from('<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>')),/INVALID/);
});

test('live backup path signs LIST and conditional DELETE, authenticates SQLite and exports apply receipt',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{DatabaseSync}=await import('node:sqlite');
 const {run,snapshot}=await import('../scripts/native-backup.mjs');
 const dir=await mkdtemp(join(tmpdir(),'retention-integration-')),path=join(dir,'native.sqlite'),now=Math.floor(Date.now()/1000),objects=new Map(),deletes=[];
 const db=new DatabaseSync(path);db.exec('CREATE TABLE native_deployment_identity(singleton INTEGER PRIMARY KEY,identity_json TEXT);CREATE TABLE rounds(id TEXT PRIMARY KEY,payout TEXT)');db.prepare('INSERT INTO native_deployment_identity VALUES(1,?)').run(JSON.stringify(identity));db.exec("INSERT INTO rounds VALUES('settled','42')");db.close();const plaintext=await snapshot(path);
 let number=0;for(const at of [now-401*DAY,now-400*DAY,now-3600]){const b=encrypt(plaintext,'skygate',key,at,{deployment_identity:identity});objects.set(`native/skygate/${at}-${b.manifest.sha256.slice(0,16)}-${String(++number).padStart(16,'0')}.aesgcm`,b.payload);}
 const legacy='native/skygate/1000000000-abcdefabcdefabcd.aesgcm';objects.set(legacy,Buffer.from('never delete legacy'));
 const vars={SKYGATE_AGENCY_DB_PATH:path,ENGINE_BACKUP_KEY_HEX:key.toString('hex'),ENGINE_BACKUP_S3_ENDPOINT:'https://storage.example',ENGINE_BACKUP_S3_BUCKET:'backups',ENGINE_BACKUP_S3_ACCESS_KEY_ID:'test',ENGINE_BACKUP_S3_SECRET_ACCESS_KEY:'test',ENGINE_BACKUP_RETENTION_ENABLED:'true',ENGINE_BACKUP_RETENTION_MODE:'apply'};
 const before=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));Object.assign(process.env,vars);t.mock.method(console,'log',()=>{});
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const u=new URL(url),name=u.pathname.slice(1);assert.ok(options.headers.authorization.startsWith('AWS4-HMAC-SHA256 '));
  if(u.searchParams.get('list-type')==='2'){assert.equal(u.searchParams.get('prefix'),'native/skygate/');return new Response('<ListBucketResult>'+[...objects.keys()].map(k=>'<Contents><Key>'+k+'</Key></Contents>').join('')+'<IsTruncated>false</IsTruncated></ListBucketResult>',{status:200});}
  if(options.method==='PUT'){objects.set(name,Buffer.from(options.body));return new Response('',{status:200});}
  const bytes=objects.get(name),etag='"'+hash(bytes)+'"';
  if(options.method==='DELETE'){assert.equal(options.headers['if-match'],etag);assert.ok(options.headers.authorization.includes('host;if-match;x-amz-content-sha256;x-amz-date'));objects.delete(name);deletes.push(name);return new Response(null,{status:204});}
  return new Response(bytes,{status:200,headers:{etag}});
 });
 try{const result=await run();assert.equal(result.retention.verified,true);assert.equal(result.retention.mode,'apply');assert.equal(result.retention.deleted_count,2);assert.equal(deletes.length,2);assert.ok(objects.has(legacy));assert.ok(objects.has(result.object));assert.equal(objects.size,3);}
 finally{await rm(dir,{recursive:true,force:true});for(const [k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
