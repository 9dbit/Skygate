/* Keep the published scene concealed until its images are decoded and Play is tapped. */
(() => {
  'use strict';
  const root=document.documentElement, splash=document.getElementById('bootSplash');
  const play=document.getElementById('bootPlay'), retry=document.getElementById('bootRetry');
  const status=document.getElementById('bootStatus'), progress=document.getElementById('bootProgress');
  let state='loading', timer;
  function fail(error){
    if(state==='entered'||state==='error')return;
    clearTimeout(timer);state='error';root.dataset.boot=state;
    status.textContent='Game belum dapat dimuat. Periksa koneksi lalu coba lagi.';
    play.hidden=true;retry.hidden=false;progress.hidden=true;
    console.error('Skygate loading failed:',error);
  }
  function enter(){
    if(state!=='ready')return;
    state='entered';root.dataset.boot=state;splash.hidden=true;
    document.querySelector('.game').inert=false;
    window.SkygateRefitText?.();
    if(!window.SkygatePreview)document.getElementById('spin').focus({preventScroll:true});
  }
  play.addEventListener('click',enter);
  retry.addEventListener('click',()=>window.location.reload());
  timer=setTimeout(()=>fail(Error('Loading timeout')),30000);
  // Only first-paint art should gate Play. Offscreen reel banks, lightning and
  // fireworks are decoded independently by SkygateReels before their first use.
  function critical(images){
    return images.filter(image=>{
      if(image.matches?.('.cascade-fx, .firework-flare'))return false;
      if(image.closest?.('.tile[aria-hidden="true"]'))return false;
      return image.closest?.('.published-layer')?.style?.display!=='none';
    });
  }
  window.SkygateBoot={fail,critical,async ready(images,sources=[]){
    const extra=[...new Set(sources)].map(src=>{const image=new Image();image.src=src;return image;});
    // Supplemental art is best-effort prefetch; it never blocks the splash.
    void Promise.allSettled(extra.map(image=>image.decode()));
    await Promise.all([...new Set(images)].map(image=>image.decode()));
    if(document.fonts)await document.fonts.ready;
    // The stylesheet is render-blocking; its absence means the UI cannot be revealed safely.
    if(!document.getElementById('gameStyles').sheet)throw Error('Game stylesheet unavailable');
    if(state!=='loading')throw Error('Loading expired');
    clearTimeout(timer);state='ready';root.dataset.boot=state;
    status.textContent='Siap memasuki Skygate';progress.hidden=true;play.disabled=false;
    if(window.SkygatePreview)enter();
  }};
})();
