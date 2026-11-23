import {createNative} from './agency-runtime.mjs';
import {mkdirSync,chownSync} from 'node:fs';
import { startBridge } from './gameops-heartbeat.cjs';
import { createServer } from 'node:http';
import { timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { createReleaseStore, ReleaseError } from './release-store.mjs';
import { dirname, extname, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
process.umask(0o077);
const {version}=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const port=Number(process.env.PORT || 3000);
const types={'.webmanifest':'application/manifest+json; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ogg':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.md':'text/markdown; charset=utf-8'};
const csp="default-src 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; manifest-src 'self'; frame-src 'self'; worker-src 'none'";
const base=Object.freeze({
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'SAMEORIGIN',
  'Content-Security-Policy':csp,
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self)',
  'Cross-Origin-Opener-Policy':'same-origin',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Origin-Agent-Cluster':'?1',
  'X-Permitted-Cross-Domain-Policies':'none',
  'Strict-Transport-Security':'max-age=31536000'
});
const authUser=process.env.SKYGATE_STUDIO_USER || 'studio';
const authPassword=process.env.SKYGATE_STUDIO_PASSWORD || '';
// Explicit, reversible opt-in for the owner's password-free Studio testing.
// Keep NODE_ENV, stored credentials, durable storage and request validation intact.
const publicStudioTesting=process.env.SKYGATE_STUDIO_PUBLIC_TESTING==='true';
if(process.env.NODE_ENV==='production'&&publicStudioTesting)throw Error('Public Studio testing is forbidden in production');
// Root is used only long enough to prepare Railway's mounted volume. All
// request handling, release writes and wallet state then run as uid/gid 1000.
if(process.getuid?.()===0){
  if(process.env.RAILWAY_VOLUME_MOUNT_PATH==='/data'){mkdirSync('/data',{recursive:true});chownSync('/data',1000,1000);}
  process.setgid(1000);process.setuid(1000);
}
if(process.getuid?.()===0)throw Error('Refusing to serve Skygate as root');
const releases=createReleaseStore(process.env.SKYGATE_RELEASE_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || (process.env.NODE_ENV==='production'?null:resolve(root,'.local-data')));
const native=createNative({releases});
const csrf=randomBytes(32).toString('hex');
const json=(res,status,value)=>{res.writeHead(status,{...base,'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function readBody(req){
 if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw new ReleaseError('Expected JSON',415);
 if(Number(req.headers['content-length']||0)>34*1024*1024)throw new ReleaseError('Upload exceeds 34 MB',413);
 let size=0,parts=[];for await(const part of req){size+=part.length;if(size>34*1024*1024)throw new ReleaseError('Upload exceeds 34 MB',413);parts.push(part);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new ReleaseError('Invalid JSON');}
}
const needsAuth=path => path==='/'||path==='/studio'||path.startsWith('/studio/');
function constantEqual(a,b){
  const aa=createHash('sha256').update(String(a),'utf8').digest();
  const bb=createHash('sha256').update(String(b),'utf8').digest();
  return timingSafeEqual(aa,bb);
}
const AUTH_WINDOW_MS=60_000, AUTH_CLIENT_LIMIT=12, AUTH_GLOBAL_LIMIT=500;
const authFailures=new Map();let globalAuth={start:Date.now(),count:0};
function authClient(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return (forwarded||req.socket.remoteAddress||'unknown').slice(0,128);
}
function noteAuthFailure(req){
  const now=Date.now();
  if(now-globalAuth.start>=AUTH_WINDOW_MS)globalAuth={start:now,count:0};
  globalAuth.count++;
  const key=authClient(req);let b=authFailures.get(key);
  if(!b||now-b.start>=AUTH_WINDOW_MS)b={start:now,count:0};
  b.count++;authFailures.set(key,b);
  if(authFailures.size>2048){
    for(const [k,v] of authFailures){if(now-v.start>=AUTH_WINDOW_MS)authFailures.delete(k);}
    while(authFailures.size>2048)authFailures.delete(authFailures.keys().next().value);
  }
  return b.count>AUTH_CLIENT_LIMIT||globalAuth.count>AUTH_GLOBAL_LIMIT;
}
function clearAuthFailure(req){authFailures.delete(authClient(req));}
function isAuthed(req){
  const header=req.headers.authorization||'';
  if(typeof header!=='string'||!header.startsWith('Basic ')||header.length>1024)return false;
  let raw;try{raw=Buffer.from(header.slice(6),'base64').toString('utf8');}catch{return false;}
  const colon=raw.indexOf(':');if(colon<0)return false;
  return constantEqual(raw.slice(0,colon),authUser)&&constantEqual(raw.slice(colon+1),authPassword);
}
const server=createServer(async(req,res)=>{
 try{
  for(const [name,value] of Object.entries(base))res.setHeader(name,value);
  let raw=new URL(req.url||'/', 'http://localhost').pathname;
  try{raw=decodeURIComponent(raw);}catch{res.writeHead(400,base);res.end('Invalid path');return;}
  if(raw.includes('\\')||raw.includes('\0')){res.writeHead(400,base);res.end('Invalid path');return;}
  // Authorize the same canonical path that will be resolved on disk. Encoded
  // separators/dot segments must never turn a public path into a private file.
  raw=posix.normalize(raw);
  // iOS also probes the conventional root path. Remap only this icon to
  // the public Game asset without exposing any other repository-root files.
  if(raw==='/apple-touch-icon.png')raw='/play/apple-touch-icon.png';
  if(raw==='/api/agency/mode' && !native.enabled){json(res,200,{agency:false});return;}
  if(await native.handle(req,res,raw))return;
  if(native.enabled && (raw==='/studio'||raw.startsWith('/studio/'))){json(res,404,{error:'Studio unavailable on native runtime'});return;}
  const api=raw.startsWith('/studio/api/');
  if(!['GET','HEAD'].includes(req.method||'')&&!(api&&req.method==='POST')){res.writeHead(405,{...base,Allow:'GET, HEAD'});res.end();return;}
  if(raw==='/health') {
    native.health(); // readiness check without exposing database, wallet or source metadata
    res.writeHead(200,{...base,'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?'':JSON.stringify({ok:true,service:native.enabled?'skygate-agency':'skygate-studio',version}));return;
  }
  // Only the two app directories are web roots; repository files are not routes.
  if(raw!=='/'&&raw!=='/studio'&&!raw.startsWith('/studio/')&&raw!=='/play'&&!raw.startsWith('/play/')){res.writeHead(404,base);res.end('Not Found');return;}
  if(raw.split('/').some(part=>part.startsWith('.'))){res.writeHead(404,base);res.end('Not Found');return;}
  const privateRoute=needsAuth(raw);
  const studioAuthRequired=!native.enabled&&privateRoute&&
    (process.env.NODE_ENV==='production'||process.env.SKYGATE_STUDIO_REQUIRE_AUTH==='true');
  if(studioAuthRequired){
    const privateHeaders={...base,'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store'};
    if(!authPassword){res.writeHead(503,privateHeaders);res.end('Studio access is not configured');return;}
    if(!isAuthed(req)){
      const limited=noteAuthFailure(req);
      res.writeHead(limited?429:401,{...privateHeaders,...(limited?{'Retry-After':'60'}:{'WWW-Authenticate':'Basic realm="SKYGATE Studio", charset="UTF-8"'})});
      res.end(limited?'Too many failed authentication attempts':'Private studio: authentication required');return;
    }
    clearAuthFailure(req);
  }
  if(api){
    if(req.method==='POST'){
      let origin;try{origin=new URL(req.headers.origin);}catch{throw new ReleaseError('Same-origin request required',403);}
      if(!['http:','https:'].includes(origin.protocol)||origin.host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site'||!constantEqual(req.headers['x-skygate-csrf']||'',csrf))throw new ReleaseError('Refresh Studio before publishing',403);
      const body=await readBody(req);
      if(!body||typeof body!=='object'||Array.isArray(body))throw new ReleaseError('Expected a release document');
      if(raw==='/studio/api/releases'){json(res,201,await releases.stage(body));return;}
      if(raw==='/studio/api/publish'){json(res,200,await releases.activate(body));return;}
      if(raw==='/studio/api/rollback'){json(res,200,await releases.activate(body,true));return;}
      throw new ReleaseError('Endpoint not found',404);
    }
    if(raw==='/studio/api/releases'){json(res,200,{...await releases.summary(),csrf});return;}
    const match=raw.match(/^\/studio\/api\/releases\/([a-f0-9-]{36})$/);
    if(match){json(res,200,await releases.revision(match[1]));return;}
    if(!raw.startsWith('/studio/api/media/'))throw new ReleaseError('Endpoint not found',404);
  }
  if(raw==='/play/release.json'){json(res,200,await releases.live());return;}
  if(raw.startsWith('/play/media/')||raw.startsWith('/studio/api/media/')){
    const file=raw.split('/').at(-1),media=await releases.media(file,privateRoute);
    res.writeHead(200,{...base,'Content-Type':media.mime,'Content-Length':media.size,'Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':privateRoute?'private, no-store':'public, max-age=31536000, immutable'});
    if(req.method==='HEAD'){res.end();return;}createReadStream(media.path).on('error',()=>res.destroy()).pipe(res);return;
  }
  if(raw==='/studio/preview/'||raw==='/studio/editor-preview/'){
    const html=(await readFile(resolve(root,'play/index.html'),'utf8')).replace('<head>','<head><base href="/play/">');
    res.writeHead(200,{...base,'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive'});res.end(req.method==='HEAD'?'':html);return;
  }
  if(raw==='/'){res.writeHead(308,{...base,Location:native.enabled?'/play/':'/studio/','Cache-Control':'no-store'});res.end();return;}
  if(raw==='/studio'||raw==='/play'){res.writeHead(308,{...base,Location:raw+'/'});res.end();return;}
  let target=resolve(root,'.'+raw);
  if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403,base);res.end('Forbidden');return;}
  let info;try{info=await stat(target);if(info.isDirectory()){target=resolve(target,'index.html');info=await stat(target);}if(!info.isFile())throw Error('not file')}catch{res.writeHead(404,base);res.end('Not Found');return;}
  const type=types[extname(target).toLowerCase()];if(!type){res.writeHead(404,base);res.end('Not Found');return;}
  res.writeHead(200,{...base,...(privateRoute?{'X-Robots-Tag':'noindex, nofollow, noarchive'}:{}),'Content-Type':type,'Content-Length':info.size,'Cache-Control':privateRoute?'private, no-store':type.startsWith('text/html')?'no-cache':'public, max-age=3600'});
  if(req.method==='HEAD'){res.end();return;}createReadStream(target).on('error',()=>res.destroy()).pipe(res);
 }catch(e){if(!(e instanceof ReleaseError))console.error(e.message);if(!res.headersSent)json(res,e.status||500,{error:e instanceof ReleaseError?e.message:'Server error'});else res.destroy();}
});
server.requestTimeout=120_000;
server.headersTimeout=15_000;
server.keepAliveTimeout=5_000;
server.maxHeadersCount=100;
server.maxRequestsPerSocket=100;
server.listen(port,'0.0.0.0',function(){console.log(`SKYGATE Studio listening on ${this.address().port}`);startBridge({game:'skygate-5000',port:this.address().port,version});});