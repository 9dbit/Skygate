/* Skygate Studio image pipeline. Original files remain in the user's source folder.
   Uploads and legacy draft images are encoded to transparent WebP before publication. */
(() => {
  'use strict';
  const MiB=1024*1024;
  const formatBytes=bytes=>bytes>=MiB?(bytes/MiB).toFixed(2)+' MB':Math.round(bytes/1024)+' KB';
  function limits(key=''){
    const symbol=key.startsWith('asset:symbols/');
    const logo=key==='asset:custom/skygate-5000-approved.png';
    return {maxEdge:symbol?768:4096,targetBytes:Math.round((symbol?.38:logo?1.65:1.38)*MiB)};
  }
  async function encode(blob,options={}){
    if(!(blob instanceof Blob)||!blob.type.startsWith('image/'))throw Error('Pilih file gambar PNG, JPG, SVG, atau WebP.');
    const policy={...limits(options.key||''),...options};
    const url=URL.createObjectURL(blob);
    try{
      const image=new Image();image.src=url;
      try{await image.decode();}catch{throw Error('Gambar tidak dapat dibuka. Pilih PNG/JPG/WebP yang valid.');}
      const width=image.naturalWidth,height=image.naturalHeight;
      if(!width||!height)throw Error('Dimensi gambar tidak valid.');
      // Reusing an already-optimized WebP avoids generational image loss.
      if(blob.type==='image/webp'&&blob.size<=policy.targetBytes&&Math.max(width,height)<=policy.maxEdge)return blob;
      const scale=Math.min(1,policy.maxEdge/Math.max(width,height));
      const canvas=document.createElement('canvas');
      const context=canvas.getContext('2d',{alpha:true});
      if(!context)throw Error('Browser tidak dapat memproses gambar.');
      const candidates=[];
      // Lower quality first only if necessary; start from a high-quality original size.
      const quality=[.96,.91,.85,.77,.68];
      const sizes=[1,.86,.72,.60];
      let best=null;
      for(const reduction of sizes){
        canvas.width=Math.max(1,Math.round(width*scale*reduction));
        canvas.height=Math.max(1,Math.round(height*scale*reduction));
        context.clearRect(0,0,canvas.width,canvas.height);
        context.drawImage(image,0,0,canvas.width,canvas.height);
        for(const q of quality){
          const output=await new Promise((resolve,reject)=>{
            try{canvas.toBlob(file=>file?resolve(file):reject(Error('Konversi gambar gagal.')),'image/webp',q);}
            catch(e){reject(e);}
          });
          if(output.type!=='image/webp')throw Error('Browser belum mendukung konversi WebP. Perbarui browser dan coba lagi.');
          if(!best||output.size<best.size)best=output;
          if(output.size<=policy.targetBytes)return output;
          if(candidates.length<2)candidates.push(output.size);
        }
      }
      if(!best||best.size>6*MiB)throw Error('Gambar terlalu besar setelah optimasi. Gunakan resolusi lebih rendah.');
      return best;
    }finally{URL.revokeObjectURL(url);}
  }
  window.SkygateImageOptimizer={encode,limits,formatBytes,version:'0.13.3'};
})();
