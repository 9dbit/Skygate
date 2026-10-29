import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createReleaseStore, validateProject, defaultSpinMotion } from '../../release-store.mjs';

const root=new URL('../../',import.meta.url);
const source=JSON.parse(await readFile(new URL('studio/project.json',root),'utf8'));
const copy=()=>structuredClone(source);
const auth='Basic '+Buffer.from('qa:releases-test-password').toString('base64');
const png={mime:'image/png',data:(await readFile(new URL('studio/assets/symbols/ruby.png',root))).toString('base64')};
async function temp(t){const dir=await mkdtemp(join(tmpdir(),'skygate-releases-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function server(t,dir,env={}){
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'production',PORT:'0',SKYGATE_STUDIO_USER:'qa',SKYGATE_STUDIO_PASSWORD:'releases-test-password',SKYGATE_STUDIO_REQUIRE_AUTH:'true',SKYGATE_RELEASE_DIR:dir,RAILWAY_VOLUME_MOUNT_PATH:'',...env},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}});
  const port=await new Promise((yes,no)=>{let output='';const timer=setTimeout(()=>no(Error('Server startup timeout')),5000);child.stdout.on('data',b=>{output+=b;const m=output.match(/listening on (\d+)/);if(m){clearTimeout(timer);yes(m[1]);}});child.once('error',no);});
  return 'http://127.0.0.1:'+port;
}

test('release snapshots survive restart, isolate drafts, publish atomically and rollback to bundled game',async t=>{
  const dir=await temp(t),store=createReleaseStore(dir),project=copy();
  project.layers.find(l=>l.id==='logo').x=30;
  const a=await store.stage({project,overrides:{'asset:symbols/ruby.png':png}});
  assert.equal(await store.live(),null);
  const draft=await store.revision(a.id),file=draft.overrides['asset:symbols/ruby.png'].file;
  await assert.rejects(store.media(file,false),e=>e.status===404);
  assert.equal((await store.media(file,true)).mime,'image/png');
  await store.activate({id:a.id,expectedActive:null});
  const restarted=createReleaseStore(dir);
  assert.equal((await restarted.live()).id,a.id);
  assert.equal((await restarted.live()).project.layers.find(l=>l.id==='logo').x,30);
  assert.equal((await restarted.media(file,false)).mime,'image/png');
  project.bet=50;const b=await store.stage({project});
  const racing=await Promise.allSettled([store.activate({id:b.id,expectedActive:a.id}),store.activate({id:a.id,expectedActive:a.id})]);
  assert.equal(racing.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await store.live()).project.bet,50);
  await store.activate({expectedActive:b.id},true);assert.equal((await store.live()).id,a.id);
  const freshDir=await temp(t),first=createReleaseStore(freshDir);const c=await first.stage({project});await first.activate({id:c.id,expectedActive:null});await first.activate({expectedActive:c.id},true);assert.equal(await first.live(),null);
  assert.equal((await first.summary()).revisions[0].published,true);
});

test('publisher rejects unsafe paths, executable media, invalid math and broken live controls',async t=>{
  const store=createReleaseStore(await temp(t));
  for(const mutate of [
    p=>p.layers[0].asset='../../server.mjs',
    p=>p.layers[0].asset='https://external.invalid/secret',
    p=>p.layers.find(l=>l.id==='spinbutton').visible=false,
    p=>p.layers.find(l=>l.id==='reels').x=-1,
    p=>p.math.safety_max_tumbles=999999,
    p=>p.math.multiplier_values=[NaN],
    p=>p.math.bonus_start_spins=-1,
    p=>p.virtualCreditsOnly=false,
    p=>p.jackpot.tiers[0].perMillion=2000000,
    p=>p.layers.push({...p.layers[0]}),
  ]){const p=copy();mutate(p);assert.throws(()=>validateProject(p));}
  await assert.rejects(store.stage({project:copy(),overrides:{'asset:scene/logo.png':{mime:'image/svg+xml',data:Buffer.from('<svg onload="alert(1)"/>').toString('base64')}}}));
  await assert.rejects(store.stage({project:copy(),overrides:{'asset:../../server.mjs':png}}));
  await assert.rejects(store.stage({project:copy(),overrides:{'audio:unknown':png}}));
  const p=copy();p.privateNote='not-public';p.assets={private:'not-public'};p.math.secret='not-public';
  const safe=validateProject(p);assert(!JSON.stringify(safe).includes('not-public'));
});

test('HTTP release workflow enforces auth, CSRF, origin, draft isolation and version conflicts',async t=>{
  const base=await server(t,await temp(t));
  const get=(path,privateRead=false)=>fetch(base+path,{headers:privateRead?{Authorization:auth}:{}});
  for(const path of ['/studio/api/releases','/studio/preview/?revision=abc','/play/..%2fstudio/api/releases'])assert.equal((await get(path)).status,401,path);
  const session=await (await get('/studio/api/releases',true)).json();assert.equal(session.available,true);
  const post=(path,data,headers={})=>fetch(base+path,{method:'POST',headers:{Authorization:auth,Origin:base,'Content-Type':'application/json','X-Skygate-CSRF':session.csrf,...headers},body:JSON.stringify(data)});
  assert.equal((await post('/studio/api/releases',{project:copy()},{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await post('/studio/api/releases',{project:copy()},{'X-Skygate-CSRF':'bad'})).status,403);
  assert.equal((await post('/studio/api/releases',{project:copy()},{Authorization:''})).status,401);
  assert.equal((await post('/studio/api/releases',{project:copy()},{'Content-Type':'text/plain'})).status,415);
  const staged=await post('/studio/api/releases',{project:copy(),overrides:{'asset:symbols/ruby.png':png}});assert.equal(staged.status,201);
  const {id}=await staged.json();const preview=await get('/studio/api/releases/'+id,true);assert.equal(preview.status,200);assert.equal(preview.headers.get('Cache-Control'),'no-store');
  const doc=await preview.json(),file=doc.overrides['asset:symbols/ruby.png'].file;
  assert.equal((await get('/play/media/'+file)).status,404);
  assert.equal((await get('/studio/api/media/'+file)).status,401);
  assert.equal((await get('/studio/api/media/'+file,true)).status,200);
  assert.equal(await (await get('/play/release.json')).json(),null);
  assert.match(await (await get('/studio/preview/?revision='+id,true)).text(),/<base href="\/play\/">/);
  assert.equal((await post('/studio/api/publish',{id,expectedActive:null})).status,200);
  assert.equal((await (await get('/play/release.json')).json()).id,id);
  const media=await get('/play/media/'+file);assert.equal(media.status,200);assert.equal(media.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal((await post('/studio/api/publish',{id,expectedActive:'stale'})).status,409);
  assert.equal((await post('/studio/api/rollback',{expectedActive:id})).status,200);
  assert.equal(await (await get('/play/release.json')).json(),null);
  assert.equal((await get('/studio/api/releases/'+id,true)).status,200);
});

test('production publishing fails closed without auth or persistent storage',async t=>{
  const noAuth=await server(t,await temp(t),{SKYGATE_STUDIO_PASSWORD:'',SKYGATE_STUDIO_REQUIRE_AUTH:''});
  assert.equal((await fetch(noAuth+'/studio/api/releases')).status,503);
  const noDisk=await server(t,'');
  const session=await (await fetch(noDisk+'/studio/api/releases',{headers:{Authorization:auth}})).json();assert.equal(session.available,false);
  const response=await fetch(noDisk+'/studio/api/releases',{method:'POST',headers:{Authorization:auth,Origin:noDisk,'Content-Type':'application/json','X-Skygate-CSRF':session.csrf},body:JSON.stringify({project:copy()})});assert.equal(response.status,503);
});

test('Studio spin motion persists with snapshots, validates bounds and migrates old projects',async t=>{
  const tuned=copy();
  tuned.spinMotion={normalMs:2000,quickMs:1200,turboMs:550};
  const validated=validateProject(tuned);
  assert.deepEqual(validated.spinMotion,tuned.spinMotion);
  const store=createReleaseStore(await temp(t));
  // Staging is also the serialization contract consumed by Game and Studio previews.
  const snapshot=await store.stage({project:tuned});
  const saved=await store.revision(snapshot.id);
  assert.deepEqual(saved.project.spinMotion,tuned.spinMotion);
  const legacy=copy();delete legacy.spinMotion;
  assert.deepEqual(validateProject(legacy).spinMotion,defaultSpinMotion);
  for(const [key,value] of [['normalMs',200],['quickMs','1150'],['turboMs',1500]]){
    const invalid=copy();invalid.spinMotion[key]=value;
    assert.throws(()=>validateProject(invalid),/spin|Ms|timing/i);
  }
  const unordered=copy();unordered.spinMotion.quickMs=2200;
  assert.throws(()=>validateProject(unordered),/order/);
  assert.deepEqual(copy().math,tuned.math,'editing presentation must never mutate outcome math');
});

test('HTTP WebP upload publishes versioned media with correct MIME and preserves private draft',async t=>{
  const dir=await temp(t),base=await server(t,dir);
  const authHeaders={Authorization:auth};
  const info=await (await fetch(base+'/studio/api/releases',{headers:authHeaders})).json();
  const raw=Buffer.from('UklGRnYAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAA/wD/gABWUDggSgAAANABAJ0BKgIAAgAAwBAloAJ0AQ74p/YAAP71Y/+1h6r/mv8D/Wn//jF7w5JqHsuzbF8QqFqwRwJK1Zun/3sF//uwX/+7Bf62AAAA','base64');
  const record={project:copy(),overrides:{'asset:symbols/ruby.png':{mime:'image/webp',data:raw.toString('base64')}}};
  const post=async(path,body)=>fetch(base+'/studio/api/'+path,{method:'POST',headers:{...authHeaders,Origin:base,'Content-Type':'application/json','X-Skygate-CSRF':info.csrf},body:JSON.stringify(body)});
  const uploaded=await post('releases',record);assert.equal(uploaded.status,201);
  const {id}=await uploaded.json();
  const doc=await(await fetch(base+'/studio/api/releases/'+id,{headers:authHeaders})).json();
  const file=doc.overrides['asset:symbols/ruby.png'].file;
  assert.match(file,/\.webp$/);
  assert.equal((await fetch(base+'/play/media/'+file)).status,404,'draft image must stay private');
  const privateFile=await fetch(base+'/studio/api/media/'+file,{headers:authHeaders});
  assert.equal(privateFile.headers.get('Content-Type'),'image/webp');
  assert.deepEqual(Buffer.from(await privateFile.arrayBuffer()),raw);
  assert.equal((await post('publish',{id,expectedActive:null})).status,200);
  const publicFile=await fetch(base+'/play/media/'+file);
  assert.equal(publicFile.status,200);
  assert.equal(publicFile.headers.get('Content-Type'),'image/webp');
  assert.equal(publicFile.headers.get('X-Content-Type-Options'),'nosniff');
  assert.deepEqual(Buffer.from(await publicFile.arrayBuffer()),raw);
  assert.equal((await post('rollback',{expectedActive:id})).status,200);
});
