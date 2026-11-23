import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(resolve(root,p),'utf8');
const server=read('server.mjs');
for(const token of [
  'Content-Security-Policy','Strict-Transport-Security','Permissions-Policy',
  'Cross-Origin-Opener-Policy','Cross-Origin-Resource-Policy',
  "Public Studio testing is forbidden in production",
  'process.umask(0o077)','Refusing to serve Skygate as root',
  'AUTH_CLIENT_LIMIT','server.headersTimeout','server.requestTimeout'
]) assert(server.includes(token),`missing hardening: ${token}`);

const play=read('play/index.html');
assert.equal((play.match(/<script(?![^>]*\\bsrc=)[^>]*>/gi)||[]).length,0,'inline scripts defeat strict CSP');
assert.equal((play.match(/\\son[a-z]+\\s*=/gi)||[]).length,0,'inline event handlers defeat strict CSP');
assert(play.includes('pwa-viewport.js?v=security1'));

const pkg=JSON.parse(read('package.json'));
assert.equal(Object.keys(pkg.dependencies||{}).length,0,'unexpected runtime dependency');
assert.equal(Object.keys(pkg.devDependencies||{}).length,0,'unexpected dev dependency');
assert(/^>=24/.test(pkg.engines?.node||''),'production Node engine must stay on 24+');

const docker=read('Dockerfile');
assert(docker.includes('COPY --chown=1000:1000'));
assert(docker.includes('NODE_OPTIONS=--disable-proto=throw'));
assert(read('.dockerignore').includes('studio/tests'));

const runtimeRoots=['server.mjs','agency-runtime.mjs','agency-wallet.cjs','agency-studio.mjs','gameops-heartbeat.cjs','release-store.mjs','play','studio'];
const files=[];
function collect(p){
  const full=resolve(root,p),st=statSync(full);
  if(st.isDirectory()){
    for(const n of readdirSync(full)){
      if(n==='tests'||n==='tools'||n.endsWith('.md'))continue;
      collect(relative(root,resolve(full,n)));
    }
  }else if(/\\.(?:js|mjs|cjs|html)$/.test(p))files.push(p);
}
for(const p of runtimeRoots)collect(p);
const secretPatterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\\bghp_[A-Za-z0-9]{30,}\\b/,
  /\\bAKIA[0-9A-Z]{16}\\b/,
  /\\bsk_live_[A-Za-z0-9]{16,}\\b/
];
for(const p of files){
  const body=read(p);
  assert(!/\\beval\\s*\\(/.test(body),`eval forbidden: ${p}`);
  assert(!/new\\s+Function\\s*\\(/.test(body),`new Function forbidden: ${p}`);
  for(const pattern of secretPatterns)assert(!pattern.test(body),`credential-like material in ${p}`);
}
console.log(`SECURITY STATIC PASS: ${files.length} runtime files; strict script CSP; no package dependencies; no obvious embedded credentials.`);
