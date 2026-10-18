import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeTrack, rect, line, turn, initialState, candidate, move, segmentAllowed, parseTrack, validatePlayable, solve, contains } from '../engine.js';
import { builtins } from '../tracks.js';
import { loadData, saveData, replay, verifiedRecord, recordKey } from '../storage.js';

const original = JSON.parse(fs.readFileSync(new URL('../original.trk',import.meta.url),'utf8'));
const tracks = builtins(original);

test('L’inertie se conserve et chaque axe accepte −1, 0 ou +1',()=>{
  let s=initialState([2,0]),t=tracks[0];
  s=move(t,s,[0,1]);assert.deepEqual(s.pos,[2,1]);assert.deepEqual(s.velocity,[0,1]);
  s=move(t,s,[0,0]);assert.deepEqual(s.pos,[2,2]);assert.deepEqual(s.velocity,[0,1]);
  s=move(t,s,[1,1]);assert.deepEqual(s.pos,[3,4]);assert.deepEqual(s.velocity,[1,2]);
  assert.throws(()=>move(t,s,[2,0]));assert.throws(()=>move(t,s,[0]));
});
test('L’arrivée en mouvement ne gagne pas ; un coup de frein sur place gagne',()=>{
  const t=makeTrack([rect(0,2,0,3),line(0,0,3,true),line(0,3,3,false)]);
  let s=initialState([1,0]);s=move(t,s,[0,1]);s=move(t,s,[0,1]);assert.equal(s.status,'racing');assert.deepEqual(s.pos,[1,3]);
  s=move(t,s,[0,-1]);assert.equal(s.status,'crashed');
  s=initialState([1,0]);s=move(t,s,[0,1]);s=move(t,s,[0,0]);s=move(t,s,[0,0]);assert.equal(s.status,'racing');s=move(t,s,[0,-1]);assert.equal(s.status,'won');assert.deepEqual(s.velocity,[0,0]);assert.equal(move(t,s,[0,1]),s);
});
test('Une extrémité sur piste ne permet pas de traverser le vide',()=>{
  const t=makeTrack([rect(0,2,0,2),rect(5,7,0,2)]);
  assert(t.allowed.has('1,1'));assert(t.allowed.has('6,1'));assert.equal(segmentAllowed(t,[1,1],[6,1]),false);
  assert.equal(segmentAllowed(t,[1,1],[2,2]),true);
});
test('Un raccourci dans le trou d’un virage elliptique est refusé',()=>{
  const t=makeTrack([turn([0,0],0,[4,4],[5,5])]);
  assert.equal(segmentAllowed(t,[5,0],[0,5]),false);
  assert.equal(segmentAllowed(t,[4,1],[4,2]),true);
});
test('L’union des blocs autorise les raccords ; leurs frontières ne sont pas des murs',()=>{
  const t=makeTrack([rect(0,2,0,4),rect(0,7,3,5,false)]);
  assert.equal(segmentAllowed(t,[1,1],[5,4]),false);assert.equal(segmentAllowed(t,[1,3],[6,4]),true);
});
test('Les bords continus détectent aussi une sortie entre points entiers',()=>{
  const t=makeTrack([rect(0,0,0,2),rect(1,2,0,0,false)]);
  assert.equal(segmentAllowed(t,[0,1],[1,0]),false);
});
test('Les virages ont bien quatre orientations et des rayons elliptiques',()=>{
  for(const a of [0,90,180,270]){
    const b=turn([0,0],a,[2,3],[5,6]);const theta=(a+45)*Math.PI/180;
    assert(contains(b,[4*Math.cos(theta),5*Math.sin(theta)]));assert(!contains(b,[0,0]));
  }
});
test('Le .trk d’origine non JSON est importable sans exécuter de code',()=>{
  const raw=fs.readFileSync(new URL('./fixtures/original-python.trk',import.meta.url),'utf8');assert.equal(parseTrack(raw).allowed.size,tracks[5].allowed.size);
  assert.deepEqual(parseTrack(JSON.stringify(original)).blocks,tracks[5].blocks);
  assert.throws(()=>parseTrack('__import__("os").system("false")'));
});
test('Les imports refusent données mal formées et pistes excessives',()=>{
  for(const raw of [null,{},[{}],[rect(4,0,0,3)], [line(0,0,0,true)],[turn([0,0],45,[1,1],[4,4])],[turn([0,0],0,[5,1],[2,4])],Array(301).fill(rect(0,1,0,1))]) assert.throws(()=>makeTrack(raw));
  assert.throws(()=>parseTrack('x'.repeat(500001)));assert.throws(()=>makeTrack([rect(-120,120,-120,120)]));
});
test('Validation : départ, arrivée, séparation et connexion',()=>{
  assert.match(validatePlayable(makeTrack([])),/départ/);assert.match(validatePlayable(makeTrack([line(0,0,2,true)])),/arrivée/);
  assert.match(validatePlayable(makeTrack([line(0,0,2,true),line(0,0,2,false)])),/distincts/);
  assert.match(validatePlayable(makeTrack([line(0,0,2,true),line(10,10,2,false)])),/reliés/);
  assert.equal(validatePlayable(tracks[5]),null);
});
for (const [i,t] of tracks.entries()) test(`Course entière ${t.id} : minimum ${[8,12,16,18,26,40][i]} et arrivée à l’arrêt`,()=>{
  const r=solve(t);assert.equal(r.actions.length,[8,12,16,18,26,40][i]);let s=initialState(r.start);
  for(const a of r.actions){assert(candidate(t,s,a).safe);s=move(t,s,a);assert.notEqual(s.status,'crashed');}
  assert.equal(s.status,'won');assert.deepEqual(s.velocity,[0,0]);assert(t.finishSet.has(s.pos.join(',')));
});
test('Solveur depuis un état intermédiaire et limite de recherche',()=>{
  const t=tracks[1],r=solve(t);let s=initialState(r.start);for(const a of r.actions.slice(0,4))s=move(t,s,a);const remaining=solve(t,s);assert.equal(remaining.actions.length,r.actions.length-4);assert.equal(solve(t,null,10).limited,true);
  const disconnected=makeTrack([line(0,0,1,true),line(10,0,1,false)]);assert.equal(solve(disconnected).impossible,true);
});
test('Sauvegardes corrompues ou bloquées : le jeu reste initialisable',()=>{
  assert.deepEqual(loadData({getItem:()=>'{invalid'}).saved,[]);assert.equal(loadData({getItem:()=>JSON.stringify({version:42})}).version,1);assert.equal(saveData({setItem:()=>{throw new Error();}},{}),false);
});
test('Une reprise et un record sont rejoués depuis leurs actions',()=>{
  const t=tracks[0],r=solve(t),s=replay(t,r.start,r.actions);assert.equal(s.status,'won');assert.equal(replay(t,[99,99],r.actions),null);assert.equal(replay(t,r.start,[[3,1]]),null);assert.equal(replay(t,r.start,[...r.actions,[0,0]]),null);
  const record={start:r.start,actions:r.actions,moves:r.actions.length};assert(verifiedRecord(t,record));assert.equal(verifiedRecord(t,{...record,moves:1}),null);assert.equal(recordKey(t),recordKey(makeTrack(t.blocks,{id:t.id})));
});
