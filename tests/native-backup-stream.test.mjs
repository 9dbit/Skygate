import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,readdir,stat,copyFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {encrypt,decrypt,restoreToPath} from '../scripts/native-backup.mjs';
import {snapshotFile,encryptFile,decryptFile,restoreFileToPath,verifyDatabase,responseToFile,responseBytes} from '../scripts/native-backup-stream.mjs';
import {enforceRetention} from '../scripts/native-retention.mjs';

const key=randomBytes(32),identity={environment:'preproduction',deployment_id:'streaming-native-fixture',core_deployment_id:'streaming-core-fixture',game_id:'skygate-5000',identity_version:1};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(callback){
 const dir=await mkdtemp(join(tmpdir(),'skygate-stream-test-')),path=join(dir,'source.sqlite'),db=new DatabaseSync(path);
 try{
  db.exec('CREATE TABLE native_deployment_identity(singleton INTEGER PRIMARY KEY,identity_json TEXT); CREATE TABLE rounds(id TEXT PRIMARY KEY,payout TEXT,payload BLOB)');
  db.prepare('INSERT INTO native_deployment_identity VALUES(1,?)').run(JSON.stringify(identity));db.exec("INSERT INTO rounds VALUES('settled','42',zeroblob(200000))");
 }finally{db.close();}
 try{return await callback({dir,path});}finally{await rm(dir,{recursive:true,force:true});}
}
test('streamed v1 archives interoperate with byte archives, preserve identity and old key-ring decryptability',async()=>fixture(async({dir,path})=>{
 const snapshot=join(dir,'snapshot.sqlite');await snapshotFile(path,snapshot);
 const source=await readFile(snapshot),fresh=await encryptFile(snapshot,join(dir,'new.aesgcm'),{game:'skygate',key,keyId:'rotated',identity});
 const wire=await readFile(fresh.path),decoded=decrypt(wire,null,{rotated:key});assert.deepEqual(decoded.plaintext,source);assert.equal(fresh.sha256,sha(wire));assert.equal(fresh.size,wire.length);
 assert.equal(wire.length,32+wire.readUInt32BE(0)+source.length);assert.deepEqual(decoded.manifest.deployment_identity,identity);
 const legacy=encrypt(source,'skygate',key,1794268800,{deployment_identity:identity}),oldPath=join(dir,'old.aesgcm');await writeFile(oldPath,legacy.payload);
 const restored=await decryptFile(oldPath,join(dir,'old.sqlite'),{keys:{legacy:key,rotated:randomBytes(32)}});assert.deepEqual(await readFile(restored.path),source);
 assert.deepEqual(verifyDatabase(restored.path,{expectedIdentity:identity,manifestIdentity:restored.manifest.deployment_identity}),identity);
 await assert.rejects(decryptFile(oldPath,join(dir,'unavailable.sqlite'),{keys:{rotated:key}}),/unavailable/);
 const published=join(dir,'published.sqlite');await restoreFileToPath(fresh.path,published,{keys:{rotated:key},expectedIdentity:identity});assert.deepEqual(await readFile(published),source);assert.equal((await stat(published)).mode&0o777,0o600);
 await restoreToPath(legacy.payload,join(dir,'byte-api.sqlite'),{key,expectedIdentity:identity});
}));
test('tampered, truncated, wrong-key and identity-mismatched streams never publish or retain plaintext',async()=>fixture(async({dir,path})=>{
 const archive=await encryptFile(path,join(dir,'archive.aesgcm'),{game:'skygate',key,identity}),wire=await readFile(archive.path);
 const cases=[['tag',bytes=>{bytes[bytes.length-1]^=1;return bytes;}],['ciphertext',bytes=>{bytes[bytes.length-100]^=1;return bytes;}],['truncated',bytes=>bytes.subarray(0,-1)],['appended',bytes=>Buffer.concat([bytes,Buffer.from([0])])],['manifest',bytes=>{bytes[4+bytes.subarray(4).indexOf(Buffer.from('preproduction'))]^=1;return bytes;}]];
 for(const [name,mutate]of cases){const payload=join(dir,name+'.aesgcm'),out=join(dir,name+'.sqlite');await writeFile(payload,mutate(Buffer.from(wire)));await assert.rejects(decryptFile(payload,out,{key}),undefined,name);await assert.rejects(stat(out),{code:'ENOENT'});await assert.rejects(restoreFileToPath(payload,out,{key,expectedIdentity:identity}));await assert.rejects(stat(out),{code:'ENOENT'});}
 await assert.rejects(decryptFile(archive.path,join(dir,'wrong-key.sqlite'),{key:randomBytes(32)}));await assert.rejects(stat(join(dir,'wrong-key.sqlite')),{code:'ENOENT'});
 const foreign={...identity,deployment_id:'other-native-fixture'},mislabeled=await encryptFile(path,join(dir,'mislabeled.aesgcm'),{game:'skygate',key,identity:foreign});
 await assert.rejects(restoreFileToPath(mislabeled.path,join(dir,'wrong-manifest.sqlite'),{key,expectedIdentity:identity}),/BACKUP_DEPLOYMENT/);
 await assert.rejects(restoreFileToPath(mislabeled.path,join(dir,'wrong-database.sqlite'),{key,expectedIdentity:foreign}),/RESTORED_DEPLOYMENT/);
 const junk=join(dir,'not-sqlite');await writeFile(junk,'authenticated but not a database');const invalid=await encryptFile(junk,join(dir,'invalid.aesgcm'),{game:'skygate',key,identity});
 await assert.rejects(restoreFileToPath(invalid.path,join(dir,'invalid.sqlite'),{key,expectedIdentity:identity}));
 assert.equal((await readdir(dir)).some(name=>name.startsWith('.native-restore-')),false);
 for(const name of ['wrong-manifest.sqlite','wrong-database.sqlite','invalid.sqlite'])await assert.rejects(stat(join(dir,name)),{code:'ENOENT'});
}));
test('file snapshot, encryption, decryption and publication refuse every occupied output including dangling links and sidecars',async()=>fixture(async({dir,path})=>{
 const archive=await encryptFile(path,join(dir,'archive.aesgcm'),{game:'skygate',key,identity}),sentinel=Buffer.from('must remain byte identical');
 for(const operation of [out=>snapshotFile(path,out),out=>encryptFile(path,out,{game:'skygate',key,identity}),out=>decryptFile(archive.path,out,{key}),out=>restoreFileToPath(archive.path,out,{key,expectedIdentity:identity})]){
  const out=join(dir,'occupied');await writeFile(out,sentinel);await assert.rejects(operation(out));assert.deepEqual(await readFile(out),sentinel);await rm(out);
 }
 for(const suffix of ['-wal','-shm','-journal']){const out=join(dir,'sidecar');await writeFile(out+suffix,sentinel);await assert.rejects(restoreFileToPath(archive.path,out,{key,expectedIdentity:identity}),/empty/);assert.deepEqual(await readFile(out+suffix),sentinel);await assert.rejects(stat(out),{code:'ENOENT'});await rm(out+suffix);}
 const out=join(dir,'dangling');await symlink(join(dir,'nonexistent-target'),out);await assert.rejects(restoreFileToPath(archive.path,out,{key,expectedIdentity:identity}),/empty/);await assert.rejects(stat(join(dir,'nonexistent-target')),{code:'ENOENT'});
 const race=join(dir,'racing.sqlite'),results=await Promise.allSettled([restoreFileToPath(archive.path,race,{key,expectedIdentity:identity}),restoreFileToPath(archive.path,race,{key,expectedIdentity:identity})]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);assert.deepEqual(await readFile(race),await readFile(path));
}));
test('file-backed retention authenticates all proofs, cleans each before the next download, and blocks deletion on corrupt input',async()=>fixture(async({dir,path})=>{
 const now=Math.floor(Date.now()/1000),objects=new Map();let sequence=0;
 for(const age of [0,3600,400*86400,401*86400]){const item=await encryptFile(path,join(dir,'object-'+sequence+'.aesgcm'),{game:'skygate',key,identity,createdAt:now-age});const object=`native/skygate/${item.manifest.created_at}-${item.manifest.sha256.slice(0,16)}-${String(++sequence).padStart(16,'0')}.aesgcm`;objects.set(object,{...item,etag:'"'+item.sha256+'"'});}
 const current=[...objects.keys()][0];
 for(const corrupt of [false,true]){
  let outstanding=0,downloaded=0,cleaned=0;const deleted=[];
  const report=await enforceRetention({game:'skygate',identity,currentObject:current,currentCiphertextSha256:objects.get(current).sha256,now,mode:'apply',list:async()=>({keys:[...objects.keys()],nextToken:null}),
   download:async object=>{assert.equal(outstanding,0);outstanding++;downloaded++;const folder=await mkdtemp(join(dir,'download-')),destination=join(folder,'archive');await copyFile(objects.get(object).path,destination);if(corrupt&&downloaded===2){const bytes=await readFile(destination);bytes[bytes.length-1]^=1;await writeFile(destination,bytes);}return {path:destination,etag:objects.get(object).etag,cleanup:async()=>{await rm(folder,{recursive:true,force:true});outstanding--;cleaned++;}};},
   verify:async item=>{const folder=await mkdtemp(join(dir,'verify-'));try{const result=await decryptFile(item.path,join(folder,'restored.sqlite'),{key});verifyDatabase(result.path,{expectedIdentity:identity,manifestIdentity:result.manifest.deployment_identity});return result.manifest;}finally{await rm(folder,{recursive:true,force:true});}},
   checkConditionalDelete:async()=>({verified:true}),remove:async(object,etag)=>{assert.equal(outstanding,0);assert.equal(etag,objects.get(object).etag);deleted.push(object);}});
  assert.equal(report.verified,!corrupt);assert.equal(outstanding,0);assert.equal(downloaded,cleaned);assert.equal(deleted.length,corrupt?0:2);
  assert.equal((await readdir(dir)).some(name=>name.startsWith('download-')||name.startsWith('verify-')),false);
 }
}));
test('truncated or oversized network control responses fail with no retained partial download',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-download-test-'));
 try{
  const out=join(dir,'partial');await assert.rejects(responseToFile(new Response('short',{headers:{'content-length':'100'}}),out),/Incomplete/);await assert.rejects(stat(out),{code:'ENOENT'});
  const failure=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(65536));controller.error(Error('network stream interrupted'));}});
  await assert.rejects(responseToFile(new Response(failure),out),/interrupted/);await assert.rejects(stat(out),{code:'ENOENT'});
  await assert.rejects(responseBytes(new Response('too long'),3),/exceeds/);
  const response=await responseToFile(new Response('complete'),out);assert.equal(response.sha256,sha(Buffer.from('complete')));assert.equal(response.size,8);assert.equal((await stat(out)).mode&0o777,0o600);
  let cancelled=false;const pending=new ReadableStream({cancel(){cancelled=true;}});await assert.rejects(responseToFile(new Response(pending),out),{code:'EEXIST'});assert.equal(cancelled,true);assert.equal((await readFile(out)).toString(),'complete');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('64 and 128 MiB backup/readback/retention/empty-volume restore keep bounded RSS using real streaming HTTP',async t=>{
 const worker=join(dirname(fileURLToPath(import.meta.url)),'helpers/backup-memory-worker.mjs'),reports=[];
 // Includes the Node HTTP fixture server and Undici allocator overhead in this process.
 for(const mib of [64,128]){const {stdout}=await promisify(execFile)(process.execPath,[worker,String(mib)],{timeout:120000,maxBuffer:1024*1024});const report=JSON.parse(stdout.trim());reports.push(report);t.diagnostic(JSON.stringify(report));assert.ok(report.incremental_peak_kib<128*1024,`incremental RSS ${report.incremental_peak_kib} KiB must stay below 128 MiB`);assert.equal(report.backup_verified,true);assert.equal(report.retention_verified,true);assert.equal(report.empty_volume_restore_verified,true);assert.equal(report.http.conditional_rejections,1);}
 assert.ok(reports[1].peak_rss_kib-reports[0].peak_rss_kib<32*1024,'doubling the archive must not add more than 32 MiB peak RSS');
});
