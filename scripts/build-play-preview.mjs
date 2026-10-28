// Build a self-contained review copy without publishing to any web host.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(root,'play');
const read=file=>readFileSync(resolve(dir,file),'utf8');
const assets={};
const mime={'.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
for(const group of ['scene','symbols','ui','audio'])for(const file of readdirSync(resolve(dir,'assets',group))){
 const path=`assets/${group}/${file}`;
 assets[path]=`data:${mime[extname(file)]};base64,${readFileSync(resolve(dir,path)).toString('base64')}`;
}
let html=read('index.html');
const css=read('game.css').replace(/url\('([^']+)'\)/g,(_,p)=>`url('${assets[p]}')`);
html=html.replace(/<link rel="stylesheet"[^>]+>/,`<style>${css}</style>`);
html=html.replace(/(src|href)="(assets\/[^\"]+)"/g,(_,attr,p)=>`${attr}="${assets[p.split('?')[0]]}"`);
html=html.replace(/<script src="([^?]+)\?[^\"]+"><\/script>/g,(_,file)=>{
 let script=read(file);
 if(file==='game.js')script=script
  .replace("resolve:id=>'assets/audio/'+id+'.mp3'", "resolve:id=>window.SKY_PREVIEW_ASSETS['assets/audio/'+id+'.mp3']")
  .replaceAll('src="assets/symbols/${sprite}.png"', 'src="${window.SKY_PREVIEW_ASSETS[\'assets/symbols/\'+sprite+\'.png\']}"')
  .replaceAll('src="assets/symbols/${art[kind]}.png"', 'src="${window.SKY_PREVIEW_ASSETS[\'assets/symbols/\'+art[kind]+\'.png\']}"');
 return `<script>${script.replaceAll('</script','<\\/script')}</script>`;
});
html=html.replace('<script>',`<script>window.SKY_PREVIEW_ASSETS=${JSON.stringify(assets)};</script><script>`);
const target=process.argv[2];if(!target)throw Error('Pass absolute output HTML path');
writeFileSync(target,html);
console.log(`Standalone preview: ${target} (${Buffer.byteLength(html)} bytes)`);
