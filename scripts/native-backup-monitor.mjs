// Persist verified backup evidence without exposing storage details publicly.
import {open,readFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {basename,dirname,join} from 'node:path';

export const BACKUP_STATUS_FILE='/data/skygate-backup-status.json';
const MAX_AGE_MS=90000*1000;
const RETRY_MS=300*1000;
const SHA_RE=/^[a-f0-9]{40}$/;
const HASH_RE=/^[a-f0-9]{64}$/;
const unverified=()=>({ok:false,backup_verified:false});

export async function writeBackupStatus(statusFile,marker){
 const payload=JSON.stringify(marker);
 const temporary=join(dirname(statusFile),'.'+basename(statusFile)+'.'+randomUUID()+'.tmp');
 let file;
 try{
  file=await open(temporary,'wx',0o600);
  await file.writeFile(payload);
  await file.sync();
  await file.close();file=null;
  await rename(temporary,statusFile);
  const directory=await open(dirname(statusFile),'r');
  try{await directory.sync();}finally{await directory.close();}
 }finally{
  if(file)await file.close().catch(()=>{});
  await rm(temporary,{force:true}).catch(()=>{});
 }
}

function validObject(object,hash){
 return typeof object==='string'&&typeof hash==='string'&&HASH_RE.test(hash)&&
  new RegExp('^native/skygate/[0-9]+-'+hash.slice(0,16)+'(?:-[a-f0-9]{16})?\\.aesgcm$').test(object);
}

export async function backupHealth({statusFile=BACKUP_STATUS_FILE,
 sourceCommit=process.env.RAILWAY_GIT_COMMIT_SHA||'',
 enabled=process.env.ENGINE_BACKUP_ENABLED==='true',clock=Date.now}={}){
 if(enabled!==true||typeof sourceCommit!=='string'||!SHA_RE.test(sourceCommit))return unverified();
 try{
  const marker=JSON.parse(await readFile(statusFile,'utf8'));
  if(!marker||Array.isArray(marker)||typeof marker!=='object'||marker.backup_verified!==true||
   marker.source_commit!==sourceCommit||!validObject(marker.object,marker.sha256)||
   typeof marker.verified_at!=='string')return unverified();
  const verifiedAt=Date.parse(marker.verified_at);
  if(!Number.isFinite(verifiedAt)||new Date(verifiedAt).toISOString()!==marker.verified_at)return unverified();
  const age=clock()-verifiedAt;
  if(!Number.isFinite(age)||age<0||age>MAX_AGE_MS)return unverified();
  const result={ok:true,backup_verified:true,verified_at:marker.verified_at,source_commit:marker.source_commit};
  if(marker.retention?.enabled===true)result.retention=Object.fromEntries(['policy','enabled','mode','effective_mode','verified','verified_at','eligible_count','deleted_count','conditional_delete_verified','conditional_delete','error_code'].map(key=>[key,marker.retention[key]??null]));
  return result;
 }catch{return unverified();}
}

function validResult(result){
 return result?.remote_readback===true&&result?.isolated_restore===true&&
  result?.manifest?.game==='skygate'&&result.manifest.format==='sqlite-online-backup-v1'&&
  Number.isSafeInteger(result.manifest.created_at)&&result.manifest.created_at>=0&&
  Number.isSafeInteger(result.manifest.size)&&result.manifest.size>0&&
  validObject(result.object,result.manifest.sha256);
}

export function startBackupLoop({env=process.env,statusFile=BACKUP_STATUS_FILE,
 runBackup=async()=>{const {run}=await import('./native-backup.mjs');return run();},
 clock=Date.now,schedule=setTimeout,cancel=clearTimeout,logger=console}={}){
 const intervalMs=Math.max(3600,Number(env.ENGINE_BACKUP_INTERVAL_SECONDS||86400))*1000;
 const sourceCommit=env.RAILWAY_GIT_COMMIT_SHA||'';
 let stopped=false,running=false,timer=null;
 const attempt=async()=>{
  if(stopped||running)return;
  running=true;timer=null;
  let delay=RETRY_MS;
  try{
   if(!Number.isSafeInteger(intervalMs)||intervalMs>2147483647)throw Error('Invalid ENGINE_BACKUP_INTERVAL_SECONDS');
   if(typeof sourceCommit!=='string'||!SHA_RE.test(sourceCommit))throw Error('RAILWAY_GIT_COMMIT_SHA is required for backup proof');
   // A process crash during a new attempt must not retain a green old marker.
   await writeBackupStatus(statusFile,{backup_verified:false,source_commit:sourceCommit,started_at:new Date(clock()).toISOString()});
   const result=await runBackup();
   if(!validResult(result))throw Error('Backup verification evidence is incomplete');
   const marker={backup_verified:true,source_commit:sourceCommit,verified_at:new Date(clock()).toISOString(),
    object:result.object,sha256:result.manifest.sha256,ciphertext_sha256:result.ciphertext_sha256||null,
    size_bytes:result.manifest.size,encrypted_size_bytes:result.encrypted_size_bytes??null,key_id:result.key_id||'legacy',retention:result.retention||null};
   await writeBackupStatus(statusFile,marker);
   logger.log(JSON.stringify({event:'engine.backup.remote_verified',game:'skygate',
    object:marker.object,sha256:marker.sha256,ciphertext_sha256:marker.ciphertext_sha256,size_bytes:marker.size_bytes,encrypted_size_bytes:marker.encrypted_size_bytes,key_id:marker.key_id,verified_at:marker.verified_at}));
   delay=intervalMs;
  }catch(error){
   try{
    await writeBackupStatus(statusFile,{backup_verified:false,source_commit:sourceCommit,
     failed_at:new Date(clock()).toISOString(),error_type:error?.name||'Error'});
   }catch(statusError){logger.error(JSON.stringify({event:'engine.backup.status_failed',game:'skygate',error_type:statusError?.name||'Error'}));}
   logger.error(JSON.stringify({event:'engine.backup.failed',game:'skygate',error_type:error?.name||'Error',error:String(error?.message||error).slice(0,160)}));
  }finally{
   running=false;
   if(!stopped){timer=schedule(attempt,delay);timer?.unref?.();}
  }
 };
 const firstAttempt=attempt();
 return {firstAttempt,stop(){stopped=true;if(timer!==null)cancel(timer);}};
}
