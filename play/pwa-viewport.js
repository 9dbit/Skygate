'use strict';
/* iOS standalone: screen.height includes the space dynamic vh can omit. */
(() => {
  const root=document.documentElement;
  const update=() => {
    const standalone=window.navigator.standalone===true ||
      window.matchMedia('(display-mode: standalone)').matches;
    const portrait=window.innerWidth<=699 &&
      window.matchMedia('(orientation: portrait)').matches;
    if(!standalone||!portrait){
      root.style.removeProperty('--sg-pwa-full-height');
      return;
    }
    const visual=Math.max(window.innerHeight||0,root.clientHeight||0,
      window.visualViewport?.height||0);
    const physical=Number(window.screen?.height)||0;
    // Ignore anomalous screen values (desktop emulation, browser zoom).
    const full=physical>=visual&&physical<=visual*1.3?physical:visual;
    if(full>0)root.style.setProperty('--sg-pwa-full-height',Math.ceil(full)+'px');
  };
  update();
  window.addEventListener('pageshow',update,{passive:true});
  window.addEventListener('resize',update,{passive:true});
  window.addEventListener('orientationchange',update,{passive:true});
  window.visualViewport?.addEventListener('resize',update,{passive:true});
})();
