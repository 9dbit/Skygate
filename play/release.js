/* One immutable release per page load; existing rounds never hot-swap math. */
(() => {
  'use strict';
  if(window.SKY_PREVIEW_ASSETS)return;
  const preview=location.pathname==='/studio/preview/';
  const id=new URLSearchParams(location.search).get('revision');
  window.SkygatePreview=preview;
  window.SkygateReleaseReady=(async()=>{
    if(preview&&!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Pilih snapshot preview dari Studio.');
    const response=await fetch(preview?'/studio/api/releases/'+id:'/play/release.json',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Versi game belum dapat dimuat. Muat ulang halaman.');
    window.SkygateActiveRelease=await response.json();
  })();
})();

window.SkygateApplyLayout=(project,asset)=>{
  const game=document.querySelector('.game');
  const scene=document.createElement('div');scene.className='published-scene';
  const bindings={winlabel:'banner',winamount:'win',credits:'credits',betlabel:'betText',reels:'reels',spinbutton:'spin',autobtn:'auto',turbobtn:'turbo',menubtn:'menu',soundbtn:'sound',infobtn:'help'};
  for(const l of project.layers){
    const wrap=document.createElement('div');wrap.className='published-layer '+l.kind+'-layer';wrap.dataset.layer=l.id;
    Object.assign(wrap.style,{left:l.x/1080*100+'%',top:l.y/1920*100+'%',width:l.w/1080*100+'%',height:l.h/1920*100+'%',zIndex:l.z,opacity:l.opacity/100,transform:`rotate(${l.rotate}deg)`,display:l.visible?'':'none',fontSize:(l.font||40)/1080*100+'cqw',color:l.color||'#ffe5af'});
    const node=bindings[l.id]&&document.getElementById(bindings[l.id]);
    if(node){
      if(l.id==='credits'||l.id==='betlabel'){const label=document.createElement('span');label.textContent=l.id==='credits'?'CREDIT ': 'BET ';wrap.append(label);}
      wrap.append(node);
      if(l.id==='spinbutton')node.querySelector('img').src=asset(l.asset);
      if(l.id==='reels'){wrap.classList.add('live-grid');wrap.append(document.getElementById('bonusRibbon'));}
    }else if(l.id==='buybtn'||l.id==='antebtn'){
      const control=document.getElementById(l.id==='buybtn'?'freeInfo':'payInfo');control.className='published-feature';control.style.backgroundImage=`url("${asset(l.asset)}")`;wrap.append(control);
    }else if(l.id==='buytext'||l.id==='antetext'){
      // The matching functional button supplies its own accessible label.
      wrap.textContent=l.id==='buytext'?'FREE SPINS':'WIN TABLE';wrap.classList.add('feature-label');
    }else if(l.kind==='image'){const image=document.createElement('img');image.src=asset(l.asset);image.alt=l.name;image.draggable=false;wrap.append(image);}
    else if(l.kind==='text'||l.kind==='circle')wrap.textContent=l.text;
    scene.append(wrap);
  }
  const betControls=document.createElement('div');betControls.className='published-bet-controls';
  const minus=document.getElementById('minus'),plus=document.getElementById('plus');
  betControls.append(minus,plus);document.querySelector('.menu-actions').before(betControls);
  // Preserve activity details in the menu and a visible virtual-credit identity.
  document.getElementById('status').classList.add('published-status');
  const identity=document.createElement('span');identity.className='published-identity';identity.textContent='VIRTUAL CREDITS · v0.7';scene.append(identity);
  game.append(scene);game.classList.add('has-published-scene');
};
