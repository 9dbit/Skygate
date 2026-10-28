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
  }
  const root=new Node(),game=new Node(),menu=new Node();root.append(game,menu);
  const nodes=new Map([...read('play/index.html').matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)].map(m=>[m[2],new Node(m[1])]));
  for(const n of nodes.values())root.append(n);
  nodes.get('spin').append(new Node('img'));
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
  assert.equal(d.nodes.get('plus').parent.dataset.layer,'plusbtn');
  assert.equal(d.nodes.get('minus').parent.dataset.layer,'minusbtn');
  assert.equal(d.nodes.get('autoStatus').parent.parent.dataset.layer,'autolabel');
  assert.equal(d.nodes.get('turboStatus').parent.parent.dataset.layer,'turbolabel');
  assert.equal(d.nodes.get('auto').children.filter(n=>n.className==='control-skin').length,1);
  assert.match(d.nodes.get('auto').className,/skinned-control/);
  assert.match(d.nodes.get('auto').querySelector('svg').innerHTML,/currentColor/);
  const scene=d.game.children.at(-1),logo=scene.children.find(n=>n.dataset.layer==='logo');
  assert.equal(logo.children[0].style.objectFit,'fill');
  assert.equal(d.nodes.get('freeInfo').children[0].className,'feature-skin');
});

test('legacy Studio projects still put unsupported bet controls in the menu',()=>{
  const d=dom(),p=JSON.parse(read('studio/project.json'));
  d.window.SkygateApplyLayout(p,path=>'assets/'+path);
  assert.equal(d.nodes.get('plus').parent.className,'published-bet-controls');
  assert.equal(d.nodes.get('minus').parent,d.nodes.get('plus').parent);
  assert.equal(d.nodes.get('autoStatus').parent,d.nodes.get('auto'));
});
