/* Original virtual-credit research wrapper for Skygate Studio v0.3.
   WARNING: Seeded xorshift RNG is deterministic and NOT a certified/secure RNG. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./engine.js'):root.SlotGameMath);if(typeof module==='object'&&module.exports)module.exports=api;else root.SkygateStudioMath=api;})(typeof globalThis!=='undefined'?globalThis:this,function(math){
 'use strict';
 function validateJackpot(cfg){
   if(!cfg || !Array.isArray(cfg.tiers))throw Error('Invalid jackpot tiers');
   let odds=0;
   for(const t of cfg.tiers){
     if(!Number.isFinite(t.awardX)||t.awardX<0||!Number.isFinite(t.perMillion)||t.perMillion<0)throw Error('Jackpot must have non-negative award/odds');
     odds+=t.perMillion;
   }
   if(odds>1000000)throw Error('Total jackpot per-million weights exceed 1,000,000');
   return cfg;
 }
 function jackpotContributionPct(cfg){validateJackpot(cfg);return cfg.enabled?100*cfg.tiers.reduce((s,t)=>s+t.awardX*t.perMillion/1e6,0):0;}
 function createStudioEngine(config,jackpotCfg,seed=20261027){
   math.validateConfig(config);validateJackpot(jackpotCfg);
   const base=math.createEngine(config,seed);
   const jpRng=math.createRng((math.uint32(seed)^0xA9E3779B)>>>0);
   function playRound(opt={}){
     const result=base.playRound(opt);
     let tier=null,awardX=0;
     if(jackpotCfg.enabled){
       let draw=jpRng.next()*1e6;
       for(const t of jackpotCfg.tiers){draw-=t.perMillion;if(draw<0){tier=t.id;awardX=Math.min(Math.max(0,config.round_max_win_x-result.winX),t.awardX);break;}}
     }
     const total=+(result.winX+awardX).toFixed(10);
     return {...result, baseWinX:result.winX,winX:total,capHit:result.capHit||total>=config.round_max_win_x,jackpot:{hit:!!tier,tier,awardX}};
   }
   return {playRound,getState(){return base.getState();}};
 }
 function classifyWin(winX,thresholds){
  if(!(winX>0))return 'none';
  if(winX>=thresholds.superX)return 'super';
  if(winX>=thresholds.megaX)return 'mega';
  if(winX>=thresholds.bigX)return 'big';
  return 'small';
 }
 return {createStudioEngine,validateJackpot,jackpotContributionPct,classifyWin};
});
