/* Studio-only iPhone 15 Pro FULL-SCREEN viewport, not a Safari toolbar preset.
 * Apple: 1179 x 2556 physical pixels. Logical display: 393 x 852 at 3x.
 * Keep the child viewport fixed; scale the complete screen uniformly to fit.
 * This does not emulate iOS hardware, Safari chrome or native safe-area env().
 */
(() => {
  'use strict';
  const WIDTH=393, HEIGHT=852;
  const stage=document.getElementById('stage');
  const phone=stage?.closest('.phone');
  const release=document.getElementById('releaseFrame');
  if(!stage||!phone||!release)return;
  function slotFor(child,kind){
    const slot=document.createElement('div');
    slot.className='device-screen-slot device-screen-'+kind;
    slot.dataset.device='iphone-15-pro';
    child.before(slot);slot.append(child);
    return slot;
  }
  const mainSlot=slotFor(stage,'canvas');
  const releaseSlot=slotFor(release,'release');
  phone.classList.add('iphone15pro-preview');
  stage.setAttribute('aria-label','iPhone 15 Pro full-screen preview, 393 by 852 CSS pixels');
  release.title='iPhone 15 Pro private preview, 393 by 852 CSS pixels';
  let pending=0;
  function setScale(slot,availableWidth,availableHeight){
    const scale=Math.max(.05,Math.min(1,availableWidth/WIDTH,availableHeight/HEIGHT));
    slot.style.setProperty('--device-scale',String(scale));
    slot.style.width=(WIDTH*scale)+'px';
    slot.style.height=(HEIGHT*scale)+'px';
    return scale;
  }
  function fit(){
    pending=0;
    const wrap=phone.closest('.viewport-wrap');
    const mobile=window.matchMedia('(max-width:800px)').matches;
    const dock=document.getElementById('mobileDock');
    const footer=document.querySelector('.viewport-footer');
    const trace=document.querySelector('.trace-bar');
    const reserved=(mobile&&dock?dock.getBoundingClientRect().height:0)+
      (footer?.getBoundingClientRect().height||32)+(trace?.getBoundingClientRect().height||28)+42;
    const height=Math.max(180,window.innerHeight-wrap.getBoundingClientRect().top-reserved);
    const width=Math.max(20,wrap.clientWidth-20);
    const scale=setScale(mainSlot,width,height);
    // 8px bezel padding + 2px border on each side. No 9:16 bezel inheritance.
    phone.style.setProperty('--device-phone-width',(WIDTH*scale+20)+'px');
    releaseSlot.hidden=release.hidden;
    if(!release.hidden){
      const area=releaseSlot.parentElement;
      const style=getComputedStyle(area);
      const available=area.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      if(available>0)setScale(releaseSlot,available,Math.min(780,window.innerHeight*(mobile ? .62 : .74)));
    }
    window.dispatchEvent(new Event('skygate-device-resize'));
  }
  function schedule(){if(!pending)pending=requestAnimationFrame(fit);}
  const resize=new ResizeObserver(schedule);
  resize.observe(phone.closest('.viewport-wrap'));
  resize.observe(releaseSlot.parentElement);
  new MutationObserver(schedule).observe(release,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(schedule).observe(document.getElementById('releaseDialog'),{attributes:true,attributeFilter:['open']});
  window.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('pageshow',schedule,{passive:true});
  window.SkygateDevicePreview=Object.freeze({
    profile:Object.freeze({id:'iphone-15-pro',width:WIDTH,height:HEIGHT,deviceScaleFactor:3,mode:'fullscreen'}),
    fit:schedule
  });
  fit();
})();
