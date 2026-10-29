/* Both Live and editable drafts use the /play renderer; the parent supplies selection handles only. */
(() => {
  const E=id=>document.getElementById(id), studio=window.SKYGATE_STUDIO, frame=E('gameCanvas');
  let lastError='',source='live', mode='edit', live=null, ready=false, payload=null, signature='', timer, generation=0, loading=false;
  const note=text=>E('canvasSource').textContent=text;
  function chrome(){
    E('stage').classList.add('shared-renderer');E('stage').classList.toggle('is-live',source==='live');
    E('stageLayers').hidden=source==='live'||mode!=='edit';
    document.querySelector('.sidebar').inert=source==='live';document.querySelector('.inspector').inert=source==='live';
    E('liveModeBtn').classList.toggle('selected',source==='live');
    E('editModeBtn').classList.toggle('selected',source==='draft'&&mode==='edit');
    E('previewModeBtn').classList.toggle('selected',source==='draft'&&mode==='preview');
    E('statusMode').textContent=source==='live'?'Live gameplay':mode==='edit'?'Edit draft':'Playtest draft';
    E('demoSpinBtn').disabled=!ready;E('editLiveBtn').disabled=loading||!live;
    note(lastError|| (source==='live'?'LIVE · '+(live?.id.slice(0,8)||'bawaan')+' · sama dengan game publik':'DRAFT LOKAL · belum dipublish · renderer gameplay yang sama'));
  }
  function alignHandles(){
    if(source!=='draft'||mode!=='edit'||!ready)return;
    const doc=frame.contentDocument;
    for(const node of E('stageLayers').children){
      const layer=[...doc.querySelectorAll('.published-layer')].find(l=>l.dataset.layer===node.dataset.id);
      if(!layer){node.style.display='none';continue;}
      const r=layer.getBoundingClientRect();Object.assign(node.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',transform:'none'});
    }
  }
  function draftRender(){
    if(source!=='draft')return;
    const next=studio.getPreviewData(),key=JSON.stringify(next);
    if(key===signature&&ready){alignHandles();return;}
    if(key===signature&&frame.getAttribute('src')!=='about:blank')return;
    signature=key;payload=next;ready=false;chrome();
    frame.src='/studio/editor-preview/?draft='+ ++generation;
  }
  async function loadLive(){
    if(loading)return;lastError='';loading=true;if(source==='live'){ready=false;signature='';}chrome();
    try{
      const res=await fetch('/play/release.json',{cache:'no-store',credentials:'same-origin'});
      if(!res.ok)throw Error('Snapshot Live belum dapat dimuat');live=await res.json();
      if(source==='live'){
        ready=false;signature='';payload=null;
        frame.src=live?'/studio/preview/?revision='+live.id:'/studio/preview/?live=1';
      }
    }catch(error){lastError=error.message+' · tekan Live untuk mencoba lagi';}
    finally{loading=false;chrome();}
  }
  function draft(nextMode){lastError='';source='draft';mode=nextMode;chrome();clearTimeout(timer);draftRender();}
  window.SKYGATE_CANVAS={draft,session:()=>ready?frame.contentWindow.SlotGameTest?.getState():null,
    exportRound(){if(ready)frame.contentDocument.getElementById('export')?.click();},
    reset(){if(ready){frame.contentDocument.getElementById('reset')?.click();studio.refreshSession();}},move(layer){
    if(source!=='draft'||!ready)return;
    const node=[...frame.contentDocument.querySelectorAll('.published-layer')].find(n=>n.dataset.layer===layer.id);
    if(node){node.style.left=layer.x/1080*100+'%';node.style.top=layer.y/1920*100+'%';}
  },spin(replay=false){
    if(!ready){note('Tunggu sampai preview siap.');return;}
    if(source==='draft')studio.setMode('preview');
    const doc=frame.contentDocument;const play=doc.getElementById('bootPlay');if(play&&!play.disabled&&!play.hidden)play.click();
    doc.getElementById(replay?'replay':'spin')?.click();
  }};
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type==='skygate-preview-round'&&ready){
      const s=window.SKYGATE_CANVAS.session(),r=s?.last?.round;
      if(r){E('traceStatus').textContent=r.winX.toFixed(3)+'× · '+r.totalTumbles+' tumbles · '+s.credits.toLocaleString('en-US')+' kredit virtual';studio.refreshSession();}
    }
    if(event.data?.type==='skygate-editor-request'&&source==='draft'&&payload)frame.contentWindow.postMessage({type:'skygate-editor-state',...payload},location.origin);
    if(event.data?.type==='skygate-preview-ready'){
      const expected=source==='draft'?'editor-draft':live?.id||'bundled';if(event.data.id!==expected)return;
      ready=true;chrome();alignHandles();
    }
  });
  window.addEventListener('skygate-draft-change',()=>{if(source==='draft'){clearTimeout(timer);timer=setTimeout(draftRender,180);}});
  window.addEventListener('resize',alignHandles);
  window.addEventListener('skygate-live-changed',loadLive);
  E('liveModeBtn').onclick=()=>{source='live';loadLive();};
  E('editLiveBtn').onclick=async()=>{
    if(!live||loading)return;lastError='';loading=true;chrome();note('Menyiapkan draft dari Live…');
    try{
      // Export the existing draft before replacing its settings and custom uploads.
      if(studio.hasLocalDraft())await studio.exportChangesZip();
      const entries=await Promise.all(Object.entries(live.overrides).map(async([key,item])=>{
        const r=await fetch('/play/media/'+item.file);if(!r.ok)throw Error('Aset Live gagal dimuat');return [key,await r.blob()];
      }));
      await studio.restoreRelease(live.project,entries);studio.setMode('edit');
    }catch(error){lastError=error.message;}finally{loading=false;chrome();}
  };
  chrome();studio.ready.then(loadLive);
})();
