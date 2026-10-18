import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { messages,tr,setLocale,relocalize,literal,number,applyTranslations } from '../i18n.js';
import { makeTrack,validatePlayable } from '../engine.js';
import { loadData,saveData } from '../storage.js';
import { documentFrom } from './dom-harness.js';
import { lightColors,themeColor } from '../palette.js';
import { render,fitCamera } from '../renderer.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Les catalogues FR/EN sont complets et conservent tous les paramètres',()=>{
  assert.deepEqual(Object.keys(messages.fr).sort(),Object.keys(messages.en).sort());assert(Object.keys(messages.fr).length>350);
  for(const key of Object.keys(messages.fr)){assert(messages.en[key]);assert.deepEqual([...messages.fr[key].matchAll(/\{p\d+\}/g)].map(m=>m[0]).sort(),[...messages.en[key].matchAll(/\{p\d+\}/g)].map(m=>m[0]).sort(),key);}
  for(const m of html.matchAll(/data-i18n-(?:title|aria-label|content|placeholder)="([^"]+)"/g))assert(messages.fr[m[1]],m[1]);
  for(const m of html.matchAll(/data-i18n-slots="([^"]+)"/g))for(const slot of m[1].split(';'))assert(messages.fr[slot.slice(slot.indexOf(':')+1)]);
});
test('Traduction : paramètres, messages imbriqués et noms personnels conservés',()=>{
  setLocale('fr');const label=tr('app.p0.sera.retire.de.tes.circuits.enregistres',{p0:literal('Mon circuit')});setLocale('en');assert.equal(relocalize(label),'“Mon circuit” will be removed from your saved tracks.');assert.equal(number(1.5),'1.5');assert.equal(validatePlayable(makeTrack([])),'Add a start line.');assert.throws(()=>makeTrack([null]),/Invalid block/);setLocale('fr');assert.equal(number(1.5),'1,5');
});
test('Les traductions statiques conservent les contrôles et leurs valeurs',()=>{
  const doc=documentFrom(html),input=doc.getElementById('blockWidth'),button=doc.getElementById('resetBlockBtn');input.value='9.5';setLocale('en');applyTranslations(doc);assert.equal(input.value,'9.5');assert.equal(doc.getElementById('blockWidth'),input);assert.match(button.textContent,/Reset shape/);assert.equal(doc.documentElement.getAttribute('lang'),'en');assert.match(doc.getElementById('introTitle').textContent,/Speed is a choice/);setLocale('fr');applyTranslations(doc);assert.match(button.textContent,/Réinitialiser/);assert.equal(input.value,'9.5');
});
test('Les préférences de thème et de langue sont persistées et les anciennes sauvegardes restent lisibles',()=>{
  let raw=JSON.stringify({version:1,settings:{sound:true}});const storage={getItem:()=>raw,setItem:(_,value)=>raw=value};const data=loadData(storage);assert.equal(data.settings.language,'fr');assert.equal(data.settings.theme,'dark');data.settings.language='en';data.settings.theme='light';saveData(storage,data);assert.equal(loadData(storage).settings.language,'en');assert.equal(loadData(storage).settings.theme,'light');assert.equal(loadData(storage).settings.sound,true);
});
test('Le canvas applique la palette claire et les couleurs principales gardent un contraste lisible',()=>{
  const relative=hex=>{const c=hex.slice(1,7).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const contrast=(a,b)=>{const x=relative(a),y=relative(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  assert(contrast(lightColors['#edf2f6'],lightColors['#10151c'])>7);assert(contrast(lightColors['#182015'],lightColors['#c5f575'])>4.5);assert(contrast(lightColors['#8793a1'],lightColors['#141b23'])>4.5);assert.notEqual(themeColor('#293745','light'),'#293745');
  const colors=[],ctx=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;if(k==='fillStyle')colors.push(v);return true;}}),t=makeTrack([{block_style:'StraightRoadBlock',left:0,right:4,bottom:0,top:8,is_vertical:true}]);render(ctx,fitCamera(t,600,400),t,{theme:'light'});assert(colors.includes(lightColors['#293745']));
});
