import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { documentFrom } from './dom-harness.js';
import { builtins } from '../tracks.js';
import { solve, makeTrack, initialState, candidate, validatePlayable } from '../engine.js';
import { STORAGE_KEY } from '../storage.js';
import { fitCamera, screen } from '../renderer.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),original=fs.readFileSync(new URL('../original.trk',import.meta.url),'utf8');
const doc=documentFrom(html),store=new Map();globalThis.document=doc;
globalThis.window={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},devicePixelRatio:1,matchMedia:()=>({matches:true}),addEventListener(){}};
globalThis.location={search:'',hash:''};globalThis.fetch=async()=>({ok:true,text:async()=>original});
let frameTime=0,workerResult=null;const workers=[];
globalThis.requestAnimationFrame=fn=>setImmediate(()=>{frameTime+=100;fn(frameTime);});globalThis.cancelAnimationFrame=clearImmediate;
globalThis.Worker=class{constructor(){workers.push(this);}postMessage(data){const outcome=workerResult;setImmediate(()=>{if(this.stopped)return;const t=makeTrack(data.blocks);this.onmessage({data:{requestId:data.requestId,error:validatePlayable(t),result:outcome||solve(t,data.start)}});});}terminate(){this.stopped=true;}};
const $=id=>doc.getElementById(id),flush=()=>new Promise(r=>setImmediate(r));
const beginRace=()=>doc.dispatch('keydown',{key:'Enter',target:$('raceCanvas')});
await import('../app.js');await flush();await flush();
assert.equal($('introDialog').open,true);$('introClose').click();

test('L’app réelle démarre, navigue, termine les six circuits et sauvegarde les records',async()=>{
  assert.equal($('loading').hidden,true);assert.equal($('trackTitle').textContent,'À la corde');assert.equal(doc.querySelectorAll('.track-card').length,6);
  doc.querySelectorAll('[data-view]')[1].click();await flush();assert.equal($('editorView').hidden,false);
  doc.querySelectorAll('[data-view]')[0].click();await flush();
  const tracks=builtins(JSON.parse(original));
  for(let i=0;i<tracks.length;i++){
    doc.querySelectorAll('.track-card')[i].click();await flush();const t=tracks[i],start=t.starts[Math.floor(t.starts.length/2)],solution=solve(t,initialState(start));
    beginRace();assert.notEqual($('raceStatus').textContent,'SUR LA GRILLE');
    for(const a of solution.actions){const b=doc.querySelectorAll('.accel-btn').find(b=>b.dataset.acceleration===a.join(','));assert.equal(b.disabled,false);b.click();await flush();}
    assert.equal($('movesStat').textContent,String(solution.actions.length).padStart(2,'0'));assert.equal($('gameDialog').open,true);assert.match($('dialogTitle').textContent,/Arrêt net/);
    assert.equal(Object.keys(JSON.parse(store.get(STORAGE_KEY)).records).length,i+1);
  }
  assert.equal($('completionCount').textContent,'6/6');assert.match($('medalCount').textContent,/6 médailles/);
});
test('Crash, annulation, entraînement et recommencement sont reliés à la vraie UI',async()=>{
  doc.querySelectorAll('.track-card')[0].click();await flush();beginRace();
  const dangerous=doc.querySelectorAll('.accel-btn').find(b=>b.classList.contains('danger'));dangerous.click();await flush();assert.equal($('dialogTitle').textContent,'Un peu trop d’élan.');
  $('undoBtn').click();assert.equal($('gameDialog').open,false);assert.equal($('movesStat').textContent,'00');assert.equal($('raceStatus').textContent,'ENTRAÎNEMENT');
  $('restartBtn').click();assert.equal($('raceStatus').textContent,'SUR LA GRILLE');assert.equal($('raceStatus').textContent,'SUR LA GRILLE');
});
test('Un indice se calcule et surligne le bon contrôle en entraînement',async()=>{
  beginRace();$('hintBtn').click();await flush();await flush();assert.equal($('raceStatus').textContent,'ENTRAÎNEMENT');assert.equal(doc.querySelectorAll('.hinted').length,1);
});
test('Atelier : copier, modifier, annuler/rétablir, enregistrer et tester',async()=>{
  doc.querySelectorAll('[data-view]')[1].click();await flush();$('loadCurrentBtn').click();assert.equal($('blockCount').textContent,'3 BLOCS');
  doc.querySelectorAll('[data-tool]').find(b=>b.dataset.tool==='straight').click();
  const canvas=$('editorCanvas');canvas.dispatch('pointerdown',{button:0,pointerId:1,clientX:820,clientY:150});canvas.dispatch('pointerup',{button:0,pointerId:1,clientX:820,clientY:150});assert.equal($('blockCount').textContent,'4 BLOCS');
  $('editorUndo').click();assert.equal($('blockCount').textContent,'3 BLOCS');$('editorRedo').click();assert.equal($('blockCount').textContent,'4 BLOCS');$('editorUndo').click();
  $('trackName').value='Mon tracé de test';$('trackName').dispatch('input');$('saveTrackBtn').click();assert.equal($('savedCount').textContent,'1');assert.equal(JSON.parse(store.get(STORAGE_KEY)).saved[0].name,'Mon tracé de test');
  $('testTrackBtn').click();await flush();await flush();assert.equal($('raceView').hidden,false);assert.equal($('trackTitle').textContent,'Mon tracé de test');assert.equal($('goldStat').textContent,'8 coups');
});

test('Virage elliptique : deux largeurs indépendantes suivent les quatre orientations et le .trk',async()=>{
  doc.querySelectorAll('[data-view]')[1].click();await flush();
  doc.querySelectorAll('[data-tool]').find(b=>b.dataset.tool==='turn').click();
  assert.equal($('widthLabel').hidden,true);assert.equal($('turnWidthStartLabel').hidden,false);assert.equal($('turnWidthEndLabel').hidden,false);
  $('turnWidthStart').value='2';$('turnWidthEnd').value='7';$('blockRadius').value='3';$('blockRadiusY').value='6';
  for(let i=0;i<4;i++){
    const canvas=$('editorCanvas');canvas.dispatch('pointermove',{clientX:600,clientY:150});canvas.dispatch('pointerdown',{button:0,pointerId:1,clientX:600,clientY:150});canvas.dispatch('pointerup',{button:0,pointerId:1,clientX:600,clientY:150});
    const b=JSON.parse(store.get(STORAGE_KEY)).draft.blocks.at(-1);
    assert.equal(b.angle,i*90);assert.deepEqual(b.inside_rad,[3,6]);assert.deepEqual(b.outside_rad,i%2?[9,7]:[4,12]);
    const roundTrip=makeTrack(JSON.parse(JSON.stringify([b])));assert.deepEqual(roundTrip.blocks[0],b);
    // At each end, the intended count of integer grid positions is drivable.
    for(const [end,width]of [[0,2],[1,7]]){const a=(i+end)*Math.PI/2,axis=(i+end)%2;let count=0;for(let r=1;r<30;r++)if(roundTrip.allowed.has([b.center[0]+Math.round(Math.cos(a))*r,b.center[1]+Math.round(Math.sin(a))*r].join(',')))count++;assert.equal(count,width);assert.equal(b.outside_rad[axis]-b.inside_rad[axis]+1,width);}
    doc.querySelectorAll('[data-tool]').find(b=>b.dataset.tool==='turn').click();$('rotateBtn').click();
  }
  $('turnWidthStart').value='30';$('blockRadius').value='40';
  const count=$('blockCount').textContent;const canvas=$('editorCanvas');canvas.dispatch('pointerdown',{button:0,pointerId:1,clientX:600,clientY:150});canvas.dispatch('pointerup',{button:0,pointerId:1,clientX:600,clientY:150});assert.equal($('blockCount').textContent,count);assert.match($('toast').textContent,/60 maximum/);
});

test('Une souris immobile prévisualise le nouveau coup sous le pointeur après une diagonale',async()=>{
  doc.querySelectorAll('.track-card')[0].click();await flush();beginRace();
  const t=builtins(JSON.parse(original))[0],start=t.starts[Math.floor(t.starts.length/2)],cam=fitCamera(t,640,480),s=initialState(start);
  const p=screen(candidate(t,s,[1,1]).pos,cam),canvas=$('raceCanvas'),event={button:0,pointerId:1,clientX:p[0],clientY:p[1]};
  canvas.dispatch('pointermove',event);assert.equal(doc.querySelectorAll('.preview')[0].dataset.acceleration,'1,1');
  canvas.dispatch('pointerdown',event);canvas.dispatch('pointerup',event);await flush();
  assert.equal($('movesStat').textContent,'01');assert.equal(doc.querySelectorAll('.preview')[0]?.dataset.acceleration,'-1,-1');assert.equal($('nextVector').textContent,'( 0, 0 )');
  // Recompute once more after the camera changes, without a pointermove.
  for(let i=0;i<5;i++)$('zoomIn').click();
  const highlighted=doc.querySelectorAll('.preview');assert.equal(highlighted.length,0);
  canvas.dispatch('pointerleave');assert.equal(doc.querySelectorAll('.preview').length,0);
});

test('Solution optimale : lecture, pause, vitesse, arrêt final et retour sans modifier la course',async()=>{
  doc.querySelectorAll('.track-card')[1].click();await flush();beginRace();
  const safe=doc.querySelectorAll('.accel-btn').find(b=>!b.classList.contains('danger')&&b.dataset.acceleration==='0,1');safe.click();await flush();
  const before=JSON.parse(store.get(STORAGE_KEY)),moves=$('movesStat').textContent;
  $('solveBtn').click();assert.equal($('solutionPanel').hidden,false);await flush();await flush();
  assert.match($('solutionStatus').textContent,/Minimum : 12 coups/);assert.equal($('solutionPause').textContent,'Lire');assert.equal($('movesStat').textContent,'00');assert.equal($('raceStatus').textContent,'SOLUTION · PAUSE');assert(doc.querySelectorAll('.accel-btn').every(b=>b.disabled));
  $('solutionSpeed').value='4';$('solutionSpeed').dispatch('change');$('solutionPause').click();await flush();await flush();await flush();
  $('solutionPause').click();assert.equal($('raceStatus').textContent,'SOLUTION · PAUSE');const paused=Number($('solutionProgress').value);await flush();await flush();assert.equal(Number($('solutionProgress').value),paused);
  $('solutionPause').click();for(let i=0;i<100&&$('raceStatus').textContent!=='SOLUTION · ARRÊT FINAL';i++)await flush();
  assert.equal($('raceStatus').textContent,'SOLUTION · ARRÊT FINAL');assert.equal($('movesStat').textContent,'12');assert.equal($('vectorStat').textContent,'( 0, 0 )');assert.equal($('gameDialog').open,false);
  assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).records,before.records);assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).session.actions,before.session.actions);
  $('solutionReplay').click();assert.equal($('movesStat').textContent,'00');$('solveBtn').click();await flush();assert.equal($('solutionPanel').hidden,true);assert.equal($('movesStat').textContent,moves);assert.equal($('raceStatus').textContent,'ENTRAÎNEMENT');
});

test('Solveur : annulation, changement de circuit et recherche limitée ne lancent pas de fausse solution',async()=>{
  $('restartBtn').click();$('solveBtn').click();const pending=workers.at(-1);$('solveBtn').click();await flush();assert.equal(pending.stopped,true);assert.equal($('solutionPanel').hidden,true);assert.equal($('raceStatus').textContent,'SUR LA GRILLE');
  $('solveBtn').click();const obsolete=workers.at(-1);doc.querySelectorAll('.track-card')[2].click();await flush();await flush();assert.equal(obsolete.stopped,true);assert.equal($('trackTitle').textContent,'Double déclic');assert.equal($('solutionPanel').hidden,true);
  workerResult={limited:true,explored:400000};$('solveBtn').click();await flush();await flush();assert.equal($('solutionPanel').hidden,true);assert.match($('toast').textContent,/aucune solution optimale ne peut être garantie/);assert.equal($('raceStatus').textContent,'SUR LA GRILLE');
  workerResult=null;$('solveBtn').click();await flush();await flush();doc.querySelectorAll('[data-view]')[1].click();await flush();assert.equal($('solutionPanel').hidden,true);assert.equal($('editorView').hidden,false);
});

test('La démonstration anime les six minimums de bout en bout sans créer de record',async()=>{
  window.matchMedia=()=>({matches:false});
  const records=JSON.parse(store.get(STORAGE_KEY)).records;
  for(const [i,minimum]of [8,12,16,18,26,40].entries()){
    doc.querySelectorAll('.track-card')[i].click();await flush();$('solveBtn').click();await flush();await flush();
    assert.equal($('raceStatus').textContent,'SOLUTION · LECTURE');assert.match($('solutionStatus').textContent,new RegExp(`Minimum : ${minimum} coups`));
    for(let j=0;j<200&&$('raceStatus').textContent!=='SOLUTION · ARRÊT FINAL';j++)await flush();
    assert.equal($('raceStatus').textContent,'SOLUTION · ARRÊT FINAL');assert.equal($('movesStat').textContent,String(minimum).padStart(2,'0'));assert.equal($('vectorStat').textContent,'( 0, 0 )');assert.equal($('gameDialog').open,false);
    $('solveBtn').click();assert.equal($('raceStatus').textContent,'SUR LA GRILLE');assert.equal($('movesStat').textContent,'00');
  }
  assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).records,records);window.matchMedia=()=>({matches:true});
});

const tool=name=>doc.querySelectorAll('[data-tool]').find(b=>b.dataset.tool===name).click();
const draft=()=>JSON.parse(store.get(STORAGE_KEY)).draft.blocks;
const editorCameraFor=blocks=>fitCamera(makeTrack(blocks),900,480,true);
function editorPointer(name,point,cam,options={}){const p=screen(point,cam);$('editorCanvas').dispatch(name,{button:0,pointerId:7,clientX:p[0],clientY:p[1],...options});}
function editorClick(point,cam,options={}){editorPointer('pointerdown',point,cam,options);editorPointer('pointerup',point,cam,options);}
function editorDrag(from,to,cam,options={}){editorPointer('pointerdown',from,cam,options);editorPointer('pointermove',to,cam,options);editorPointer('pointerup',to,cam,options);}
async function emptyEditor(){doc.querySelectorAll('[data-view]')[1].click();await flush();$('newTrackBtn').click();$('dialogActions').children[0].click();return editorCameraFor([]);}

test('Édition directe : sélection, curseur de bord, glissement, annulation unique et champs liés',async()=>{
  doc.querySelectorAll('.track-card')[0].click();await flush();doc.querySelectorAll('[data-view]')[1].click();await flush();$('loadCurrentBtn').click();
  const cam=editorCameraFor(draft());editorClick([2,7],cam);assert.match($('selectionTitle').textContent,/Route droite/);assert.equal($('blockWidth').value,'5');
  editorPointer('pointermove',[4+1/3,6],cam);assert.equal($('editorCanvas').style.cursor,'ew-resize');
  editorPointer('pointerdown',[4+1/3,6],cam);editorPointer('pointermove',[5+1/3,6],cam);editorPointer('pointermove',[6+1/3,6],cam);editorPointer('pointerup',[7+1/3,6],cam);
  assert.equal(draft()[0].right,7);assert.equal(draft()[0].left,0);assert.equal($('blockWidth').value,'8');
  $('editorUndo').click();assert.equal(draft()[0].right,4);$('editorRedo').click();assert.equal(draft()[0].right,7);
  editorClick([2,7],cam);$('blockWidth').value='9';$('blockWidth').dispatch('input');$('blockWidth').value='10';$('blockWidth').dispatch('input');$('blockWidth').dispatch('change');assert.equal(draft()[0].right,9);
  $('editorUndo').click();assert.equal(draft()[0].right,7);editorClick([2,7],cam);$('blockWidth').value='0';$('blockWidth').dispatch('input');assert.match($('editorFeedback').textContent,/dimension/);assert.equal(draft()[0].right,7);$('blockWidth').dispatch('blur');
  editorDrag([2,7],[5,9],cam);assert.deepEqual(draft()[0],{block_style:'StraightRoadBlock',left:3,right:10,bottom:2,top:16,is_vertical:true});
  const before=draft();editorPointer('pointerdown',[5,9],cam);editorPointer('pointermove',[9,10],cam);$('editorCanvas').dispatch('pointercancel');assert.deepEqual(draft(),before);assert.equal($('blockWidth').value,'8');
  $('rotateBtn').click();assert.equal(draft()[0].is_vertical,false);assert.equal(draft()[0].right,17);$('editorUndo').click();assert.deepEqual(draft(),before);
  editorClick([5,9],cam);$('deleteBlockBtn').click();assert.equal(draft().length,2);$('editorUndo').click();assert.deepEqual(draft(),before);
});

test('Blocs superposés : Alt + clic permet de sélectionner la route sous le départ',async()=>{
  $('loadCurrentBtn').click();const cam=editorCameraFor(draft());editorClick([2,0],cam);assert.match($('selectionTitle').textContent,/Départ/);editorClick([2,0],cam,{altKey:true});assert.match($('selectionTitle').textContent,/Route droite/);
});

test('Plume réelle : création par clic-glissé, modification des points/tangentes et circuit testable',async()=>{
  const cam=await emptyEditor();tool('pen');$('blockWidth').value='3';$('blockWidth').dispatch('input');
  editorDrag([0,0],[0,3],cam);editorDrag([8,8],[11,8],cam);editorClick([16,0],cam);assert.equal($('finishPenBtn').disabled,false);$('finishPenBtn').click();
  assert.equal(draft().length,1);assert.equal(draft()[0].block_style,'BezierRoadBlock');assert.deepEqual(draft()[0].nodes[0].out,[0,3]);assert.deepEqual(draft()[0].nodes[1].in,[5,8]);assert.match($('selectionTitle').textContent,/Tracé à la plume/);
  editorDrag([8,8],[9,9],cam);assert.deepEqual(draft()[0].nodes[1].point,[9,9]);assert.deepEqual(draft()[0].nodes[1].out,[12,9]);
  editorDrag([16,0],[18,3],cam,{altKey:true});assert.deepEqual(draft()[0].nodes[2].out,[18,3]);assert.deepEqual(draft()[0].nodes[2].in,[14,-3]);
  editorPointer('pointermove',[18,3],cam);assert.equal($('editorCanvas').style.cursor,'crosshair');editorDrag([18,3],[19,4],cam,{altKey:true});assert.deepEqual(draft()[0].nodes[2].in,[14,-3]);assert.deepEqual(draft()[0].nodes[2].out,[19,4]);
  $('editorUndo').click();assert.deepEqual(draft()[0].nodes[2].out,[18,3]);
  tool('start');editorClick([-1,0],cam);tool('finish');editorClick([15,0],cam);assert.equal(draft().length,3);
  $('testTrackBtn').click();await flush();await flush();assert.equal($('raceView').hidden,false);assert.equal($('trackTitle').textContent,'Mon nouveau tracé');assert.notEqual($('goldStat').textContent,'— coups');
});

test('Plume : fermer une boucle, annuler/rétablir et abandonner un tracé inachevé',async()=>{
  const cam=await emptyEditor();tool('pen');for(const p of [[0,0],[8,0],[8,8],[0,8]])editorClick(p,cam);editorClick([0,0],cam);assert.equal(draft()[0].closed,true);assert.equal(draft()[0].nodes.length,4);
  $('editorUndo').click();assert.equal(draft().length,0);$('editorRedo').click();assert.equal(draft()[0].closed,true);
  tool('pen');editorClick([-4,-4],cam);editorClick([-4,-8],cam);$('editorUndo').click();assert.match($('penCount').textContent,/1 point/);$('cancelPenBtn').click();assert.match($('penCount').textContent,/0 point/);assert.equal(draft().length,1);
});

test('Les raccourcis restent cohérents pendant un geste à la plume ou une modification',async()=>{
  const cam=await emptyEditor();tool('pen');editorClick([0,0],cam);editorPointer('pointerdown',[8,0],cam);editorPointer('pointermove',[8,3],cam);doc.dispatch('keydown',{key:'Enter',target:$('editorCanvas')});editorPointer('pointerup',[8,3],cam);assert.equal(draft().length,1);assert.deepEqual(draft()[0].nodes[1].out,[8,3]);
  const before=draft();editorPointer('pointerdown',[0,0],cam);editorPointer('pointermove',[2,2],cam);doc.dispatch('keydown',{key:'Escape',target:$('editorCanvas')});editorPointer('pointerup',[2,2],cam);assert.deepEqual(draft(),before);
  editorPointer('pointerdown',[0,0],cam);editorPointer('pointermove',[2,2],cam);doc.dispatch('keydown',{key:'Delete',target:$('editorCanvas')});editorPointer('pointerup',[2,2],cam);assert.equal(draft().length,0);$('editorUndo').click();assert.deepEqual(draft(),before);
});

const shortcut=(shift=false,target=$('editorCanvas'))=>doc.dispatch('keydown',{key:shift?'Z':'z',ctrlKey:true,shiftKey:shift,target});
test('Ctrl+Z / Ctrl+Maj+Z : modifications, reset annulable, plume et champs natifs',async()=>{
  const cam=await emptyEditor();tool('straight');$('blockWidth').value='5';$('blockLength').value='12';editorClick([0,0],cam);editorPointer('pointerdown',[4+1/3,6],cam);editorPointer('pointerup',[7+1/3,6],cam);assert.equal(draft()[0].right,7);
  shortcut();assert.equal(draft()[0].right,4);shortcut(true);assert.equal(draft()[0].right,7);
  editorClick([2,6],cam);$('resetBlockBtn').click();assert.equal(draft()[0].right,4);shortcut();assert.equal(draft()[0].right,7);shortcut(true);assert.equal(draft()[0].right,4);
  const before=draft();shortcut(false,$('trackName'));assert.deepEqual(draft(),before);
  tool('pen');editorClick([-5,0],cam);editorClick([-5,8],cam);shortcut();assert.match($('penCount').textContent,/1 point/);shortcut(true);assert.match($('penCount').textContent,/2 point/);$('cancelPenBtn').click();
});
test('Magnétisme : bascule persistée, placement et déplacement libres, réactivation sans saut de sélection',async()=>{
  const cam=await emptyEditor();$('snapToggle').checked=false;$('snapToggle').dispatch('change');assert.equal(JSON.parse(store.get(STORAGE_KEY)).settings.snap,false);tool('straight');editorClick([.4,.35],cam);assert.equal(draft()[0].left,.4);assert.equal(draft()[0].bottom,.35);
  editorDrag([2,6],[2.4,6.4],cam);assert.equal(draft()[0].left,.8);assert.equal(draft()[0].bottom,.75);
  const before=draft();doc.dispatch('keydown',{key:'m',target:$('editorCanvas')});assert.equal($('snapToggle').checked,true);assert.equal(JSON.parse(store.get(STORAGE_KEY)).settings.snap,true);editorClick([2.8,6],cam);assert.deepEqual(draft(),before);
  $('resetBlockBtn').click();assert.equal(draft()[0].left,.8);assert.equal(draft()[0].bottom,.75);assert.equal(draft()[0].right,4.8);
});
test('Le départ n’a plus de bouton fixe et les raccourcis fonctionnent aussi en course',async()=>{
  doc.querySelectorAll('.track-card')[0].click();await flush();assert.equal($('startBanner'),null);assert.equal($('startBtn'),null);assert.equal($('raceStatus').textContent,'SUR LA GRILLE');
  doc.querySelectorAll('.accel-btn').find(b=>b.dataset.acceleration==='0,1').click();await flush();assert.equal($('movesStat').textContent,'01');shortcut(false,$('raceCanvas'));assert.equal($('movesStat').textContent,'00');shortcut(true,$('raceCanvas'));await flush();assert.equal($('movesStat').textContent,'01');assert.equal($('raceStatus').textContent,'ENTRAÎNEMENT');
});
test('Les circuits personnalisés apparaissent, se jouent, affichent leurs records et sont mis à jour/supprimés',async()=>{
  doc.querySelectorAll('[data-view]')[1].click();await flush();$('loadCurrentBtn').click();$('trackName').value='Sprint personnalisé';$('trackName').dispatch('input');$('saveTrackBtn').click();
  let card=doc.querySelectorAll('.custom-race-card').find(b=>b.textContent.includes('Sprint personnalisé'));assert(card);assert.equal(Number($('customRaceCount').textContent),JSON.parse(store.get(STORAGE_KEY)).saved.length);card.click();await flush();await flush();assert.equal($('raceView').hidden,false);assert.equal($('trackTitle').textContent,'Sprint personnalisé');assert.equal($('startBtn'),null);assert.equal($('goldStat').textContent,'8 coups');
  const saved=JSON.parse(store.get(STORAGE_KEY)).saved.find(s=>s.name==='Sprint personnalisé'),t=makeTrack(saved.blocks),r=solve(t,initialState(t.starts[2]));beginRace();for(const a of r.actions){doc.querySelectorAll('.accel-btn').find(b=>b.dataset.acceleration===a.join(',')).click();await flush();}
  assert.equal($('gameDialog').open,true);assert(JSON.parse(store.get(STORAGE_KEY)).records[`custom:${saved.id}:${(await import('../storage.js')).fingerprint(saved.blocks)}`]);assert.match(doc.querySelectorAll('.custom-race-card').find(b=>b.textContent.includes('Sprint personnalisé')).textContent,/Record : 8 coups/);$('dialogClose').click();
  doc.querySelectorAll('[data-view]')[1].click();await flush();doc.querySelectorAll('.saved-track').find(b=>b.textContent.includes('Sprint personnalisé')).children[1].click();$('trackName').value='Sprint renommé';$('trackName').dispatch('input');$('saveTrackBtn').click();assert(doc.querySelectorAll('.custom-race-card').some(b=>b.textContent.includes('Sprint renommé')));assert(!doc.querySelectorAll('.custom-race-card').some(b=>b.textContent.includes('Sprint personnalisé')));
  doc.querySelectorAll('.saved-track').find(b=>b.textContent.includes('Sprint renommé')).children[2].click();$('dialogActions').children[0].click();assert(!doc.querySelectorAll('.custom-race-card').some(b=>b.textContent.includes('Sprint renommé')));
  const cam=await emptyEditor();tool('straight');editorClick([0,0],cam);$('trackName').value='Tracé incomplet';$('trackName').dispatch('input');$('saveTrackBtn').click();card=doc.querySelectorAll('.custom-race-card').find(b=>b.textContent.includes('Tracé incomplet'));assert.match(card.textContent,/À compléter/);card.click();assert.equal($('editorView').hidden,false);assert.match($('toast').textContent,/départ/);
});

test('Le principe est une fenêtre au lancement, sans onglet, et le choix du départ reste disponible',async()=>{
  assert.equal(doc.querySelectorAll('[data-view]').length,2);assert.equal($('guideView'),null);assert.equal($('introDialog').tagName,'DIALOG');
  doc.querySelectorAll('.track-card')[0].click();await flush();const t=builtins(JSON.parse(original))[0],cam=fitCamera(t,640,480),canvas=$('raceCanvas');
  $('helpBtn').click();assert.equal($('introDialog').open,true);const before=JSON.parse(store.get(STORAGE_KEY)).session;doc.querySelectorAll('.accel-btn').find(b=>b.dataset.acceleration==='0,1').click();assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).session,before);$('guidePlayBtn').click();assert.equal($('introDialog').open,false);
  const click=point=>{const p=screen(point,cam);for(const event of ['pointerdown','pointerup'])canvas.dispatch(event,{button:0,pointerId:1,clientX:p[0],clientY:p[1]});};
  click([1,0]);let session=JSON.parse(store.get(STORAGE_KEY)).session;assert.deepEqual(session.start,[1,0]);assert.equal(session.started,false);assert.equal(session.actions.length,0);
  click([1,1]);await flush();session=JSON.parse(store.get(STORAGE_KEY)).session;assert.equal(session.started,true);assert.deepEqual(session.start,[1,0]);assert.deepEqual(session.actions,[[0,1]]);assert.equal($('movesStat').textContent,'01');assert.equal($('startBtn'),null);assert(!doc.querySelector('.arena-bottom').textContent.includes('VITESSE 0'));
});

test('FR/EN et clair/sombre changent à chaud sans perdre la course ni les noms personnels',async()=>{
  const before=JSON.parse(store.get(STORAGE_KEY)),names=before.saved.map(s=>s.name);$('helpBtn').click();$('introLanguageBtn').click();assert.equal($('introDialog').open,true);assert.equal(doc.documentElement.getAttribute('lang'),'en');assert.match($('introTitle').textContent,/Speed is a choice/);assert.equal($('trackTitle').textContent,'First momentum');assert.match($('hintBtn').textContent,/Give me a hint/);assert.match(doc.querySelectorAll('[data-view]')[1].textContent,/Editor/);assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).saved.map(s=>s.name),names);
  $('introClose').click();assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).session.actions,before.session.actions);assert.equal($('movesStat').textContent,'01');$('themeBtn').click();assert.equal(doc.documentElement.getAttribute('data-theme'),'light');assert.equal(JSON.parse(store.get(STORAGE_KEY)).settings.theme,'light');assert.equal($('themeBtn').getAttribute('aria-label'),'Switch to dark theme');assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).session.actions,before.session.actions);
  $('hintBtn').click();await flush();await flush();assert.match($('toast').textContent,/Hint:/);$('solveBtn').click();await flush();await flush();assert.match($('solutionStatus').textContent,/Minimum: 8 moves/);assert.equal($('solutionPause').textContent,'Play');
  $('languageBtn').click();assert.equal(doc.documentElement.getAttribute('lang'),'fr');assert.match($('solutionStatus').textContent,/Minimum : 8 coups/);assert.equal($('solutionPause').textContent,'Lire');$('solveBtn').click();assert.equal($('movesStat').textContent,'01');assert.equal($('trackTitle').textContent,'Premier élan');
  $('languageBtn').click();doc.querySelectorAll('[data-view]')[1].click();await flush();$('newTrackBtn').click();assert.equal($('dialogKicker').textContent,'EDITOR');assert.equal($('dialogTitle').textContent,'A new line.');assert.match($('dialogActions').textContent,/Keep editing my track/);$('dialogActions').children[1].click();$('languageBtn').click();
  $('themeBtn').click();assert.equal(doc.documentElement.getAttribute('data-theme'),'dark');assert.equal(JSON.parse(store.get(STORAGE_KEY)).settings.language,'fr');assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).saved.map(s=>s.name),names);assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)).records,before.records);
});
