import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,mkdirSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHmac,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openBoundDatabase,nativeCookie,validateRedeemed} from '../deployment-identity.mjs';
import {createNative} from '../agency-runtime.mjs';
import walletTransport from '../agency-wallet.cjs';
const env=()=>({AGENCY_ENVIRONMENT:'preproduction',AGENCY_DEPLOYMENT_ID:'native-test-deployment',AGENCY_CORE_DEPLOYMENT_ID:'core-test-deployment',AGENCY_WALLET_SECRET:'q'.repeat(40),AGENCY_WALLET_MODE:'sandbox'});
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(fn){const directory=mkdtempSync(join(tmpdir(),'native-isolation-'));return Promise.resolve().then(()=>fn(directory)).finally(()=>rmSync(directory,{recursive:true,force:true}));}
test('immutable native identity rejects foreign environment before writing',()=>fixture(dir=>{
 const path=join(dir,'native.sqlite'),opened=openBoundDatabase(path,env(),'skygate-5000');
 for(const sql of ["DELETE FROM native_deployment_identity","UPDATE native_deployment_identity SET identity_json='{}'","INSERT OR REPLACE INTO native_deployment_identity VALUES(1,'{}')"])assert.throws(()=>opened.db.exec(sql),/immutable/);
 opened.db.close();const before=readFileSync(path);
 assert.throws(()=>openBoundDatabase(path,{...env(),AGENCY_ENVIRONMENT:'production'},'skygate-5000'),/IDENTITY_MISMATCH/);
 assert.deepEqual(readFileSync(path),before);
}));
test('unbound legacy database cannot be adopted as preproduction',()=>fixture(dir=>{
 const path=join(dir,'native.sqlite'),db=new DatabaseSync(path);db.exec('CREATE TABLE old_sessions(id TEXT)');db.close();const before=readFileSync(path);
 assert.throws(()=>openBoundDatabase(path,env(),'skygate-5000'),/UNBOUND_DATABASE/);assert.deepEqual(readFileSync(path),before);
}));
test('volume containment and cookie/deployment namespaces reject cross-environment use',()=>fixture(dir=>{
 const mount=join(dir,'mount'),outside=join(dir,'outside');mkdirSync(mount);mkdirSync(outside);symlinkSync(outside,join(mount,'link'));
 assert.throws(()=>openBoundDatabase(join(mount,'link','native.sqlite'),{...env(),RAILWAY_VOLUME_MOUNT_PATH:mount},'skygate-5000'),/escapes/);
 const opened=openBoundDatabase(join(mount,'native.sqlite'),env(),'skygate-5000');opened.db.close();
 assert.notEqual(nativeCookie('x'.repeat(48),env(),opened.identity),nativeCookie('x'.repeat(48),env(),{...opened.identity,environment:'sandbox'}));
 const good={provider:'soft-tech',game:'skygate-5000',environment:'preproduction',deployment_id:'core-test-deployment'};validateRedeemed(good,env(),opened.identity);
 for(const bad of [{},{...good,environment:'sandbox'},{...good,deployment_id:'foreign-core'},{...good,provider:'foreign'},{...good,game:'wrong-game'}])assert.throws(()=>validateRedeemed(bad,env(),opened.identity),/IDENTITY_MISMATCH/);
}));
test('v2 transport signs exact body, environment and Core audience',async()=>{
 let sent;
 const wallet=walletTransport.createAgencyWallet({origin:'https://core.example',keyId:'test-engine',secret:'q'.repeat(40),environment:'preproduction',audience:'core-test-deployment',fetchImpl:async(url,options)=>{sent={url,options};return new Response('{"ok":true}',{status:200});}});
 await wallet.redeem('x'.repeat(48),'request-id');const h=sent.options.headers;
 const canonical=['agency.v2','preproduction','core-test-deployment','POST','/api/v4/agency-game/redeem',h['X-Agency-Timestamp'],h['X-Agency-Nonce'],sha(sent.options.body)].join('\n');
 assert.equal(h['X-Agency-Version'],'2');assert.equal(h['X-Agency-Audience'],'core-test-deployment');
 assert.equal(h['X-Agency-Signature'],createHmac('sha256','q'.repeat(40)).update(canonical).digest('hex'));
 assert.notEqual(h['X-Agency-Signature'],createHmac('sha256','q'.repeat(40)).update(canonical.replace('preproduction','sandbox')).digest('hex'));
});
test('production startup remains quarantined with no wallet calls',()=>fixture(async dir=>{
 let calls=0;const app=createNative({env:{...env(),AGENCY_ENVIRONMENT:'production',SKYGATE_AGENCY_DB_PATH:join(dir,'native.sqlite')},releases:{live:async()=>null},wallet:{redeem:async()=>{calls++;}}});
 try{assert.equal(app.health().deployment_identity.play_enabled,false);await assert.rejects(app.test.redeem('x'.repeat(48)),/PRODUCTION_RELEASE_GATES_PENDING/);await app.test.recover();assert.equal(calls,0);}finally{app.close();}
}));
