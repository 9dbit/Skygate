'use strict';
// Server-side only. The game must persist request_id, round_ref and its outcome before calls.
const crypto=require('node:crypto');
const transport=require('./agency-transport.cjs');
class AgencyWalletError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
function createAgencyWallet({origin,keyId,secret,fetchImpl,allowLocal=false,environment='sandbox',audience=''}){
 const url=new URL(origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||allowLocal&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Agency wallet origin must be HTTPS');
 if(!keyId||typeof secret!=='string'||secret.length<32)throw Error('Agency wallet credentials required');
 if(!['sandbox','preproduction','production'].includes(environment))throw Error('Invalid agency environment');
 if(environment!=='sandbox'&&!audience)throw Error('Explicit agency audience required');
 if(audience&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(audience))throw Error('Invalid agency audience');
 if(fetchImpl!==undefined&&typeof fetchImpl!=='function')throw Error('Explicit fetch injection must be a function');
 const pool=fetchImpl?null:transport.transportForOrigin(url.origin,{allowLocal});
 async function request(action,payload){
  const started=performance.now();
  if(environment==='production')throw new AgencyWalletError(423,'PRODUCTION_RELEASE_GATES_PENDING');
  if(!['redeem','status','reserve','settle','void','studio-sync'].includes(action))throw Error('Unsupported agency action');
  const path='/api/v4/agency-game/'+action,body=JSON.stringify(payload);
  if(typeof body!=='string')throw new AgencyWalletError(422,'AGENCY_INVALID_REQUEST');
  if(Buffer.byteLength(body)>transport.MAX_REQUEST_BYTES)throw new AgencyWalletError(413,'AGENCY_REQUEST_TOO_LARGE');
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomBytes(16).toString('hex');
  const hash=crypto.createHash('sha256').update(body).digest('hex'),signature=crypto.createHmac('sha256',secret).update([...(audience?['agency.v2',environment,audience]:['agency.v1']),'POST',path,timestamp,nonce,hash].join('\n')).digest('hex');
  const headers={'Content-Type':'application/json','X-Agency-Key':keyId,'X-Agency-Timestamp':timestamp,'X-Agency-Nonce':nonce,'X-Agency-Signature':signature,...(audience?{'X-Agency-Version':'2','X-Agency-Environment':environment,'X-Agency-Audience':audience}:{})};
  let status,data;
  if(fetchImpl){
   // Explicit dependency injection retained for isolated signer/domain fixtures.
   const r=await fetchImpl(new URL(path,url),{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(transport.REQUEST_TIMEOUT_MS)});
   status=r.status;try{data=await r.json();}catch{throw new AgencyWalletError(502,'AGENCY_INVALID_RESPONSE');}
  }else{
   try{({status,data}=await pool.post(path,body,headers,started));}
   catch(e){if(e instanceof transport.TransportError)throw new AgencyWalletError(e.status,e.code);throw e;}
  }
  if(status<200||status>=300)throw new AgencyWalletError(status,data?.code||'AGENCY_REQUEST_REJECTED');return data;
 }
 return {redeem:(token,requestId)=>{if(!requestId)throw Error('Persisted redemption request ID required');return request('redeem',{token,request_id:requestId});},status:p=>request('status',p),reserve:p=>request('reserve',p),settle:p=>request('settle',p),void:p=>request('void',p),studioSync:p=>request('studio-sync',p),transportMetrics:()=>fetchImpl?{implementation:'injected_fetch'}:transport.transportMetrics()};
}
module.exports={createAgencyWallet,AgencyWalletError,transportMetrics:transport.transportMetrics,closeTransport:transport.closeTransport};
