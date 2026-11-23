import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {request} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const auth='Basic '+Buffer.from('qa:security-test-only-password').toString('base64');

async function start(t,extra={}){
  const dir=mkdtempSync(join(tmpdir(),'sky-security-'));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,
    PORT:'0',NODE_ENV:'production',SKYGATE_RELEASE_DIR:dir,RAILWAY_VOLUME_MOUNT_PATH:'',
    SKYGATE_STUDIO_USER:'qa',SKYGATE_STUDIO_PASSWORD:'security-test-only-password',
    SKYGATE_STUDIO_PUBLIC_TESTING:'false',SKYGATE_STUDIO_REQUIRE_AUTH:'true',...extra},
    stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}rmSync(dir,{recursive:true,force:true});});
  return await new Promise((resolve,reject)=>{
    let out='',err='';const timer=setTimeout(()=>reject(Error('security server startup timeout: '+err)),7000);
    child.stderr.on('data',b=>err+=b);
    child.stdout.on('data',b=>{out+=b;const m=out.match(/listening on (\d+)/);if(m){clearTimeout(timer);resolve({child,port:Number(m[1])});}});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('security server exited '+code+': '+err));});
  });
}
function call(port,path,{authorization}={}){
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,headers:authorization?{authorization}:{}},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
    });
    req.on('error',reject);req.end();
  });
}

test('production emits restrictive browser and transport security headers',async t=>{
  const {port}=await start(t);
  const play=await call(port,'/play/');
  assert.equal(play.status,200);
  const csp=play.headers['content-security-policy'];
  assert.match(csp,/default-src 'none'/);
  assert.match(csp,/script-src 'self'/);
  assert.doesNotMatch(csp,/script-src[^;]*unsafe-inline/);
  assert.match(play.headers['strict-transport-security'],/max-age=31536000/);
  assert.equal(play.headers['x-content-type-options'],'nosniff');
  assert.equal(play.headers['x-frame-options'],'SAMEORIGIN');
  assert.equal(play.headers['cross-origin-opener-policy'],'same-origin');
  assert.equal(play.headers['cross-origin-resource-policy'],'same-origin');
  assert.match(play.headers['permissions-policy'],/camera=\(\)/);

  const health=await call(port,'/health');
  assert.equal(health.status,200);
  assert.deepEqual(Object.keys(JSON.parse(health.body)).sort(),['ok','service','version']);
  for(const word of ['database','wallet','source_commit'])assert(!health.body.includes(word));

  const privatePage=await call(port,'/studio/');
  assert.equal(privatePage.status,401);
  assert.equal(privatePage.headers['cache-control'],'no-store');
  assert.match(privatePage.headers['x-robots-tag'],/noindex/);
});

test('Studio invalid credentials are throttled without locking out valid owner credentials',async t=>{
  const {port}=await start(t);
  let throttled=false;
  const bad='Basic '+Buffer.from('qa:wrong').toString('base64');
  for(let i=0;i<16;i++){
    const r=await call(port,'/studio/',{authorization:bad});
    assert([401,429].includes(r.status));
    throttled ||= r.status===429;
  }
  assert(throttled,'brute-force throttle did not engage');
  assert.equal((await call(port,'/studio/',{authorization:auth})).status,200,'valid owner must bypass failed-attempt lockout');
});

test('production refuses password-free public Studio mode at process startup',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sky-security-refuse-'));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'0',NODE_ENV:'production',
    SKYGATE_RELEASE_DIR:dir,RAILWAY_VOLUME_MOUNT_PATH:'',SKYGATE_STUDIO_PUBLIC_TESTING:'true',
    SKYGATE_STUDIO_PASSWORD:'security-test-only-password'},stdio:['ignore','pipe','pipe']});
  let err='';child.stderr.on('data',b=>err+=b);
  const [code]=await once(child,'exit');rmSync(dir,{recursive:true,force:true});
  assert.notEqual(code,0);assert.match(err,/Public Studio testing is forbidden in production/);
});
