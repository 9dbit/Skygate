import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT || 3000);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ogg':'audio/ogg','.wav':'audio/wav','.md':'text/markdown; charset=utf-8'};
const base={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN'};
createServer(async(req,res)=>{
 try{
  let raw=new URL(req.url||'/', 'http://localhost').pathname;
  if(raw==='/health') {res.writeHead(200,{...base,'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,service:'skygate-studio',version:'0.3.1'}));return;}
  if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405,{...base,Allow:'GET, HEAD'});res.end();return;}
  try{raw=decodeURIComponent(raw);}catch{res.writeHead(400,base);res.end('Invalid path');return;}
  if(raw.includes('\\')||raw.includes('\0')){res.writeHead(400,base);res.end('Invalid path');return;}
  if(raw==='/')raw='/studio/index.html';
  if(raw==='/studio'||raw==='/play'){res.writeHead(308,{...base,Location:raw+'/'});res.end();return;}
  let target=resolve(root,'.'+raw);
  if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403,base);res.end('Forbidden');return;}
  let info;try{info=await stat(target);if(info.isDirectory()){target=resolve(target,'index.html');info=await stat(target);}if(!info.isFile())throw Error('not file')}catch{res.writeHead(404,base);res.end('Not Found');return;}
  const type=types[extname(target).toLowerCase()];if(!type){res.writeHead(404,base);res.end('Not Found');return;}
  res.writeHead(200,{...base,'Content-Type':type,'Content-Length':info.size,'Cache-Control':type.startsWith('text/html')?'no-cache':'public, max-age=3600'});
  if(req.method==='HEAD'){res.end();return;}createReadStream(target).on('error',()=>res.destroy()).pipe(res);
 }catch(e){console.error(e.message);if(!res.headersSent){res.writeHead(500,base);res.end('Server error');}}
}).listen(port,'0.0.0.0',()=>console.log(`SKYGATE Studio listening on ${port}`));
