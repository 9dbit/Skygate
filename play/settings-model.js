/* Bet arithmetic uses integer hundredths. Presentation never feeds the RNG. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SkygateSettings=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const coins=[.01,.02,.03,.05,.1,.2,.3,.5,1,2,3,5,10,15];
  const money=n=>Math.round((n+Number.EPSILON)*100)/100;
  const total=(level,coin,ante=false)=>money(level*coin*(ante?25:20));
  const combinations=ante=>coins.flatMap(coin=>Array.from({length:10},(_,i)=>({level:i+1,coin,base:total(i+1,coin),total:total(i+1,coin,ante)}))).filter(b=>b.total>=.2&&b.total<=300);
  function fromBase(base,ante=false){return combinations(ante).sort((a,b)=>Math.abs(a.base-base)-Math.abs(b.base-base)||a.level-b.level)[0];}
  function step(current,direction,ante=false){const all=combinations(ante).sort((a,b)=>a.base-b.base||a.level-b.level);return direction>0?(all.find(b=>b.base>current+.0001)||all.at(-1)):([...all].reverse().find(b=>b.base<current-.0001)||all[0]);}
  const speeds=['normal','quick','turbo'];
  function normalize(input={}){return {speed:speeds.includes(input.speed)?input.speed:'normal',battery:!!input.battery,spinLocked:input.spinLocked!==false,promotions:input.promotions!==false,skipScreens:input.skipScreens!==false,intro:input.intro!==false,coinsView:!!input.coinsView,autospins:Math.min(1000,Math.max(10,Math.round((Number(input.autospins)||100)/10)*10))};}
  return {coins,money,total,combinations,fromBase,step,speeds,normalize};
});
