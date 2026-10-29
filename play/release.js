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

  // Presentation-only metal shells: derive geometry from the editable control
  // layers. Neither the saved Live release nor local Studio draft is rewritten.
  const shown=id=>project.layers.find(l=>l.id===id&&l.visible!==false&&l.opacity>0);
  const boardArt=shown('controlboard'),creditArt=shown('credits'),betArt=shown('betlabel');
  const minusArt=shown('minusbtn'),plusArt=shown('plusbtn');
  const rect=(layers,padX,padY)=>{
    const x=Math.max(0,Math.min(...layers.map(l=>l.x))-padX);
    const y=Math.max(0,Math.min(...layers.map(l=>l.y))-padY);
    const right=Math.min(1080,Math.max(...layers.map(l=>l.x+l.w))+padX);
    const bottom=Math.min(1920,Math.max(...layers.map(l=>l.y+l.h))+padY);
    return {x,y,w:right-x,h:bottom-y};
  };
  let splitPanels=null;
  if(project.presentation==='olympus-gold'&&boardArt&&creditArt&&betArt&&minusArt&&plusArt){
    const credit=rect([creditArt],28,18),bet=rect([minusArt,betArt,plusArt],20,12);
    if(credit.x+credit.w+20<bet.x &&
       Math.max(credit.y,bet.y)<Math.min(credit.y+credit.h,bet.y+bet.h)){
      splitPanels={credit,bet,z:Math.max(1,Math.min(creditArt.z,betArt.z)-1)};
    }
  }
  const retired=new Set(['winlabel','virtual_note','buytext','freespins_sub','free_arrow','swirl_icon']);
  // Moving a button detaches its captions until the scene is appended. Capture
  // all bindings first so later caption layers retain their live DOM nodes.
  const boundNodes=Object.fromEntries(Object.entries(bindings).map(([id,target])=>[id,document.getElementById(target)]));
  for(const l of project.layers){
    // The functional booster button already renders its own live label.
    // Do not paint legacy "WIN TABLE" over the Booster in published games.
    if(retired.has(l.id)||(l.id==='antetext'&&project.math.reference_rules))continue;
    const wrap=document.createElement('div');wrap.className='published-layer '+l.kind+'-layer';wrap.dataset.layer=l.id;
    Object.assign(wrap.style,{left:l.x/1080*100+'%',top:l.y/1920*100+'%',width:l.w/1080*100+'%',height:l.h/1920*100+'%',zIndex:l.z,opacity:l.opacity/100,transform:`rotate(${l.rotate}deg)`,display:l.visible?'':'none',fontSize:(l.font||40)/1080*100+'cqw',color:l.color||'#ffe5af'});
    if(l.id==='controlboard'&&splitPanels)wrap.style.visibility='hidden';
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
    }else if(l.kind==='image'){
      // The approved logo is a fixed art replacement, not a Studio layout edit.
      // Published snapshots keep all positions, sizes, z-indexes and math.
      const useApprovedLogo=l.id==='logo'&&l.asset==='custom/skygate-5000-approved.png';
      const image=document.createElement('img');image.src=asset(l.asset);image.alt=l.name;image.draggable=false;
      if(!useApprovedLogo)cropImage(image,l.crop);
      wrap.classList.add('image-crop');
      if(l.id==='logo'){
        wrap.classList.add('brand-logo');
        if(useApprovedLogo){
          // This supplied lockup already contains SKYGATE and crystalline 5000.
          // Never crop it, stretch it, or paint an extra 5000 over the artwork.
          Object.assign(image.style,{position:'static',left:'auto',top:'auto',width:'100%',height:'100%',objectFit:'contain'});
          image.alt='Skygate 5000';wrap.classList.add('brand-complete');wrap.append(image);
        }else{
          const mark=document.createElement('span');mark.className='brand-top';mark.append(image);
          image.alt='Skygate';const number=document.createElement('strong');number.className='brand-number';number.textContent='5000';wrap.append(mark,number);
        }
      }else wrap.append(image);}
    else if(l.kind==='text'||l.kind==='circle')wrap.textContent=l.text;
    if(l.kind==='text'){
      const content=document.createElement('span');content.className='text-content';
      while(wrap.firstChild)content.append(wrap.firstChild);
      wrap.append(content);
    }

    // FX is a presentation-only scene sibling, positioned from the saved guardian.
    // Append BEFORE Zeus at a lower z-index to keep the face and silhouette clear.
    if(l.id==='guardian'&&l.kind==='image'&&l.visible!==false&&l.opacity>0){
      const fx=document.createElement('div');
      fx.className='zeus-lightning-fx';
      fx.dataset.fx='guardian-lightning';
      fx.setAttribute('aria-hidden','true');
      Object.assign(fx.style,{
        left:l.x/1080*100+'%',top:l.y/1920*100+'%',
        width:l.w/1080*100+'%',height:l.h/1920*100+'%',
        zIndex:Math.max(1,l.z-1),transform:'rotate('+(l.rotate||0)+'deg)'
      });
      fx.innerHTML="<svg viewBox=\"0 0 1000 680\" preserveAspectRatio=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\"><g class=\"zeus-bolt zeus-bolt-one\"><path class=\"zeus-bolt-glow\" d=\"M888 -14 732 121 805 149 641 270 710 299 487 496 536 443 377 679\"/><path class=\"zeus-bolt-core\" d=\"M888 -14 732 121 805 149 641 270 710 299 487 496 536 443 377 679\"/><path class=\"zeus-bolt-branch\" d=\"M641 270 496 209 539 285 430 336 M487 496 345 529 400 563 258 618\"/></g><g class=\"zeus-bolt zeus-bolt-two\"><path class=\"zeus-bolt-glow\" d=\"M48 18 226 149 172 181 359 290 317 323 526 496 439 467 661 673\"/><path class=\"zeus-bolt-core\" d=\"M48 18 226 149 172 181 359 290 317 323 526 496 439 467 661 673\"/><path class=\"zeus-bolt-branch\" d=\"M359 290 452 222 422 302 537 342 M526 496 640 469 591 523 748 610\"/></g><g class=\"zeus-bolt zeus-bolt-three\"><path class=\"zeus-bolt-glow\" d=\"M552 -20 590 120 528 162 635 264 571 305 676 454\"/><path class=\"zeus-bolt-core\" d=\"M552 -20 590 120 528 162 635 264 571 305 676 454\"/></g></svg>";
      // Layered cloud volumes share the guardian footprint, below Zeus.
      fx.innerHTML='<span class="zeus-cloud-back"></span><span class="zeus-cloud-front"></span><span class="zeus-cloud-flash"></span>'+fx.innerHTML;
      scene.append(fx);
    }
    scene.append(wrap);
  }

  if(splitPanels){
    for(const [name,bounds] of [['credit',splitPanels.credit],['bet',splitPanels.bet]]){
      const shell=document.createElement('div');
      shell.className='split-wallet-panel split-'+name+'-panel';
      shell.dataset.fx='wallet-'+name;
      shell.setAttribute('aria-hidden','true');
      Object.assign(shell.style,{
        left:bounds.x/1080*100+'%',top:bounds.y/1920*100+'%',
        width:bounds.w/1080*100+'%',height:bounds.h/1920*100+'%',
        zIndex:splitPanels.z
      });
      scene.append(shell);
    }
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
    const approved=logo?.asset==='custom/skygate-5000-approved.png';
    img.src=asset(logo?.asset||'scene/logo.png');
    if(approved){
      host.classList?.add('brand-complete');
      const number=host.querySelector('.brand-number');
      if(number)number.hidden=true;
      const top=host.querySelector('.brand-top');
      if(top?.style)Object.assign(top.style,{inset:'0',overflow:'visible'});
      Object.assign(img.style,{position:'static',left:'auto',top:'auto',width:'100%',height:'100%',objectFit:'contain'});
      img.alt='Skygate 5000';
    }else{
      const c=logo?.crop;
      if(c)Object.assign(img.style,{position:'absolute',left:-c.x/c.w*100+'%',top:-c.y/c.h*100+'%',width:100/c.w+'%',height:100/c.h+'%',objectFit:'fill'});
    }
  }
  document.documentElement.style.setProperty('--sg-action-image','url('+JSON.stringify(asset(panel?.asset||'ui/confirmation-panel-v1.png'))+')');
};
