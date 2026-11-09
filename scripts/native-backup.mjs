// Soft Tech Skygate: encrypted online SQLite backup. Run separately, never from request handlers.
import {backup as sqliteBackup, DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm,mkdir,open,link,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute,dirname} from 'node:path';
import {canonicalPath,requestedIdentity} from '../deployment-identity.mjs';
import {enforceRetention,probeConditionalDeletion} from './native-retention.mjs';

const sha256=x=>createHash('sha256').update(x).digest('hex');
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
function encrypt(plaintext,game,key,createdAt=Math.floor(Date.now()/1000),metadata={}){
 if(key.length!==32)throw Error('ENGINE_BACKUP_KEY_HEX must be 32 bytes');
 const manifest={game,created_at:createdAt,sha256:sha256(plaintext),size:plaintext.length,format:'sqlite-online-backup-v1',key_id:metadata.key_id||'legacy',deployment_identity:metadata.deployment_identity||null};
 const header=Buffer.from(JSON.stringify(manifest));
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(header);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 return {manifest,payload:Buffer.concat([Buffer.from([header.length>>>24,(header.length>>>16)&255,(header.length>>>8)&255,header.length&255]),header,nonce,ciphertext,cipher.getAuthTag()])};
}
function decrypt(payload,key=null,keys=null){
 if(!Buffer.isBuffer(payload)||payload.length<32)throw Error('Invalid backup payload');
 const length=payload.readUInt32BE(0);if(length<1||length>8192)throw Error('Invalid manifest');
 const header=payload.subarray(4,4+length),manifest=JSON.parse(header.toString());
 if(!key){const ring=keys||keyRing(),name=manifest.key_id||'legacy';key=ring[name];if(!key)throw Error('Backup decrypt key unavailable');if(typeof key==='string')key=Buffer.from(key,'hex');}
 const nonce=payload.subarray(4+length,16+length),ciphertext=payload.subarray(16+length,-16),tag=payload.subarray(-16);
 const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAAD(header);decipher.setAuthTag(tag);
 const plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
 if(sha256(plaintext)!==manifest.sha256||plaintext.length!==manifest.size)throw Error('Backup hash mismatch');
 return {manifest,plaintext};
}
async function snapshot(dbPath){
 if(!isAbsolute(dbPath))throw Error('Absolute database path required');
 const dir=await mkdtemp(join(tmpdir(),'skygate-backup-'));
 try{
  const dest=join(dir,'snapshot.sqlite');
  const source=new DatabaseSync(dbPath,{readOnly:true});
  try{await sqliteBackup(source,dest,{rate:128});}finally{source.close();}
  const db=new DatabaseSync(dest,{readOnly:true});
  try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Snapshot integrity failure');}
  finally{db.close();}
  return await readFile(dest);
 }finally{await rm(dir,{recursive:true,force:true});}
}
function signingKey(secret,date,region){let k=hmac('AWS4'+secret,date);k=hmac(k,region);k=hmac(k,'s3');return hmac(k,'aws4_request');}
async function s3Request(method,objectKey='',body,options={}){
 const endpoint=new URL(process.env.ENGINE_BACKUP_S3_ENDPOINT);
 const bucket=process.env.ENGINE_BACKUP_S3_BUCKET;
 const region=process.env.ENGINE_BACKUP_S3_REGION||'auto';
 const access=process.env.ENGINE_BACKUP_S3_ACCESS_KEY_ID,secret=process.env.ENGINE_BACKUP_S3_SECRET_ACCESS_KEY;
 if(!bucket||!access||!secret)throw Error('S3 credentials not configured');
 const url=new URL(endpoint.toString());
 if((process.env.ENGINE_BACKUP_S3_URL_STYLE||'virtual-host')==='virtual-host')url.hostname=bucket+'.'+url.hostname;
 else url.pathname=endpoint.pathname.replace(/\/$/,'')+'/'+encodeURIComponent(bucket);
 url.pathname=url.pathname.replace(/\/$/,'')+'/'+objectKey.split('/').map(encodeURIComponent).join('/');
 const canonicalQuery=Object.entries(options.query||{}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('&');url.search=canonicalQuery;
 const now=new Date(),amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=amzDate.slice(0,8);
 const payloadHash=sha256(body||Buffer.alloc(0));
 const headers={host:url.host,...(options.ifMatch?{'if-match':options.ifMatch}:{}),'x-amz-content-sha256':payloadHash,'x-amz-date':amzDate};
 const signedHeaders=Object.keys(headers).sort().join(';');
 const canonical=method+'\n'+url.pathname+'\n'+canonicalQuery+'\n'+Object.entries(headers).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+':'+v+'\n').join('')+'\n'+signedHeaders+'\n'+payloadHash;
 const scope=date+'/'+region+'/s3/aws4_request';
 const signature=hmac(signingKey(secret,date,region),'AWS4-HMAC-SHA256\n'+amzDate+'\n'+scope+'\n'+sha256(canonical)).toString('hex');
 const authorization='AWS4-HMAC-SHA256 Credential='+access+'/'+scope+', SignedHeaders='+signedHeaders+', Signature='+signature;
 const response=await fetch(url,{method,headers:{...headers,authorization},body:method==='PUT'?body:undefined,signal:AbortSignal.timeout(30000)});
 if(!response.ok){const error=Error('S3 '+method+' returned HTTP '+response.status);error.httpStatus=response.status;throw error;}
 const bytes=Buffer.from(await response.arrayBuffer());return options.metadata?{bytes,etag:response.headers.get('etag')}:bytes;
}
async function run(){
 const {key,name:key_id}=activeKey();
 const plaintext=await snapshot(process.env.SKYGATE_AGENCY_DB_PATH||'');
 const {manifest,payload}=encrypt(plaintext,'skygate',key,Math.floor(Date.now()/1000),{key_id,deployment_identity:snapshotIdentity(process.env.SKYGATE_AGENCY_DB_PATH)});
 const object='native/skygate/'+manifest.created_at+'-'+manifest.sha256.slice(0,16)+'-'+randomBytes(8).toString('hex')+'.aesgcm';
 await s3Request('PUT',object,payload);
 const remote=await s3Request('GET',object);
 if(!remote.equals(payload))throw Error('Remote readback mismatch');
 const restored=decrypt(remote,key);
 const dir=await mkdtemp(join(tmpdir(),'skygate-restore-'));
 try{
  const path=join(dir,'restore.sqlite');await writeFile(path,restored.plaintext);
  const db=new DatabaseSync(path,{readOnly:true});
  try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Restore integrity failure');}
  finally{db.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
 const result={object,manifest,ciphertext_sha256:sha256(payload),key_id,remote_readback:true,isolated_restore:true};
 if(process.env.ENGINE_BACKUP_RETENTION_ENABLED==='true')result.retention=await runRetention(result);
 console.log(JSON.stringify(result));
 return result;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});

const xmlText=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export function parseObjectList(bytes){
 const xml=bytes.toString('utf8');if(!xml.includes('<ListBucketResult')||xml.includes('<!DOCTYPE')||xml.includes('<!ENTITY'))throw Error('RETENTION_INVENTORY_INVALID');
 const keys=[...xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<\/Contents>/g)].map(x=>xmlText(x[1]));
 const truncated=/<IsTruncated>true<\/IsTruncated>/.test(xml),token=xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
 if(truncated&&!token)throw Error('RETENTION_INVENTORY_INVALID');return {keys,nextToken:truncated?xmlText(token):null};
}
export async function runRetention(current,env=process.env){
 const identity=current.manifest.deployment_identity;
 return enforceRetention({game:'skygate',identity,currentObject:current.object,currentCiphertextSha256:current.ciphertext_sha256,
  mode:env.ENGINE_BACKUP_RETENTION_MODE||'dry-run',restoringObject:env.ENGINE_RESTORE_OBJECT_KEY||env.ENGINE_RESTORE_OBJECT||null,
  maxDeletes:Number(env.ENGINE_BACKUP_RETENTION_MAX_DELETES||5),
  probeRequested:env.ENGINE_BACKUP_RETENTION_PROBE==='true',
  checkConditionalDelete:()=>probeConditionalDeletion({game:'skygate',identity,
   put:(key,payload)=>s3Request('PUT',key,payload,{metadata:true}),download:key=>s3Request('GET',key,undefined,{metadata:true}),
   head:key=>s3Request('HEAD',key),remove:(key,etag)=>s3Request('DELETE',key,undefined,{ifMatch:etag})}),
  list:async token=>parseObjectList(await s3Request('GET','',undefined,{query:{'list-type':'2',prefix:'native/skygate/',...(token?{'continuation-token':token}:{})}})),
  download:key=>s3Request('GET',key,undefined,{metadata:true}),remove:(key,etag)=>s3Request('DELETE',key,undefined,{ifMatch:etag}),
  verify:async payload=>{const restored=decrypt(payload);const dir=await mkdtemp(join(tmpdir(),'retention-verify-'));try{const path=join(dir,'snapshot.sqlite');await writeFile(path,restored.plaintext);const db=new DatabaseSync(path,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('RETENTION_INTEGRITY_FAILED');}finally{db.close();}if(!sameIdentity(snapshotIdentity(path),identity))throw Error('RETENTION_FOREIGN_OR_MALFORMED_MANIFEST');return restored.manifest;}finally{await rm(dir,{recursive:true,force:true});}},
  logger:event=>console.log(JSON.stringify(event))});
}

export function keyRing(env=process.env){
 let keys;try{keys=JSON.parse(env.ENGINE_BACKUP_KEYS_JSON||'{}');}catch{throw Error('Invalid backup key ring');}
 if(!keys||typeof keys!=='object'||Array.isArray(keys))throw Error('Backup key ring must be an object');
 if(env.ENGINE_BACKUP_KEY_HEX&&!keys.legacy)keys.legacy=env.ENGINE_BACKUP_KEY_HEX;
 if(!Object.keys(keys).length||Object.entries(keys).some(([name,key])=>!/^[A-Za-z0-9._-]{1,64}$/.test(name)||typeof key!=='string'||!/^[a-fA-F0-9]{64}$/.test(key)))throw Error('Backup key ring must contain named 32-byte keys');
 return Object.fromEntries(Object.entries(keys).map(([name,key])=>[name,Buffer.from(key,'hex')]));
}
export function activeKey(env=process.env){const ring=keyRing(env),name=env.ENGINE_BACKUP_ACTIVE_KEY_ID||'legacy';if(!ring[name])throw Error('Active backup key ID missing from key ring');return {name,key:ring[name]};}
export function snapshotIdentity(path){
 const db=new DatabaseSync(path,{readOnly:true});try{if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='native_deployment_identity'").get())return null;return JSON.parse(db.prepare('SELECT identity_json FROM native_deployment_identity WHERE singleton=1').get().identity_json);}finally{db.close();}
}
const sameIdentity=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
export async function restoreToPath(payload,destination,{key=null,keys=null,expectedIdentity=null}={}){
 if(!isAbsolute(destination))throw Error('Absolute restore destination required');
 if(['','-wal','-shm'].some(suffix=>existsSync(destination+suffix)))throw Error('Restore destination must be empty');
 const {manifest,plaintext}=decrypt(payload,key,keys);
 if(expectedIdentity&&!sameIdentity(manifest.deployment_identity,expectedIdentity))throw Error('BACKUP_DEPLOYMENT_IDENTITY_MISMATCH');
 await mkdir(dirname(destination),{recursive:true});const dir=await mkdtemp(join(dirname(destination),'.native-restore-'));
 try{
  const verified=join(dir,'verified.sqlite');await writeFile(verified,plaintext,{mode:0o600});
  const db=new DatabaseSync(verified,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Restored database integrity failure');}finally{db.close();}
  if(expectedIdentity&&!sameIdentity(snapshotIdentity(verified),expectedIdentity))throw Error('RESTORED_DEPLOYMENT_IDENTITY_MISMATCH');
  const file=await open(verified,'r');try{await file.sync();}finally{await file.close();}
  await link(verified,destination);const directory=await open(dirname(destination),'r');try{await directory.sync();}finally{await directory.close();}
  return manifest;
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function restoreFromRemote(env=process.env){
 const object=env.ENGINE_RESTORE_OBJECT_KEY||env.ENGINE_RESTORE_OBJECT;if(!object)return null;
 const destination=canonicalPath(env.SKYGATE_AGENCY_DB_PATH,env),identity=requestedIdentity(env,'skygate-5000');
 const hash=env.ENGINE_RESTORE_CIPHERTEXT_SHA256||'';
 if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Expected restore ciphertext SHA-256 required');
 if(env.ENGINE_RESTORE_CONFIRM_DEPLOYMENT_ID!==identity.deployment_id)throw Error('Explicit restore deployment confirmation required');
 if(!/^native\/skygate\/[A-Za-z0-9._-]+$/.test(object))throw Error('Invalid restore object scope');
 const markerPath=join(dirname(destination),'.native-restore.json'),expected={object,ciphertext_sha256:hash,deployment_identity:identity};
 if(existsSync(destination)){
  let recorded;try{recorded=JSON.parse(await readFile(markerPath,'utf8'));}catch{throw Error('Restore requested on unmarked existing database');}
  if(recorded.object!==object||recorded.ciphertext_sha256!==hash||!sameIdentity(recorded.deployment_identity,identity)||!sameIdentity(snapshotIdentity(destination),identity))throw Error('Existing restored database identity or marker mismatch');
  return null;
 }
 await mkdir(dirname(destination),{recursive:true});
 if((await readdir(dirname(destination))).some(name=>name!=='lost+found'))throw Error('Restore requires an empty replacement volume');
 const start=performance.now(),payload=await s3Request('GET',object);
 if(sha256(payload)!==hash)throw Error('Remote restore ciphertext hash mismatch');
 const manifest=await restoreToPath(payload,destination,{keys:keyRing(env),expectedIdentity:identity});
 const marker=await open(markerPath,'wx',0o600);try{await marker.writeFile(JSON.stringify(expected));await marker.sync();}finally{await marker.close();}
 const directory=await open(dirname(destination),'r');try{await directory.sync();}finally{await directory.close();}
 console.log(JSON.stringify({event:'engine.restore.completed',game:'skygate',object,ciphertext_sha256:hash,snapshot_created_at:manifest.created_at,rto_restore_seconds:(performance.now()-start)/1000}));
 return manifest;
}
export {encrypt,decrypt,snapshot,run};
