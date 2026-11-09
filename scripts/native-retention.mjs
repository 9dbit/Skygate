// Bounded, fail-closed retention. Railway has no lifecycle/Object Lock support.
import {createHash,randomBytes} from 'node:crypto';
export const RETENTION_POLICY='native-7d-4w-12m-v1';
const DAY=86400;
const sha=x=>createHash('sha256').update(x).digest('hex');
const identityEqual=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
const strongETag=value=>typeof value==='string'&&/^"[^"\s]{1,200}"$/.test(value);
export async function probeConditionalDeletion({game,identity,put,download,head,remove,now=Math.floor(Date.now()/1000)}){
 const report={verified:false,verified_at:new Date(now*1000).toISOString(),wrong_etag_rejected:false,correct_etag_deleted:false,absence_verified:false};
 try{
  if(!/^[a-z0-9-]{1,32}$/.test(game)||!identity||!['sandbox','preproduction','production'].includes(identity.environment)||!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(identity.deployment_id||''))throw Error('RETENTION_PROBE_SCOPE_INVALID');
  const token=randomBytes(16).toString('hex'),object=`native/${game}/.retention-probe/${identity.environment}/${identity.deployment_id}/${token}.probe`;
  report.probe_object=object;
  const first=Buffer.from(JSON.stringify({deployment_identity:identity,probe:token,generation:1})),second=Buffer.from(JSON.stringify({deployment_identity:identity,probe:token,generation:2}));
  const a=await put(object,first),b=await put(object,second);
  if(!strongETag(a?.etag)||!strongETag(b?.etag)||a.etag===b.etag)throw Error('RETENTION_PROBE_ETAG_UNAVAILABLE');
  try{await remove(object,a.etag);}catch(error){if(error.httpStatus!==412)throw Error('RETENTION_PROBE_FAILED');report.wrong_etag_rejected=true;}
  if(!report.wrong_etag_rejected)throw Error('RETENTION_PROBE_CONDITION_IGNORED');
  const read=await download(object);
  if(read.etag!==b.etag||!Buffer.isBuffer(read.bytes)||!read.bytes.equals(second))throw Error('RETENTION_PROBE_CONTENT_CHANGED');
  await remove(object,b.etag);report.correct_etag_deleted=true;
  try{await head(object);}catch(error){if(error.httpStatus!==404)throw Error('RETENTION_PROBE_ABSENCE_UNVERIFIED');report.absence_verified=true;}
  if(!report.absence_verified)throw Error('RETENTION_PROBE_ABSENCE_UNVERIFIED');
  report.verified=true;
 }catch(error){report.error_code=/^RETENTION_[A-Z_]+$/.test(error?.message||'')?error.message:'RETENTION_PROBE_FAILED';}
 return report;
}
function weekStart(seconds){const d=new Date(seconds*1000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.getTime()/1000;}
function month(seconds){const d=new Date(seconds*1000);return d.getUTCFullYear()*12+d.getUTCMonth();}
export function retentionPlan(keys,{game,now=Math.floor(Date.now()/1000),restoringObject=null,maxDeletes=5}={}){
 if(!/^[a-z0-9-]{1,32}$/.test(game)||!Number.isSafeInteger(now)||!Number.isInteger(maxDeletes)||maxDeletes<1||maxDeletes>10)throw Error('RETENTION_CONFIG_INVALID');
 const pattern=new RegExp('^native/'+game+'/([0-9]{10})-([a-f0-9]{16})-([a-f0-9]{16})\\.aesgcm$');
 const records=[];const ignored=[];const seen=new Set();
 for(const key of keys){if(seen.has(key))throw Error('RETENTION_DUPLICATE_INVENTORY');seen.add(key);const m=typeof key==='string'&&pattern.exec(key);if(!m){ignored.push(key);continue;}const at=Number(m[1]);if(at>now)throw Error('RETENTION_FUTURE_OBJECT');records.push({key,created_at:at,hash_prefix:m[2]});}
 records.sort((a,b)=>b.created_at-a.created_at||b.key.localeCompare(a.key));
 const keep=new Set(records.slice(0,2).map(x=>x.key)),protectedBuckets=new Set(),oldRepresentatives=new Set();
 if(restoringObject)keep.add(restoringObject);
 for(const r of records){
  const age=now-r.created_at;if(age<7*DAY)keep.add(r.key);
  const daily=Math.floor(now/DAY)-Math.floor(r.created_at/DAY),weekly=(weekStart(now)-weekStart(r.created_at))/(7*DAY),monthly=month(now)-month(r.created_at);
  for(const [name,index,limit]of [['day',daily,7],['week',weekly,4],['month',monthly,12]]){
   const label=name+':'+index;if(index>=0&&index<limit&&!protectedBuckets.has(label)){protectedBuckets.add(label);keep.add(r.key);if(age>=7*DAY)oldRepresentatives.add(r.key);}
  }
 }
 const candidates=records.filter(x=>!keep.has(x.key)&&now-x.created_at>=7*DAY).reverse().slice(0,maxDeletes);
 const verifyKeys=new Set([...records.slice(0,2).map(x=>x.key),...oldRepresentatives,...candidates.map(x=>x.key)]);
 return {records,keep:[...keep],ignored,candidates,verifyKeys:[...verifyKeys]};
}
export async function enforceRetention({game,identity,currentObject,currentCiphertextSha256,list,download,remove,verify,now=Math.floor(Date.now()/1000),restoringObject=null,mode='dry-run',maxObjects=4096,maxDeletes=5,logger=()=>{},checkConditionalDelete=null,probeRequested=false}){
 const report={policy:RETENTION_POLICY,enabled:true,mode,effective_mode:'dry-run',verified:false,conditional_delete_verified:false,inventory_count:0,managed_count:0,retained_count:0,protected_unknown_count:0,eligible_count:0,deleted_count:0,verified_at:new Date(now*1000).toISOString()};
 try{
  if(!['dry-run','apply'].includes(mode)||!identity||identity.environment==='production'&&!identity.deployment_id||!currentObject||!/^[a-f0-9]{64}$/.test(currentCiphertextSha256))throw Error('RETENTION_CONFIG_INVALID');
  const keys=[],tokens=new Set();let token=null;
  do{const page=await list(token);if(!page||!Array.isArray(page.keys))throw Error('RETENTION_INVENTORY_INVALID');keys.push(...page.keys);if(keys.length>maxObjects)throw Error('RETENTION_INVENTORY_LIMIT');token=page.nextToken||null;if(token){if(tokens.has(token))throw Error('RETENTION_PAGINATION_LOOP');tokens.add(token);}}while(token);
  report.inventory_count=keys.length;
  if(!keys.includes(currentObject))throw Error('RETENTION_CURRENT_OBJECT_MISSING');
  const plan=retentionPlan(keys,{game,now,restoringObject,maxDeletes});report.managed_count=plan.records.length;report.protected_unknown_count=plan.ignored.length;report.retained_count=plan.keep.length;report.eligible_count=plan.candidates.length;
  const required=new Set([...plan.verifyKeys,currentObject]);if(required.size>32)throw Error('RETENTION_VERIFICATION_LIMIT');
  const records=new Map(plan.records.map(x=>[x.key,x])),proofs=new Map();
  for(const key of required){
   const record=records.get(key);if(!record)throw Error('RETENTION_OBJECT_SCOPE_INVALID');
   const response=await download(key);if(!response||!Buffer.isBuffer(response.bytes))throw Error('RETENTION_DOWNLOAD_INVALID');
   const digest=sha(response.bytes);if(key===currentObject&&digest!==currentCiphertextSha256)throw Error('RETENTION_CURRENT_CIPHERTEXT_CHANGED');
   const manifest=await verify(response.bytes);
   if(!manifest||manifest.game!==game||manifest.created_at!==record.created_at||!String(manifest.sha256).startsWith(record.hash_prefix)||!identityEqual(manifest.deployment_identity,identity))throw Error('RETENTION_FOREIGN_OR_MALFORMED_MANIFEST');
   if(key===currentObject&&(now-manifest.created_at<0||now-manifest.created_at>25*3600))throw Error('RETENTION_CURRENT_BACKUP_STALE');
   proofs.set(key,{digest,etag:response.etag});
  }
  report.planned_objects=plan.candidates.map(x=>x.key);logger({event:'engine.backup.retention_plan',...report});
  if(probeRequested||(mode==='apply'&&plan.candidates.length)){
   if(typeof checkConditionalDelete!=='function')throw Error('RETENTION_CONDITIONAL_DELETE_UNVERIFIED');
   const capability=await checkConditionalDelete();report.conditional_delete=capability;
   if(capability?.verified!==true)throw Error(capability?.error_code||'RETENTION_CONDITIONAL_DELETE_UNVERIFIED');
   report.conditional_delete_verified=true;report.effective_mode=mode;
  }
  if(mode==='apply'){
   for(const item of plan.candidates){
    const proof=proofs.get(item.key);if(!strongETag(proof.etag))throw Error('RETENTION_CONDITIONAL_DELETE_UNAVAILABLE');
    // Conditional deletion cannot delete an object changed after verification.
    await remove(item.key,proof.etag);report.deleted_count++;
   }
  }
  report.verified=true;logger({event:'engine.backup.retention_completed',...report});return report;
 }catch(error){report.error_code=/^RETENTION_[A-Z_]+$/.test(error?.message||'')?error.message:'RETENTION_OPERATION_FAILED';logger({event:'engine.backup.retention_blocked',...report});return report;}
}
