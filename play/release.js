/* One immutable release per page load; existing rounds never hot-swap math. */
(() => {
  'use strict';
  if(typeof location!=='undefined'&&location.pathname==='/studio/editor-preview/'){
    window.SkygatePreview=true;window.SkygateEditorPreview=true;
    window.SkygateReleaseReady=new Promise(resolve=>{
      const receive=event=>{
        if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='skygate-editor-state')return;
        const {project,assets}=event.data;
        if(!project||!Array.isArray(project.layers)||!project.math)return;
        window.removeEventListener('message',receive);
        window.SKY_PREVIEW_ASSETS=assets||{};
        window.SkygateActiveRelease={id:'editor-draft',createdAt:new Date().toISOString(),project,overrides:{}};
        resolve();
      };
      window.addEventListener('message',receive);
      window.parent.postMessage({type:'skygate-editor-request'},location.origin);
    });
    return;
  }
  if(window.SKY_PREVIEW_ASSETS)return;
  const preview=location.pathname==='/studio/preview/';
  const id=new URLSearchParams(location.search).get('revision');
  const previewLive=preview&&new URLSearchParams(location.search).get('live')==='1';
  window.SkygatePreview=preview;
  window.SkygateReleaseReady=(async()=>{
    if(preview&&!previewLive&&!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Pilih snapshot preview dari Studio.');
    const response=await fetch(preview&&!previewLive?'/studio/api/releases/'+id:'/play/release.json',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Versi game belum dapat dimuat. Muat ulang halaman.');
    window.SkygateActiveRelease=await response.json();
  })();
})();

window.SkygateApplyLayout=(project,asset)=>{
  const game=document.querySelector('.game');
  const scene=document.createElement('div');scene.className='published-scene';
  if(project.presentation==='olympus-gold')game.classList.add('olympus-gold');
  const cropImage=(img,c)=>{if(c)Object.assign(img.style,{position:'absolute',left:-c.x/c.w*100+'%',top:-c.y/c.h*100+'%',width:100/c.w+'%',height:100/c.h+'%',objectFit:'fill'});};
  const bindings={winamount:'win',credits:'credits',betlabel:'betText',reels:'reels',spinbutton:'spin',autobtn:'auto',turbobtn:'turbo',menubtn:'menu',soundbtn:'sound',infobtn:'help',minusbtn:'minus',plusbtn:'plus',autolabel:'autoStatus',turbolabel:'turboStatus'};
  const retired=new Set(['winlabel','virtual_note','buytext','freespins_sub','free_arrow','swirl_icon']);
  // Moving a button detaches its captions until the scene is appended. Capture
  // all bindings first so later caption layers retain their live DOM nodes.
  const boundNodes=Object.fromEntries(Object.entries(bindings).map(([id,target])=>[id,document.getElementById(target)]));
  for(const l of project.layers){
    if(retired.has(l.id))continue;
    const wrap=document.createElement('div');wrap.className='published-layer '+l.kind+'-layer';wrap.dataset.layer=l.id;
    Object.assign(wrap.style,{left:l.x/1080*100+'%',top:l.y/1920*100+'%',width:l.w/1080*100+'%',height:l.h/1920*100+'%',zIndex:l.z,opacity:l.opacity/100,transform:`rotate(${l.rotate}deg)`,display:l.visible?'':'none',fontSize:(l.font||40)/1080*100+'cqw',color:l.color||'#ffe5af'});
    const node=boundNodes[l.id];
    if(node){
      if(l.id==='credits'||l.id==='betlabel'){const label=document.createElement('span');label.textContent=l.id==='credits'?'CREDIT ': 'BET ';wrap.append(label);}
      wrap.append(node);
      if(l.id==='spinbutton')for(const img of node.querySelectorAll('img')){img.src=asset(l.asset);cropImage(img,l.crop);}
      if(l.kind==='circle'&&l.asset){const bg=document.createElement('img');bg.src=asset(l.asset);bg.alt='';bg.className='control-skin';cropImage(bg,l.crop);node.prepend(bg);node.classList.add('skinned-control');if(l.id==='autobtn'&&project.presentation==='olympus-gold')node.querySelector('svg').innerHTML='<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>';}
      if(l.id==='reels'){wrap.classList.add('live-grid');wrap.append(document.getElementById('bonusRibbon'));}
    }else if(l.id==='antebtn'||l.id==='buybtn'){
      const reference=project.math.reference_rules;
      const control=document.getElementById(l.id==='buybtn'?'buyFeature':reference?'anteFeature':'payInfo');control.classList.add('published-feature');if(reference)control.classList.add('live-feature');const bg=document.createElement('img');bg.src=asset(l.asset);bg.alt='';bg.className='feature-skin';cropImage(bg,l.crop);control.prepend(bg);wrap.append(control);
      if(!reference)control.setAttribute('aria-label','Win table · nilai simbol');
    }else if(l.id==='antetext'){
      // The matching functional button supplies its own accessible label.
      wrap.textContent='WIN TABLE';wrap.classList.add('feature-label');
    }else if(l.kind==='image'){const image=document.createElement('img');image.src=asset(l.asset);image.alt=l.name;image.draggable=false;cropImage(image,l.crop);wrap.classList.add('image-crop');
      if(l.id==='logo'){
        wrap.classList.add('brand-logo');const mark=document.createElement('span');mark.className='brand-top';mark.append(image);
        image.alt='Skygate';const number=document.createElement('strong');number.className='brand-number';number.textContent='5000';wrap.append(mark,number);
      }else wrap.append(image);}
    else if(l.kind==='text'||l.kind==='circle')wrap.textContent=l.text;
    if(l.kind==='text'){
      const content=document.createElement('span');content.className='text-content';
      while(wrap.firstChild)content.append(wrap.firstChild);
      wrap.append(content);
    }
    scene.append(wrap);
  }
  const missingBet=['minusbtn','plusbtn'].filter(id=>!project.layers.some(l=>l.id===id));
  if(missingBet.length){const betControls=document.createElement('div');betControls.className='published-bet-controls';for(const id of missingBet)betControls.append(document.getElementById(bindings[id]));document.querySelector('.menu-actions').before(betControls);}
  // Preserve activity details in the menu and a visible virtual-credit identity.
  document.getElementById('status').classList.add('published-status');
  const identity=document.createElement('span');identity.className='published-identity';identity.textContent='VIRTUAL CREDITS\nSKYGATE';scene.append(identity);
  game.append(scene);game.classList.add('has-published-scene');
  window.SkygateRefitText=()=>window.SkygateTextFit.request(scene);
  window.addEventListener('resize',window.SkygateRefitText);
  window.SkygateRefitText();
};

// Splash and popup identities follow the same published assets and crop as the game.
window.SkygateSyncChrome=(project,asset)=>{
  const logo=project?.layers.find(l=>l.id==='logo');
  const panel=project?.layers.find(l=>l.id==='buybtn');
  // Published snapshots keep their immutable artwork. A fresh/unpublished game
  // must not depend on a media hash stored only in the production volume.
  for(const host of document.querySelectorAll('[data-game-brand]')){
    const img=host.querySelector('img');
    img.src=asset(logo?.asset||'scene/logo.png');
    const c=logo?.crop;
    if(c)Object.assign(img.style,{position:'absolute',left:-c.x/c.w*100+'%',top:-c.y/c.h*100+'%',width:100/c.w+'%',height:100/c.h+'%',objectFit:'fill'});
  }
  document.documentElement.style.setProperty('--sg-action-image','url('+JSON.stringify(asset(panel?.asset||'ui/confirmation-panel-v1.png'))+')');
};
