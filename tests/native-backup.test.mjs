import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {encrypt,decrypt,snapshot} from '../scripts/native-backup.mjs';

test('encrypted snapshot restores and rejects tampering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'skygate-native-test-'));
 try{
  const dbPath=join(dir,'live.sqlite'),db=new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE rounds (id INTEGER PRIMARY KEY, amount INTEGER); INSERT INTO rounds(amount) VALUES (42);');
  const plaintext=await snapshot(dbPath);
  db.close();
  const key=randomBytes(32),{manifest,payload}=encrypt(plaintext,'skygate',key);
  assert.equal(manifest.game,'skygate');
  assert.ok(!payload.includes(Buffer.from('CREATE TABLE rounds')));
  assert.deepEqual(decrypt(payload,key).plaintext,plaintext);
  const tampered=Buffer.from(payload);tampered[tampered.length-1]^=1;
  assert.throws(()=>decrypt(tampered,key));
 }finally{await rm(dir,{recursive:true,force:true});}
});
