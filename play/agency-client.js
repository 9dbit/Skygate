'use strict';
window.SkygateAgencyReady=(async()=>{
 const mode=await fetch('/api/agency/mode',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Game mode unavailable');return r.json();});
 if(!mode.agency)return null;
 const key='skygate-agency-pending',launchKey='skygate-agency-launch';
 async function request(path,payload){
  const r=await fetch('/api/agency/'+path,{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Skygate-Client':'agency-ui'},...(payload?{body:JSON.stringify(payload)}:{})});
  const d=await r.json();if(!r.ok){const e=Error(d.error||'Wallet unavailable');e.status=r.status;throw e;}return d;
 }
 const params=new URLSearchParams(location.hash.slice(1)),token=params.get('playground_launch');
 if(token){sessionStorage.setItem(launchKey,token);params.delete('playground_launch');history.replaceState(null,'',location.pathname+location.search+(params.size?'#'+params:''));sessionStorage.removeItem(key);}
 if(sessionStorage.getItem(launchKey)){
  try{await request('launch',{token:sessionStorage.getItem(launchKey)});sessionStorage.removeItem(launchKey);}
  catch(e){if(e.status<500&&![408,429].includes(e.status))sessionStorage.removeItem(launchKey);throw e;}
 }
 await window.SkygateReleaseReady;
 const api={state:await request('state'),async spin(bet,ante,buy_bonus){
  let payload=JSON.parse(sessionStorage.getItem(key)||'null');
  if(!payload){payload={request_id:crypto.randomUUID(),bet:String(bet),ante,buy_bonus,release_id:api.state.release_id};sessionStorage.setItem(key,JSON.stringify(payload));}
  try{const result=await request('spin',payload);api.state=result.state;sessionStorage.removeItem(key);return result;}
  catch(e){if(e.status<500&&![408,429].includes(e.status))sessionStorage.removeItem(key);throw e;}
 }};
 const pending=JSON.parse(sessionStorage.getItem(key)||'null');
 if(pending&&api.state.history.some(h=>h.request_id===pending.request_id))sessionStorage.removeItem(key);
 if(api.state.release_id!==(window.SkygateActiveRelease?.id||'bundled'))throw Error('Versi berubah. Muat ulang game.');
 window.SkygateAgency=api;return api;
})();
window.SkygateAgencyReady.catch(()=>{});
