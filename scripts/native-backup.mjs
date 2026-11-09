// Soft Tech Skygate: encrypted online SQLite backup. Run separately, never from request handlers.
import {backup as sqliteBackup, DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';

const sha256=x=>createHash('sha256').update(x).digest('hex');
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
function encrypt(plaintext,game,key,createdAt=Math.floor(Date.now()/1000)){
 if(key.length!==32)throw Error('ENGINE_BACKUP_KEY_HEX must be 32 bytes');
 const manifest={game,created_at:createdAt,sha256:sha256(plaintext),size:plaintext.length,format:'sqlite-online-backup-v1'};
 const header=Buffer.from(JSON.stringify(manifest));
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(header);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 return {manifest,payload:Buffer.concat([Buffer.from([header.length>>>24,(header.length>>>16)&255,(header.length>>>8)&255,header.length&255]),header,nonce,ciphertext,cipher.getAuthTag()])};
}
function decrypt(payload,key){
 const length=payload.readUInt32BE(0);if(length<1||length>8192)throw Error('Invalid manifest');
 const header=payload.subarray(4,4+length),manifest=JSON.parse(header.toString());
 const nonce=payload.subarray(4+length,16+length),ciphertext=payload.subarray(16+length,-16),tag=payload.subarray(-16);
 const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAAD(header);decipher.setAuthTag(tag);
 const plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
 if(sha256(plaintext)!==manifest.sha256)throw Error('Backup hash mismatch');
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
async function s3Request(method,objectKey,body){
 const endpoint=new URL(process.env.ENGINE_BACKUP_S3_ENDPOINT);
 const bucket=process.env.ENGINE_BACKUP_S3_BUCKET;
 const region=process.env.ENGINE_BACKUP_S3_REGION||'auto';
 const access=process.env.ENGINE_BACKUP_S3_ACCESS_KEY_ID,secret=process.env.ENGINE_BACKUP_S3_SECRET_ACCESS_KEY;
 if(!bucket||!access||!secret)throw Error('S3 credentials not configured');
 const url=new URL(endpoint.toString());
 if((process.env.ENGINE_BACKUP_S3_URL_STYLE||'virtual-host')==='virtual-host')url.hostname=bucket+'.'+url.hostname;
 else url.pathname=endpoint.pathname.replace(/\/$/,'')+'/'+encodeURIComponent(bucket);
 url.pathname=url.pathname.replace(/\/$/,'')+'/'+objectKey.split('/').map(encodeURIComponent).join('/');
 const now=new Date(),amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=amzDate.slice(0,8);
 const payloadHash=sha256(body||Buffer.alloc(0));
 const signedHeaders='host;x-amz-content-sha256;x-amz-date';
 const headers={host:url.host,'x-amz-content-sha256':payloadHash,'x-amz-date':amzDate};
 const canonical=method+'\n'+url.pathname+'\n\n'+Object.entries(headers).map(([k,v])=>k+':'+v+'\n').join('')+'\n'+signedHeaders+'\n'+payloadHash;
 const scope=date+'/'+region+'/s3/aws4_request';
 const signature=hmac(signingKey(secret,date,region),'AWS4-HMAC-SHA256\n'+amzDate+'\n'+scope+'\n'+sha256(canonical)).toString('hex');
 const authorization='AWS4-HMAC-SHA256 Credential='+access+'/'+scope+', SignedHeaders='+signedHeaders+', Signature='+signature;
 const response=await fetch(url,{method,headers:{...headers,authorization},body:method==='PUT'?body:undefined});
 if(!response.ok)throw Error('S3 '+method+' returned HTTP '+response.status);
 return Buffer.from(await response.arrayBuffer());
}
async function run(){
 const key=Buffer.from(process.env.ENGINE_BACKUP_KEY_HEX||'','hex');
 const plaintext=await snapshot(process.env.SKYGATE_AGENCY_DB_PATH||'');
 const {manifest,payload}=encrypt(plaintext,'skygate',key);
 const object='native/skygate/'+manifest.created_at+'-'+manifest.sha256.slice(0,16)+'.aesgcm';
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
 console.log(JSON.stringify({object,manifest,remote_readback:true,isolated_restore:true}));
}
if(import.meta.url===new URL('file://'+process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});
export {encrypt,decrypt,snapshot};
