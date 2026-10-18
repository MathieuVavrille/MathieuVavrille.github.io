import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { documentFrom } from './dom-harness.js';
import { rect,line,makeTrack,solve } from '../engine.js';
import { recordKey,STORAGE_KEY } from '../storage.js';

const blocks=[rect(0,4,0,14),line(0,0,5,true),line(0,14,5,false)],t=makeTrack(blocks,{id:'custom:resume'});
const data={version:1,saved:[{id:'resume',name:'Mon circuit repris',blocks}],settings:{snap:false,language:'en',theme:'light'},session:{trackId:t.id,signature:recordKey(t),start:[2,0],actions:[[0,1]],started:true,assisted:false}};
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),original=fs.readFileSync(new URL('../original.trk',import.meta.url),'utf8'),doc=documentFrom(html),store=new Map([[STORAGE_KEY,JSON.stringify(data)]]);
globalThis.document=doc;globalThis.window={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},devicePixelRatio:1,matchMedia:()=>({matches:true}),addEventListener(){}};
globalThis.location={search:'',hash:''};globalThis.fetch=async()=>({ok:true,text:async()=>original});globalThis.requestAnimationFrame=fn=>setImmediate(()=>fn(performance.now()));globalThis.cancelAnimationFrame=clearImmediate;
globalThis.Worker=class{postMessage(d){setImmediate(()=>{if(!this.stopped)this.onmessage({data:{requestId:d.requestId,result:solve(makeTrack(d.blocks),d.start)}});});}terminate(){this.stopped=true;}};
const flush=()=>new Promise(r=>setImmediate(r));
await import('../app.js');await flush();await flush();
test('Rechargement : course personnalisée et préférence de magnétisme sont retrouvées',()=>{
  const $=id=>doc.getElementById(id);assert.equal($('loading').hidden,true);assert.equal($('trackTitle').textContent,'Mon circuit repris');assert.equal($('movesStat').textContent,'01');assert.equal($('startBtn'),null);assert.equal($('introDialog').open,true);assert.equal($('customRaceCount').textContent,'1');assert.equal($('snapToggle').checked,false);assert.match($('snapHint').textContent,/Free/);assert.equal($('goldStat').textContent,'8 moves');assert.equal(doc.documentElement.getAttribute('lang'),'en');assert.equal(doc.documentElement.getAttribute('data-theme'),'light');assert.match($('introTitle').textContent,/Speed/);assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).session.actions,[[0,1]]);
});
