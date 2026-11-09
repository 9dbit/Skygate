// Reproducible synthetic measurement: real local HTTP, disposable SQLite/files only.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run,restoreFromRemote} from '../../scripts/native-backup.mjs';
import {hashFile} from '../../scripts/native-backup-stream.mjs';

const mib=Number(process.argv[2]);assert.ok(Number.isSafeInteger(mib)&&mib>=1&&mib<=1024);
const root=await mkdtemp(join(tmpdir(),'skygate-stream-memory-')),source=join(root,'source'),replacement=join(root,'replacement');
const identity={environment:'sandbox',deployment_id:'disposable-memory-fixture',core_deployment_id:'disposable-core',game_id:'skygate-5000',identity_version:1};
const objects=new Map(),transport={put:0,get:0,conditional_rejections:0},stages={};let server,timer,stage='snapshot-encrypt';
try{
 await mkdir(source);await mkdir(replacement);const dbPath=join(source,'native.sqlite'),db=new DatabaseSync(dbPath);
 db.exec('PRAGMA cache_size=-2048; CREATE TABLE native_deployment_identity(singleton INTEGER PRIMARY KEY,identity_json TEXT NOT NULL); CREATE TABLE fixture_records(id INTEGER PRIMARY KEY,record BLOB NOT NULL)');
 db.prepare('INSERT INTO native_deployment_identity VALUES(1,?)').run(JSON.stringify(identity));
 db.exec('BEGIN');const insert=db.prepare('INSERT INTO fixture_records(record) VALUES(zeroblob(1048576))');
 for(let n=0;n<mib;n++)insert.run();db.exec('COMMIT');db.close();
 server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://localhost'),key=decodeURIComponent(url.pathname.replace(/^\/fixture\//,'')),method=request.method;
   if(method==='GET'&&url.searchParams.get('list-type')==='2'){
    const prefix=url.searchParams.get('prefix')||'';response.end('<ListBucketResult><IsTruncated>false</IsTruncated>'+[...objects.keys()].filter(k=>k.startsWith(prefix)).map(k=>'<Contents><Key>'+k+'</Key></Contents>').join('')+'</ListBucketResult>');return;
   }
   if(method==='PUT'){
    transport.put++;stage='put-'+transport.put;assert.match(request.headers.authorization,/AWS4-HMAC-SHA256/);
    const path=join(root,'object-'+createHash('sha256').update(key).digest('hex'));
    await pipeline(request,createWriteStream(path,{mode:0o600}));const digest=await hashFile(path),etag='"'+digest.sha256+'"';
    assert.equal(request.headers['x-amz-content-sha256'],digest.sha256);assert.equal(Number(request.headers['content-length']),digest.size);
    objects.set(key,{path,etag,size:digest.size});response.writeHead(200,{etag});response.end();return;
   }
   const object=objects.get(key);if(!object){response.writeHead(404);response.end();return;}
   if(method==='DELETE'){
    if(request.headers['if-match']!==object.etag){transport.conditional_rejections++;response.writeHead(412);response.end();return;}
    await rm(object.path);objects.delete(key);response.writeHead(204);response.end();return;
   }
   response.writeHead(200,{etag:object.etag,'content-length':String(object.size)});
   if(method==='HEAD'){response.end();return;}
   assert.equal(method,'GET');transport.get++;stage='get-'+transport.get;await pipeline(createReadStream(object.path,{highWaterMark:65536}),response);
  }catch(error){if(!response.headersSent)response.writeHead(500);response.destroy(error);process.stderr.write(String(error.stack)+'\n');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 Object.assign(process.env,{SKYGATE_AGENCY_DB_PATH:dbPath,AGENCY_ENVIRONMENT:identity.environment,AGENCY_DEPLOYMENT_ID:identity.deployment_id,AGENCY_CORE_DEPLOYMENT_ID:identity.core_deployment_id,
  ENGINE_BACKUP_KEY_HEX:'a5'.repeat(32),ENGINE_BACKUP_KEYS_JSON:'{}',ENGINE_BACKUP_ACTIVE_KEY_ID:'legacy',ENGINE_BACKUP_S3_ENDPOINT:'http://127.0.0.1:'+server.address().port,
  ENGINE_BACKUP_S3_BUCKET:'fixture',ENGINE_BACKUP_S3_URL_STYLE:'path',ENGINE_BACKUP_S3_ACCESS_KEY_ID:'fixture',ENGINE_BACKUP_S3_SECRET_ACCESS_KEY:'fixture',
  ENGINE_BACKUP_RETENTION_ENABLED:'true',ENGINE_BACKUP_RETENTION_MODE:'apply',ENGINE_BACKUP_RETENTION_PROBE:'true'});
 const baseline=process.memoryUsage().rss,baselinePeak=process.resourceUsage().maxRSS,start=performance.now();let maxExternal=0;
 timer=setInterval(()=>{const memory=process.memoryUsage();maxExternal=Math.max(maxExternal,memory.external);if(!stages[stage]||memory.rss>stages[stage].rss)stages[stage]={rss:memory.rss,external:memory.external,array_buffers:memory.arrayBuffers};},10);timer.unref();
 const log=console.log;let result,restored;
 try{
  console.log=()=>{};
  result=await run();
  Object.assign(process.env,{SKYGATE_AGENCY_DB_PATH:join(replacement,'native.sqlite'),ENGINE_RESTORE_OBJECT_KEY:result.object,ENGINE_RESTORE_CIPHERTEXT_SHA256:result.ciphertext_sha256,ENGINE_RESTORE_CONFIRM_DEPLOYMENT_ID:identity.deployment_id});
  restored=await restoreFromRemote();
 }finally{console.log=log;}
 clearInterval(timer);timer=null;
 assert.equal(result.remote_readback,true);assert.equal(result.isolated_restore,true);assert.equal(result.retention.verified,true);assert.equal(result.retention.conditional_delete_verified,true);
 assert.equal(restored.sha256,result.manifest.sha256);
 const recovered=new DatabaseSync(join(replacement,'native.sqlite'),{readOnly:true});try{assert.equal(recovered.prepare('SELECT COUNT(*) AS n FROM fixture_records').get().n,mib);}finally{recovered.close();}
 const peak=process.resourceUsage().maxRSS;
 console.log(JSON.stringify({requested_mib:mib,snapshot_bytes:result.manifest.size,baseline_rss_kib:baseline/1024,baseline_peak_kib:baselinePeak,peak_rss_kib:peak,
  incremental_peak_kib:peak-baseline/1024,incremental_to_snapshot_ratio:Number(((peak*1024-baseline)/result.manifest.size).toFixed(3)),max_external_kib:Math.round(maxExternal/1024),elapsed_seconds:Number(((performance.now()-start)/1000).toFixed(3)),
  backup_verified:true,retention_verified:true,empty_volume_restore_verified:true,transport:'real local HTTP, disposable file-backed S3 fixture',http:transport,...(process.env.BACKUP_MEMORY_PROFILE==='true'?{stages}:{})}));
}finally{if(timer)clearInterval(timer);if(server)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
