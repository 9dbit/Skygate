import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {createReleaseStore} from '../../release-store.mjs';

const project=()=>JSON.parse(readFileSync(new URL('../project.json',import.meta.url),'utf8'));
const webp={
  alpha:'UklGRnYAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAA/wD/gABWUDggSgAAANABAJ0BKgIAAgAAwBAloAJ0AQ74p/YAAP71Y/+1h6r/mv8D/Wn//jF7w5JqHsuzbF8QqFqwRwJK1Zun/3sF//uwX/+7Bf62AAAA',
  lossless:'UklGRioAAABXRUJQVlA4TB4AAAAvAUAAEB8w//MvICjyfzQBQdF1ywXwJuECDRH9DwE=',
  opaque:'UklGRk4AAABXRUJQVlA4IEIAAACwAQCdASoCAAIAAMAQJZgCdAEO9sTIAP75u//dMvHm9Q/2Qf/5FcwjD+m78T0fL4/+sr//5OP/+px/clgy22CAAAA='
};
const asItem=b=>({mime:'image/webp',data:b.toString('base64')});

test('WebP lossless, alpha and lossy uploads survive snapshots and public publication',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'skygate-webp-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=createReleaseStore(dir);
  for(const [name,base64] of Object.entries(webp)){
    const doc=await store.stage({project:project(),overrides:{'asset:symbols/ruby.png':{mime:'image/webp',data:base64}}});
    const saved=await store.revision(doc.id);
    const file=saved.overrides['asset:symbols/ruby.png'].file;
    assert.match(file,/^[a-f0-9]{64}\.webp$/);
    assert.equal(saved.overrides['asset:symbols/ruby.png'].mime,'image/webp');
    await assert.rejects(store.media(file,false),e=>e.status===404);
    await store.activate({id:doc.id,expectedActive:(await store.summary()).active});
    assert.equal((await store.media(file,false)).mime,'image/webp',name);
  }
  const pngData=readFileSync(new URL('../assets/symbols/ruby.png',import.meta.url)).toString('base64');
  const doc=await store.stage({project:project(),overrides:{'asset:symbols/ruby.png':{mime:'image/png',data:pngData}}});
  const old=(await store.revision(doc.id)).overrides['asset:symbols/ruby.png'];
  assert.match(old.file,/\.png$/,'older PNG releases are still valid');
});

test('WebP validation fails closed for broken RIFF, fake size, animation and oversized images',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'skygate-invalid-webp-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=createReleaseStore(dir),plain=Buffer.from(webp.alpha,'base64');
  const invalid=[];
  const badMagic=Buffer.from(plain);badMagic.write('JUNK');invalid.push(badMagic);
  const brokenSize=Buffer.from(plain);brokenSize.writeUInt32LE(11,4);invalid.push(brokenSize);
  const brokenChunk=Buffer.from(plain);brokenChunk.writeUInt32LE(0xffffffff,16);invalid.push(brokenChunk);
  const animation=Buffer.from(plain);animation[20]|=2;invalid.push(animation);
  const oversized=Buffer.from(plain);oversized[24]=0;oversized[25]=16;oversized[26]=0;invalid.push(oversized);
  const badCodec=Buffer.from(plain);badCodec.write('XXXX',12);invalid.push(badCodec);
  for(const bytes of invalid){
    await assert.rejects(store.stage({project:project(),overrides:{'asset:symbols/ruby.png':asItem(bytes)}}),/WebP|image|Animated|Truncated|Unsupported/);
  }
  await assert.rejects(store.stage({project:project(),overrides:{'asset:symbols/ruby.png':{mime:'image/png',data:webp.alpha}}}),/PNG|WebP/);
});

test('browser optimizer maintains transparent canvas and adapts WebP output to size budget',async()=>{
  const script=readFileSync(new URL('../image-optimizer.js',import.meta.url),'utf8');
  const observed={alpha:null,cleared:0,drawn:0,qualities:[],sizes:[],revoked:0};
  const window={},url={createObjectURL:()=>'blob:qa',revokeObjectURL:()=>{observed.revoked++;}};
  const document={createElement:()=>{
    const canvas={width:0,height:0,
      getContext:(_kind,options)=>{observed.alpha=options.alpha;return {
        clearRect:()=>{observed.cleared++;},
        drawImage:()=>{observed.drawn++;}
      };},
      toBlob(cb,mime,quality){
        observed.qualities.push(quality);observed.sizes.push([this.width,this.height]);
        const bytes=Math.round(16000*quality*(this.width/2048)**2);
        cb(new Blob([new Uint8Array(bytes)],{type:mime}));
      }
    };
    return canvas;
  }};
  class Image{constructor(){this.naturalWidth=Image.width||2048;this.naturalHeight=Image.height||1024;}async decode(){}}
  vm.runInNewContext(script,{window,document,URL:url,Blob,Image});
  const input=new Blob([new Uint8Array(23000)],{type:'image/png'});
  const output=await window.SkygateImageOptimizer.encode(input,{key:'asset:custom/zeus_guardian.png',targetBytes:6000});
  assert.equal(output.type,'image/webp');
  assert(output.size<=6000);
  assert.equal(observed.alpha,true,'canvas retains alpha channel');
  assert(observed.cleared>0&&observed.drawn>0);
  assert(observed.qualities.length>1,'quality adapts');
  assert(observed.sizes.some(([w])=>w<2048),'resolution adapts only if necessary');
  assert.equal(observed.revoked,1,'blob URL revoked');
  Image.width=512;Image.height=512;
  const saved=new Blob([new Uint8Array(1200)],{type:'image/webp'});
  assert.equal(await window.SkygateImageOptimizer.encode(saved,{key:'asset:symbols/ruby.png'}),saved,'already optimized WebP not re-encoded');
});

test('Studio loads optimizer before upload and publisher; snapshot path is MIME aware',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert(html.indexOf('image-optimizer.js')<html.indexOf('studio.js?v=0.13.3'));
  assert(html.indexOf('image-optimizer.js')<html.indexOf('publish.js?v=0.13.3'));
  const source=readFileSync(new URL('../publish.js',import.meta.url),'utf8');
  assert.match(source,/SkygateImageOptimizer\.encode\(original,\{key\}\)/);
  assert.doesNotMatch(source,/\bawait png\(original/);
});
