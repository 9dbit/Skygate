import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {encrypt,decrypt,snapshot} from '../scripts/native-backup.mjs';
import {backupHealth,writeBackupStatus,startBackupLoop} from '../scripts/native-backup-monitor.mjs';

const SOURCE='a'.repeat(40),HASH='b'.repeat(64),NOW=Date.parse('2026-11-10T00:00:00.000Z');
const marker=()=>({backup_verified:true,source_commit:SOURCE,verified_at:new Date(NOW-1000).toISOString(),
 object:'native/skygate/1794268799-'+HASH.slice(0,16)+'.aesgcm',sha256:HASH});
const failed={ok:false,backup_verified:false};

async function withEnvironment(values,callback){
 const before=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
 Object.assign(process.env,values);
 try{return await callback();}finally{for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}

function scheduler(){
 const scheduled=[],logs=[];
 return {scheduled,logs,
  schedule(callback,delay){const timer={callback,delay,unref(){}};scheduled.push(timer);return timer;},
  cancel(timer){timer.cancelled=true;},
  logger:{log(line){logs.push(JSON.parse(line));},error(line){logs.push(JSON.parse(line));}}};
}

test('encrypted snapshot restores and rejects tampering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-native-test-'));
 try{
  const dbPath=join(dir,'live.sqlite'),db=new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE rounds (id INTEGER PRIMARY KEY, amount INTEGER); INSERT INTO rounds(amount) VALUES (42);');
  const plaintext=await snapshot(dbPath);
  db.close();
  const key=randomBytes(32),{manifest,payload}=encrypt(plaintext,'skygate',key);
  assert.equal(manifest.game,'skygate');
  assert.ok(!payload.includes(Buffer.from('CREATE TABLE rounds')));
  assert.deepEqual(decrypt(payload,key).plaintext,plaintext);
  const tampered=Buffer.from(payload);tampered[tampered.length-1]^=1;
  assert.throws(()=>decrypt(tampered,key));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('health requires fresh source-bound proof and exposes only safe fields',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-proof-test-')),statusFile=join(dir,'status.json');
 const read=options=>backupHealth({statusFile,sourceCommit:SOURCE,enabled:true,clock:()=>NOW,...options});
 try{
  assert.deepEqual(await read(),failed);
  await writeBackupStatus(statusFile,marker());
  assert.deepEqual(await read(),{ok:true,backup_verified:true,verified_at:marker().verified_at,source_commit:SOURCE});
  assert.deepEqual(await read({enabled:false}),failed);
  assert.deepEqual(await read({sourceCommit:''}),failed);
  assert.deepEqual(await read({sourceCommit:'wrong-build'}),failed);
  const cases=[null,[],true,{},
   {...marker(),backup_verified:'true'},
   {...marker(),backup_verified:false},
   {...marker(),source_commit:undefined},
   {...marker(),source_commit:'c'.repeat(40)},
   {...marker(),verified_at:undefined},
   {...marker(),verified_at:123},
   {...marker(),verified_at:'2026-11-10T00:00:00'},
   {...marker(),verified_at:'2026-02-30T00:00:00.000Z'},
   {...marker(),verified_at:new Date(NOW+1).toISOString()},
   {...marker(),verified_at:new Date(NOW-90000001).toISOString()},
   {...marker(),object:''},
   {...marker(),sha256:'not-a-hash'}];
  for(const value of cases){await writeBackupStatus(statusFile,value);assert.deepEqual(await read(),failed);}
  await writeFile(statusFile,'{incomplete');
  assert.deepEqual(await read(),failed);
  await writeBackupStatus(statusFile,{...marker(),verified_at:new Date(NOW-90000000).toISOString(),private_detail:'never expose'});
  assert.deepEqual(await read(),{ok:true,backup_verified:true,verified_at:new Date(NOW-90000000).toISOString(),source_commit:SOURCE});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('atomic status replacement never exposes partial JSON and removes temporary files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-atomic-test-')),statusFile=join(dir,'status.json');
 try{
  await writeBackupStatus(statusFile,marker());
  let done=false;const errors=[];
  const reader=(async()=>{while(!done){try{const value=JSON.parse(await readFile(statusFile,'utf8'));assert.equal(value.source_commit,SOURCE);}catch(error){errors.push(error);}}})();
  try{for(let i=0;i<12;i++)await writeBackupStatus(statusFile,{...marker(),sequence:i});}finally{done=true;await reader;}
  assert.equal(errors.length,0);
  assert.deepEqual(await readdir(dir),['status.json']);
  assert.equal((await stat(statusFile)).mode&0o777,0o600);
  await assert.rejects(writeBackupStatus(dir,marker()));
  assert.deepEqual(await readdir(dir),['status.json']);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('worker persists proof only after actual encrypted snapshot readback and restore',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-worker-test-')),statusFile=join(dir,'status.json'),dbPath=join(dir,'live.sqlite');
 const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE rounds(id INTEGER PRIMARY KEY,amount INTEGER);INSERT INTO rounds(amount) VALUES(42)');db.close();
 const timers=scheduler();let stored,breakReadback=false,puts=0,gets=0,worker;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  assert.ok(options.signal instanceof AbortSignal);
  if(options.method==='PUT'){puts++;stored=Buffer.from(options.body);return new Response('',{status:200});}
  gets++;return new Response(breakReadback?Buffer.from('corrupt remote readback'):stored,{status:200});
 });
 t.mock.method(console,'log',()=>{});
 const environment={SKYGATE_AGENCY_DB_PATH:dbPath,ENGINE_BACKUP_KEY_HEX:randomBytes(32).toString('hex'),
  ENGINE_BACKUP_S3_ENDPOINT:'https://example.invalid',ENGINE_BACKUP_S3_BUCKET:'test-bucket',
  ENGINE_BACKUP_S3_ACCESS_KEY_ID:'test',ENGINE_BACKUP_S3_SECRET_ACCESS_KEY:'test',ENGINE_BACKUP_S3_URL_STYLE:'virtual-host'};
 try{
  await withEnvironment(environment,async()=>{
   worker=startBackupLoop({env:{RAILWAY_GIT_COMMIT_SHA:SOURCE},statusFile,clock:()=>NOW,...timers});
   await worker.firstAttempt;
   assert.equal(puts,1);assert.equal(gets,1);
   assert.deepEqual(await backupHealth({statusFile,sourceCommit:SOURCE,enabled:true,clock:()=>NOW}),
    {ok:true,backup_verified:true,verified_at:new Date(NOW).toISOString(),source_commit:SOURCE});
   assert.equal(timers.scheduled[0].delay,86400000);
   assert.equal(timers.logs.filter(x=>x.event==='engine.backup.remote_verified').length,1);
   breakReadback=true;
   await timers.scheduled[0].callback();
   assert.equal(puts,2);assert.equal(gets,2);
   assert.deepEqual(await backupHealth({statusFile,sourceCommit:SOURCE,enabled:true,clock:()=>NOW}),failed);
   assert.equal(timers.scheduled[1].delay,300000);
   assert.equal(timers.logs.filter(x=>x.event==='engine.backup.remote_verified').length,1);
   assert.equal(timers.logs.at(-1).event,'engine.backup.failed');
  });
 }finally{worker?.stop();await rm(dir,{recursive:true,force:true});}
});

test('worker serializes attempts, rejects incomplete proof and retries in five minutes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-schedule-test-')),statusFile=join(dir,'status.json');
 const timers=scheduler();let resolveBackup,calls=0;
 const pending=new Promise(resolve=>{resolveBackup=resolve;});
 const worker=startBackupLoop({env:{RAILWAY_GIT_COMMIT_SHA:SOURCE,ENGINE_BACKUP_INTERVAL_SECONDS:'1'},
  statusFile,clock:()=>NOW,runBackup:()=>{calls++;return pending;},...timers});
 try{
  // Wait for the start marker; no timer can fire while this attempt is in flight.
  while(calls===0)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(timers.scheduled.length,0);
  assert.deepEqual(await backupHealth({statusFile,sourceCommit:SOURCE,enabled:true,clock:()=>NOW}),failed);
  resolveBackup(undefined);
  await worker.firstAttempt;
  assert.equal(calls,1);
  assert.equal(timers.scheduled[0].delay,300000);
  assert.deepEqual(await backupHealth({statusFile,sourceCommit:SOURCE,enabled:true,clock:()=>NOW}),failed);
  worker.stop();
  await timers.scheduled[0].callback();
  assert.equal(calls,1);
 }finally{worker.stop();resolveBackup?.();await rm(dir,{recursive:true,force:true});}
});

test('invalid source or interval never calls backup and cannot preserve old success',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-config-test-')),statusFile=join(dir,'status.json');
 try{
  for(const env of [{},{RAILWAY_GIT_COMMIT_SHA:SOURCE,ENGINE_BACKUP_INTERVAL_SECONDS:'invalid'},
   {RAILWAY_GIT_COMMIT_SHA:SOURCE,ENGINE_BACKUP_INTERVAL_SECONDS:'3000000'}]){
   await writeBackupStatus(statusFile,marker());
   const timers=scheduler();let calls=0;
   const worker=startBackupLoop({env,statusFile,clock:()=>NOW,runBackup:async()=>{calls++;},...timers});
   try{await worker.firstAttempt;assert.equal(calls,0);assert.equal(timers.scheduled[0].delay,300000);
    assert.deepEqual(await backupHealth({statusFile,sourceCommit:SOURCE,enabled:true,clock:()=>NOW}),failed);
   }finally{worker.stop();}
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
