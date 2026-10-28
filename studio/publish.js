(() => {
  'use strict';
  const E=id=>document.getElementById(id);
  let inventory=null,selected=null,previewReady=false,busy=false;
  const message=text=>E('releaseStatus').textContent=text;
  function controls(){
    E('prepareRelease').disabled=busy||!inventory?.available;
    E('publishRelease').disabled=busy||!previewReady||!selected||selected===inventory?.active;
    E('rollbackRelease').disabled=busy||!inventory?.available||(!inventory.active&&!inventory.previous);
    E('loadRelease').disabled=busy||!previewReady||!selected;
    E('closeRelease').disabled=busy;
  }
  async function api(path,body){
    const response=await fetch('/studio/api/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-Skygate-CSRF':inventory.csrf}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Permintaan belum berhasil');return data;
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
  function preview(id){
    selected=id;previewReady=false;controls();E('previewLabel').textContent='Snapshot '+id.slice(0,8)+' · private preview';
    E('releaseFrame').hidden=false;E('releaseFrame').src='/studio/preview/?revision='+id;
    message('Memuat game preview. Periksa layout dan coba spin sebelum Publish.');
  }
  async function run(task){
    if(busy)return;busy=true;controls();
    try{await task();}catch(error){message(error.message||'Belum berhasil. Coba lagi.');}
    finally{busy=false;controls();}
  }
  async function png(blob){
    const url=URL.createObjectURL(blob);
    try{
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,4096/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise((yes,no)=>canvas.toBlob(file=>file?yes(file):no(Error('Gambar tidak dapat disiapkan')),'image/png'));
    }finally{URL.revokeObjectURL(url);}
  }
  const base64=blob=>new Promise((yes,no)=>{const reader=new FileReader();reader.onload=()=>yes(reader.result.split(',')[1]);reader.onerror=()=>no(Error('Upload tidak dapat dibaca'));reader.readAsDataURL(blob);});
  E('releaseBtn').onclick=()=>{
    E('releaseDialog').showModal();
    void run(async()=>{await refresh();if(inventory.available)message('Siapkan preview dari proyek lokal atau pilih versi tersimpan.');});
  };
  E('closeRelease').onclick=()=>{E('releaseDialog').close();E('releaseFrame').src='about:blank';previewReady=false;controls();};
  E('releaseDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();else{E('releaseFrame').src='about:blank';previewReady=false;}});
  E('prepareRelease').onclick=()=>void run(async()=>{
    message('Menyiapkan snapshot dan aset…');
    const bundle=await window.SKYGATE_STUDIO.getPublishBundle();const overrides={};let total=0;
    for(const [key,original] of bundle.overrides){
      const blob=key.startsWith('asset:')?await png(original):original;
      const max=key.startsWith('asset:')?6:12;if(blob.size>max*1024*1024)throw Error(`${key}: batas ${max} MB per aset`);
      total+=blob.size;if(total>24*1024*1024)throw Error('Total aset tambahan maksimal 24 MB');
      overrides[key]={mime:blob.type,data:await base64(blob)};
    }
    const result=await api('releases',{project:bundle.project,overrides});await refresh();preview(result.id);
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==E('releaseFrame').contentWindow||event.data?.type!=='skygate-preview-ready'||event.data.id!==selected)return;
    previewReady=true;message('Preview siap. Snapshot ini dapat dipublikasikan setelah Anda memeriksanya.');controls();
  });
  E('publishRelease').onclick=()=>void run(async()=>{
    message('Menerbitkan snapshot…');await api('publish',{id:selected,expectedActive:inventory.active});await refresh();message('Snapshot sudah live. Buka atau muat ulang game untuk melihat versi baru.');
  });
  E('rollbackRelease').onclick=()=>void run(async()=>{
    message('Mengembalikan versi sebelumnya…');await api('rollback',{expectedActive:inventory.active});await refresh();message('Versi sebelumnya sudah live. Snapshot lain tetap tersimpan.');
  });
  E('loadRelease').onclick=()=>void run(async()=>{
    message('Memuat proyek dan aset snapshot…');const doc=await api('releases/'+selected),overrides=[];
    for(const [key,item] of Object.entries(doc.overrides)){
      const response=await fetch('/studio/api/media/'+item.file,{credentials:'same-origin'});if(!response.ok)throw Error('Aset snapshot tidak dapat dimuat');overrides.push([key,await response.blob()]);
    }
    await window.SKYGATE_STUDIO.restoreRelease(doc.project,overrides);message('Snapshot sudah dimuat ke editor. Perubahan berikutnya tersimpan lokal sampai Anda publish lagi.');
  });
})();
