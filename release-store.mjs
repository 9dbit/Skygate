import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import math from './studio/math/engine.js';
import studioMath from './studio/math/studio_math.js';

export const symbols = ['ruby','sapphire','emerald','amethyst','topaz','amber','pearl','ring','crown','hourglass','chalice','orb','scatter'];
export const tracks = ['bgm_celestial_loop','spin_start','reel_stop','tumble','symbol_win','multiplier','bonus_intro','free_spin_start','big_win','mega_win','jackpot','ui_click','ambient_thunder'];
export const shippedAssets = [
  ...symbols.map(x=>`symbols/${x}.png`),
  ...['sky_background.jpg','hero_composite_reference.jpg','guardian.png','logo.png','column_left.png','column_right.png'].map(x=>`scene/${x}`),
  ...['gold_banner','blue_button','spin_button','spin_button_clean','reel_frame','jackpot_mini','jackpot_minor','jackpot_major','jackpot_grand'].map(x=>`ui/${x}.svg`),
  ...tracks.map(x=>`audio/${x}.mp3`),
  'ui/confirmation-panel-v1.png',
];
export class ReleaseError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail=message=>{throw new ReleaseError(message);};
const num=(v,min,max,name)=>{if(!Number.isFinite(v)||v<min||v>max)fail(`${name}: expected ${min}–${max}`);return v;};
const integer=(v,min,max,name)=>{num(v,min,max,name);if(!Number.isInteger(v))fail(`${name}: expected integer`);return v;};
const str=(v,max,name)=>{if(typeof v!=='string'||v.length>max)fail(`Invalid ${name}`);return v;};
const color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'#ffe5af';
const own=(obj,k)=>Object.prototype.hasOwnProperty.call(obj,k);
const clone=x=>JSON.parse(JSON.stringify(x));

// Rebuild the public document from known fields. Never publish the editor's
// arbitrary metadata, reference overlays, paths, or browser storage.
export function validateProject(input, overrideKeys=[]){
  const p=input;
  if(!p||p.schema!=='skygate/studio-v0.3'||p.virtualCreditsOnly!==true)fail('Expected a virtual-credit Skygate project');
  if(!Array.isArray(p.layers)||p.layers.length<1||p.layers.length>100)fail('Expected 1–100 layers');
  const allowed=new Set(shippedAssets), keys=new Set(overrideKeys);
  const ids=new Set();
  const layers=p.layers.map(l=>{
    if(!l||!/^[-a-zA-Z0-9_]{1,80}$/.test(l.id)||ids.has(l.id))fail('Layer ids must be unique');ids.add(l.id);
    if(!['image','grid','text','panel','circle'].includes(l.kind))fail('Unsupported layer kind');
    const out={id:l.id,name:str(l.name||l.id,120,'layer name'),kind:l.kind,x:num(l.x,-1080,2160,'x'),y:num(l.y,-1920,3840,'y'),w:num(l.w,4,2160,'width'),h:num(l.h,4,3840,'height'),z:integer(l.z,0,100,'z-index'),rotate:num(l.rotate??0,-180,180,'rotation'),opacity:num(l.opacity??100,0,100,'opacity'),visible:l.visible!==false,locked:!!l.locked};
    if(l.kind==='image'||(l.kind==='circle'&&l.asset)){
      if(!allowed.has(l.asset)&&!(typeof l.asset==='string'&&/^custom\/[a-zA-Z0-9_.-]{1,160}$/.test(l.asset)&&keys.has('asset:'+l.asset)))fail(`Missing or unsupported image: ${l.id}`);
      out.asset=l.asset;
    }
    if(l.crop&&out.asset){
      const c=l.crop;out.crop={x:num(c.x,0,.99,'crop x'),y:num(c.y,0,.99,'crop y'),w:num(c.w,.01,1,'crop width'),h:num(c.h,.01,1,'crop height')};
      if(c.x+c.w>1.000001||c.y+c.h>1.000001)fail('Crop must stay inside its source image');
    }
    if(l.kind==='text'||l.kind==='circle'){out.text=str(l.text||'',180,'layer text');out.font=num(l.font||40,8,170,'font');out.color=color(l.color);}
    if(l.kind==='grid'&&l.id!=='reels')fail('Only one live reel grid is supported');
    return out;
  });
  for(const [id,kind] of Object.entries({reels:'grid',spinbutton:'image',winamount:'text',credits:'text',betlabel:'text',autobtn:'circle',turbobtn:'circle',menubtn:'circle',soundbtn:'circle',infobtn:'circle'})){
    const l=layers.find(l=>l.id===id);
    if(!l||l.kind!==kind||!l.visible||l.opacity<20||l.x<0||l.y<0||l.x+l.w>1081||l.y+l.h>1921)fail(`Keep ${id} visible and inside the canvas`);
    if(['spinbutton','autobtn','turbobtn','menubtn','soundbtn','infobtn'].includes(id)&&(l.w<90||l.h<90))fail(`${id} is too small for touch`);
  }
  for(const id of ['minusbtn','plusbtn']){
    const l=layers.find(l=>l.id===id);if(l&&(l.kind!=='circle'||!l.visible||l.opacity<20||l.w<90||l.h<90||l.x<0||l.y<0||l.x+l.w>1081||l.y+l.h>1921))fail(`Keep ${id} usable and inside the canvas`);
  }

  if(!Array.isArray(p.grid)||p.grid.length!==30||p.grid.some(x=>!symbols.includes(x)))fail('Expected 30 valid symbols');
  const c=clone(p.math||{});
  try{math.validateConfig(c);}catch(e){fail('Math: '+e.message);}
  const regular=c.reference_rules?['crown','hourglass','ring','chalice','ruby','amethyst','topaz','emerald','sapphire']:symbols.slice(0,7), outcomes=[...regular,'scatter','orb'];
  if(Object.keys(c.symbol_weights).sort().join()!==outcomes.sort().join()||Object.keys(c.paytable).sort().join()!==regular.sort().join())fail('Expected the nine supported outcomes');
  for(const v of Object.values(c.symbol_weights))num(v,.000001,1000000,'symbol weight');
  for(const a of Object.values(c.paytable))for(const v of a)num(v,0,100000,'payout');
  if(!c.multiplier_values.length||c.multiplier_values.length>30)fail('Invalid multiplier list');
  c.multiplier_values.forEach(v=>integer(v,1,10000,'multiplier'));c.multiplier_weights.forEach(v=>num(v,.000001,1000000,'multiplier weight'));
  for(const k of ['bonus_trigger_scatters','bonus_retrigger_scatters'])integer(c[k],1,30,k);
  for(const k of ['bonus_start_spins','bonus_retrigger_add_spins'])integer(c[k],1,200,k);
  integer(c.safety_max_tumbles,1,c.reference_rules?10000:80,'tumble limit');integer(c.safety_max_bonus_spins,1,c.reference_rules?10000:200,'bonus limit');num(c.round_max_win_x,1,100000,'round cap');
  // Config metadata is limited separately; unknown fields never cross the boundary.
  const config=Object.fromEntries(['grid_columns','grid_rows','min_match','symbol_weights','paytable','multiplier_values','multiplier_weights','bonus_start_spins','bonus_trigger_scatters','bonus_retrigger_scatters','bonus_retrigger_add_spins','round_max_win_x','safety_max_tumbles','safety_max_bonus_spins'].map(k=>[k,c[k]]));
  if(c.reference_rules){
    config.reference_rules=true;
    if(!c.bonus_symbol_weights || Object.keys(c.bonus_symbol_weights).sort().join()!==outcomes.sort().join())fail('Expected bonus reel weights');
    config.bonus_symbol_weights=Object.fromEntries(outcomes.map(k=>[k,num(c.bonus_symbol_weights[k],.000001,1000000,'bonus weight')]));
    config.ante_scatter_weight_multiplier=num(c.ante_scatter_weight_multiplier,1,10,'ante scatter weight');
    config.scatter_paytable=Object.fromEntries(['4','5','6'].map(k=>[k,num(c.scatter_paytable?.[k],0,100000,'scatter pay')]));
  }
  config.profile_id=c.reference_rules?'skygate-reference-rules-v1':'studio-published-v0.6';
  const jackpot={enabled:!!p.jackpot?.enabled,type:'fixed-demo',tiers:(p.jackpot?.tiers||[]).map(t=>({id:str(t.id,16,'jackpot id'),name:str(t.name,30,'jackpot name'),awardX:num(t.awardX,0,100000,'jackpot award'),perMillion:num(t.perMillion,0,1e6,'jackpot odds'),color:color(t.color)}))};
  if(jackpot.tiers.length!==4||new Set(jackpot.tiers.map(t=>t.id)).size!==4||jackpot.tiers.some(t=>!['mini','minor','major','grand'].includes(t.id)))fail('Expected four jackpot tiers');
  try{studioMath.validateJackpot(jackpot);}catch(e){fail(e.message);}
  const audio={muted:!!p.audio?.muted,master:num(p.audio?.master,0,100,'master volume')};
  if(!Array.isArray(p.tracks)||p.tracks.length!==tracks.length||new Set(p.tracks.map(t=>t.id)).size!==tracks.length)fail('Expected all audio tracks');
  const audioTracks=p.tracks.map(t=>{if(!tracks.includes(t.id))fail('Unknown track');return {id:t.id,name:str(t.name,80,'track name'),loop:!!t.loop,volume:num(t.volume,0,100,'track volume'),fade:num(t.fade,0,5000,'audio fade')};});
  const winPresentation=Object.fromEntries(['smallX','bigX','megaX','superX'].map(k=>[k,num(p.winPresentation?.[k],0,100000,k)]));
  if(!(winPresentation.smallX<=winPresentation.bigX&&winPresentation.bigX<=winPresentation.megaX&&winPresentation.megaX<=winPresentation.superX))fail('Win thresholds must increase');
  return {schema:p.schema,projectName:str(p.projectName||'SKYGATE',80,'project name'),presentation:p.presentation==='olympus-gold'?'olympus-gold':'classic',virtualCreditsOnly:true,stage:{width:1080,height:1920},layers,grid:[...p.grid],math:config,jackpot,audio,tracks:audioTracks,winPresentation,seed:integer(p.seed,1,4294967295,'seed'),bet:num(p.bet,.2,300,'bet'),credit:num(p.credit,1,100000000,'starting credit')};
}

function decodeOverride(key,item){
  if(!item||typeof item.data!=='string'||item.data.length%4!==0||!/^([A-Za-z0-9+/]*={0,2})$/.test(item.data))fail('Invalid asset encoding');
  const bytes=Buffer.from(item.data,'base64');
  const audio=key.startsWith('audio:');
  if(!bytes.length||bytes.length>(audio?12:6)*1024*1024)fail('Asset exceeds upload limit');
  let ext,mime;
  if(!audio){
    if(item.mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.length>=24){
      num(bytes.readUInt32BE(16),1,4096,'image width');num(bytes.readUInt32BE(20),1,4096,'image height');ext='png';mime='image/png';
    }else fail('Publish images as PNG; Studio converts uploads automatically');
  }else{
    if(item.mime==='audio/mpeg'&&(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224))){ext='mp3';mime='audio/mpeg';}
    else if(item.mime==='audio/ogg'&&bytes.subarray(0,4).toString()==='OggS'){ext='ogg';mime='audio/ogg';}
    else if(item.mime==='audio/wav'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE'){ext='wav';mime='audio/wav';}
    else fail('Unsupported audio. Use MP3, OGG or WAV.');
  }
  return {bytes,mime,file:createHash('sha256').update(bytes).digest('hex')+'.'+ext};
}

export function createReleaseStore(directory){
  let queue=Promise.resolve();
  const root=directory&&resolve(directory,'skygate-releases');
  const required=()=>{if(!root)throw new ReleaseError('Persistent storage is not configured',503);};
  async function index(){if(!root)return {active:null,previous:null,revisions:[]};try{return JSON.parse(await readFile(resolve(root,'index.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {active:null,previous:null,revisions:[]};throw e;}}
  async function atomic(file,body){await mkdir(root,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(body),{mode:0o600});await rename(tmp,file);}
  const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  async function revision(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw new ReleaseError('Release not found',404);const i=await index();if(!i.revisions.some(r=>r.id===id))throw new ReleaseError('Release not found',404);return JSON.parse(await readFile(resolve(root,id+'.json'),'utf8'));}
  async function summary(){const i=await index();return {...i,available:!!root};}
  async function stage(body){return serial(async()=>{
    required();const overrides=body.overrides||{};
    if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).length>100)fail('Invalid asset overrides');
    const items=[],mapping={};let size=0;
    for(const [key,item] of Object.entries(overrides)){
      if(!(key.startsWith('asset:')&&(shippedAssets.includes(key.slice(6))&&!key.slice(6).startsWith('audio/')||/^custom\/[a-zA-Z0-9_.-]{1,160}$/.test(key.slice(6))))&&!(key.startsWith('audio:')&&tracks.includes(key.slice(6))))fail('Unsupported asset key');
      const decoded=decodeOverride(key,item);size+=decoded.bytes.length;if(size>24*1024*1024)fail('Combined custom assets exceed 24 MB');items.push(decoded);mapping[key]={file:decoded.file,mime:decoded.mime};
    }
    const project=validateProject(body.project,Object.keys(overrides));
    const i=await index();if(i.revisions.length>=24)throw new ReleaseError('Release archive is full (24 snapshots). Export a backup before requesting archive maintenance.',409);
    const used=i.revisions.reduce((n,r)=>n+(r.size||0),0);if(used+size>350*1024*1024)throw new ReleaseError('Release archive storage limit reached',409);
    const id=randomUUID(),createdAt=new Date().toISOString();
    await mkdir(resolve(root,'media'),{recursive:true});
    for(const item of items){try{await writeFile(resolve(root,'media',item.file),item.bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}
    const doc={id,createdAt,project,overrides:mapping};await atomic(resolve(root,id+'.json'),doc);
    i.revisions.unshift({id,createdAt,name:project.projectName,published:false,size});await atomic(resolve(root,'index.json'),i);
    return {id,createdAt};
  });}
  async function activate(body,rollback=false){return serial(async()=>{
    required();const i=await index();if(!own(body,'expectedActive')||body.expectedActive!==i.active)throw new ReleaseError('Live version changed. Refresh the release list and try again.',409);
    const id=rollback?i.previous:body.id;
    if(rollback&&id===undefined)throw new ReleaseError('No previous version',409);
    if(id===i.active) return summary();
    if(id!==null){const entry=i.revisions.find(r=>r.id===id);if(!entry)throw new ReleaseError('Release not found',404);entry.published=true;entry.publishedAt=new Date().toISOString();}
    if(rollback&&i.active===null&&i.previous===null)throw new ReleaseError('No previous version',409);
    i.previous=i.active;i.active=id;await atomic(resolve(root,'index.json'),i);return {...i,available:true};
  });}
  async function live(){const i=await index();return i.active?revision(i.active):null;}
  async function media(file,privateRoute){
    if(!/^[a-f0-9]{64}\.(png|mp3|ogg|wav)$/.test(file))throw new ReleaseError('Media not found',404);
    const i=await index();let item;
    for(const r of i.revisions.filter(r=>privateRoute||r.published)){const doc=await revision(r.id);item=Object.values(doc.overrides).find(x=>x.file===file);if(item)break;}
    if(!item)throw new ReleaseError('Media not found',404);
    const path=resolve(root,'media',file),info=await stat(path);return {path,size:info.size,mime:item.mime};
  }
  return {summary,stage,activate,revision,live,media};
}
