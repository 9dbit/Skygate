import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateProject} from '../../release-store.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const preset=()=>JSON.parse(read('studio/themes/olympus-gold/project.json'));
const keys=p=>[...new Set(p.layers.filter(l=>l.asset).map(l=>'asset:'+l.asset))];

test('Olympus import retains bounded image crops, theme and independently skinned controls',()=>{
  const p=preset(),clean=validateProject(p,keys(p));
  assert.equal(clean.presentation,'olympus-gold');
  for(const id of ['autobtn','turbobtn','menubtn','soundbtn','infobtn','minusbtn','plusbtn']){
    const l=clean.layers.find(l=>l.id===id);assert.equal(l.asset,'custom/round_button.png');assert(l.crop.w>0);
  }
  const original=p.layers.find(l=>l.id==='logo');
  original.crop.x=.99;original.crop.w=.5;
  assert.throws(()=>validateProject(p,keys(p)),/Crop must stay/);
  const bad=preset();bad.layers.find(l=>l.id==='autobtn').asset='../../secret.png';
  assert.throws(()=>validateProject(bad,keys(bad)),/unsupported image/);
  const missing=preset();missing.layers.find(l=>l.id==='plusbtn').w=50;
  assert.throws(()=>validateProject(missing,keys(missing)),/Keep plusbtn usable/);
});

// Minimal DOM model exercises the real live binding function without a browser,
// so moving captions out of a button cannot silently break its state updates.
function dom(){
  class Node {
    constructor(tag='div'){this.tagName=tag;this.style={};this.dataset={};this.children=[];this.className='';this.classList={add:(...xs)=>{this.className+=' '+xs.join(' ');}};}
    append(...nodes){for(const n of nodes){if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=this;this.children.push(n);}}
    setAttribute(k,v){this[k]=v;}
    get firstChild(){return this.children[0];}
    prepend(n){this.append(n);this.children.unshift(this.children.pop());}
    before(n){this.parent.append(n);}
    querySelector(tag){return this.children.find(n=>n.tagName===tag);}
    querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]);}
  }
  const root=new Node(),game=new Node(),menu=new Node();root.append(game,menu);
  const nodes=new Map([...read('play/index.html').matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)].map(m=>[m[2],new Node(m[1])]));
  for(const n of nodes.values())root.append(n);
  nodes.get('spin').append(new Node('img'));
  const rotor=new Node('span');rotor.append(new Node('img'));nodes.get('spin').append(rotor);
  for(const id of ['auto','turbo','menu','sound','help','minus','plus'])nodes.get(id).append(new Node('svg'));
  nodes.get('auto').append(nodes.get('autoStatus'));nodes.get('turbo').append(nodes.get('turboStatus'));
  // Match the browser: getElementById cannot find nodes in a detached scene.
  const connected=node=>{for(let n=node;n;n=n.parent)if(n===root)return true;return false;};
  const document={getElementById:id=>connected(nodes.get(id))?nodes.get(id):null,createElement:tag=>new Node(tag),querySelector:s=>s==='.game'?game:menu};
  const window={SKY_PREVIEW_ASSETS:{},SkygateTextFit:{request(){}},addEventListener(){}};
  vm.runInNewContext(read('play/release.js'),{window,document});
  return {window,game,nodes};
}

test('live layout keeps bet controls on canvas and moves Auto caption into its editable layer',()=>{
  const d=dom(),p=preset();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  assert.match(d.game.className,/olympus-gold/);
  const spinImages=d.nodes.get('spin').querySelectorAll('img');assert.equal(spinImages.length,2);assert(spinImages.every(img=>img.src==='assets/'+p.layers.find(l=>l.id==='spinbutton').asset));assert.deepEqual(spinImages[0].style,spinImages[1].style);
  assert.equal(d.nodes.get('plus').parent.dataset.layer,'plusbtn');
  assert.equal(d.nodes.get('minus').parent.dataset.layer,'minusbtn');
  assert.equal(d.nodes.get('autoStatus').parent.parent.dataset.layer,'autolabel');
  assert.equal(d.nodes.get('turboStatus').parent.parent.dataset.layer,'turbolabel');
  assert.equal(d.nodes.get('auto').children.filter(n=>n.className==='control-skin').length,1);
  assert.match(d.nodes.get('auto').className,/skinned-control/);
  assert.match(d.nodes.get('auto').querySelector('svg').innerHTML,/currentColor/);
  const scene=d.game.children.at(-1),logo=scene.children.find(n=>n.dataset.layer==='logo');
  assert.equal(logo.children[0].children[0].style.objectFit,'fill');
  assert.equal(logo.children[1].textContent,'5000');
  assert.equal(logo.children[1].className,'brand-number');
  assert.equal(d.nodes.get('anteFeature').children[0].className,'feature-skin');
});

test('legacy Studio projects still put unsupported bet controls in the menu',()=>{
  const d=dom(),p=JSON.parse(read('studio/project.json'));
  d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  assert.equal(d.nodes.get('plus').parent.className,'published-bet-controls');
  assert.equal(d.nodes.get('minus').parent,d.nodes.get('plus').parent);
  assert.equal(d.nodes.get('autoStatus').parent,d.nodes.get('auto'));
});

test('amount-only releases retain new Buy and Ante controls without obsolete labels',()=>{
  const p=preset(),clean=validateProject(p,keys(p));
  assert(!clean.layers.some(l=>['winlabel','virtual_note','buytext'].includes(l.id)));
  const d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  assert(!scene.children.some(l=>['winlabel','virtual_note','buytext'].includes(l.dataset.layer)));
  assert(!d.nodes.has('freeInfo'));assert(!d.nodes.has('banner'));
  const broken=preset();broken.layers=broken.layers.filter(l=>l.id!=='winamount');
  assert.throws(()=>validateProject(broken,keys(broken)),/Keep winamount visible/);
});

test('game splash and dialog artwork fall back to shipped assets without a live snapshot',()=>{
  const image={style:{}},properties={};
  const document={
    querySelectorAll:()=>[{querySelector:()=>image}],
    documentElement:{style:{setProperty:(key,value)=>{properties[key]=value;}}}
  };
  const window={SKY_PREVIEW_ASSETS:{}};
  vm.runInNewContext(read('play/release.js'),{window,document});
  window.SkygateSyncChrome(null,path=>'assets/'+path);
  assert.equal(image.src,'assets/scene/logo.png');
  assert.ok(properties['--sg-action-image'].includes('assets/ui/confirmation-panel-v1.png'));
  const live=preset();
  window.SkygateSyncChrome(live,path=>'assets/'+path);
  assert.equal(image.src,'assets/'+live.layers.find(l=>l.id==='logo').asset);
  assert.ok(properties['--sg-action-image'].includes('assets/custom/feature_panel.png'));
});

test('approved logo overrides the original snapshot without changing saved art coordinates',()=>{
  const p=preset(),logo=p.layers.find(l=>l.id==='logo');
  logo.asset='custom/skygate-5000-approved.png';
  delete logo.crop;
  const originalAsset=logo.asset,position=[logo.x,logo.y,logo.w,logo.h];
  const d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1),rendered=scene.children.find(n=>n.dataset.layer==='logo');
  assert.equal(rendered.children.length,1);
  assert.equal(rendered.children[0].src,'assets/custom/skygate-5000-approved.png');
  assert.equal(rendered.children[0].alt,'Skygate 5000');
  assert.equal(rendered.children[0].style.objectFit,'contain');
  assert.equal(rendered.children[0].style.position,'static');
  assert.match(rendered.className,/brand-complete/);
  assert.equal(logo.asset,originalAsset);
  assert.deepEqual([logo.x,logo.y,logo.w,logo.h],position);
});
test('approved logo on splash does not render a second 5000',()=>{
  const brand={classList:{add(){}},nodes:{
    img:{style:{}},'.brand-top':{style:{}},'.brand-number':{hidden:false}
  },querySelector(query){return this.nodes[query]||null;}};
  const document={querySelectorAll:()=>[brand],documentElement:{style:{setProperty(){}}}};
  const window={SKY_PREVIEW_ASSETS:{}};
  vm.runInNewContext(read('play/release.js'),{window,document});
  const project=preset();
  project.layers.find(l=>l.id==='logo').asset='custom/skygate-5000-approved.png';
  window.SkygateSyncChrome(project,path=>'assets/'+path);
  assert.equal(brand.nodes['.brand-number'].hidden,true);
  assert.equal(brand.nodes.img.src,'assets/custom/skygate-5000-approved.png');
  assert.equal(brand.nodes.img.style.objectFit,'contain');
  assert.equal(brand.nodes['.brand-top'].style.inset,'0');
});

test('Studio replaces logo through its existing PNG picker without creating a second logo layer',()=>{
  const script=read('studio/studio.js');
  assert.match(script,/layer\?\.id==='logo'&&layer\.asset===asset/);
  assert.match(script,/saveImageUpload\('asset:custom\/skygate-5000-approved\.png',f\)/);
  assert.match(script,/delete layer\.crop/);
  assert.match(script,/saveLocal\(\);render\(\)/);
});


test('Zeus lightning is behind the guardian and follows edited position without changing approved logo or 50% background',()=>{
  const p=preset(),guardian=p.layers.find(l=>l.id==='guardian'),logo=p.layers.find(l=>l.id==='logo');
  const sky=p.layers.find(l=>l.id==='sky');sky.opacity=50;
  logo.asset='custom/skygate-5000-approved.png';delete logo.crop;
  Object.assign(guardian,{x:444,y:66,w:590,h:430,rotate:5});
  const before=JSON.stringify(p),d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  const fx=scene.children.find(l=>l.dataset.fx==='guardian-lightning');
  const zeus=scene.children.find(l=>l.dataset.layer==='guardian');
  const bg=scene.children.find(l=>l.dataset.layer==='sky');
  const brand=scene.children.find(l=>l.dataset.layer==='logo');
  assert.ok(fx,'Lightning is a separate DOM visual layer');
  assert.equal(fx.className,'zeus-lightning-fx');
  assert.equal(fx['aria-hidden'],'true');
  assert.ok(scene.children.indexOf(fx)<scene.children.indexOf(zeus));
  assert.ok(Number(fx.style.zIndex)<Number(zeus.style.zIndex));
  for(const key of ['left','top','width','height','transform']) assert.equal(fx.style[key],zeus.style[key]);
  assert.match(fx.innerHTML,/<svg/);
  assert.equal(bg.style.opacity,.5);
  assert.equal(brand.children[0].src,'assets/custom/skygate-5000-approved.png');
  assert.equal(JSON.stringify(p),before,'Do not modify Studio state or published artwork');
});
test('Hidden or transparent guardian does not leave an orphan effect',()=>{
  for(const value of [{visible:false},{opacity:0}]){
    const p=preset();Object.assign(p.layers.find(l=>l.id==='guardian'),value);
    const d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
    assert.equal(d.game.children.at(-1).children.filter(n=>n.dataset.fx==='guardian-lightning').length,0);
  }
});
test('Zeus electricity respects reduced motion and battery saver',()=>{
  const css=read('play/game.css');
  assert.match(css,/prefers-reduced-motion:reduce[\s\S]*?zeus-lightning-fx\{display:none!important\}/);
  assert.match(css,/:has\(#spin\.battery-saver\) \.zeus-lightning-fx\{display:none\}/);
});

test('wallet CREDIT and BET get separate static shells without mutating the Studio layout',()=>{
  const p=preset(),original=JSON.stringify(p),d=dom();
  d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  const left=scene.children.find(n=>n.dataset.fx==='wallet-credit');
  const right=scene.children.find(n=>n.dataset.fx==='wallet-bet');
  const backing=scene.children.find(n=>n.dataset.layer==='controlboard');
  assert(left&&right,'both panels appear in the Game and Studio shared renderer');
  assert.equal(backing.style.visibility,'hidden');
  assert(Number(left.style.left.slice(0,-1))<Number(right.style.left.slice(0,-1)));
  assert(Number(left.style.zIndex)<Number(d.nodes.get('credits').parent.parent.style.zIndex));
  assert(Number(right.style.zIndex)<Number(d.nodes.get('minus').parent.style.zIndex));
  assert.equal(d.nodes.get('minus').parent.dataset.layer,'minusbtn');
  assert.equal(d.nodes.get('plus').parent.dataset.layer,'plusbtn');
  assert.equal(JSON.stringify(p),original,'original immutable Live snapshot is untouched');
});
test('split panel artwork remains available when a Studio layer is hidden',()=>{
  const p=preset();p.layers.find(l=>l.id==='plusbtn').visible=false;
  const d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  assert.equal(scene.children.filter(n=>n.dataset.fx?.startsWith('wallet-')).length,0);
  assert.notEqual(scene.children.find(n=>n.dataset.layer==='controlboard').style.visibility,'hidden');
});
test('Zeus thunder cloud remains behind the edited guardian, with battery and motion fallbacks',()=>{
  const d=dom();d.window.SkygateApplyLayout(preset(),path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  const zeus=scene.children.find(n=>n.dataset.layer==='guardian');
  const fx=scene.children.find(n=>n.dataset.fx==='guardian-lightning');
  for(const item of ['zeus-cloud-back','zeus-cloud-front','zeus-cloud-flash'])
    assert(fx.innerHTML.includes(item),item);
  assert(Number(fx.style.zIndex)<Number(zeus.style.zIndex));
  const css=read('play/game.css');
  assert(css.includes('@keyframes zeus-cloud-drift'));
  assert(css.includes('@keyframes zeus-cloud-flash'));
  assert(css.includes('.game:has(#spin.battery-saver) .zeus-lightning-fx{display:none}'));
  assert(css.includes('@media(prefers-reduced-motion:reduce){.zeus-lightning-fx{display:none!important}}'));
});
test('only the inner spinner rotates at idle; frame is static and battery saver disables motion',()=>{
  const css=read('play/game.css');
  assert(css.includes('.spin:not(.busy):not(.battery-saver) .spin-rotor{'));
  assert(css.includes('animation:skygate-rotor-idle 17s linear infinite'));
  assert(css.includes('.spin.busy:not(.battery-saver) .spin-rotor{'));
  assert(css.includes('.spin.battery-saver .spin-rotor{'));
  assert(css.includes('.published-layer[data-layer="spinbutton"] #spin .spin-frame{display:none}'));
  assert(!css.includes('.spin:not(.busy) .spin-frame{animation:'),'the outer frame must not spin');
});

test('approved reference panel skins match BUY SPIN width, x positions and source crop',()=>{
  const p=preset(),before=JSON.stringify(p),d=dom();
  d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  const credit=scene.children.find(n=>n.dataset.fx==='wallet-credit');
  const bet=scene.children.find(n=>n.dataset.fx==='wallet-bet');
  const buy=p.layers.find(l=>l.id==='buybtn'),booster=p.layers.find(l=>l.id==='antebtn');
  const board=p.layers.find(l=>l.id==='controlboard');
  assert(credit&&bet);
  assert.equal(credit.style.left,buy.x/1080*100+'%');
  assert.equal(bet.style.left,booster.x/1080*100+'%');
  assert.equal(credit.style.top,board.y/1920*100+'%');
  assert.equal(bet.style.top,credit.style.top);
  assert.equal(credit.style.width,buy.w/1080*100+'%');
  assert.equal(bet.style.width,booster.w/1080*100+'%');
  assert.equal(credit.style.width,bet.style.width,'equal panel widths');
  for(const panel of [credit,bet]){
    assert.equal(panel.children.length,2,'feature frame and decorative emblem');
    assert.equal(panel.children[0].className,'feature-skin wallet-skin');
    assert.equal(panel.children[0].src,'assets/'+buy.asset);
    assert.equal(panel.children[0].style.objectFit,'fill');
    assert.equal(panel.children[0].style.width,100/buy.crop.w+'%');
    assert.equal(panel.children[0].style.height,100/buy.crop.h+'%');
  }
  assert.equal(JSON.stringify(p),before,'do not edit old published project');
});
test('symmetry falls back safely when feature panel geometry cannot fit controls',()=>{
  const p=preset();p.layers.find(l=>l.id==='antebtn').w=230;
  const d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  assert.equal(scene.children.filter(n=>n.dataset.fx?.startsWith('wallet-')).length,0);
  assert.notEqual(scene.children.find(n=>n.dataset.layer==='controlboard').style.visibility,'hidden');
});
test('approved 1000x pill copy, centering, ring scale and static frame are shared by game and studio',()=>{
  const html=read('play/index.html'),css=read('play/game.css');
  assert.match(html,/id="promoBadge"[^>]*>\s*<span class="promo-caption">WIN UP TO<\/span><strong class="promo-value">1000x<\/strong>/);
  assert.match(css,/\.olympus-gold \.promo-badge\{[\s\S]*?left:24%;width:52%;height:3\.2%/);
  assert.match(css,/\.olympus-gold \.published-layer\[data-layer="spinbutton"\] #spin\{\s*width:60%;height:60%/);
  assert(css.includes('conic-gradient(from -35deg'));
  assert(css.includes('.promo-badge::before'));
  assert(css.includes('.promo-badge::after'));
  assert(!css.includes('spin-frame{animation:'));
  assert.match(read('play/game.js'),/WIN UP TO 1000×/);
  assert.match(read('studio/index.html'),/v0\.14\.2/);
});

test('Olympus credit and bet show SVG currency icons instead of visible text labels',()=>{
  const p=preset(),original=JSON.stringify(p),d=dom();
  d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  for(const [kind,layerId,expected] of [
    ['credit','credits','Kredit virtual: '],['bet','betlabel','Nilai taruhan: ']
  ]){
    const panel=scene.children.find(n=>n.dataset.fx==='wallet-'+kind);
    assert(panel);
    assert.equal(panel.children[0].className,'feature-skin wallet-skin');
    const emblem=panel.children[1];
    assert.equal(emblem.className,'wallet-coin-icon wallet-coin-'+kind);
    assert.equal(emblem['aria-hidden'],'true');
    assert.match(emblem.innerHTML,/<svg[\s\S]*<\/svg>/);
    if(kind==='credit')assert.match(emblem.innerHTML,/sg-gold-stack-v137/);
    else assert.match(emblem.innerHTML,/sg-poker-rim-v137/);
    const layer=scene.children.find(n=>n.dataset.layer===layerId);
    const accessible=layer.children[0].children[0];
    assert.equal(accessible.className,'sr-only wallet-a11y-label');
    assert.equal(accessible.textContent,expected);
    assert(!layer.children[0].children.some(n=>n.textContent==='CREDIT '||n.textContent==='BET '));
  }
  assert.equal(d.nodes.get('credits').parent.parent.dataset.layer,'credits');
  assert.equal(d.nodes.get('betText').parent.parent.dataset.layer,'betlabel');
  assert.equal(JSON.stringify(p),original);
});
test('minus button mirrors plus inset exactly and leaves a gap for poker chip and bet amount',()=>{
  const p=preset(),d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const panel=p.layers.find(l=>l.id==='antebtn');
  const plus=p.layers.find(l=>l.id==='plusbtn');
  const minus=p.layers.find(l=>l.id==='minusbtn');
  const value=p.layers.find(l=>l.id==='betlabel');
  const rightInset=panel.x+panel.w-plus.x-plus.w;
  const mirroredX=panel.x+rightInset;
  const moved=d.nodes.get('minus').parent;
  assert.equal(moved.style.left,mirroredX/1080*100+'%');
  assert.equal(rightInset,26);
  assert.equal(mirroredX,577);
  assert(mirroredX+minus.w<value.x-32,'minus must not overlap bet amount');
  // The poker chip follows the minus and precedes the numeric live BET.
  const iconStart=panel.x+panel.w*.25;
  const iconEnd=iconStart+panel.w*.102;
  assert(iconStart>mirroredX+minus.w,'chip must clear the minus hit target');
  assert(iconEnd<value.x,'chip must not obscure bet amount');
  assert.equal(d.nodes.get('plus').parent.style.left,plus.x/1080*100+'%');
});
test('non-Olympus and customized fallback preserve their existing readable CREDIT/BET labels',()=>{
  const p=preset();p.layers.find(l=>l.id==='plusbtn').visible=false;
  const d=dom();d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  for(const [id,label] of [['credits','CREDIT '],['betlabel','BET ']]){
    const node=scene.children.find(l=>l.dataset.layer===id);
    assert.equal(node.children[0].children[0].textContent,label);
    assert.notEqual(node.children[0].children[0].className,'sr-only wallet-a11y-label');
  }
  assert.equal(d.nodes.get('minus').parent.style.left,
    p.layers.find(l=>l.id==='minusbtn').x/1080*100+'%');
});

test('legacy Live minus x643 is corrected, new Studio preset x577 and designer edits are respected',()=>{
  const original=preset(),newMinus=original.layers.find(l=>l.id==='minusbtn');
  assert.equal(newMinus.x,577,'new Olympus imports match the displayed symmetric geometry');
  const old=preset();old.layers.find(l=>l.id==='minusbtn').x=643;
  const before=JSON.stringify(old),d=dom();
  d.window.SkygateApplyLayout(old,path=>'assets/'+path);
  assert.equal(d.nodes.get('minus').parent.style.left,577/1080*100+'%');
  assert.equal(JSON.stringify(old),before,'historical Live snapshot remains immutable');
  const custom=preset();custom.layers.find(l=>l.id==='minusbtn').x=620;
  const c=dom();c.window.SkygateApplyLayout(custom,path=>'assets/'+path);
  const scene=c.game.children.at(-1);
  assert.equal(c.nodes.get('minus').parent.style.left,620/1080*100+'%');
  assert.equal(scene.children.filter(n=>n.dataset.fx?.startsWith('wallet-')).length,0,
    'use original panel and labels if a custom move would overlap the poker icon');
});

test('PWA publishes the sky background as a full-viewport underlay without editing the studio project',()=>{
  const p=preset(),before=JSON.stringify(p),d=dom();
  d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const backdrop=d.game.children[0];
  assert.equal(backdrop.className,'pwa-stage-background');
  assert.equal(backdrop['aria-hidden'],'true');
  assert.equal(backdrop.src,'assets/custom/olympus_background.png');
  assert.equal(d.game.children.at(-1).className,'published-scene');
  assert.equal(JSON.stringify(p),before);
  const css=read('play/game.css');
  assert(css.includes('Skygate v0.14.0 full-bleed mobile viewport'));
  assert(css.includes('height:100vh;height:100dvh;min-height:100dvh'));
  assert(css.includes('bottom:env(safe-area-inset-bottom,0px)'));
  assert(css.includes('.game.has-published-scene>.pwa-stage-background'));
});

test('v0.14.1 anchors WIN 1000x and BET settings to the same safe-area stage',()=>{
  const project=preset(),snapshot=JSON.stringify(project),d=dom();
  d.window.SkygateApplyLayout(project,path=>'assets/'+path);
  const scene=d.game.children.at(-1),promo=d.nodes.get('promoBadge');
  const bet=d.nodes.get('betMenu'),frame=project.layers.find(l=>l.id==='winbanner');
  assert.equal(promo.parent,scene,'promo must follow WIN banner in the scene');
  assert.equal(bet.parent,scene,'BET button must follow MENU footer baseline');
  assert.equal(promo.style.top,(frame.y/1920*100-3)+'%');
  assert.equal(JSON.stringify(project),snapshot,'never mutate editable Studio layout');
  const moved=preset();moved.layers.find(l=>l.id==='winbanner').y+=80;
  const d2=dom();d2.window.SkygateApplyLayout(moved,path=>'assets/'+path);
  assert.equal(d2.nodes.get('promoBadge').style.top,
    ((frame.y+80)/1920*100-3)+'%','promo must follow custom Studio WIN position');
  const css=read('play/game.css'),html=read('play/index.html');
  assert(css.includes('.olympus-gold .published-scene > .promo-badge'));
  assert(css.includes('.olympus-gold .published-scene > .bet-menu{pointer-events:auto}'));
  assert(css.includes('height:var(--sg-pwa-full-height,100dvh)'));
  assert(html.includes('window.navigator.standalone===true'));
  assert(html.includes('window.screen?.height'));
});

test('Olympus AUTO / NORMAL stay 1:1 and keep saved layer centers unchanged',()=>{
  const p=preset(),before=JSON.stringify(p),d=dom();
  d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  const scene=d.game.children.at(-1);
  for(const id of ['autobtn','turbobtn']){
    const l=p.layers.find(layer=>layer.id===id);
    const node=scene.children.find(child=>child.dataset.layer===id);
    const diameter=l.w/1080*100;
    const centerY=(l.y+l.h/2)/1920*100;
    assert(node.className.includes('published-mode-circle'),id);
    assert.equal(node.style.width,diameter+'%',id);
    assert.equal(node.style.height,diameter+'cqw',id);
    assert.equal(node.style.top,`calc(${centerY}% - ${diameter/2}cqw)`,id);
    assert.equal(node.style.aspectRatio,'1 / 1',id);
    assert.equal(node.children[0],d.nodes.get(id==='autobtn'?'auto':'turbo'),id);
  }
  assert.equal(JSON.stringify(p),before,'Studio snapshot must remain immutable');
  const custom=preset(),edit=custom.layers.find(layer=>layer.id==='autobtn');
  edit.y+=38;edit.w=160;
  const changed=dom();changed.window.SkygateApplyLayout(custom,path=>'assets/'+path);
  const rendered=changed.game.children.at(-1).children.find(child=>child.dataset.layer==='autobtn');
  assert.equal(rendered.style.height,160/1080*100+'cqw');
  assert.equal(rendered.style.top,`calc(${(edit.y+edit.h/2)/1920*100}% - ${160/1080*50}cqw)`);
  const css=read('play/game.css');
  assert(css.includes('.published-layer.published-mode-circle>.mode-control'));
});
