(() => {
  'use strict';
  const E=id=>document.getElementById(id);
  let inventory=null,selected=null,previewReady=false,busy=false,previewKind='none',previewTimeout=null,previewSerial=0;
  const message=text=>E('releaseStatus').textContent=text;
  function controls(){
    E('prepareRelease').disabled=busy||!inventory?.available;
    E('publishRelease').disabled=busy||previewKind!=='snapshot'||!previewReady||!selected||selected===inventory?.active;
    E('rollbackRelease').disabled=busy||!inventory?.available||(!inventory.active&&!inventory.previous);
    E('loadRelease').disabled=busy||previewKind!=='snapshot'||!previewReady||!selected;
    E('closeRelease').disabled=busy;
  }
  async function api(path,body){
    const response=await fetch('/studio/api/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-Skygate-CSRF':inventory.csrf}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok){const error=Error(data.error||'Permintaan belum berhasil');error.status=response.status;throw error;}return data;
  }
  async function refresh(){
    inventory=await api('releases');
    E('liveRelease').textContent='Live: '+(inventory.active?inventory.active.slice(0,8):'Skygate bawaan');
    const list=E('releaseHistory');list.replaceChildren();
    for(const r of inventory.revisions){
      const row=document.createElement('div');row.className='release-row';
      const text=document.createElement('span');text.textContent=`${r.name} · ${r.id.slice(0,8)}${r.id===inventory.active?' · LIVE':r.published?' · pernah live':' · draft'}\n${new Date(r.createdAt).toLocaleString('id-ID')}`;
      const btn=document.createElement('button');btn.textContent='Preview';btn.onclick=()=>{if(!busy)preview(r.id);};row.append(text,btn);list.append(row);
    }
    if(!inventory.available)message('Penyimpanan rilis belum tersedia. Proyek lokal dan ekspor tetap dapat dipakai.');
    controls();
  }
  // Render a playable draft immediately. Staging remains an explicit action,
  // so opening the dialog cannot exhaust the version archive.
  function showPreview(kind,id=null){
    clearTimeout(previewTimeout);
    const serial=++previewSerial;
    previewKind=kind;selected=kind==='snapshot'?id:null;previewReady=false;
    const frame=E('releaseFrame');
    frame.hidden=false;
    if(kind==='draft'){
      E('previewLabel').textContent='Draft saat ini · belum dipublish';
      frame.src='/studio/editor-preview/?publish-draft='+serial;
      message('Memuat preview Draft. Untuk publish, siapkan snapshot terlebih dahulu.');
    }else{
      E('previewLabel').textContent='Snapshot '+id.slice(0,8)+' · preview privat';
      frame.src='/studio/preview/?revision='+id;
      message('Memuat snapshot '+id.slice(0,8)+'…');
    }
    controls();
    previewTimeout=setTimeout(()=>{
      if(serial!==previewSerial||previewReady||!E('releaseDialog').open)return;
      message('Preview belum siap. Periksa koneksi atau aset gambar. Tutup dan buka panel untuk mencoba ulang.');
    },20000);
  }
  const preview=id=>showPreview('snapshot',id);
  const draftPreview=()=>showPreview('draft');
  function clearPreview(){
    ++previewSerial;clearTimeout(previewTimeout);
    selected=null;previewKind='none';previewReady=false;
    E('releaseFrame').hidden=true;E('releaseFrame').src='about:blank';
    controls();
  }
  async function run(task){
    if(busy)return;busy=true;controls();
    try{await task();}catch(error){if([403,409].includes(error.status)){try{await refresh();}catch{}}message(error.message||'Belum berhasil. Coba lagi.');}
    finally{busy=false;controls();}
  }
  const base64=blob=>new Promise((yes,no)=>{const reader=new FileReader();reader.onload=()=>yes(reader.result.split(',')[1]);reader.onerror=()=>no(Error('Upload tidak dapat dibaca'));reader.readAsDataURL(blob);});
  E('releaseBtn').onclick=()=>{
    E('releaseDialog').showModal();
    draftPreview();
    void run(async()=>{await refresh();});
  };
  E('closeRelease').onclick=()=>{E('releaseDialog').close();clearPreview();};
  E('releaseDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();else clearPreview();});
  E('releaseFrame').addEventListener('error',()=>{
    if(previewKind!=='none'&&E('releaseDialog').open)message('Preview gagal dimuat. Periksa koneksi lalu buka ulang panel.');
  });
  E('releaseFrame').addEventListener('load',()=>{
    const frame=E('releaseFrame');
    if(previewKind==='none'||!E('releaseDialog').open||frame.hidden)return;
    // A 401/404 page may fire "load" but contains no game. Surface it here.
    try{if(frame.contentDocument&&!frame.contentDocument.querySelector('.game')){
      clearTimeout(previewTimeout);message('Halaman preview tidak tersedia. Periksa akses Studio dan muat ulang.');
    }}catch{message('Preview tidak dapat diakses. Pastikan Studio dan game menggunakan domain yang sama.');}
  });
  E('prepareRelease').onclick=()=>void run(async()=>{
    message('Memeriksa aset sebelum optimasi WebP…');
    const bundle=await window.SKYGATE_STUDIO.getPublishBundle();
    const overrides={};let total=0,originalTotal=0;
    const limit=24*1024*1024,format=window.SkygateImageOptimizer.formatBytes;
    for(let i=0;i<bundle.overrides.length;i++){
      const [key,original]=bundle.overrides[i];
      originalTotal+=original.size;
      message('WebP '+(i+1)+'/'+bundle.overrides.length+' · '+key+' · '+format(total)+' / 24 MB');
      let blob;
      try{
        blob=key.startsWith('asset:')?await window.SkygateImageOptimizer.encode(original,{key}):original;
      }catch(error){throw Error(key+': '+error.message);}
      const max=key.startsWith('asset:')?6:12;
      if(blob.size>max*1024*1024)throw Error(key+': file masih melebihi '+max+' MB setelah kompresi');
      total+=blob.size;
      if(total>limit)throw Error('Aset setelah WebP '+format(total)+' melebihi 24 MB. Kurangi aset besar atau resolusinya.');
      overrides[key]={mime:blob.type,data:await base64(blob)};
    }
    message('Optimasi selesai: '+format(originalTotal)+' → '+format(total)+'. Menyimpan snapshot privat…');
    const result=await api('releases',{project:bundle.project,overrides});
    await refresh();preview(result.id);
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==E('releaseFrame').contentWindow||previewKind==='none'||!E('releaseDialog').open)return;
    if(event.data?.type==='skygate-editor-request'&&previewKind==='draft'){
      const serial=previewSerial;
      void Promise.resolve(window.SKYGATE_STUDIO.ready).then(()=>{
        if(previewKind!=='draft'||serial!==previewSerial||event.source!==E('releaseFrame').contentWindow)return;
        event.source.postMessage({type:'skygate-editor-state',...window.SKYGATE_STUDIO.getPreviewData()},location.origin);
      }).catch(error=>message('Draft tidak dapat ditampilkan: '+error.message));
      return;
    }
    if(event.data?.type==='skygate-preview-error'){
      clearTimeout(previewTimeout);previewReady=false;
      message('Preview gagal: '+String(event.data.message||'Aset game belum dapat dimuat')+'. Coba lagi.');
      controls();return;
    }
    if(event.data?.type!=='skygate-preview-ready'||event.data.id!==(previewKind==='draft'?'editor-draft':selected))return;
    clearTimeout(previewTimeout);previewReady=true;
    message(previewKind==='draft'
      ?'Preview Draft siap. Untuk publish perubahan, klik Siapkan preview proyek ini.'
      :'Snapshot siap. Periksa game, lalu klik Publish snapshot ke game.');
    controls();
  });
  E('publishRelease').onclick=()=>void run(async()=>{
    message('Menerbitkan snapshot…');await api('publish',{id:selected,expectedActive:inventory.active});await refresh();window.dispatchEvent(new Event('skygate-live-changed'));message('Snapshot sudah live. Buka atau muat ulang game untuk melihat versi baru.');
  });
  E('rollbackRelease').onclick=()=>void run(async()=>{
    message('Mengembalikan versi sebelumnya…');await api('rollback',{expectedActive:inventory.active});await refresh();window.dispatchEvent(new Event('skygate-live-changed'));message('Versi sebelumnya sudah live. Snapshot lain tetap tersimpan.');
  });
  E('loadRelease').onclick=()=>void run(async()=>{
    message('Memuat proyek dan aset snapshot…');const doc=await api('releases/'+selected),overrides=[];
    for(const [key,item] of Object.entries(doc.overrides)){
      const response=await fetch('/studio/api/media/'+item.file,{credentials:'same-origin'});if(!response.ok)throw Error('Aset snapshot tidak dapat dimuat');overrides.push([key,await response.blob()]);
    }
    await window.SKYGATE_STUDIO.restoreRelease(doc.project,overrides);window.SKYGATE_STUDIO.setMode('edit');message('Snapshot sudah dimuat ke editor. Perubahan berikutnya tersimpan lokal sampai Anda publish lagi.');
  });
})();
