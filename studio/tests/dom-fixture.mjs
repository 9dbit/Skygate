export function makeDOM() {
  const created=[], animations=[];
  class Node {
    constructor(tag='div') {
      Object.assign(this,{tagName:tag,children:[],style:{},dataset:{},attributes:{},events:{},className:'',textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,open:false});
      this.classList={
        contains:cls=>this.className.split(' ').includes(cls),
        toggle:(cls,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));if(on??!names.has(cls))names.add(cls);else names.delete(cls);this.className=[...names].join(' ');},
        add:(...classes)=>classes.forEach(cls=>this.classList.toggle(cls,true)),
        remove:(...classes)=>classes.forEach(cls=>this.classList.toggle(cls,false))
      };
      created.push(this);
    }
    append(...nodes){for(const n of nodes){if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=this;this.children.push(n);}}
    replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes);}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,fn){this.events[k]=fn;}
    querySelectorAll(selector){const matches=n=>selector.startsWith('.')?n.classList.contains(selector.slice(1)):n.tagName===selector;return this.children.flatMap(n=>[...(matches(n)?[n]:[]),...n.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]??(selector==='small'?(this.small??=new Node('small')):null);}
    showModal(){this.open=true;}
    close(){this.open=false;}
    scrollIntoView(){}
    decode(){return Promise.resolve();}
    animate(frames,options){let resolve;const finished=new Promise(r=>resolve=r);const a={node:this,frames,options,finished,cancelled:false,cancel(){this.cancelled=true;resolve();}};animations.push(a);if(options.iterations!==Infinity)queueMicrotask(resolve);return a;}
  }
  return {Node,created,animations};
}
