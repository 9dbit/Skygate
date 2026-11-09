// File-backed v1 archives. Unauthenticated plaintext stays private until GCM final succeeds.
import {backup as sqliteBackup,DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {open,rm,mkdir,mkdtemp,link,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,isAbsolute,join} from 'node:path';

export const STREAM_CHUNK_BYTES=64*1024;
const MAX_MANIFEST_BYTES=8192;
const MAX_CONTROL_BYTES=1024*1024;
export const sameIdentity=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);

async function writeAll(file,bytes){
 for(let offset=0;offset<bytes.length;){const {bytesWritten}=await file.write(bytes,offset,bytes.length-offset);if(!bytesWritten)throw Error('Backup file write made no progress');offset+=bytesWritten;}
}
async function readExactly(file,bytes,position){
 for(let offset=0;offset<bytes.length;){const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,position+offset);if(!bytesRead)throw Error('Truncated backup payload');offset+=bytesRead;}
 return bytes;
}
async function readChunks(file,start,end,consume){
 const buffer=Buffer.allocUnsafe(STREAM_CHUNK_BYTES);
 for(let position=start;position<end;){const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,end-position),position);if(!bytesRead)throw Error('Backup file changed while reading');await consume(buffer.subarray(0,bytesRead));position+=bytesRead;}
}
async function openInput(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await file.stat();if(!stat.isFile()||!Number.isSafeInteger(stat.size))throw Error('Regular backup file required');return {file,size:stat.size};}catch(error){await file.close();throw error;}
}
async function closeFiles(files,removePath=null){
 const results=await Promise.allSettled(files.filter(Boolean).map(file=>file.close()));
 if(removePath)await rm(removePath,{force:true});
 const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
}
export async function hashFile(path){
 const {file,size}=await openInput(path),hash=createHash('sha256');
 try{await readChunks(file,0,size,chunk=>hash.update(chunk));return {sha256:hash.digest('hex'),size};}finally{await file.close();}
}
function readDatabase(path,callback){
 const db=new DatabaseSync(path,{readOnly:true});
 try{db.exec('PRAGMA mmap_size=0; PRAGMA cache_size=-2048');return callback(db);}finally{db.close();}
}
function identityFromDatabase(db){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='native_deployment_identity'").get())return null;
 const row=db.prepare('SELECT identity_json FROM native_deployment_identity WHERE singleton=1').get();
 if(!row)throw Error('Native deployment identity is missing');
 return JSON.parse(row.identity_json);
}
export const databaseIdentity=path=>readDatabase(path,identityFromDatabase);
export function verifyDatabase(path,{expectedIdentity=null,manifestIdentity=null}={}){
 return readDatabase(path,db=>{
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Restored database integrity failure');
  const identity=identityFromDatabase(db);
  if(manifestIdentity&&!sameIdentity(identity,manifestIdentity))throw Error('RESTORED_DEPLOYMENT_IDENTITY_MISMATCH');
  if(expectedIdentity&&!sameIdentity(identity,expectedIdentity))throw Error('RESTORED_DEPLOYMENT_IDENTITY_MISMATCH');
  return identity;
 });
}
export async function snapshotFile(sourcePath,destination){
 if(!isAbsolute(sourcePath)||!isAbsolute(destination))throw Error('Absolute database path required');
 // Reserve a fresh path before SQLite opens it; never overwrite a caller's file.
 const reserved=await open(destination,'wx',0o600);await reserved.close();
 try{
  const source=new DatabaseSync(sourcePath,{readOnly:true});
  try{source.exec('PRAGMA mmap_size=0; PRAGMA cache_size=-2048');await sqliteBackup(source,destination,{rate:128});}finally{source.close();}
  verifyDatabase(destination);return destination;
 }catch(error){await rm(destination,{force:true});throw error;}
}
function manifestFor({game,keyId,createdAt,identity},digest){
 return {game,created_at:createdAt,sha256:digest.sha256,size:digest.size,format:'sqlite-online-backup-v1',key_id:keyId||'legacy',deployment_identity:identity||null};
}
function validManifest(manifest){
 if(!manifest||Array.isArray(manifest)||manifest.format!=='sqlite-online-backup-v1'||!Number.isSafeInteger(manifest.size)||manifest.size<0||!Number.isSafeInteger(manifest.created_at)||manifest.created_at<0||!/^[a-f0-9]{64}$/.test(manifest.sha256)||typeof manifest.game!=='string'||!manifest.game)throw Error('Invalid backup manifest');
 if(manifest.key_id!==undefined&&!/^[A-Za-z0-9._-]{1,64}$/.test(manifest.key_id))throw Error('Invalid backup key ID');
 return manifest;
}
export async function encryptFile(sourcePath,destination,{game,key,keyId='legacy',createdAt=Math.floor(Date.now()/1000),identity=null}={}){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('ENGINE_BACKUP_KEY_HEX must be 32 bytes');
 const digest=await hashFile(sourcePath),manifest=validManifest(manifestFor({game,keyId,createdAt,identity},digest)),header=Buffer.from(JSON.stringify(manifest));
 if(header.length>MAX_MANIFEST_BYTES)throw Error('Invalid manifest');
 const nonce=randomBytes(12),prefix=Buffer.allocUnsafe(4);prefix.writeUInt32BE(header.length);
 const cipher=createCipheriv('aes-256-gcm',key,nonce,{authTagLength:16});cipher.setAAD(header);
 const {file:source,size}=await openInput(sourcePath);
 let output,created=false,completed=false;
 try{
  if(size!==digest.size)throw Error('Snapshot changed before encryption');
  output=await open(destination,'wx',0o600);created=true;
  const ciphertextHash=createHash('sha256'),plaintextHash=createHash('sha256');let bytes=0;
  const emit=async chunk=>{ciphertextHash.update(chunk);bytes+=chunk.length;await writeAll(output,chunk);};
  await emit(prefix);await emit(header);await emit(nonce);
  await readChunks(source,0,size,async chunk=>{plaintextHash.update(chunk);await emit(cipher.update(chunk));});
  await emit(cipher.final());await emit(cipher.getAuthTag());
  if(plaintextHash.digest('hex')!==digest.sha256)throw Error('Snapshot changed during encryption');
  await output.sync();completed=true;
  return {manifest,path:destination,sha256:ciphertextHash.digest('hex'),size:bytes};
 }finally{await closeFiles([source,output],created&&!completed?destination:null);}
}
export async function decryptFile(payloadPath,destination,{key=null,keys=null}={}){
 const {file:source,size}=await openInput(payloadPath);let output,created=false,completed=false;
 try{
  if(size<33)throw Error('Invalid backup payload');
  const length=(await readExactly(source,Buffer.alloc(4),0)).readUInt32BE();
  if(length<1||length>MAX_MANIFEST_BYTES||size<32+length)throw Error('Invalid manifest');
  const header=await readExactly(source,Buffer.alloc(length),4),manifest=validManifest(JSON.parse(header.toString('utf8')));
  if(size!==32+length+manifest.size)throw Error('Truncated or oversized backup payload');
  if(!key){key=keys?.[manifest.key_id||'legacy'];if(!key)throw Error('Backup decrypt key unavailable');if(typeof key==='string')key=Buffer.from(key,'hex');}
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Invalid backup decrypt key');
  const nonce=await readExactly(source,Buffer.alloc(12),4+length),tag=await readExactly(source,Buffer.alloc(16),size-16);
  const decipher=createDecipheriv('aes-256-gcm',key,nonce,{authTagLength:16});decipher.setAAD(header);decipher.setAuthTag(tag);
  output=await open(destination,'wx',0o600);created=true;
  const hash=createHash('sha256');let plaintextSize=0;
  const emit=async chunk=>{hash.update(chunk);plaintextSize+=chunk.length;await writeAll(output,chunk);};
  await readChunks(source,16+length,size-16,async chunk=>{await emit(decipher.update(chunk));});
  await emit(decipher.final()); // No SQLite read or publication may precede authentication.
  if(plaintextSize!==manifest.size||hash.digest('hex')!==manifest.sha256)throw Error('Backup hash mismatch');
  await output.sync();completed=true;return {manifest,path:destination};
 }finally{await closeFiles([source,output],created&&!completed?destination:null);}
}
async function requireEmptyDestination(destination){
 if(!isAbsolute(destination))throw Error('Absolute restore destination required');
 for(const suffix of ['','-wal','-shm','-journal']){
  try{await lstat(destination+suffix);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  throw Error('Restore destination must be empty');
 }
}
export async function restoreFileToPath(payloadPath,destination,{key=null,keys=null,expectedIdentity=null}={}){
 await requireEmptyDestination(destination);await mkdir(dirname(destination),{recursive:true});
 const dir=await mkdtemp(join(dirname(destination),'.native-restore-'));
 try{
  const verified=join(dir,'verified.sqlite'),{manifest}=await decryptFile(payloadPath,verified,{key,keys});
  if(manifest.game!=='skygate')throw Error('BACKUP_GAME_MISMATCH');
  if(expectedIdentity&&!sameIdentity(manifest.deployment_identity,expectedIdentity))throw Error('BACKUP_DEPLOYMENT_IDENTITY_MISMATCH');
  verifyDatabase(verified,{expectedIdentity,manifestIdentity:manifest.deployment_identity});
  await requireEmptyDestination(destination);await link(verified,destination);
  const directory=await open(dirname(destination),'r');try{await directory.sync();}finally{await directory.close();}
  return manifest;
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function responseToFile(response,destination){
 let output,created=false,completed=false;
 try{
  output=await open(destination,'wx',0o600);created=true;const hash=createHash('sha256');let size=0;
  if(response.body)for await(const value of response.body){const chunk=Buffer.from(value.buffer,value.byteOffset,value.byteLength);size+=chunk.length;if(!Number.isSafeInteger(size))throw Error('Backup object exceeds supported size');hash.update(chunk);await writeAll(output,chunk);}
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^[0-9]+$/.test(declared)||Number(declared)!==size))throw Error('Incomplete backup download');
  await output.sync();completed=true;return {path:destination,size,sha256:hash.digest('hex'),etag:response.headers.get('etag')};
 }finally{if(!completed)await response.body?.cancel().catch(()=>{});await closeFiles([output],created&&!completed?destination:null);}
}
export async function responseBytes(response,maxBytes=MAX_CONTROL_BYTES){
 const chunks=[];let size=0;
 if(response.body)for await(const value of response.body){size+=value.byteLength;if(size>maxBytes)throw Error('Backup control response exceeds limit');chunks.push(Buffer.from(value.buffer,value.byteOffset,value.byteLength));}
 return Buffer.concat(chunks,size);
}
