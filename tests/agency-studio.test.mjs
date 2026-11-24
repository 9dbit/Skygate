import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createReleaseStore} from '../release-store.mjs';
import {createStudioSync} from '../agency-studio.mjs';
const project=JSON.parse(await readFile(new URL('../studio/project.json',import.meta.url),'utf8'));
function pack(value=project){const body=JSON.stringify({format:'playground.studio.v1',game:'skygate-5000',payload:{project:value,overrides:{}}});return {id:randomUUID(),body,sha256:createHash('sha256').update(body).digest('hex')};}
test('signed Studio intent validates first, persists activation, survives restart and rolls back',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sky-studio-sync-')),releases=createReleaseStore(join(dir,'releases')),pkg=pack(),reports=[];
 const env={AGENCY_STUDIO_SYNC:'1',SKYGATE_AGENCY_DB_PATH:join(dir,'wallet.sqlite')};
 let intent={generation:0,desired:null,candidate:pkg,apply:null},sync;
 const client={studioSync:async p=>{reports.push(p);return intent;}};
 try{
  sync=createStudioSync({env,client,releases});await sync.tick();assert.equal(reports.at(-1).receipt.state,'validated');assert.equal(await releases.live(),null);
  intent={generation:1,desired:pkg.id,apply:pkg};await sync.tick();assert.equal((await releases.live()).id,pkg.id);assert.equal(reports.at(-1).generation,1);
  await sync.close();sync=createStudioSync({env,client,releases});await sync.tick();assert.equal(reports.at(-1).active,pkg.id);
  const invalid=pack({...project,layers:[]});intent={generation:2,desired:invalid.id,apply:invalid,candidate:invalid};await sync.tick();assert.equal(reports.at(-1).receipt.state,'rejected');assert.equal((await releases.live()).id,pkg.id);assert.equal(reports.at(-1).generation,1);assert.ok(reports.at(-1).error);
  intent={generation:2,desired:null,apply:null};await sync.tick();assert.equal(await releases.live(),null);assert.equal(reports.at(-1).generation,2);
  intent={generation:2,desired:null,candidate:{...pkg,sha256:'0'.repeat(64)}};await sync.tick();assert.equal(reports.at(-1).receipt.state,'rejected');
  await assert.rejects(releases.stage({project:{...project,projectName:'Changed'}},pkg.id),/immutable|identity|changed|berubah/i);
 }finally{await sync?.close();await rm(dir,{recursive:true,force:true});}
});
