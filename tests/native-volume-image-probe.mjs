// Feed to the built image on stdin. No checkout mount, credentials or network.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,statSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {requirePersistentMount} from './native-volume.mjs';
await import('./scripts/native-backup.mjs');await import('./scripts/native-backup-monitor.mjs');await import('./scripts/native-retention.mjs');
const mode=process.argv[2];assert.ok(['mounted','unmounted'].includes(mode));mkdirSync('/data',{recursive:true});
const env={...process.env,RAILWAY_SERVICE_ID:'synthetic-service',RAILWAY_DEPLOYMENT_ID:'00000000-0000-4000-8000-000000000001',RAILWAY_VOLUME_MOUNT_PATH:'/data',
 AGENCY_WALLET_MODE:'sandbox',AGENCY_ENVIRONMENT:'preproduction',AGENCY_DEPLOYMENT_ID:'native-image-smoke',AGENCY_CORE_DEPLOYMENT_ID:'core-image-smoke',
 AGENCY_WALLET_ORIGIN:'https://core.example.invalid',AGENCY_WALLET_KEY_ID:'synthetic-image-smoke',AGENCY_WALLET_SECRET:'synthetic-image-secret-never-for-use-'.repeat(2),
 SKYGATE_AGENCY_DB_PATH:'/data/native.sqlite',SKYGATE_RELEASE_DIR:'/data/releases',AGENCY_STUDIO_SYNC:'0',ENGINE_BACKUP_ENABLED:'false',PORT:'18080'};
for(const key of Object.keys(env))if(key.startsWith('ENGINE_RESTORE_'))delete env[key];
if(mode==='unmounted'){
 const before=statSync('/data');assert.throws(()=>requirePersistentMount(env),{message:'PERSISTENT_NATIVE_VOLUME_REQUIRED'});
 const child=spawnSync(process.execPath,['server.mjs'],{cwd:'/app',env,encoding:'utf8',timeout:12000,maxBuffer:16384});
 assert.notEqual(child.status,0);assert.match(child.stderr,/PERSISTENT_NATIVE_VOLUME_REQUIRED/);
 const after=statSync('/data');assert.deepEqual([before.uid,before.gid,before.mode],[after.uid,after.gid,after.mode]);
 assert.ok(!existsSync('/data/native.sqlite')&&!existsSync('/data/.native-restore.json'));
}else{
 assert.equal(requirePersistentMount(env).verified,true);
 const child=spawn(process.execPath,['server.mjs'],{cwd:'/app',env,stdio:'ignore'});
 let exited=false;const closed=new Promise(resolve=>child.once('exit',()=>{exited=true;resolve();}));
 try{
  const deadline=Date.now()+12000;let health;
  while(Date.now()<deadline){
   assert.ok(!exited,'Native image entrypoint terminated before health');
   try{const response=await fetch('http://127.0.0.1:18080/health',{signal:AbortSignal.timeout(1000),redirect:'error'});if(response.ok){health=await response.json();break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(health?.ok&&health.database==='connected');assert.equal(health.platform_deployment_id,env.RAILWAY_DEPLOYMENT_ID);
  assert.equal(health.native_volume.required,true);assert.equal(health.native_volume.verified,true);assert.equal(health.native_volume.verification,'linux_mountinfo');
  assert.deepEqual(Object.keys(health.native_volume).sort(),['filesystem_type','required','verification','verified']);assert.ok(existsSync('/data/native.sqlite'));
 }finally{child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await closed;clearTimeout(timer);}
}
console.log('PASS: final image actual entrypoint and mount guard: '+mode);
