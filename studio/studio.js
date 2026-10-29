/* SKYGATE Studio v0.4. Mobile studio, portable backups, iOS-compatible sound. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const deep=o=>JSON.parse(JSON.stringify(o));
  const DEFAULT=deep(window.SKY_PROJECT_DEFAULT);
  const storageKey='skygate-studio-20261027-v03';
  const VALID_TABS=['layers','assets','audio','math','jackpot','test'];
  let pendingEdit=null;
  let state=deep(DEFAULT), activeTab='layers', selected='guardian', mode='edit',undoHistory=[], engine=null, simCancelled=false, overrideURL=new Map(), overrideBlobs=new Map(), testStats=null, busy=false, toastTimeout=0, lastRound=null, previewVisualGrid=null;
  const symbolNames=['ruby','sapphire','emerald','amethyst','topaz','amber','pearl','ring','crown','hourglass','chalice','orb','scatter'];
  const symbolLabels={ruby:'Ruby',sapphire:'Sapphire',emerald:'Emerald',amethyst:'Amethyst',topaz:'Topaz',amber:'Amber',pearl:'Pearl',ring:'Ring',crown:'Crown',hourglass:'Hourglass',chalice:'Chalice',orb:'Multiplier Orb',scatter:'Scatter'};
  const imageFiles=[
    ...symbolNames.map(s=>({id:s,path:'symbols/'+s+'.png',group:'REEL SYMBOLS',kind:'symbol'})),
    {id:'sky_background',path:'scene/sky_background.jpg',group:'SCENE & CHARACTER'},
    {id:'guardian',path:'scene/guardian.png',group:'SCENE & CHARACTER'},
    {id:'logo',path:'scene/logo.png',group:'SCENE & CHARACTER'},
    {id:'column_left',path:'scene/column_left.png',group:'SCENE & CHARACTER'},
    {id:'column_right',path:'scene/column_right.png',group:'SCENE & CHARACTER'},
    {id:'reel_frame',path:'ui/reel_frame.svg',group:'FRAME & CONTROLS'},
    {id:'gold_banner',path:'ui/gold_banner.svg',group:'FRAME & CONTROLS'},
    {id:'blue_button',path:'ui/blue_button.svg',group:'FRAME & CONTROLS'},
    {id:'spin_button',path:'ui/spin_button.svg',group:'FRAME & CONTROLS'},
    ...['mini','minor','major','grand'].map(s=>({id:'jackpot_'+s,path:'ui/jackpot_'+s+'.svg',group:'JACKPOT BANNERS'}))
  ];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
  function toast(message){const node=$('#toast');node.textContent=message;node.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>node.classList.remove('visible'),2800);}
  function lookupLayer(id){return state.layers.find(x=>x.id===id);}
  function assetURL(path){return overrideURL.get('asset:'+path)||window.SKY_EMBEDDED_ASSETS?.[path]||'assets/'+path;}
  function audioURL(trackId){return overrideURL.get('audio:'+trackId)||window.SKY_EMBEDDED_AUDIO?.[trackId]||window.QA_AUDIO_DATA?.[trackId]||'assets/audio/'+trackId+'.mp3';}
  function getAt(path){return path.split('.').reduce((o,k)=>o?.[k],state);}
  function setAt(path,val){const parts=path.split('.');let o=state;for(const k of parts.slice(0,-1))o=o[k];o[parts.at(-1)]=val;}
  function remember(){undoHistory.push(deep(state));if(undoHistory.length>35)undoHistory.shift();}
  function saveLocal(showToast=false){try{localStorage.setItem(storageKey,JSON.stringify(state));$('#saveStatus').textContent='Saved locally';if(showToast)toast('Project saved in this browser.');}catch(e){$('#saveStatus').textContent='Storage unavailable';if(showToast)toast('Storage is unavailable; export JSON for backup.');}}
  function invalidateEngine(){engine=null;testStats=null;}
  function validateSpinMotion(motion){
    if(!motion||typeof motion!=='object'||Array.isArray(motion))throw Error('Invalid spin motion settings');
    for(const [key,min,max] of [['normalMs',1200,3500],['quickMs',750,2300],['turboMs',420,1300]]){
      const n=motion[key];if(!Number.isInteger(n)||n<min||n>max)throw Error(key+' must be '+min+' to '+max+' ms');
    }
    if(!(motion.normalMs>motion.quickMs&&motion.quickMs>motion.turboMs))throw Error('Keep NORMAL slower than QUICK, and QUICK slower than TURBO');
  }
  function validateLoaded(data){
    if(!data||data.schema!==DEFAULT.schema||!Array.isArray(data.layers)||!Array.isArray(data.grid)||data.grid.length!==30||!Array.isArray(data.tracks))throw Error('Invalid Skygate Studio project schema');
    if(data.layers.some(l=>!['image','grid','text','panel','circle'].includes(l.kind)||!Number.isFinite(l.x)||!Number.isFinite(l.y)||!Number.isFinite(l.w)||!Number.isFinite(l.h)))throw Error('Layer geometry must be numeric');
    window.SlotGameMath.validateConfig(data.math);window.SkygateStudioMath.validateJackpot(data.jackpot);
    // Older exported projects and published snapshots do not have motion yet.
    data.spinMotion={...DEFAULT.spinMotion,...(data.spinMotion||{})};
    validateSpinMotion(data.spinMotion);
    return data;
  }
  function restoreLocal(){try{const raw=localStorage.getItem(storageKey);if(raw)state=validateLoaded(JSON.parse(raw));}catch(e){state=deep(DEFAULT);}}
  function selectTab(t){if(!VALID_TABS.includes(t))return;activeTab=t;$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));renderSidebar();renderInspector();syncMobileDock();}
  function syncMobileDock(){const open=document.body.classList.contains('studio-mobile-panel-open');$$('[data-mobile-tab]').forEach(b=>b.classList.toggle('selected',open?b.dataset.mobileTab===activeTab:b.dataset.mobileTab==='canvas'));}
  function setMobilePanel(open){document.body.classList.toggle('studio-mobile-panel-open',open);$('#mobileSheetBackdrop').hidden=!open;syncMobileDock();if(open)$('#inspectorContent').scrollTop=0;}
  function stagePct(n,axis){return n/(axis==='x'?1080:1920)*100+'%';}
  function positionLayer(el,l){el.style.left=stagePct(l.x,'x');el.style.top=stagePct(l.y,'y');el.style.width=stagePct(l.w,'x');el.style.height=stagePct(l.h,'y');el.style.opacity=(l.opacity??100)/100;el.style.zIndex=l.z;el.style.transform=`rotate(${l.rotate||0}deg)`;el.style.display=l.visible===false?'none':'';}
  function layerText(el,l,value=l.text){
    const content=document.createElement('span');content.className='text-content';
    if(state.presentation==='olympus-gold'&&['credits','betlabel'].includes(l.id)){
      content.classList.add('wallet-text');const label=document.createElement('span');label.textContent=l.id==='credits'?'CREDIT':'BET';
      const amount=document.createElement('strong');amount.textContent=value;content.append(label,amount);
    }else content.textContent=value;
    el.replaceChildren(content);
  }
  function drawCanvas(){
    const root=$('#stageLayers');root.replaceChildren();
    root.classList.toggle('olympus-gold',state.presentation==='olympus-gold');
    const layers=[...state.layers].sort((a,b)=>(a.z||0)-(b.z||0));
    for(const l of layers){
      const el=document.createElement('div');el.className='stage-layer '+l.kind+'-layer'+(selected===l.id&&mode==='edit'?' selected':'')+(l.locked?' locked':'');el.dataset.id=l.id;el.dataset.kind=l.kind;positionLayer(el,l);
      if(l.kind==='image'||(l.kind==='circle'&&l.asset)){const img=document.createElement('img');img.src=assetURL(l.asset);img.alt=l.name;img.draggable=false;if(l.crop){const c=l.crop;Object.assign(img.style,{position:'absolute',left:-c.x/c.w*100+'%',top:-c.y/c.h*100+'%',width:100/c.w+'%',height:100/c.h+'%',objectFit:'fill'});}el.classList.add('image-crop');el.append(img);if(l.kind==='circle'){el.classList.add('skinned-control');const icon=document.createElement('span');icon.textContent=l.text||'';el.append(icon);}}
      else if(l.kind==='text'){layerText(el,l);el.style.color=l.color||'#ffe5af';}
      else if(l.kind==='circle')el.textContent=l.text||'★';
      else if(l.kind==='grid'){
        for(const id of previewVisualGrid||state.grid){const cell=document.createElement('div');cell.className='grid-cell';const im=document.createElement('img');im.alt=id;im.src=assetURL('symbols/'+id+'.png');im.draggable=false;cell.append(im);el.append(cell);}
      }
      root.append(el);
    }
    // Fixed source-ratio font sizing, effective even with variable editor viewport.
    resizeText();
    window.dispatchEvent(new Event('skygate-draft-change'));
  }
  function resizeText(){const stageW=$('#stage').getBoundingClientRect().width;$$('#stageLayers .text-layer').forEach(el=>{const l=lookupLayer(el.dataset.id);if(l)el.style.fontSize=(l.font||40)*stageW/1080+'px'});$$('#stageLayers .circle-layer').forEach(el=>{const l=lookupLayer(el.dataset.id);if(l)el.style.fontSize=Math.max(6,(l.font||36)*stageW/1080)+'px'});window.SkygateTextFit.request($('#stageLayers'));}
  function renderSidebar(){
    const side=$('#sideContent');side.replaceChildren();const label=$('#sideTitle');const count=$('#sideCount');
    if(activeTab==='layers'){
      label.textContent='LAYER TREE';count.textContent=state.layers.length+' layers';
      const list=[...state.layers].sort((a,b)=>b.z-a.z);
      side.innerHTML=list.map(l=>`<div class="layer-row ${selected===l.id?'active':''}" data-layer-row="${esc(l.id)}"><div class="layer-icon">${{image:'▧',grid:'▦',text:'T',panel:'▰',circle:'●'}[l.kind]}</div><span class="name">${esc(l.name)}</span><span class="mini-action" title="${l.locked?'Unlock':'Lock'}" data-lock="${esc(l.id)}">${l.locked?'♙':'♧'}</span><span class="mini-action" title="${l.visible?'Hide':'Show'}" data-eye="${esc(l.id)}">${l.visible?'◉':'◌'}</span></div>`).join('');
    }else if(activeTab==='assets'){
      label.textContent='SEPARATE ASSETS';count.textContent=imageFiles.length+' files';let last='';
      side.innerHTML=imageFiles.map(f=>{let head='';if(f.group!==last){last=f.group;head=`<div class="asset-group">${esc(last)}</div>`;}return head+`<button class="asset-row" data-asset="${esc(f.path)}"><img src="${esc(assetURL(f.path))}" loading="lazy"><span>${esc(f.id.replaceAll('_',' '))}<small>PNG / SVG · individual</small></span><b class="asset-chip">↗</b></button>`;}).join('');
    }else if(activeTab==='audio'){
      label.textContent='AUDIO ASSETS';count.textContent=state.tracks.length+' tracks';
      side.innerHTML=state.tracks.map(t=>`<div class="track-mini"><span style="color:var(--gold);font-size:17px">♫</span><span style="flex:1">${esc(t.name)}</span><span style="color:#7fdaa8;font-size:10px">${t.loop?'LOOP':'SFX'}</span></div>`).join('');
    }else if(activeTab==='math'){
      label.textContent='GAME MATH';count.textContent='Virtual-only';
      side.innerHTML=`<div class="property-card"><strong>6×5 / 8+ Anywhere</strong><p>Tumble, multiplier orb, free spins and payouts use deterministic demo engine.</p></div><div class="property-card"><strong>Configurable model</strong><p>Symbol weights and paytable are the real inputs to the simulated round engine. Target RTP is planning metadata.</p></div>`;
    }else if(activeTab==='jackpot'){
      label.textContent='JACKPOT TIERS';count.textContent=state.jackpot.enabled?'Active':'Disabled';
      side.innerHTML=state.jackpot.tiers.map(t=>`<div class="property-card" style="border-left:3px solid ${esc(t.color)}"><strong>${esc(t.name)}</strong><p>${fmt(t.awardX)}× bet · ${fmt(t.perMillion)} per million paid spins</p></div>`).join('');
    }else{label.textContent='SPIN & TEST';count.textContent='Motion + QA';side.innerHTML=`<div class="property-card"><strong>Test sequence</strong><p>1. Edit math profile<br>2. Run sample rounds<br>3. Inspect hit rate, RTP and jackpot events<br>4. Export project config and overrides</p></div><div class="warning-note">The studio is a research prototype. No deposits, withdrawals or account/player targeting.</div>`;}
  }
  function field(path,label,type='number',opts={}){
    const val=getAt(path);const attrs=`data-path="${esc(path)}" ${opts.min!==undefined?'min="'+opts.min+'"':''} ${opts.max!==undefined?'max="'+opts.max+'"':''} ${opts.step!==undefined?'step="'+opts.step+'"':''}`;
    const input=type==='checkbox'?`<input type="checkbox" ${attrs} ${val?'checked':''}/>`:`<input type="${type}" ${attrs} value="${esc(val)}" ${opts.placeholder?'placeholder="'+esc(opts.placeholder)+'"':''}/>`;
    return `<div class="field"><label class="field-label">${esc(label)} ${opts.note?'<small>'+esc(opts.note)+'</small>':''}</label>${input}</div>`;
  }
  function currentLayer(){return lookupLayer(selected);}
  function renderInspector(){
    const root=$('#inspectorContent');const title=$('#panelTitle');
    if(activeTab==='layers'){
      const l=currentLayer();title.textContent='Layer properties';
      if(!l){root.innerHTML='<div class="warning-note">Choose a layer from the tree or mobile canvas.</div>';return;}
      root.innerHTML=`<div class="section-head">SELECTED ELEMENT</div><div class="property-card"><strong>${esc(l.name)}</strong><p>Layer ${esc(l.id)} · ${esc(l.kind)} · z-index ${l.z}</p>${l.asset?`<img class="asset-preview" src="${esc(assetURL(l.asset))}" alt="${esc(l.name)}"/>`:''}</div>
        ${field('layers.'+state.layers.indexOf(l)+'.name','Layer Name','text')}
        <div class="section-head">POSITION & SIZE</div><div class="field-grid">${field('layers.'+state.layers.indexOf(l)+'.x','X · px','number',{step:1})}${field('layers.'+state.layers.indexOf(l)+'.y','Y · px','number',{step:1})}${field('layers.'+state.layers.indexOf(l)+'.w','Width','number',{min:4,step:1})}${field('layers.'+state.layers.indexOf(l)+'.h','Height','number',{min:4,step:1})}</div>
        <div class="field-grid">${field('layers.'+state.layers.indexOf(l)+'.opacity','Opacity','number',{min:0,max:100,step:1})}${field('layers.'+state.layers.indexOf(l)+'.rotate','Rotation · °','number',{min:-180,max:180})}</div>
        <div class="field-grid">${field('layers.'+state.layers.indexOf(l)+'.z','Z-index','number',{step:1})}${l.kind==='text'||l.kind==='circle'?field('layers.'+state.layers.indexOf(l)+'.font','Font px','number',{min:8,max:170}):'<div></div>'}</div>
        ${l.kind==='text'||l.kind==='circle'?`${field('layers.'+state.layers.indexOf(l)+'.text','Display Text','text')}${l.kind==='text'?`<div class="field"><label class="field-label">Text Color</label><input type="color" data-path="layers.${state.layers.indexOf(l)}.color" value="${esc(l.color||'#ffe5a4')}"></div>`:''}`:''}
        ${l.asset?`<div class="section-head">ASSET SOURCE</div><div class="field"><label class="field-label">Image Source</label><input type="text" disabled value="${esc(l.asset)}"/></div><div class="prop-row"><button class="prop-btn" data-asset-replace="${esc(l.asset)}">↥ Replace PNG/SVG</button><button class="prop-btn alt" data-asset-reset="${esc(l.asset)}">↶ Restore</button></div>`:''}
        <div class="section-head">LAYER CONTROLS</div><label class="switchline">Visible <input type="checkbox" data-path="layers.${state.layers.indexOf(l)}.visible" ${l.visible?'checked':''}/></label><label class="switchline">Lock Position <input type="checkbox" data-path="layers.${state.layers.indexOf(l)}.locked" ${l.locked?'checked':''}/></label><div class="prop-row" style="margin-top:13px"><button class="prop-btn" data-duplicate="${esc(l.id)}">⧉ Duplicate</button><button class="prop-btn alt" data-delete="${esc(l.id)}">Delete</button></div><div class="inspector-note">On canvas: drag to move. Saved values are in a 1080 × 1920 coordinate system and scale for smartphone.</div>`;
    }else if(activeTab==='assets'){
      title.textContent='Asset Manager';root.innerHTML=`<div class="section-head">MODULAR RENDER ASSETS</div><div class="property-card"><strong>Each PNG / SVG is independent</strong><p>Tap an asset in the left library to select it. Replace selected files without touching other symbols or panels.</p><p>Image crop cutouts originate from a flattened JPEG reference. This is not a recovered multi-layer PSD or a licensed art source.</p></div><button class="wide-btn" id="addAssetBtn">＋ Add selected artwork as layer</button><div class="section-head">ASSET MANAGEMENT</div><div class="prop-row"><button class="prop-btn" id="uploadAnyBtn">↥ Upload New Asset</button><button class="prop-btn alt" id="openAssetContact">⧉ View Asset Sheet</button></div><div class="warning-note">Custom uploads are stored in browser IndexedDB when supported. Use Export changes ZIP to archive uploaded binary files. Project JSON contains layout/settings, not the uploaded binary data.</div>`;
    }else if(activeTab==='audio'){
      title.textContent='Audio & Music Editor';
      const tracks=state.tracks.map((t,i)=>`<div class="audio-row"><div class="audio-row-header"><div><strong>${esc(t.name)}</strong><br/><small>${esc(t.event)} · ${t.loop?'loop':'one shot'} · ${overrideBlobs.has('audio:'+t.id)?'CUSTOM':'BUILT-IN'}</small></div><div class="audio-row-actions"><button aria-label="Play ${esc(t.name)}" data-audio-play="${esc(t.id)}">▶</button><button aria-label="Stop ${esc(t.name)}" data-audio-stop="${esc(t.id)}">■</button><button aria-label="Upload ${esc(t.name)}" data-audio-upload="${esc(t.id)}">↥</button><button aria-label="Reset ${esc(t.name)}" data-audio-reset="${esc(t.id)}">↶</button></div></div><div class="audio-wave" role="button" tabindex="0" title="Click to seek or play" data-audio-wave="${esc(t.id)}">${(window.SKY_AUDIO_WAVES?.[t.id]||Array(44).fill(15)).map(h=>`<i style="height:${h}%"></i>`).join('')}</div><div class="audio-controls"><label>Volume ${t.volume}%</label><small style="color:#bca5cf">Fade ${t.fade||0}ms</small><input type="range" data-path="tracks.${i}.volume" min="0" max="100" step="1" value="${t.volume}"/><label><input type="checkbox" data-path="tracks.${i}.loop" ${t.loop?'checked':''}/> Loop</label></div><div class="field-grid" style="margin-top:8px"><div><label class="field-label">Fade (ms)</label><input type="number" data-path="tracks.${i}.fade" min="0" max="10000" step="100" value="${t.fade||0}"/></div><div><label class="field-label">Speed</label><select data-path="tracks.${i}.rate">${[0.75,1,1.25,1.5].map(x=>`<option value="${x}" ${(t.rate||1)===x?'selected':''}>${x}×</option>`).join('')}</select></div></div><div class="field-grid" style="margin-top:8px"><div><label class="field-label">Trim start (s)</label><input type="number" min="0" step="0.1" data-path="tracks.${i}.trimStart" value="${t.trimStart||0}"/></div><div><label class="field-label">Trim end (s; 0=full)</label><input type="number" min="0" step="0.1" data-path="tracks.${i}.trimEnd" value="${t.trimEnd||0}"/></div></div></div>`).join('');
      root.innerHTML=`<div class="section-head">MIXER MASTER</div><div class="prop-row" style="margin:8px 0 16px"><button class="prop-btn" id="audioUnlockPanelBtn">♫ Enable audio (iPhone)</button></div><div class="field"><label class="field-label">Master Volume · ${state.audio.master}%</label><input type="range" data-path="audio.master" min="0" max="100" value="${state.audio.master}"/></div><label class="switchline">Mute All <input type="checkbox" data-path="audio.muted" ${state.audio.muted?'checked':''}/></label><div class="prop-row" style="margin:12px 0"><button class="prop-btn" data-audio-play="bgm_celestial_loop">♫ Play BGM</button><button class="prop-btn alt" id="stopAllAudio">■ Stop All</button></div><div class="section-head">13 EDITABLE AUDIO CHANNELS</div>${tracks}<div class="warning-note">Tap <b>Enable sound</b> once on iPhone before testing SFX. MP3 fallbacks and Web Audio prevent delayed tumble/win sounds being blocked after a user tap. All default audio is synthesized original. Upload MP3/WAV/OGG/M4A; export ZIP to preserve custom tracks.</div>`;
    }else if(activeTab==='math'){
      title.textContent='Math & Win Table';
      const sm=state.math.symbol_weights;const table=Object.keys(state.math.paytable);
      const payRows=table.map(s=>`<tr><td><img class="image-mini" src="${esc(assetURL('symbols/'+s+'.png'))}" title="${esc(s)}"/></td><td>${esc(s)}</td>${state.math.paytable[s].map((v,i)=>`<td><input type="number" min="0" step="0.001" data-path="math.paytable.${s}.${i}" value="${v}"/></td>`).join('')}</tr>`).join('');
      root.innerHTML=`<div class="section-head">MODEL CONFIGURATION</div><div class="warning-note">Theoretical RTP is NOT guaranteed by a target field. Actual returns depend on all outcome weights, paytable, bonus rules, jackpots, and max-win caps. Run simulation for an observed sample.</div><div class="field-grid">${field('targetRTP','Research RTP Target (%)','number',{min:0,max:100,step:0.05})}${field('math.round_max_win_x','Maximum Win (×)','number',{min:1,max:100000,step:1})}${field('math.bonus_start_spins','Initial Free Spins','number',{min:1,max:50,step:1})}${field('math.bonus_trigger_scatters','Scatter Trigger','number',{min:3,max:6,step:1})}${field('math.bonus_retrigger_scatters','Scatter Retrigger','number',{min:3,max:6,step:1})}${field('math.bonus_retrigger_add_spins','Retrigger Add Spins','number',{min:1,max:25,step:1})}</div>
      <div class="section-head">SYMBOL WEIGHTS <small style="color:#8a819b;font-weight:400">· relative</small></div><div class="field-grid">${Object.keys(sm).map(s=>field('math.symbol_weights.'+s,symbolLabels[s]||s,'number',{min:1,max:10000,step:1})).join('')}</div>
      <div class="section-head">WIN TABLE <small style="font-size:9px;color:#8e829b">· multiple of paid bet</small></div><table class="table-like"><thead><tr><th></th><th>Symbol</th><th>8–9</th><th>10–11</th><th>12+</th></tr></thead><tbody>${payRows}</tbody></table>
      <div class="section-head">MULTIPLIER WEIGHTS</div><div class="field-grid">${state.math.multiplier_values.map((n,i)=>field('math.multiplier_weights.'+i,`${n}× weight`,'number',{min:1,max:10000,step:1})).join('')}</div><div class="section-head">WIN CELEBRATION THRESHOLDS</div><div class="field-grid">${field('winPresentation.smallX','Small ≥ (×)','number',{min:0,step:.5})}${field('winPresentation.bigX','Big ≥ (×)','number',{min:1,step:1})}${field('winPresentation.megaX','Mega ≥ (×)','number',{min:1,step:1})}${field('winPresentation.superX','Super ≥ (×)','number',{min:1,step:1})}</div><button class="sim-button" id="quickTestBtn">▶ Simulate 10,000 paid spins</button>`;
    }else if(activeTab==='jackpot'){
      title.textContent='Jackpot Studio';const tiers=state.jackpot.tiers;
      root.innerHTML=`<div class="section-head">FIXED JACKPOT SYSTEM</div><label class="switchline">Enable demo jackpot <input type="checkbox" data-path="jackpot.enabled" ${state.jackpot.enabled?'checked':''}/></label><div class="warning-note">Default OFF. This is a fictional fixed-award lottery that uses an independent seeded stream. The game does NOT select winners by user, balance, operator intervention, or loss streak.</div><div class="section-head">JACKPOT CONFIGURATION</div><table class="table-like"><thead><tr><th>Tier</th><th>Award ×bet</th><th>Hits / 1M</th></tr></thead><tbody>${tiers.map((t,i)=>`<tr><td style="color:${esc(t.color)}">${esc(t.name)}</td><td><input type="number" min="0" max="${state.math.round_max_win_x}" data-path="jackpot.tiers.${i}.awardX" value="${t.awardX}"/></td><td><input type="number" min="0" max="1000000" step="1" data-path="jackpot.tiers.${i}.perMillion" value="${t.perMillion}"/></td></tr>`).join('')}</tbody></table>
      <div class="property-card" style="margin-top:14px"><strong>Expected jackpot add-on (uncapped)</strong><p style="font-size:24px;color:#ffe0a6;font-weight:900;margin:3px 0">${window.SkygateStudioMath.jackpotContributionPct(state.jackpot).toFixed(4)}%</p><p>Upper-bound component before overall max-win clipping. Not an observed RTP or the game’s total return.</p></div><div class="prop-row"><button class="prop-btn" id="testJackpotMini">Preview MINI FX</button><button class="prop-btn" id="testJackpotGrand">Preview GRAND FX</button></div><div class="inspector-note">FX Preview only, never awards credits. Real outcomes only use the published probability settings and engine seed.</div>`;
    }else{
      title.textContent='Spin Speed & Test Lab';
      const motionFields=[['normalMs','NORMAL',1200,3500],['quickMs','QUICK',750,2300],['turboMs','TURBO',420,1300]]
        .map(([key,label,min,max])=>`<div class="field spin-speed-field"><label class="field-label" for="spin-speed-${key}">${label} <strong data-motion-readout>${(state.spinMotion[key]/1000).toFixed(2)} s</strong></label><input id="spin-speed-${key}" type="range" data-path="spinMotion.${key}" min="${min}" max="${max}" step="50" value="${state.spinMotion[key]}"></div>`).join('');
      root.innerHTML=`<div class="section-head">SPIN SPEED · REEL MOTION</div><div class="property-card"><strong>Animation duration for each spin mode</strong><p>Slide to adjust the approximate time from first reel start through the last reel stop. Smaller numbers are faster. Results, bets and bonus odds never change.</p><div class="motion-sliders">${motionFields}</div><p class="inspector-note">Changes update your local draft. Choose Edit / Playtest to preview, then Preview & Publish to activate on the public game.</p></div><div class="section-head">RUN REPRODUCIBLE SAMPLE</div><div class="field-grid">${field('seed','Seed','number',{min:1,max:4294967295,step:1})}${field('bet','Virtual Bet','number',{min:1,max:1000000,step:1})}</div><div class="field"><label class="field-label">Paid Spins (sample)</label><select id="simCount"><option value="1000">1,000</option><option selected value="10000">10,000</option><option value="100000">100,000</option></select></div><div class="prop-row"><button class="sim-button" id="runSimBtn">▷ Run Simulation</button><button class="prop-btn alt" id="cancelSimBtn">Stop</button></div><div class="progress" aria-label="Simulation progress"><div id="simProgress"></div></div><div class="section-head">SAMPLE RESULTS</div><div id="simStats">${testStats?metricHTML(testStats):'<div class="inspector-note">No sample has been run under the current editable configuration.</div>'}</div><div class="section-head">PLAYABLE DEMO</div><div class="prop-row"><button class="prop-btn" id="testSingleSpin">↻ Spin Once</button><button class="prop-btn alt" id="resetCredits">Reset Credits</button></div><div class="property-card" style="margin-top:13px"><strong>Demo Session</strong><p>Credits: <b id="creditsRead">${fmt(window.SKYGATE_CANVAS?.session()?.credits??state.credit)}</b><br>Stake: <b>${fmt(window.SKYGATE_CANVAS?.session()?.bet??state.bet)}</b></p></div><div class="section-head">REPLAY / EXPORT</div><div class="prop-row"><button class="prop-btn" id="replayLast">↶ Replay last result</button><button class="prop-btn alt" id="exportRound">↓ Round JSON</button></div><div class="warning-note">Stats describe only this synthetic simulation profile. Neither the initial target RTP nor the old v0.2 historical RTP is certified or guaranteed after changing settings.</div>`;
    }
    if(activeTab==='layers'){
      const options=[...state.layers].sort((a,b)=>b.z-a.z).map(l=>`<option value="${esc(l.id)}" ${selected===l.id?'selected':''}>${esc(l.name)}${l.locked?' [locked]':''}</option>`).join('');
      root.insertAdjacentHTML('afterbegin',`<div class="mobile-layer-picker"><label class="field-label" for="mobileLayerSelect">SELECT A LAYER</label><select id="mobileLayerSelect">${options}</select></div>`);
    }
    if(activeTab==='assets'){
      root.insertAdjacentHTML('beforeend',`<div class="section-head">TAP ASSET TO INSERT</div><div class="mobile-asset-grid">${imageFiles.map(f=>`<button type="button" data-inspector-asset="${esc(f.path)}"><img src="${esc(assetURL(f.path))}" loading="lazy" alt=""><span>${esc(f.id.replaceAll('_',' '))}</span></button>`).join('')}</div>`);
    }
  }
  function metricHTML(data){return `<div class="metric-grid"><div class="metric"><small>OBSERVED RTP</small><b>${data.rtp.toFixed(2)}%</b></div><div class="metric"><small>HIT RATE</small><b>${data.hit.toFixed(2)}%</b></div><div class="metric"><small>PROFITABLE ROUNDS</small><b>${data.profitable.toFixed(2)}%</b></div><div class="metric"><small>BONUS RATE</small><b>${data.bonus.toFixed(3)}%</b></div><div class="metric"><small>HOUSE HOLD · SAMPLE</small><b>${(100-data.rtp).toFixed(2)}%</b></div><div class="metric"><small>JACKPOT HITS</small><b>${data.jackpots}</b></div></div><div class="inspector-note">${fmt(data.count)} paid rounds, seed ${data.seed}. Max round ${fmt(data.maxX)}× bet. These sample statistics are not a true long-run RTP certification.</div>`;}
  function render(){renderSidebar();drawCanvas();renderInspector();}
  function selectLayer(id){selected=id;activeTab='layers';$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));render();syncMobileDock();}
  async function loadOverrides(){
    try{
      const db=await openDB();if(!db)return;
      const tx=db.transaction('overrides','readonly');const store=tx.objectStore('overrides');const keys=await new Promise((yes,no)=>{let req=store.getAllKeys();req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error);});
      for(const key of keys){const blob=await new Promise((yes,no)=>{let req=store.get(key);req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error);});if(blob instanceof Blob)registerOverride(key,blob);}
      render();
    }catch(e){console.warn('IndexedDB unavailable',e.message);}
  }
  function openDB(){return new Promise((yes,no)=>{if(!('indexedDB'in window)){yes(null);return;}const req=indexedDB.open('skygate-studio-assetdb',1);req.onupgradeneeded=()=>req.result.createObjectStore('overrides');req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error);});}
  function registerOverride(key,blob){if(overrideURL.has(key))URL.revokeObjectURL(overrideURL.get(key));overrideURL.set(key,URL.createObjectURL(blob));overrideBlobs.set(key,blob);if(key.startsWith('audio:'))audioKit.clearCache();}
  async function storeOverride(key,blob){registerOverride(key,blob);try{const db=await openDB();if(db)await new Promise((yes,no)=>{const rq=db.transaction('overrides','readwrite').objectStore('overrides').put(blob,key);rq.onsuccess=yes;rq.onerror=()=>no(rq.error);});}catch(e){toast('File assigned for this session. Persistent storage unavailable.');}}
  async function clearOverride(key){const url=overrideURL.get(key);if(url)URL.revokeObjectURL(url);overrideURL.delete(key);overrideBlobs.delete(key);try{const db=await openDB();if(db)await new Promise((yes,no)=>{const rq=db.transaction('overrides','readwrite').objectStore('overrides').delete(key);rq.onsuccess=yes;rq.onerror=()=>no(rq.error);});}catch(e){}render();}
  function filePicker(accept,handler){const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=async()=>{const f=input.files[0];if(f)await handler(f);};input.click();}
  function replaceAsset(asset){filePicker('image/png,image/jpeg,image/webp,image/svg+xml',async f=>{
    if(f.size>12e6){toast('Image too large. Max 12MB.');return;}
    const layer=currentLayer();
    if(layer?.id==='logo'&&layer.asset===asset){
      // Upload a full, original Skygate 5000 lockup through the existing layer.
      // Keep all geometry/z-order unchanged and avoid adding a second logo layer.
      if(f.type!=='image/png'){toast('Skygate logo must be a transparent PNG.');return;}
      await storeOverride('asset:custom/skygate-5000-approved.png',f);
      remember();layer.asset='custom/skygate-5000-approved.png';delete layer.crop;
      saveLocal();render();toast('Logo updated in Draft. Preview & Publish to update the game.');
      return;
    }
    await storeOverride('asset:'+asset,f);render();toast('Asset replaced: '+asset);
  });}
  function replaceAudio(id){filePicker('audio/*,.mp3,.wav,.ogg,.m4a',async f=>{if(f.size>25e6){toast('Audio file >25 MB. Please optimize.');return;}await storeOverride('audio:'+id,f);renderInspector();toast('Custom track assigned: '+id);});}
  function addAsset(path){remember();const id='art_'+Date.now();const layer={id,name:path.split('/').at(-1).split('.')[0],kind:'image',asset:path,x:315,y:760,w:400,h:220,z:55,opacity:100,visible:true,locked:false,rotate:0};state.layers.push(layer);saveLocal();selectLayer(id);}
  function updateInput(el,commit){
    const path=el.dataset.path;if(!path)return;
    const before=getAt(path);let value;
    if(el.type==='checkbox')value=el.checked;
    else if(el.type==='number'||el.type==='range'||(el.tagName==='SELECT'&&path.startsWith('tracks.')))value=Number(el.value);
    else value=el.value;
    if(typeof value==='number'&&!Number.isFinite(value))return;
    if(!pendingEdit||pendingEdit.path!==path)pendingEdit={path,snapshot:deep(state)};
    setAt(path,value);
    if(path.startsWith('spinMotion.')){
      if(commit){
        try{validateSpinMotion(state.spinMotion);}catch(e){state=pendingEdit.snapshot;pendingEdit=null;toast('Invalid spin speed: '+e.message);render();return;}
        // Refresh the shared playable draft only once the slider is released.
        drawCanvas();
      }else{
        const readout=el.closest('.field')?.querySelector('[data-motion-readout]');
        if(readout)readout.textContent=(value/1000).toFixed(2)+' s';
      }
    }
    if(path.startsWith('math.')||path.startsWith('jackpot.')||path==='seed'){
      if(commit){
        try{window.SlotGameMath.validateConfig(state.math);window.SkygateStudioMath.validateJackpot(state.jackpot);}catch(e){state=pendingEdit.snapshot;pendingEdit=null;toast('Invalid configuration: '+e.message);render();return;}
      }
      invalidateEngine();
    }
    if(path.startsWith('layers.')||path==='bet'||path==='credit')drawCanvas();
    if(path.startsWith('tracks.')||path.startsWith('audio.'))updateAudioVolumes();
    if(commit){
      if(JSON.stringify(pendingEdit.snapshot)!==JSON.stringify(state)){undoHistory.push(pendingEdit.snapshot);if(undoHistory.length>35)undoHistory.shift();}
      pendingEdit=null;saveLocal();render();
    }
  }
  function setMode(m){window.SKYGATE_CANVAS?.draft(m);mode=m;$('#stage').classList.toggle('edit-mode',m==='edit');$('#editModeBtn').classList.toggle('selected',m==='edit');$('#previewModeBtn').classList.toggle('selected',m==='preview');$('#statusMode').textContent=m==='edit'?'Edit mode':'Playtest mode';drawCanvas();}
  function getEngine(){if(!engine)engine=window.SkygateStudioMath.createStudioEngine(state.math,state.jackpot,Number(state.seed));return engine;}
  function trace(msg){$('#traceStatus').textContent=msg;}
  const audioKit=new window.SkyAudioMixer({
    resolve:audioURL,
    track:id=>state.tracks.find(t=>t.id===id),
    settings:()=>state.audio,
    onStatus:status=>{const btn=$('#audioUnlockBtn');if(btn){btn.dataset.ready=String(status==='ready');btn.title=status==='ready'?'Audio ready':'Tap once to enable audio on iPhone';btn.querySelector('em').textContent=status==='ready'?'Sound ready':'Enable sound';}},
    onError:msg=>{console.warn(msg);toast(msg);}
  });
  function playAudio(id){if(!state.audio.muted)audioKit.play(id);}
  function stopAudio(id,fadeOut=true){audioKit.stop(id,fadeOut);}
  function stopAll(){audioKit.stopAll();}
  function updateAudioVolumes(){audioKit.updateMix();}
  let previewTimeout=0;
  function flash(message,tier=''){clearTimeout(previewTimeout);$('#stageOverlay').innerHTML=`<div class="stage-jackpot-flash">${esc(message)}</div>`;previewTimeout=setTimeout(()=>$('#stageOverlay').replaceChildren(),1800);}
  function demoSpin(replay=false){
    if(window.SKYGATE_CANVAS){window.SKYGATE_CANVAS.spin(replay);return;}
    if(busy)return;
    if(!replay&&state.credit<state.bet){toast('Not enough virtual credit. Reset to continue.');return;}
    busy=true;
    let result;
    try{result=replay?lastRound:getEngine().playRound({trace:true});}catch(e){busy=false;toast('Math error: '+e.message);return;}
    if(!result){busy=false;toast('No round to replay yet.');return;}
    if(!replay){remember();lastRound=result;state.credit=Math.max(0,state.credit-state.bet+result.winX*state.bet);saveLocal();}
    setMode('preview');previewVisualGrid=result.base.initial.map(x=>x.kind);
    drawCanvas();playAudio('spin_start');trace((replay?'Replay ':'Spin ')+result.paidIndex+': resolving '+result.totalTumbles+' tumble(s)…');
    const display=(id,text)=>{const l=lookupLayer(id);if(l)l.text=text;};
    setTimeout(()=>{
      if(result.totalTumbles>0){playAudio('tumble');$('#stage').classList.remove('stage-grid-jitter');void $('#stage').offsetWidth;$('#stage').classList.add('stage-grid-jitter');}
      previewVisualGrid=result.base.final.map(x=>x.kind);drawCanvas();
      const classWin=window.SkygateStudioMath.classifyWin(result.winX,state.winPresentation);
      const amount=(result.winX*state.bet).toFixed(2);
      const status=`${result.winX.toFixed(3)}× · ${fmt(result.totalTumbles)} tumbles · bonus ${result.bonus.triggered?'YES':'no'} · jackpot ${result.jackpot.hit?result.jackpot.tier:'none'}`;
      trace(status);
      const winLabel=$('#stageLayers [data-id="winlabel"]');const winAmount=$('#stageLayers [data-id="winamount"]');
      if(winLabel)layerText(winLabel,lookupLayer('winlabel'),result.jackpot.hit?'JACKPOT':result.winX>0?'TOTAL WIN':'NO WIN');
      if(winAmount)layerText(winAmount,lookupLayer('winamount'),amount);
      const credits=$('#stageLayers [data-id="credits"]');if(credits)layerText(credits,lookupLayer('credits'),fmt(state.credit));
      const bet=$('#stageLayers [data-id="betlabel"]');if(bet)layerText(bet,lookupLayer('betlabel'),fmt(state.bet));
      resizeText();
      if(result.jackpot.hit){flash(result.jackpot.tier.toUpperCase()+' JACKPOT');playAudio('jackpot');}
      else if(result.bonus.triggered){flash('FREE SPINS!');playAudio('bonus_intro');}
      else if(classWin==='mega'||classWin==='super'){flash(classWin.toUpperCase()+' WIN');playAudio('mega_win');}
      else if(classWin==='big'){playAudio('big_win');}
      else if(result.winX>0)playAudio('symbol_win');
      if(result.base.appliedMultiplierX>1)playAudio('multiplier');
      busy=false;renderInspector();
    },550);
  }
  function previewJackpot(id){const t=state.jackpot.tiers.find(t=>t.id===id);if(!t)return;setMode('preview');flash(t.name+' JACKPOT · FX ONLY');playAudio('jackpot');trace('FX preview only. No spin, no credit adjustment.');}
  function resetCredits(){if(window.SKYGATE_CANVAS){window.SKYGATE_CANVAS.reset();return;}remember();state.credit=100000;lastRound=null;previewVisualGrid=null;invalidateEngine();drawCanvas();renderInspector();saveLocal();toast('Virtual demo credits restored.');}
  function readSimCount(){const el=$('#simCount');return Number(el?.value)||10000;}
  async function runSimulation(count=10000){
    if(busy){toast('Finish current demo spin first.');return;}
    simCancelled=false;
    let sim;
    try{sim=window.SkygateStudioMath.createStudioEngine(deep(state.math),deep(state.jackpot),Number(state.seed));}catch(e){toast('Invalid math model: '+e.message);return;}
    const seed=state.seed;testStats=null;
    const button=$('#runSimBtn');if(button)button.disabled=true;
    let played=0,hits=0,profitable=0,bonus=0,jackpots=0,awarded=0,maxX=0;
    const progress=$('#simProgress');
    const tick=()=>{
      if(simCancelled){if(button)button.disabled=false;trace('Simulation cancelled.');return;}
      try{
        const chunk=Math.min(350,count-played);
        for(let i=0;i<chunk;i++){
          const r=sim.playRound();played++;awarded+=r.winX;
          if(r.winX>0)hits++;if(r.winX>1)profitable++;if(r.bonus.triggered)bonus++;if(r.jackpot.hit)jackpots++;maxX=Math.max(maxX,r.winX);
        }
      }catch(e){toast('Simulation error: '+e.message);if(button)button.disabled=false;return;}
      if(progress)progress.style.width=(played/count*100).toFixed(1)+'%';
      if(played<count){setTimeout(tick,0);return;}
      testStats={count:played,seed,rtp:100*awarded/played,hit:100*hits/played,profitable:100*profitable/played,bonus:100*bonus/played,jackpots,maxX};
      if(button)button.disabled=false;
      $('#simStats')?.replaceChildren();if($('#simStats'))$('#simStats').innerHTML=metricHTML(testStats);
      trace(`Simulation complete: ${fmt(played)} spins, observed RTP ${testStats.rtp.toFixed(3)}%.`);
      toast('Simulation complete. Sample statistics updated.');
    };
    setTimeout(tick,0);
  }
  function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function exportProject(){download('SKYGATE_Studio_Project_v0.4.json',new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));toast('Exported editable project settings (JSON).');}
  function exportRound(){if(window.SKYGATE_CANVAS){window.SKYGATE_CANVAS.exportRound();return;}if(!lastRound){toast('Spin once to generate a trace.');return;}download('SKYGATE_Round_Trace.json',new Blob([JSON.stringify(lastRound,null,2)],{type:'application/json'}));toast('Round trace exported.');}
  function crc32(arr){let c=0xffffffff;for(let i=0;i<arr.length;i++){c^=arr[i];for(let j=0;j<8;j++)c=c>>>1^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  const textEnc=new TextEncoder();
  async function storedZip(entries){
    let parts=[],central=[],offset=0;
    for(const ent of entries){
      const bytes=ent.blob instanceof Uint8Array?ent.blob:new Uint8Array(await ent.blob.arrayBuffer()),name=textEnc.encode(ent.name),crc=crc32(bytes);
      const l=new Uint8Array(30+name.length),dv=new DataView(l.buffer);dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(6,0x0800,true);dv.setUint32(14,crc,true);dv.setUint32(18,bytes.length,true);dv.setUint32(22,bytes.length,true);dv.setUint16(26,name.length,true);l.set(name,30);parts.push(l,bytes);
      const c=new Uint8Array(46+name.length),cd=new DataView(c.buffer);cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint16(8,0x0800,true);cd.setUint32(16,crc,true);cd.setUint32(20,bytes.length,true);cd.setUint32(24,bytes.length,true);cd.setUint16(28,name.length,true);cd.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=l.length+bytes.length;
    }
    const centralSize=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),dv=new DataView(end.buffer);dv.setUint32(0,0x06054b50,true);dv.setUint16(8,entries.length,true);dv.setUint16(10,entries.length,true);dv.setUint32(12,centralSize,true);dv.setUint32(16,offset,true);
    return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  async function exportChangesZip(){
    const inventory={schema:'skygate/studio-overrides-v0.4',note:'Copy these override files into the complete downloaded project. JSON data is included separately.',files:{}};
    const entries=[{name:'project.json',blob:new Blob([JSON.stringify(state,null,2)])}];
    for(const [key,blob] of overrideBlobs){const filename=key.replace(':','/').replaceAll('..','_').replaceAll('/','_')+(blob.type.includes('mpeg')?'.mp3':blob.type.includes('svg')?'.svg':blob.type.includes('png')?'.png':blob.type.includes('ogg')?'.ogg':blob.type.includes('wav')?'.wav':'.bin');const name='overrides/'+filename;entries.push({name,blob});inventory.files[key]=name;}
    entries.push({name:'override-manifest.json',blob:new Blob([JSON.stringify(inventory,null,2)])});
    download('SKYGATE_Studio_Changes_v0.4.zip',await storedZip(entries));toast('Saved changes ZIP with project settings and all custom uploads.');
  }
  function parseStoredZip(bytes){
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),txt=new TextDecoder(),entries=new Map();
    let pos=0,bytesSeen=0;
    while(pos+4<=bytes.length&&dv.getUint32(pos,true)===0x04034b50){
      if(entries.size>=100)throw Error('ZIP entry limit exceeded');
      if(pos+30>bytes.length)throw Error('Truncated ZIP header');
      const flags=dv.getUint16(pos+6,true),method=dv.getUint16(pos+8,true),crc=dv.getUint32(pos+14,true),compressed=dv.getUint32(pos+18,true),raw=dv.getUint32(pos+22,true),nameLen=dv.getUint16(pos+26,true),extraLen=dv.getUint16(pos+28,true);
      if((flags&0x08)||method!==0||compressed!==raw)throw Error('This editor imports the uncompressed ZIP format exported by Skygate Studio');
      const begin=pos+30+nameLen+extraLen,end=begin+compressed;
      if(end>bytes.length)throw Error('Truncated ZIP entry');
      const name=txt.decode(bytes.slice(pos+30,pos+30+nameLen));
      if(name.includes('..')||name.startsWith('/')||name.includes('\\')||entries.has(name))throw Error('Unsafe ZIP entry');
      const content=bytes.slice(begin,end);if(crc32(content)!==crc)throw Error('ZIP checksum mismatch');
      bytesSeen+=content.length;if(bytesSeen>60e6)throw Error('ZIP content exceeds limit');
      entries.set(name,content);pos=end;
    }
    return entries;
  }
  async function importChangesZip(file){
    if(file.size>60e6)throw Error('ZIP too large (60MB limit)');
    const zip=parseStoredZip(new Uint8Array(await file.arrayBuffer()));
    if(!zip.has('project.json')||!zip.has('override-manifest.json'))throw Error('Missing project.json / override-manifest.json');
    const decoder=new TextDecoder();
    const imported=validateLoaded(JSON.parse(decoder.decode(zip.get('project.json'))));
    const manifest=JSON.parse(decoder.decode(zip.get('override-manifest.json')));
    if(!manifest.files||typeof manifest.files!=='object')throw Error('Invalid override manifest');
    const changes=[];
    for(const [key,name] of Object.entries(manifest.files)){
      if(!/^(asset|audio):[a-zA-Z0-9_./-]+$/.test(key)||typeof name!=='string'||!name.startsWith('overrides/')||!zip.has(name))throw Error('Invalid override entry: '+key);
      const raw=zip.get(name),type=name.endsWith('.mp3')?'audio/mpeg':name.endsWith('.ogg')?'audio/ogg':name.endsWith('.wav')?'audio/wav':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.jpg')?'image/jpeg':'application/octet-stream';
      const max=key.startsWith('audio:')?25e6:12e6;if(raw.length>max)throw Error('Override too large: '+key);
      changes.push({key,blob:new Blob([raw],{type})});
    }
    remember();state=imported;invalidateEngine();lastRound=null;previewVisualGrid=null;
    for(const key of [...overrideBlobs.keys()])await clearOverride(key);
    for(const item of changes)await storeOverride(item.key,item.blob);
    saveLocal();render();toast('Full project + '+changes.length+' custom assets restored.');
  }
  function doUndo(){if(!undoHistory.length){toast('No changes to undo.');return;}const snapshot=undoHistory.pop();state=snapshot;lastRound=null;previewVisualGrid=null;invalidateEngine();saveLocal();render();toast('Last change undone.');}
  function attach(){
    $('#mobileDock').addEventListener('click',e=>{const btn=e.target.closest('[data-mobile-tab]');if(!btn)return;const t=btn.dataset.mobileTab;if(t==='canvas'){setMobilePanel(false);return;}selectTab(t);setMobilePanel(true);});
    $('#mobileClosePanel').onclick=()=>setMobilePanel(false);
    $('#mobileSheetBackdrop').onclick=()=>setMobilePanel(false);
    $('#audioUnlockBtn').onclick=()=>audioKit.unlock();
    $('#mobileBackupBtn').onclick=exportChangesZip;
    // Re-unlock on a fresh touch if iOS has suspended AudioContext after an
    // app switch. Do not restart music automatically or call on every tap.
    document.addEventListener('pointerdown',()=>{
      if(!audioKit.isReady())void audioKit.unlock();
    },{capture:true});
    window.addEventListener('pagehide',()=>stopAll());
    $('#mainNav').addEventListener('click',e=>{const el=e.target.closest('[data-tab]');if(el)selectTab(el.dataset.tab);});
    $('#sideContent').addEventListener('click',e=>{
      const lock=e.target.closest('[data-lock]');if(lock){const l=lookupLayer(lock.dataset.lock);remember();l.locked=!l.locked;saveLocal();render();return;}
      const eye=e.target.closest('[data-eye]');if(eye){const l=lookupLayer(eye.dataset.eye);remember();l.visible=!l.visible;saveLocal();render();return;}
      const layer=e.target.closest('[data-layer-row]');if(layer){selectLayer(layer.dataset.layerRow);return;}
      const art=e.target.closest('[data-asset]');if(art){const path=art.dataset.asset;const target=currentLayer();if(target&&target.kind==='image'){remember();target.asset=path;saveLocal();render();toast('Changed selected layer to '+path);}else addAsset(path);return;}
    });
    $('#inspectorContent').addEventListener('input',e=>{
      if(e.target.dataset.path)updateInput(e.target,false);
    });
    $('#inspectorContent').addEventListener('change',e=>{
      if(e.target.id==='mobileLayerSelect'){selectLayer(e.target.value);return;}
      if(e.target.dataset.path)updateInput(e.target,true);
    });
    $('#inspectorContent').addEventListener('click',async e=>{
      const t=e.target;
      if(t.id==='mobileLayerSelect')return;
      if(t.closest('[data-inspector-asset]')){const path=t.closest('[data-inspector-asset]').dataset.inspectorAsset;addAsset(path);setMobilePanel(false);return;}
      if(t.closest('[data-asset-replace]'))replaceAsset(t.closest('[data-asset-replace]').dataset.assetReplace);
      else if(t.closest('[data-asset-reset]'))clearOverride('asset:'+t.closest('[data-asset-reset]').dataset.assetReset);
      else if(t.closest('[data-audio-wave]')){const id=t.closest('[data-audio-wave]').dataset.audioWave;const r=t.closest('[data-audio-wave]').getBoundingClientRect();if(!audioKit.seek(id,(e.clientX-r.left)/r.width))playAudio(id);}
      else if(t.closest('[data-audio-play]'))playAudio(t.closest('[data-audio-play]').dataset.audioPlay);
      else if(t.closest('[data-audio-stop]'))stopAudio(t.closest('[data-audio-stop]').dataset.audioStop);
      else if(t.closest('[data-audio-upload]'))replaceAudio(t.closest('[data-audio-upload]').dataset.audioUpload);
      else if(t.closest('[data-audio-reset]'))clearOverride('audio:'+t.closest('[data-audio-reset]').dataset.audioReset);
      else if(t.id==='audioUnlockPanelBtn')audioKit.unlock();
      else if(t.id==='stopAllAudio')stopAll();
      else if(t.id==='uploadAnyBtn')filePicker('image/*,.svg',async f=>{const safe=f.name.replace(/[^a-zA-Z0-9_.-]/g,'_');const name='custom/'+Date.now()+'_'+safe;await storeOverride('asset:'+name,f);addAsset(name);});
      else if(t.id==='addAssetBtn')addAsset('symbols/ruby.png');
      else if(t.id==='openAssetContact')window.open(window.SKY_EMBEDDED_ASSETS?.['asset_contact_sheet.jpg']||'assets/asset_contact_sheet.jpg','_blank');
      else if(t.closest('[data-duplicate]')){const l=lookupLayer(t.closest('[data-duplicate]').dataset.duplicate);if(l){remember();const d=deep(l);d.id='copy_'+Date.now();d.name+=' Copy';d.x+=25;d.y+=25;d.z+=1;state.layers.push(d);saveLocal();selectLayer(d.id);}}
      else if(t.closest('[data-delete]')){const id=t.closest('[data-delete]').dataset.delete;if(id==='sky'){toast('Background cannot be deleted. Hide it instead.');return;}remember();state.layers=state.layers.filter(l=>l.id!==id);selected='';saveLocal();render();}
      else if(t.id==='testJackpotMini')previewJackpot('mini');else if(t.id==='testJackpotGrand')previewJackpot('grand');
      else if(t.id==='quickTestBtn'){selectTab('test');runSimulation(10000);}
      else if(t.id==='testSingleSpin')demoSpin();
      else if(t.id==='runSimBtn')runSimulation(readSimCount());
      else if(t.id==='cancelSimBtn'){simCancelled=true;toast('Requested simulation stop.');}
      else if(t.id==='resetCredits')resetCredits();
      else if(t.id==='replayLast')demoSpin(true);
      else if(t.id==='exportRound')exportRound();
    });
    // Drag-and-drop source coordinates, stable across screen sizes.
    let dragging=null;
    $('#stageLayers').addEventListener('pointerdown',e=>{
      const el=e.target.closest('[data-id]');if(!el)return;
      if(mode==='preview'){if(el.dataset.id==='spinbutton')demoSpin();return;}
      const l=lookupLayer(el.dataset.id);if(!l){return;}
      if(selected!==l.id){selected=l.id;renderSidebar();renderInspector();$$('#stageLayers .stage-layer').forEach(x=>x.classList.toggle('selected',x.dataset.id===l.id));}
      if(l.locked)return;
      e.preventDefault();dragging={id:l.id,startX:e.clientX,startY:e.clientY,x:l.x,y:l.y,moved:false};$('#stageLayers').setPointerCapture(e.pointerId);
    });
    $('#stageLayers').addEventListener('pointermove',e=>{
      if(!dragging)return;const l=lookupLayer(dragging.id);if(!l)return;const bounds=$('#stage').getBoundingClientRect();
      const x=dragging.x+(e.clientX-dragging.startX)*1080/bounds.width;const y=dragging.y+(e.clientY-dragging.startY)*1920/bounds.height;
      l.x=Math.round(Math.max(-l.w*.9,Math.min(1080-l.w*.1,x)));l.y=Math.round(Math.max(-l.h*.9,Math.min(1920-l.h*.1,y)));
      dragging.moved=true;const el=$('#stageLayers [data-id="'+l.id+'"]');if(el)positionLayer(el,l);window.SKYGATE_CANVAS?.move(l);
    });
    $('#stageLayers').addEventListener('pointerup',()=>{if(!dragging)return;if(dragging.moved){const l=lookupLayer(dragging.id);const newX=l.x,newY=l.y;l.x=dragging.x;l.y=dragging.y;remember();l.x=newX;l.y=newY;saveLocal();renderInspector();drawCanvas();}dragging=null;});
    $('#stageLayers').addEventListener('pointercancel',()=>{dragging=null;});
    $('#stage').addEventListener('click',e=>{if(mode==='preview'&&e.target.closest('[data-id="spinbutton"]'))demoSpin();});
    $('#editModeBtn').onclick=()=>setMode('edit');$('#previewModeBtn').onclick=()=>setMode('preview');
    $('#showRefBtn').onclick=()=>{const el=$('#referenceOverlay');el.hidden=!el.hidden;$('#showRefBtn').classList.toggle('selected',!el.hidden);};
    $('#guidesBtn').onclick=()=>{const el=$('#stageGuides');el.hidden=!el.hidden;$('#guidesBtn').classList.toggle('selected',!el.hidden);};
    $('#resetSelectionBtn').onclick=()=>{selected='';drawCanvas();renderSidebar();renderInspector();};
    $('#demoSpinBtn').onclick=()=>demoSpin();$('#saveBtn').onclick=()=>saveLocal(true);$('#undoBtn').onclick=doUndo;
    $('#exportBtn').onclick=exportProject;$('#bundleBtn').onclick=exportChangesZip;
    $('#importBtn').onclick=()=>$('#importInput').click();
    $('#importInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(/\.zip$/i.test(f.name)){await importChangesZip(f);}else{const data=validateLoaded(JSON.parse(await f.text()));remember();state=data;invalidateEngine();lastRound=null;previewVisualGrid=null;saveLocal();render();toast('Imported JSON settings; custom files require ZIP backup.');}}catch(err){toast('Could not import project: '+err.message);}e.target.value='';};
    window.addEventListener('resize',resizeText);
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveLocal(true);}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();doUndo();}});
  }
  async function restoreRelease(project, overrides){
    const next=validateLoaded({...deep(DEFAULT),...project,tracks:project.tracks.map(t=>({...DEFAULT.tracks.find(d=>d.id===t.id),...t}))});
    remember();state=next;invalidateEngine();lastRound=null;previewVisualGrid=null;
    for(const key of [...overrideBlobs.keys()])await clearOverride(key);
    for(const [key,blob] of overrides)await storeOverride(key,blob);
    saveLocal();render();toast('Snapshot loaded into this browser.');
  }
  restoreLocal();attach();render();const overridesReady=loadOverrides();
  window.SKYGATE_STUDIO={version:'0.13.1',ready:overridesReady,refreshSession:renderInspector,setMode,getPreviewData:()=>({project:deep(state),assets:Object.fromEntries([...new Set([...state.layers.filter(l=>l.asset).map(l=>l.asset),...symbolNames.map(n=>'symbols/'+n+'.png')])].map(p=>['assets/'+p,new URL(assetURL(p),location.href).href]).concat(state.tracks.map(t=>['assets/audio/'+t.id+'.mp3',new URL(audioURL(t.id),location.href).href])))}),hasLocalDraft:()=>!!localStorage.getItem(storageKey),getPublishBundle:async()=>{await overridesReady;return {project:deep(state),overrides:[...overrideBlobs]};},restoreRelease,getState:()=>deep(state),getSelected:()=>selected,getOverrideKeys:()=>[...overrideBlobs.keys()],runSimulation,demoSpin,saveLocal,exportProject,exportChangesZip,importChangesZip,playAudio,stopAll,selectTab,audioReady:()=>audioKit.isReady(),audioPlaying:id=>audioKit.isPlaying(id),openMobilePanel:setMobilePanel};
})();
