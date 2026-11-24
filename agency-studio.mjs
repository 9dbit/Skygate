import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
// Runtime validation and durable activation receipts, independent of player rounds.
export function createStudioSync({env,client,releases,baseline}){
 if(env.AGENCY_STUDIO_SYNC!=='1')return {close(){},tick:async()=>{},status:()=>({enabled:false})};
 const db=new DatabaseSync(env.SKYGATE_AGENCY_DB_PATH+'.studio');
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS prepared(id TEXT PRIMARY KEY,sha TEXT NOT NULL,runtime TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),active TEXT,sha TEXT,generation INTEGER NOT NULL);
 INSERT OR IGNORE INTO state VALUES(1,NULL,NULL,0);`);
 let busy=null,stopped=false,lastError='',lastSync=null;
 const state=()=>db.prepare('SELECT * FROM state WHERE id=1').get();
 const runtime=env.RAILWAY_GIT_COMMIT_SHA||'local-studio-v1';
 async function prepare(pkg){
  if(!pkg||!/^[a-f0-9-]{36}$/.test(pkg.id)||typeof pkg.body!=='string'||sha(pkg.body)!==pkg.sha256)throw Error('Checksum paket tidak cocok');
  const old=db.prepare('SELECT * FROM prepared WHERE id=?').get(pkg.id);
  if(old){if(old.sha!==pkg.sha256)throw Error('Identitas rilis berubah');if(old.runtime===runtime){await releases.revision(pkg.id);return;}}
  const b=JSON.parse(pkg.body);
  if(b.format!=='playground.studio.v1'||b.game!=='skygate-5000'||!b.payload?.project)throw Error('Paket Skygate tidak valid');
  await releases.stage(b.payload,pkg.id);
  db.prepare('INSERT INTO prepared VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET runtime=excluded.runtime').run(pkg.id,pkg.sha256,runtime);
 }
 async function run(){
  let s=state();
  const info=await releases.summary();
  const coherent=info.active===s.active;
  const response=await client.studioSync({runtime,generation:coherent?s.generation:0,active:coherent?s.active:null,sha256:coherent?s.sha:null,baseline,error:lastError});
  if(stopped)return;
  let receipt;
  if(response.candidate){
   const p=response.candidate;
   try{await prepare(p);receipt={id:p.id,sha256:p.sha256,state:'validated'};}
   catch(e){receipt={id:p.id,sha256:p.sha256,state:'rejected',error:String(e.message).slice(0,500)};}
  }
  try{
   if(response.generation>s.generation||!coherent){
    if(response.desired){if(!response.apply)throw Error('Paket aktif belum tersedia');await prepare(response.apply);}
    const current=await releases.summary();
    await releases.activate({id:response.desired,expectedActive:current.active});
    db.prepare('UPDATE state SET active=?,sha=?,generation=? WHERE id=1').run(response.desired,response.apply?.sha256||null,response.generation);
   }
   lastError='';
  }catch(e){lastError=String(e.message).slice(0,500);}
  if(stopped)return;
  s=state();await client.studioSync({runtime,generation:s.generation,active:s.active,sha256:s.sha,receipt,error:lastError});lastSync=new Date().toISOString();
 }
 function tick(){if(stopped)return Promise.resolve();if(busy)return busy;busy=run().catch(()=>{lastError='Sinkronisasi Playground belum tersedia';}).finally(()=>{busy=null;});return busy;}
 const timer=setInterval(tick,env.AGENCY_WALLET_LOCAL_QA==='1'?300:10000);timer.unref();tick();
 return {tick,status:()=>({enabled:true,last_sync:lastSync,error:lastError}),async close(){if(stopped)return;stopped=true;clearInterval(timer);if(busy)await busy;db.close();}};
}
