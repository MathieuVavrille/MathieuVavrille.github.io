import test from 'node:test';
import assert from 'node:assert/strict';
import { rect,line,turn,makeTrack,parseTrack,contains,segmentAllowed,solve,initialState,move,validatePlayable } from '../engine.js';
import { editHandles,hitResize,resizeBlock,translateBlock,rotateBlock,blockDimensions,setBlockDimensions,resetBlock,magneticPoint } from '../editor-geometry.js';
import { loadData,saveData } from '../storage.js';
import { pathGeometry } from '../path-geometry.js';
import { screen } from '../renderer.js';

const node=(x,y)=>({point:[x,y],in:[x,y],out:[x,y]});
const road=(nodes,width=3,closed=false)=>({block_style:'BezierRoadBlock',nodes,width,closed});
test('Les bords et coins d’une route redimensionnent sans bouger le bord opposé',()=>{
  const b=rect(0,4,0,12);assert.deepEqual(resizeBlock(b,'nw',[-3,4]),rect(-3,4,0,16));assert.deepEqual(resizeBlock(b,'e',[-99,0]),rect(0,0,0,12));
  assert.deepEqual(translateBlock(b,[200,-200]),rect(116,120,-120,-108));assert.deepEqual(b,rect(0,4,0,12));
  const c={cx:2,cy:6,w:600,h:500,scale:20};assert.equal(hitResize(b,screen([-1/3,3],c),c).id,'w');assert.equal(hitResize(b,screen([4+1/3,12+1/3],c),c).cursor,'nesw-resize');
});
test('Les deux extrémités des lignes gardent des largeurs de 1 à 40',()=>{
  for(const vertical of [true,false]){const b=line(3,4,5,true,vertical),delta=vertical?[-2,0]:[0,-2],resized=resizeBlock(b,'start',delta);assert.equal(resized.width,7);assert.equal(resized.start_pos[vertical?0:1],b.start_pos[vertical?0:1]-2);assert.equal(resizeBlock(b,'end',[100,100]).width,40);assert.equal(resizeBlock(b,'end',[-100,-100]).width,1);makeTrack([resized]);}
});
test('Les poignées des quatre virages respectent les rayons et les largeurs A/B',()=>{
  for(const angle of [0,90,180,270]){
    const b=turn([0,0],angle,[3,6],[5,12]),sx=angle===90||angle===180?-1:1;
    const changed=resizeBlock(b,'outer-0',[2*sx,0]);assert.deepEqual(changed.outside_rad,[7,12]);assert.deepEqual(changed.inside_rad,b.inside_rad);
    assert.equal(resizeBlock(b,'inner-0',[99*sx,0]).inside_rad[0],5);assert.equal(resizeBlock(b,'outer-0',[-99*sx,0]).outside_rad[0],3);
    assert.equal(editHandles(b).length,4);let rotated=b;for(let i=0;i<4;i++)rotated=rotateBlock(rotated);assert.deepEqual(rotated,b);makeTrack([changed]);
    const dims=blockDimensions(b);assert.deepEqual(setBlockDimensions(b,dims),b);
  }
});
test('Plume : traits, courbes et boucles utilisent la même géométrie pour collisions et export',()=>{
  const a=node(0,0),b=node(10,10);a.out=[0,10];b.in=[0,10];const curve=road([a,b],1),t=makeTrack([curve]);
  assert(contains(curve,[0,0]));assert(contains(curve,[10,10]));assert.equal(segmentAllowed(t,[0,0],[10,10]),false);assert(pathGeometry(curve).points.length>10);
  assert.deepEqual(parseTrack(JSON.stringify([curve])).blocks,t.blocks);
  const loop=road([node(0,0),node(8,0),node(8,8),node(0,8)],1,true),track=makeTrack([loop]);assert(track.allowed.has('0,4'));assert(!track.allowed.has('4,4'));assert.equal(segmentAllowed(track,[0,4],[8,4]),false);
});
test('Une piste à la plume est jouable et résolue avec un arrêt valide',()=>{
  const t=makeTrack([road([node(0,0),node(12,0)]),line(0,-1,3,true,false),line(12,-1,3,false,false)]);assert.equal(validatePlayable(t),null);
  const r=solve(t);assert(r.actions.length>0);let s=initialState(r.start);for(const a of r.actions){s=move(t,s,a);assert.notEqual(s.status,'crashed');}assert.equal(s.status,'won');assert.deepEqual(s.velocity,[0,0]);
});
test('Plume : déplacer les points, courber un angle, casser une tangente et régler la largeur',()=>{
  const b=road([node(0,0),node(10,0)]),curved=resizeBlock(b,'node-0',[2,3],{altKey:true});assert.deepEqual(curved.nodes[0],{point:[0,0],in:[-2,-3],out:[2,3]});
  const linked=resizeBlock(curved,'out-0',[1,1]);assert.deepEqual(linked.nodes[0].in,[-3,-4]);
  const broken=resizeBlock(curved,'out-0',[1,1],{altKey:true});assert.deepEqual(broken.nodes[0].in,[-2,-3]);
  const moved=resizeBlock(curved,'node-0',[1,2]);assert.deepEqual(moved.nodes[0].point,[1,2]);assert.deepEqual(moved.nodes[0].out,[3,5]);
  assert.equal(resizeBlock(b,'path-width',[0,2]).width,7);let rotated=curved;for(let i=0;i<4;i++)rotated=rotateBlock(rotated);assert.deepEqual(rotated,curved);
  const shifted=translateBlock(curved,[5,4]);assert.deepEqual(shifted.nodes[1].point,[15,4]);makeTrack([shifted]);
});
test('Les imports à la plume refusent les coordonnées, largeurs et points mal formés',()=>{
  for(const b of [road([node(0,0)]),road([node(0,0),node(1,1)],0),road([node(0,0),node(1,1)],41),road([node(0,0),node(1,1)],3,true),road([node(0,0),node(121,0)]),road([{point:[0,0],in:[Infinity,0],out:[0,0]},node(1,1)])])assert.throws(()=>makeTrack([b]));
});

test('Reset : les dimensions de base préservent les positions, orientations et points de plume',()=>{
  assert.deepEqual(resetBlock(rect(3,20,4,6,false)),rect(3,14,4,8,false));
  assert.deepEqual(resetBlock(turn([2,3],270,[2,6],[9,12])),turn([2,3],270,[4,4],[8,8]));
  assert.deepEqual(resetBlock(line(5,7,12,false,false)),line(5,7,5,false,false));
  const b=road([{point:[0,0],in:[-2,0],out:[2,0]},node(10,8)],3),reset=resetBlock(b);assert.equal(reset.width,5);assert.deepEqual(reset.nodes[0],node(0,0));assert.deepEqual(b.nodes[0].out,[2,0]);
});
test('Magnétisme : grille, alignement proche et dessin libre au centième',()=>{
  assert.deepEqual(magneticPoint([2.43,3.22],[],25,true).point,[2,3]);assert.deepEqual(magneticPoint([2.43,3.22],[],25,false).point,[2.43,3.22]);
  const blocks=[rect(5.25,8.25,2,8)];assert.deepEqual(magneticPoint([5.3,4.2],blocks,25,true),{point:[5.25,4],guides:{x:5.25}});
  assert.equal(magneticPoint([5.3,4.2],blocks,250,true).guides,null);
  assert.deepEqual(resizeBlock(rect(0,4,0,12),'e',[.4,0],{snap:false}),rect(0,4.4,0,12));
  assert.deepEqual(translateBlock(rect(0,4,0,12),[.4,.35],{snap:false}),rect(.4,4.4,.35,12.35));
  const turnFree=resizeBlock(turn([0,0],0,[3,4],[7,9]),'outer-0',[.35,0],{snap:false});assert.equal(turnFree.outside_rad[0],7.35);makeTrack([turnFree]);
  assert.deepEqual(translateBlock(line(0,0,3,true),[.4,.35],{snap:false}).start_pos,[0,0]);
});
test('Les blocs décimaux se réimportent et restent compatibles avec une course sur grille',()=>{
  const t=makeTrack([rect(-.15,3.7,-.1,12.2),line(0,0,4,true),line(0,12,4,false)]),r=solve(t);assert(r.actions.length);assert.equal(parseTrack(JSON.stringify(t.blocks)).allowed.size,t.allowed.size);
  let s=initialState(r.start);for(const a of r.actions)s=move(t,s,a);assert.equal(s.status,'won');assert.throws(()=>makeTrack([line(.5,0,4,true)]));
});
test('La préférence de magnétisme est activée par défaut et persistée sans perdre les autres réglages',()=>{
  let raw=null;const storage={getItem:()=>raw,setItem:(_,value)=>raw=value};const data=loadData(storage);assert.equal(data.settings.snap,true);data.settings.snap=false;data.settings.sound=true;saveData(storage,data);assert.equal(loadData(storage).settings.snap,false);assert.equal(loadData(storage).settings.sound,true);
});
