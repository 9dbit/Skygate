// Required CI entrypoint inside a private mount namespace; no live data/network.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,statSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {requirePersistentMount,platformHealth} from '../native-volume.mjs';
import {openBoundDatabase} from '../deployment-identity.mjs';

const denied=env=>assert.throws(()=>requirePersistentMount(env),{message:'PERSISTENT_NATIVE_VOLUME_REQUIRED'});
const base=mkdtempSync(join(tmpdir(),'native-mount-fixture-')),source=join(base,'source'),target=join(base,'mount space\ttab\nline\\slash');
mkdirSync(source);mkdirSync(target);
const env={RAILWAY_SERVICE_ID:'synthetic-service',RAILWAY_DEPLOYMENT_ID:'00000000-0000-4000-8000-000000000001',RAILWAY_VOLUME_MOUNT_PATH:target,
 AGENCY_ENVIRONMENT:'preproduction',AGENCY_DEPLOYMENT_ID:'native-mount-fixture',AGENCY_CORE_DEPLOYMENT_ID:'core-mount-fixture'};
let mounted=0;
try{
 denied(env);
 execFileSync('mount',['--bind',source,target]);mounted=1;
 assert.equal(statSync(source).dev,statSync(target).dev);assert.equal(statSync(target).dev,statSync(base).dev);
 const proof=requirePersistentMount(env);assert.equal(proof.verified,true);assert.equal(proof.verification,'linux_mountinfo');
 const health=platformHealth(env);assert.equal(health.platform_deployment_id,env.RAILWAY_DEPLOYMENT_ID);
 assert.deepEqual(Object.keys(health.native_volume).sort(),['filesystem_type','required','verification','verified']);
 const path=join(target,'native.sqlite');openBoundDatabase(path,env,'skygate-5000').db.close();openBoundDatabase(path,env,'skygate-5000').db.close();
 mkdirSync(join(target,'ordinary'));denied({...env,RAILWAY_VOLUME_MOUNT_PATH:join(target,'ordinary')});
 const alias=join(base,'alias');symlinkSync(target,alias);denied({...env,RAILWAY_VOLUME_MOUNT_PATH:alias});
 execFileSync('mount',['-t','tmpfs','-o','size=1m,nodev,nosuid','tmpfs',target]);mounted=2;denied(env);
 execFileSync('umount',[target]);mounted=1;assert.equal(requirePersistentMount(env).verified,true);
 execFileSync('mount',['-o','remount,bind,ro',target]);denied(env);
 execFileSync('umount',[target]);mounted=0;denied(env);
 assert.ok(existsSync(join(source,'native.sqlite'))&&!existsSync(path));
 execFileSync('mount',['-t','tmpfs','-o','size=1m,nodev,nosuid','tmpfs',target]);mounted=1;denied(env);
}finally{while(mounted){execFileSync('umount',[target]);mounted--;}rmSync(base,{recursive:true,force:true});}
console.log('PASS: actual escaped same-filesystem bind, native identity open, readonly/ordinary/symlink/tmpfs rejection, no stale proof');
