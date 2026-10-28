// Build a self-contained review copy without publishing to any web host.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(root,'play');
const read=file=>readFileSync(resolve(dir,file),'utf8');
const assets={};
const projectPath=process.argv[3],assetMapPath=process.argv[4];
const reviewProject=projectPath?JSON.parse(readFileSync(projectPath,'utf8')):null;
const mime={'.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
for(const group of ['scene','symbols','ui','audio'])for(const file of readdirSync(resolve(dir,'assets',group))){
 const path=`assets/${group}/${file}`;
 assets[path]=`data:${mime[extname(file)]};base64,${readFileSync(resolve(dir,path)).toString('base64')}`;
}
if(assetMapPath)for(const [key,file] of Object.entries(JSON.parse(readFileSync(assetMapPath,'utf8')))){
 const path=key.replace(/^asset:/,'assets/');
 assets[path]=`data:${mime[extname(file)]};base64,${readFileSync(file).toString('base64')}`;
}
let html=read('index.html');
const css=read('game.css').replace(/url\('([^']+)'\)/g,(_,p)=>`url('${assets[p]}')`);
html=html.replace(/<link rel="stylesheet"[^>]+>/,`<style>${css}</style>`);
html=html.replace(/(src|href)="(assets\/[^\"]+)"/g,(_,attr,p)=>`${attr}="${assets[p.split('?')[0]]}"`);
html=html.replace(/<script src="([^?]+)\?[^\"]+"><\/script>/g,(_,file)=>{
 let script=read(file);

 return `<script>${script.replaceAll('</script','<\\/script')}</script>`;
});
const reviewRelease=reviewProject?`;window.SkygateActiveRelease=${JSON.stringify({id:'olympus-local-preview',createdAt:'2026-10-28T00:00:00Z',project:reviewProject,overrides:{}})}`:'';
html=html.replace('<script>',`<script>window.SKY_PREVIEW_ASSETS=${JSON.stringify(assets)}${reviewRelease};</script><script>`);
const target=process.argv[2];if(!target)throw Error('Pass absolute output HTML path');
writeFileSync(target,html);
console.log(`Standalone preview: ${target} (${Buffer.byteLength(html)} bytes)`);
