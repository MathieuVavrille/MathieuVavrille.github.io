import { messages } from './locales.js';

let locale='fr';
const rendered=new Map();
export const getLocale=()=>locale;
export function setLocale(value){locale=value==='en'?'en':'fr';return locale;}
export function literal(value){return{literal:String(value)};}
export function tr(key,values={}){
  const template=messages[locale][key]??messages.fr[key]??key;
  const text=template.replace(/\{(p\d+)\}/g,(_,name)=>String(values[name]?.literal??values[name]??`{${name}}`));
  rendered.set(text,{key,values});return text;
}
export function relocalize(text){
  const key=Object.keys(messages.fr).find(key=>messages.fr[key]===text||messages.en[key]===text);
  const saved=rendered.get(text)||(key?{key,values:{}}:null);if(!saved)return text;
  const values=Object.fromEntries(Object.entries(saved.values).map(([key,value])=>[key,typeof value==='string'?relocalize(value):value]));
  return tr(saved.key,values);
}
export function applyTranslations(root=document){
  for(const el of root.querySelectorAll('[data-i18n-slots]')){
    for(const slot of el.getAttribute('data-i18n-slots').split(';')){const colon=slot.indexOf(':'),index=Number(slot.slice(0,colon)),key=slot.slice(colon+1),node=el.childNodes[index];if(node)node.textContent=tr(key);}
  }
  for(const attribute of ['title','aria-label','placeholder','content'])for(const el of root.querySelectorAll(`[data-i18n-${attribute}]`))el.setAttribute(attribute,tr(el.getAttribute(`data-i18n-${attribute}`)));
  const html=root.documentElement||root.querySelector('html');if(html)html.setAttribute('lang',locale);
}
export function number(value,digits=1){return Number(value).toLocaleString(locale==='fr'?'fr-FR':'en-GB',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
export { messages };
