// Server-authoritative native Skygate sandbox. SQLite intents precede network
// calls; the browser never supplies a payout, result, RNG seed or wallet balance.
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import walletTransport from './agency-wallet.cjs';
import {createStudioSync} from './agency-studio.mjs';
import math from './studio/math/engine.js';
import studioMath from './studio/math/studio_math.js';
import settings from './play/settings-model.js';

export class NativeError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new NativeError(status,message);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const COOKIE='skygate_agency';
function decimal(value){
 if(typeof value!=='string'||!/^\d{1,16}(?:\.\d{1,12})?$/.test(value))fail(422,'Nominal harus string decimal non-negatif');
 const [a,b='']=value.split('.');return {n:BigInt(a+b),places:b.length};
}
export function amountUnits(value,scale,rounding='exact'){
 const {n,places}=decimal(value),numerator=n*10n**BigInt(scale),denominator=10n**BigInt(places);
 const q=numerator/denominator,r=numerator%denominator;
 if(rounding==='exact'&&r)fail(422,'Taruhan tidak sesuai presisi koin agen');
 return q+(rounding==='ceil'&&r?1n:rounding==='half_up'&&r*2n>=denominator?1n:0n);
}
export function payoutUnits(bet,multiplier,scale,rounding='half_up'){
 const a=decimal(bet),b=decimal(Number(multiplier).toFixed(10));
 const numerator=a.n*b.n*10n**BigInt(scale),denominator=10n**BigInt(a.places+b.places);
 return numerator/denominator+(rounding==='ceil'&&numerator%denominator?1n:rounding==='half_up'&&(numerator%denominator)*2n>=denominator?1n:0n);
}
export function credits(units,scale){const n=BigInt(units),factor=10n**BigInt(scale);return scale?`${n/factor}.${String(n%factor).padStart(scale,'0')}`:String(n);}
const secureRng=()=>({next:()=>randomBytes(6).readUIntBE(0,6)/2**48,state:()=>null});

export function createNative({env=process.env,releases,wallet=null,clock=()=>Date.now(),outcomeFactory=null}={}){
 const mode=env.AGENCY_WALLET_MODE||'';
 if(!['','sandbox'].includes(mode))throw Error('Native Skygate supports sandbox only');
 if(!mode)return {enabled:false,health:()=>({}),handle:async()=>false,close:()=>{}};
 if(!isAbsolute(env.SKYGATE_AGENCY_DB_PATH||''))throw Error('Persistent SKYGATE_AGENCY_DB_PATH required');
 const client=wallet||walletTransport.createAgencyWallet({origin:env.AGENCY_WALLET_ORIGIN,keyId:env.AGENCY_WALLET_KEY_ID,secret:env.AGENCY_WALLET_SECRET,allowLocal:env.AGENCY_WALLET_LOCAL_QA==='1'});
 let baseline;
 if(env.AGENCY_STUDIO_SYNC==='1'){
  const project=JSON.parse(readFileSync(new URL('./studio/project-data.js',import.meta.url),'utf8').replace(/^window\.SKY_PROJECT_DEFAULT\s*=\s*/,'').trim().replace(/;$/,''));
  project.math=JSON.parse(readFileSync(new URL('./play/config.js',import.meta.url),'utf8').replace(/^window\.SlotGameConfig\s*=\s*/,'').trim().replace(/;$/,''));
  project.bet=2; // Keep the bundled runtime's starting stake, not Studio's demo stake.
  baseline={format:'playground.studio.v1',game:'skygate-5000',name:'Template Studio Skygate',payload:{project,overrides:{}}};
 }
 if(typeof env.AGENCY_WALLET_SECRET!=='string'||env.AGENCY_WALLET_SECRET.length<32)throw Error('Sandbox session signing key required');
 mkdirSync(dirname(env.SKYGATE_AGENCY_DB_PATH),{recursive:true});
 const db=new DatabaseSync(env.SKYGATE_AGENCY_DB_PATH,{timeout:30000});
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS launches(cookie_hash TEXT PRIMARY KEY,session_json TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,actor TEXT NOT NULL,request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,session_json TEXT NOT NULL,
  stake TEXT NOT NULL,payout TEXT NOT NULL,max_payout TEXT NOT NULL,result_json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'intent',central_id TEXT,error_status INTEGER,created_at INTEGER NOT NULL,finished_at INTEGER,UNIQUE(actor,request_id));
 CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON rounds(actor) WHERE state IN ('intent','reserved');`);
 const query=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const studio=createStudioSync({env,client,releases,baseline});
 let queue=Promise.resolve();
 const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 async function call(action,p){try{return await client[action](p);}catch(e){if(e instanceof walletTransport.AgencyWalletError)throw e;throw new NativeError(503,'Koneksi wallet terputus. Ulangi request yang sama; hasil tersimpan.');}}
 async function currentConfig(){
  const release=await releases.live();
  const cfg=release?.project?.math||JSON.parse(readFileSync(new URL('./play/config.js',import.meta.url),'utf8').replace(/^window\.SlotGameConfig\s*=\s*/,'').trim().replace(/;$/,''));
  math.validateConfig(cfg);return {release,cfg,id:release?.id||'bundled',hash:sha(JSON.stringify({cfg,jackpot:release?.project?.jackpot||null}))};
 }
 async function redeem(token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{30,120}$/.test(token))fail(422,'Token tidak valid');
  let s;try{s=await client.redeem(token,'skygate-redeem-'+sha(token));}catch(e){if(e instanceof walletTransport.AgencyWalletError)fail(e.status<500?e.status:503,'Launch ditolak. Buka kembali dari website agen.');throw new NativeError(503,'Koneksi launch terputus; ulangi token yang sama');}
  if(s.game!=='skygate-5000'||!Number.isInteger(s.coin_scale)||s.coin_scale<0||s.coin_scale>12)fail(409,'Scope game atau presisi tidak sesuai');
  const cookie=createHmac('sha256',env.AGENCY_WALLET_SECRET).update('cookie:'+token).digest('hex');
  run('INSERT INTO launches VALUES(?,?,?) ON CONFLICT(cookie_hash) DO UPDATE SET session_json=excluded.session_json',sha(cookie),JSON.stringify(s),clock());
  return {cookie,session:s};
 }
 function session(raw){
  if(!/^[a-f0-9]{64}$/.test(raw||''))fail(401,'Buka Skygate dari website agen');
  const row=query('SELECT * FROM launches WHERE cookie_hash=? AND created_at>?',sha(raw),clock()-86400000);
  if(!row)fail(401,'Sesi tidak tersedia. Buka kembali dari website agen');
  const s=JSON.parse(row.session_json);return {s,actor:s.tenant_id+':'+s.player_id};
 }
 async function advance(id){
  let r=query('SELECT * FROM rounds WHERE id=?',id);if(r.state==='failed')fail(r.error_status,'Reservasi ditolak; gunakan request baru setelah memeriksa saldo/sesi');
  const s=JSON.parse(r.session_json);
  if(r.state==='intent'){
   let result;try{result=await call('reserve',{tenant_id:s.tenant_id,session_id:s.session_id,round_ref:r.id,stake:r.stake,max_payout:r.max_payout});}
   catch(e){if(e instanceof walletTransport.AgencyWalletError){if(e.status>=400&&e.status<500&&![408,429].includes(e.status))run("UPDATE rounds SET state='failed',error_status=? WHERE id=?",e.status,id);fail(e.status<500?e.status:503,'Reservasi wallet belum berhasil. Periksa saldo, sesi dan risk pool.');}throw e;}
   run("UPDATE rounds SET state='reserved',central_id=? WHERE id=?",result.id,id);r=query('SELECT * FROM rounds WHERE id=?',id);
  }
  if(r.state==='reserved'){
   try{await call('settle',{tenant_id:s.tenant_id,round_id:r.central_id,payout:r.payout,evidence:'skygate-native-v1:'+sha(r.result_json)});}
   catch(e){if(e instanceof walletTransport.AgencyWalletError)fail(503,'Settlement tertunda; hasil tersimpan untuk rekonsiliasi');throw e;}
   run("UPDATE rounds SET state='settled',finished_at=? WHERE id=?",clock(),id);r=query('SELECT * FROM rounds WHERE id=?',id);
  }
  return r;
 }
 function context(s){return {navigation:s.navigation||null,session_expires_at:s.expires_at||null,session_expired:!!s.expires_at&&Date.parse(s.expires_at)<=clock()};}
 async function snapshot(s,actor){
  const pending=query("SELECT id FROM rounds WHERE actor=? AND state IN ('intent','reserved')",actor);if(pending)await advance(pending.id);
  let b;try{b=await call('status',{tenant_id:s.tenant_id,session_id:s.session_id});}catch(e){if(e instanceof walletTransport.AgencyWalletError)fail(503,'Saldo pusat belum tersedia');throw e;}
  const cfg=await currentConfig();
  const history=all("SELECT id,result_json,payout,stake FROM rounds WHERE actor=? AND state='settled' ORDER BY finished_at DESC LIMIT 30",actor).map(r=>({...JSON.parse(r.result_json),id:r.id,payout:credits(r.payout,s.coin_scale),cost:credits(r.stake,s.coin_scale)}));
  return {...context({...s,...b}),wallet:'soft-tech',simulation:true,coin_scale:s.coin_scale,balance:credits(b.balance,s.coin_scale),reserved:credits(b.reserved,s.coin_scale),release_id:cfg.id,config_hash:cfg.hash,history,
   policy:{rounding:'half_up',note:`Sandbox Soft Tech: payout dibulatkan half-up ke ${s.coin_scale} desimal setelah seluruh bonus. Saldo pusat tidak dapat direset dari game.`}};
 }
 async function spin(s,actor,p){
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['request_id','bet','ante','buy_bonus','release_id'].includes(k)))fail(422,'Payload spin tidak valid');
  if(!/^[a-f0-9-]{36}$/.test(p.request_id||'')||typeof p.ante!=='boolean'||typeof p.buy_bonus!=='boolean'||typeof p.release_id!=='string'||typeof p.bet!=='string')fail(422,'Request ID, taruhan, opsi dan release wajib');
  const payloadHash=sha(JSON.stringify({bet:p.bet,ante:p.ante,buy_bonus:p.buy_bonus,release_id:p.release_id}));
  let r=query('SELECT * FROM rounds WHERE actor=? AND request_id=?',actor,p.request_id);
  if(r&&r.payload_hash!==payloadHash)fail(409,'Payload idempotency berbeda');
  if(!r){
   if(query("SELECT id FROM rounds WHERE actor=? AND state IN ('intent','reserved')",actor))fail(409,'Ronde masih diproses. Pulihkan state sebelum membuat ronde baru');
   const {release,cfg,id,hash}=await currentConfig();if(p.release_id!==id)fail(409,'Versi game berubah. Muat ulang sebelum bermain');
   if(p.ante&&p.buy_bonus)fail(422,'Buy bonus tidak dapat digabung dengan booster');
   if(!settings.combinations(p.ante).some(x=>x.base===Number(p.bet)))fail(422,'Taruhan di luar pilihan game');
   amountUnits(p.bet,s.coin_scale);
   const stake=payoutUnits(p.bet,p.buy_bonus?100:p.ante?1.25:1,s.coin_scale,'half_up');
   // Costs must be exactly representable; never round down a fractional wager.
   const costRaw=Number(p.bet)*(p.buy_bonus?100:p.ante?1.25:1);
   if(amountUnits(costRaw.toFixed(4),s.coin_scale)!==stake)fail(422,'Biaya tidak sesuai presisi agen');
   let round;
   if(outcomeFactory)round=await outcomeFactory(cfg,p); // injected by isolated tests only
   else{
    const engine=release?studioMath.createStudioEngine(cfg,release.project.jackpot,0,{base:secureRng(),jackpot:secureRng()}):math.createEngine(cfg,0,secureRng());
    round=engine.playRound({trace:true,ante:p.ante,buyBonus:p.buy_bonus});
   }
   // No seed/state can be used to predict another agency round.
   round={...round,initialSeed:null,rngStateStart:null,rngStateEnd:null,rng:'node:crypto.randomInt'};
   const payout=payoutUnits(p.bet,round.winX,s.coin_scale),max=payoutUnits(p.bet,cfg.round_max_win_x,s.coin_scale,'ceil');
   if(payout>max)fail(503,'Outcome exceeds reserved liability');
   const rid='skygate-'+randomUUID(),result={request_id:p.request_id,round,bet:p.bet,ante:p.ante,buy_bonus:p.buy_bonus,release_id:id,config_hash:hash,rounding:'half_up'};
   // SQLite synchronous FULL commits the immutable outcome before reserve.
   run('INSERT INTO rounds(id,actor,request_id,payload_hash,session_json,stake,payout,max_payout,result_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',rid,actor,p.request_id,payloadHash,JSON.stringify(s),String(stake),String(payout),String(max),JSON.stringify(result),clock());
   r=query('SELECT * FROM rounds WHERE id=?',rid);
  }
  r=await advance(r.id);const state=await snapshot(s,actor);
  return {...JSON.parse(r.result_json),id:r.id,payout:credits(r.payout,s.coin_scale),cost:credits(r.stake,s.coin_scale),state};
 }
 async function recover(){for(const row of all("SELECT id FROM rounds WHERE state IN ('intent','reserved') LIMIT 20")){try{await advance(row.id);}catch{}}}
 const timer=setInterval(()=>{void serial(recover);},30000);timer.unref();
 async function handle(req,res,path){
  if(!path.startsWith('/api/agency/'))return false;
  const send=(status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));};
  try{
   if(req.method==='GET'&&path==='/api/agency/mode'){send(200,{agency:true,environment:'sandbox'});return true;}
   if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');
   let data;
   if(req.method==='POST'){
    if(req.headers['x-skygate-client']!=='agency-ui'||req.headers['sec-fetch-site']==='cross-site')fail(403,'Same-origin client required');
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail(403,'Same-origin request required');
    if(!String(req.headers['content-type']).startsWith('application/json'))fail(415,'JSON required');
    let size=0,parts=[];for await(const part of req){size+=part.length;if(size>4096)fail(413,'Payload too large');parts.push(part);}try{data=JSON.parse(Buffer.concat(parts));}catch{fail(400,'Invalid JSON');}
   }
   if(req.method==='POST'&&path==='/api/agency/launch'){
    const result=await serial(()=>redeem(data?.token));const secure=req.headers['x-forwarded-proto']==='https'||req.socket.encrypted;
    send(200,{ok:true,mode:'sandbox',...context(result.session)},{'Set-Cookie':`${COOKIE}=${result.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure?'; Secure':''}`});return true;
   }
   const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
   const result=await serial(async()=>{const {s,actor}=session(raw);if(req.method==='GET'&&path==='/api/agency/context')return context(s);if(req.method==='GET'&&path==='/api/agency/state')return snapshot(s,actor);if(req.method==='POST'&&path==='/api/agency/spin')return spin(s,actor,data);fail(404,'Endpoint tidak tersedia');});send(200,result);
  }catch(e){send(e instanceof NativeError?e.status:500,{error:e instanceof NativeError?e.message:'Native wallet error; retry the same request'});}
  return true;
 }
 return {enabled:true,handle,health:()=>{query('SELECT 1');return {provider:'soft-tech',wallet:'soft-tech',mode:'sandbox',database:'connected',source_commit:env.RAILWAY_GIT_COMMIT_SHA||'',studio:studio.status()};},close:()=>{clearInterval(timer);studio.close();db.close();},
  // Local test harness can exercise the same serialized domain operations.
  test:{redeem:token=>serial(()=>redeem(token)),state:raw=>serial(()=>{const {s,actor}=session(raw);return snapshot(s,actor);}),spin:(raw,p)=>serial(()=>{const {s,actor}=session(raw);return spin(s,actor,p);}),recover:()=>serial(recover)}};
}
