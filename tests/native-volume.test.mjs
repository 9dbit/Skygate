import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,symlink,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseMountInfo,requirePersistentMount,platformHealth,eventProvenance,MAX_MOUNTINFO_BYTES,MAX_MOUNTINFO_LINES,MAX_MOUNTINFO_LINE_BYTES} from '../native-volume.mjs';
import {restoreFromRemote,run as runBackup} from '../scripts/native-backup.mjs';

const ROOT='10 1 8:1 / / rw,relatime - ext4 /dev/fixture rw\n';
const BIND='11 10 8:1 /owned/native /data rw,relatime shared:4 future:ignored - ext4 /dev/fixture rw\n';
const UUID='00000000-0000-4000-8000-000000000001',ERROR={message:'PERSISTENT_NATIVE_VOLUME_REQUIRED'};
const cloud=mount=>({RAILWAY_SERVICE_ID:'synthetic-service',RAILWAY_DEPLOYMENT_ID:UUID,RAILWAY_VOLUME_MOUNT_PATH:mount});
const repo=dirname(dirname(fileURLToPath(import.meta.url)));

test('same-device bind and optional fields preserve the exact mount record',()=>{
 const records=parseMountInfo(Buffer.from(ROOT+BIND));
 assert.deepEqual(records.get(11),{mount_id:11,root:'/owned/native',mountpoint:'/data',filesystem_type:'ext4',writable:true});
});
test('escaped paths decode once and stacked mounts keep distinct IDs',()=>{
 const escaped=BIND.replace('/data',String.raw`/data\040space\011tab\012line\134040`);
 assert.equal(parseMountInfo(Buffer.from(ROOT+escaped)).get(11).mountpoint,'/data space\ttab\nline\\040');
 const records=parseMountInfo(Buffer.from(ROOT+BIND+'12 11 0:9 / /data rw - tmpfs tmpfs rw\n'));
 assert.equal(records.get(11).filesystem_type,'ext4');assert.equal(records.get(12).filesystem_type,'tmpfs');
});
test('malformed and bounded mount tables fail closed',()=>{
 const invalid=['','invalid',ROOT+BIND+BIND,BIND.replace(' - ',' '),BIND.replace('11 10','x 10'),BIND.replace('8:1','not-device'),
  BIND.replace('/data',String.raw`/data\077`),BIND.replace('/data','data'),BIND.replace('/data','/data\0'),BIND.replace(' ext4 ',' ext/4 '),
  BIND.replace('11 10','9007199254740992 10'),'x'.repeat(MAX_MOUNTINFO_BYTES+1),
  ROOT+'11 10 8:1 / /data rw '+'x'.repeat(MAX_MOUNTINFO_LINE_BYTES)+' - ext4 disk rw\n',
  Array.from({length:MAX_MOUNTINFO_LINES+1},(_,i)=>`${i+1} 0 8:1 / /data rw - ext4 disk rw\n`).join('')];
 for(const raw of invalid)assert.throws(()=>parseMountInfo(Buffer.from(raw)),ERROR);
});
test('real kernel rejects an existing ordinary directory, symlinks and missing paths',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-volume-'));
 try{
  const mount=join(dir,'data'),link=join(dir,'link');await mkdir(mount);await symlink(mount,link);
  for(const path of [mount,link,join(mount,'missing'),'/'])assert.throws(()=>requirePersistentMount(cloud(path)),ERROR);
  assert.deepEqual(await readdir(mount),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('real shared-memory mount and missing cloud mount fail closed',()=>{
 if(process.platform==='linux'&&existsSync('/dev/shm'))assert.throws(()=>requirePersistentMount(cloud('/dev/shm')),ERROR);
 assert.throws(()=>requirePersistentMount({RAILWAY_SERVICE_ID:'synthetic'}),ERROR);
 assert.throws(()=>requirePersistentMount(cloud('relative')),ERROR);
 assert.equal(requirePersistentMount({}),null);
});
test('non-Linux cloud never falls back to a directory',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(process,'platform');
 try{Object.defineProperty(process,'platform',{value:'darwin'});assert.throws(()=>requirePersistentMount(cloud('/data')),ERROR);assert.equal(requirePersistentMount({}),null);}
 finally{Object.defineProperty(process,'platform',descriptor);}
});
test('unreadable proc metadata cannot fall back to an existing directory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-volume-'));
 try{
  const source=`import {requirePersistentMount} from ${JSON.stringify(new URL('../native-volume.mjs',import.meta.url).href)};try{requirePersistentMount(${JSON.stringify(cloud(dir))});process.exit(2)}catch(e){if(e.message!=='PERSISTENT_NATIVE_VOLUME_REQUIRED')throw e;process.stdout.write('blocked')}`;
  const child=spawnSync(process.execPath,['--permission','--allow-fs-read='+repo,'--allow-fs-read='+dir,'--input-type=module','-e',source],{encoding:'utf8',timeout:5000,maxBuffer:4096});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'blocked');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('restore checks actual mount before downloading or creating marker',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'native-volume-'));let requests=0;
 t.mock.method(globalThis,'fetch',()=>{requests++;throw Error('must not download');});
 try{
  await assert.rejects(restoreFromRemote({...cloud(dir),SKYGATE_AGENCY_DB_PATH:join(dir,'native.sqlite'),ENGINE_RESTORE_OBJECT_KEY:'native/skygate/synthetic.aesgcm'}),ERROR);
  const values=cloud(dir),old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  try{Object.assign(process.env,values);await assert.rejects(runBackup(),ERROR);}
  finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  assert.equal(requests,0);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('actual server entrypoint cannot initialize an ordinary cloud directory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-volume-entry-'));
 try{
  const child=spawnSync(process.execPath,['server.mjs'],{cwd:repo,env:{PATH:process.env.PATH,...cloud(dir),AGENCY_WALLET_MODE:'sandbox',SKYGATE_AGENCY_DB_PATH:join(dir,'native.sqlite')},encoding:'utf8',timeout:5000,maxBuffer:8192});
  assert.notEqual(child.status,0);assert.match(child.stderr,/PERSISTENT_NATIVE_VOLUME_REQUIRED/);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('health and emission provenance contain bounded metadata only',()=>{
 assert.deepEqual(platformHealth({}),{platform_deployment_id:null,native_volume:{required:false,verified:false,verification:'not_required_local',filesystem_type:null}});
 const before=Date.now(),event=eventProvenance({RAILWAY_DEPLOYMENT_ID:UUID,secret:'do-not-copy'});
 assert.equal(event.platform_deployment_id,UUID);assert.deepEqual(Object.keys(event).sort(),['event_at','platform_deployment_id']);
 assert.ok(Date.parse(event.event_at)>=before&&Date.parse(event.event_at)<=Date.now());
 assert.equal(eventProvenance({RAILWAY_DEPLOYMENT_ID:'not-a-uuid'}).platform_deployment_id,null);
});
