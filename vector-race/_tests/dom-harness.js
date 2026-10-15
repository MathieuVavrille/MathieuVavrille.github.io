// A small DOM double for integration of the real app module. No layout engine:
// these tests exercise event/state wiring, not browser rendering or accessibility.
const voids=new Set(['meta','link','input','br','hr','img']);
export class Element {
  constructor(tag='div',attrs={}){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.children=[];this.listeners={};this.dataset={};this.style={};this.parentElement=null;this._text='';this.hidden='hidden'in attrs;this.disabled='disabled'in attrs;this.checked='checked'in attrs;this.value=attrs.value||'';this.min=attrs.min;this.max=attrs.max;this.id=attrs.id;this.className=attrs.class||'';for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;}
  get classList(){const el=this;return{contains:c=>el.className.split(/\s+/).includes(c),toggle(c,force){const set=new Set(el.className.split(/\s+/).filter(Boolean));const on=force===undefined?!set.has(c):!!force;if(on)set.add(c);else set.delete(c);el.className=[...set].join(' ');return on;}};}
  get childNodes(){return this.children;}
  set innerHTML(html){this.replaceChildren(...parse(html).children);}
  get innerHTML(){return this.children.map(c=>c.textContent).join('');}
  set textContent(t){this.children=[];this._text=String(t);}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  append(...children){for(const child of children){const c=typeof child==='string'?new Text(child):child;this.children.push(c);c.parentElement=this;}}
  replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=v;}
  getAttribute(k){return this.attrs[k]??null;}
  removeAttribute(k){delete this.attrs[k];}
  querySelectorAll(selector){const result=[];const walk=p=>{for(const c of p.children){if(matches(c,selector))result.push(c);walk(c);}};walk(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}
  dispatch(name,options={}){const e={target:this,preventDefault(){},...options};for(const fn of this.listeners[name]||[])fn(e);if(typeof this['on'+name]==='function')this['on'+name](e);}
  click(){if(!this.disabled)this.dispatch('click');}
  focus(){this.onfocus?.();}
  setPointerCapture(){}
  getBoundingClientRect(){return{left:0,top:0,width:this.id==='editorCanvas'?900:640,height:480};}
  getContext(){return this.context||=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
class Text extends Element{constructor(text){super('#text');this._text=text;}}
function matches(el,s){if(s.startsWith('.'))return el.classList.contains(s.slice(1));if(s.startsWith('['))return s.slice(1,-1)in el.attrs;return el.tagName.toLowerCase()===s;}
function parse(html){
  const root=new Element('root'),stack=[root];
  for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('<!'))continue;
    if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
    if(token.startsWith('<')){const tag=token.match(/^<([^\s/>]+)/)?.[1];if(!tag)continue;const attrs={};for(const m of token.slice(tag.length+1).matchAll(/([\w:-]+)(?:="([^"]*)"|='([^']*)')?/g)){if(m[1]!=='/')attrs[m[1]]=m[2]??m[3]??'';}const el=new Element(tag,attrs);stack.at(-1).append(el);if(!voids.has(tag)&&!token.endsWith('/>'))stack.push(el);}
    else stack.at(-1).append(new Text(token));
  }
  return root;
}
export function documentFrom(html){const doc=parse(html);doc.getElementById=id=>{const walk=p=>p.id===id?p:p.children.map(walk).find(Boolean);return walk(doc)||null;};doc.createElement=tag=>new Element(tag);doc.createTextNode=t=>new Text(t);doc.documentElement=doc.querySelector('html');return doc;}
