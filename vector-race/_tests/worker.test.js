import test from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../i18n.js';
let response;
globalThis.self={postMessage:data=>response=data};
await import('../solver-worker.js');
test('Le Web Worker localise ses erreurs selon la langue de la requête',()=>{
  self.onmessage({data:{requestId:1,blocks:[],locale:'en'}});assert.equal(response.error,'Add a start line.');assert.equal(response.requestId,1);
  self.onmessage({data:{requestId:2,blocks:[],locale:'fr'}});assert.equal(response.error,'Ajoute une ligne de départ.');assert.equal(response.requestId,2);setLocale('fr');
});
