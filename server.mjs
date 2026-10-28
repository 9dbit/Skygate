import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT || 3000);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ogg':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.md':'text/markdown; charset=utf-8'};
const base={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN'};
const authUser=process.env.SKYGATE_STUDIO_USER || 'studio';
const authPassword=process.env.SKYGATE_STUDIO_PASSWORD || '';
const needsAuth=path => path==='/'||path==='/studio'||path.startsWith('/studio/');
function constantEqual(a,b){const aa=Buffer.from(a,'utf8'),bb=Buffer.from(b,'utf8');return aa.length===bb.length&&timingSafeEqual(aa,bb);}
function isAuthed(req){
  const header=req.headers.authorization||'';
  if(typeof header!=='string'||!header.startsWith('Basic ')||header.length>1024)return false;
  let raw;try{raw=Buffer.from(header.slice(6),'base64').toString('utf8');}catch{return false;}
  const colon=raw.indexOf(':');if(colon<0)return false;
  return constantEqual(raw.slice(0,colon),authUser)&&constantEqual(raw.slice(colon+1),authPassword);
}
createServer(async(req,res)=>{
 try{
  let raw=new URL(req.url||'/', 'http://localhost').pathname;
  if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405,{...base,Allow:'GET, HEAD'});res.end();return;}
  try{raw=decodeURIComponent(raw);}catch{res.writeHead(400,base);res.end('Invalid path');return;}
  if(raw.includes('\\')||raw.includes('\0')){res.writeHead(400,base);res.end('Invalid path');return;}
  // Authorize the same canonical path that will be resolved on disk. Encoded
  // separators/dot segments must never turn a public path into a private file.
  raw=posix.normalize(raw);
  if(raw==='/health') {res.writeHead(200,{...base,'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,service:'skygate-studio',version:'0.4.2'}));return;}
  // Only the two app directories are web roots; repository files are not routes.
  if(raw!=='/'&&raw!=='/studio'&&!raw.startsWith('/studio/')&&raw!=='/play'&&!raw.startsWith('/play/')){res.writeHead(404,base);res.end('Not Found');return;}
  if(raw.split('/').some(part=>part.startsWith('.'))){res.writeHead(404,base);res.end('Not Found');return;}
  const privateRoute=needsAuth(raw);
  if(privateRoute&&process.env.NODE_ENV==='production'&&(authPassword||process.env.SKYGATE_STUDIO_REQUIRE_AUTH==='true')){
    const privateHeaders={...base,'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store'};
    if(!authPassword){res.writeHead(503,privateHeaders);res.end('Studio access is not configured');return;}
    if(!isAuthed(req)){res.writeHead(401,{...privateHeaders,'WWW-Authenticate':'Basic realm="SKYGATE Studio", charset="UTF-8"'});res.end('Private studio: authentication required');return;}
  }
  if(raw==='/'){res.writeHead(308,{...base,Location:'/studio/','Cache-Control':'no-store'});res.end();return;}
  if(raw==='/studio'||raw==='/play'){res.writeHead(308,{...base,Location:raw+'/'});res.end();return;}
  let target=resolve(root,'.'+raw);
  if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403,base);res.end('Forbidden');return;}
  let info;try{info=await stat(target);if(info.isDirectory()){target=resolve(target,'index.html');info=await stat(target);}if(!info.isFile())throw Error('not file')}catch{res.writeHead(404,base);res.end('Not Found');return;}
  const type=types[extname(target).toLowerCase()];if(!type){res.writeHead(404,base);res.end('Not Found');return;}
  res.writeHead(200,{...base,...(privateRoute?{'X-Robots-Tag':'noindex, nofollow, noarchive'}:{}),'Content-Type':type,'Content-Length':info.size,'Cache-Control':privateRoute?'private, no-store':type.startsWith('text/html')?'no-cache':'public, max-age=3600'});
  if(req.method==='HEAD'){res.end();return;}createReadStream(target).on('error',()=>res.destroy()).pipe(res);
 }catch(e){console.error(e.message);if(!res.headersSent){res.writeHead(500,base);res.end('Server error');}}
}).listen(port,'0.0.0.0',function(){console.log(`SKYGATE Studio listening on ${this.address().port}`);});
