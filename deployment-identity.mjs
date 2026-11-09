import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {existsSync,mkdirSync,realpathSync,chmodSync} from 'node:fs';
import {basename,dirname,isAbsolute,relative,resolve,sep} from 'node:path';

export function requestedIdentity(env,game){
 const environment=env.AGENCY_ENVIRONMENT||'sandbox';
 if(!['sandbox','preproduction','production'].includes(environment))throw Error('Invalid AGENCY_ENVIRONMENT');
 if(environment!=='sandbox'&&(!env.AGENCY_DEPLOYMENT_ID||!env.AGENCY_CORE_DEPLOYMENT_ID))throw Error('Explicit native and core deployment IDs required');
 const deployment_id=env.AGENCY_DEPLOYMENT_ID||'legacy-'+game,core_deployment_id=env.AGENCY_CORE_DEPLOYMENT_ID||'legacy-sandbox-core';
 if([deployment_id,core_deployment_id].some(x=>!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(x)))throw Error('Invalid deployment identity');
 return Object.freeze({environment,deployment_id,core_deployment_id,game_id:game,identity_version:1});
}
export function canonicalPath(path,env){
 if(!isAbsolute(path||''))throw Error('Absolute persistent database path required');
 let ancestor=path,parts=[];while(!existsSync(ancestor)){parts.unshift(basename(ancestor));ancestor=dirname(ancestor);}
 const result=resolve(realpathSync(ancestor),...parts),mount=env.RAILWAY_VOLUME_MOUNT_PATH;
 if(mount){const rel=relative(realpathSync(mount),result);if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Native database escapes persistent volume');}
 return result;
}
function compare(db,identity){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='native_deployment_identity'").get()){if(identity.environment!=='sandbox'&&db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get())throw Error('UNBOUND_DATABASE_CANNOT_CHANGE_ENVIRONMENT');return false;}
 const row=db.prepare('SELECT identity_json FROM native_deployment_identity WHERE singleton=1').get();
 const persisted=row&&JSON.parse(row.identity_json);
 if(!persisted||Object.keys(identity).some(k=>persisted[k]!==identity[k])||Object.keys(persisted).length!==Object.keys(identity).length)throw Error('NATIVE_DEPLOYMENT_IDENTITY_MISMATCH');
 return true;
}
export function openBoundDatabase(path,env,game){
 path=canonicalPath(path,env);const identity=requestedIdentity(env,game);
 if(existsSync(path)){const ro=new DatabaseSync(path,{readOnly:true});try{compare(ro,identity);}finally{ro.close();}}
 mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path,{timeout:30000});chmodSync(path,0o600);
 try{
  db.exec('BEGIN IMMEDIATE');
  if(!compare(db,identity)){
   db.exec('CREATE TABLE native_deployment_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1),identity_json TEXT NOT NULL)');
   db.prepare('INSERT INTO native_deployment_identity VALUES(1,?)').run(JSON.stringify(identity));
  }
  db.exec(`CREATE TRIGGER IF NOT EXISTS native_identity_update BEFORE UPDATE ON native_deployment_identity BEGIN SELECT RAISE(ABORT,'immutable native identity'); END;
  CREATE TRIGGER IF NOT EXISTS native_identity_delete BEFORE DELETE ON native_deployment_identity BEGIN SELECT RAISE(ABORT,'immutable native identity'); END;
  CREATE TRIGGER IF NOT EXISTS native_identity_insert BEFORE INSERT ON native_deployment_identity BEGIN SELECT RAISE(ABORT,'immutable native identity'); END; COMMIT;`);
  return {db,path,identity};
 }catch(e){db.close();throw e;}
}
export function validateRedeemed(s,env,identity){
 if((identity.environment!=='sandbox'||env.AGENCY_CORE_DEPLOYMENT_ID)&&(s.game!==identity.game_id||s.provider!=='soft-tech'||s.environment!==identity.environment||(s.core_deployment_id||s.deployment_id)!==identity.core_deployment_id))throw Error('CORE_DEPLOYMENT_IDENTITY_MISMATCH');
}
export function nativeCookie(token,env,identity){return createHmac('sha256',env.AGENCY_WALLET_SECRET).update(['native.cookie.v2',identity.environment,identity.deployment_id,identity.core_deployment_id,identity.game_id,token].join('\n')).digest('hex');}
