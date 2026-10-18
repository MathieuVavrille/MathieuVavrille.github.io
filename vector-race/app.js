import { tr, setLocale, getLocale, applyTranslations, relocalize, number, literal } from './i18n.js';
import { themeColor } from './palette.js';
import { ACCELERATIONS, add, key, clone, makeTrack, initialState, candidate, move, parseTrack, rect, line, turn, contains, validatePlayable } from './engine.js';
import { builtins } from './tracks.js';
import { fitCamera, screen, world, render } from './renderer.js';
import { loadData, saveData, replay, verifiedRecord, recordKey } from './storage.js';
import { blockTool, hitResize, resizeBlock, translateBlock, rotateBlock, blockDimensions, setBlockDimensions, resetBlock, magneticPoint, editReference, precise } from './editor-geometry.js';

const $ = id => document.getElementById(id);
const GOLD = [8, 12, 16, 18, 26, 40];
const signed = n => `${n>0?'+':''}${number(n,Number.isInteger(n)?0:2)}`;
const fmt = p => `( ${signed(p[0])}, ${signed(p[1])} )`;
let storage;
try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw new Error(tr("app.storage.unavailable")); } }; }
const data = loadData(storage);
setLocale(data.settings.language);
let tracks = [], track, state, started = false, assisted = false, currentView = 'race', hover = null, hintAction = null, busy = false, animation = null, camera, editorCamera, resizePending = false, storageWarned = false;
let editor = { blocks: [], name: tr("app.mon.premier.trace"), tool: 'select', rotation: 0, point: null, history: [], future: [], savedId: null, selected: -1, activeHandle: null }, editorTrack = makeTrack([]), jobId = 0;
let editorGesture=null,fieldSnapshot=null,penDraft=null,snapGuides=null;
const customMinimums=new Map();
let racePointer = null, padPointer = null, solution = null;
let raceFuture=[];
const raceCanvas = $('raceCanvas'), editorCanvas = $('editorCanvas');
let toastTimer,pendingHint=false;
let dialogModel=null;
function toast(message, error = false) { $('toast').textContent = relocalize(message);$('toast').classList.toggle('error', error);$('toast').hidden = false;clearTimeout(toastTimer);toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 4200); }
function persist() { if (!saveData(storage, data) && !storageWarned) { storageWarned = true;toast(tr("app.la.sauvegarde.locale.est.indisponible.exporte.tes.circuits.pour.les.conserver"), true); } }
function saveSession() {
  if (track?.id !== 'test') data.session = { trackId: track.id, signature: recordKey(track), start: state.history[0], actions: state.actions, started, assisted };
  persist();
}
function recordFor(t) { return verifiedRecord(t, data.records[recordKey(t)]); }
function medal(t, moves) { if (!t.gold) return { name: tr("app.trace.termine"), symbol: '⚑' };return moves <= t.gold ? { name: tr("app.medaille.dor"), symbol: '✦', tier: 'gold' } : moves <= t.gold + 3 ? { name: tr("app.medaille.dargent"), symbol: '◇', tier: 'silver' } : { name: tr("app.medaille.de.bronze"), symbol: '◈', tier: 'bronze' }; }

let audioContext;
function sound(type = 'move') {
  if (!data.settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();audioContext.resume();
    const notes = type === 'won' ? [440, 554, 659, 880] : type === 'crashed' ? [150, 90] : [260 + Math.min(state.moves, 12) * 18];
    notes.forEach((n, i) => { const o = audioContext.createOscillator(), g = audioContext.createGain(), t = audioContext.currentTime + i * .09;o.type = 'sine';o.frequency.setValueAtTime(n, t);g.gain.setValueAtTime(.0001, t);g.gain.exponentialRampToValueAtTime(.045, t + .015);g.gain.exponentialRampToValueAtTime(.0001, t + .16);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t + .18); });
  } catch { /* Sound is optional; gameplay remains available. */ }
}
function updateSoundButton() { $('soundBtn').setAttribute('aria-label', data.settings.sound ? tr("app.desactiver.le.son") : tr("app.activer.le.son"));$('soundBtn').title = data.settings.sound ? tr("app.desactiver.le.son") : tr("app.activer.le.son");$('soundIcon').textContent = data.settings.sound ? '♫' : '♪';$('soundBtn').style.color = data.settings.sound ? 'var(--lime)' : ''; }

function trackThumb(t) {
  const [l,b,r,top] = t.bounds, scale = Math.min(32 / (r-l+1), 29 / (top-b+1));
  const p = q => `${(19 + (q[0]-(l+r)/2)*scale).toFixed(2)},${(17 - (q[1]-(b+top)/2)*scale).toFixed(2)}`;
  let paths = '';
  for (const block of t.blocks.filter(b => b.block_style !== 'StartFinishBlock')) {
    if (block.block_style === 'StraightRoadBlock') {
      const from=block.is_vertical?[(block.left+block.right)/2,block.bottom]:[block.left,(block.bottom+block.top)/2];
      const to=block.is_vertical?[(block.left+block.right)/2,block.top]:[block.right,(block.bottom+block.top)/2];paths += `<path d="M${p(from)}L${p(to)}"/>`;
    }
    else if(block.block_style==='BezierRoadBlock'){paths+=`<path d="M${block.nodes.map(n=>p(n.point)).join('L')}"/>`;}
    else { const points = Array.from({length:13},(_,i)=>{ const a=(block.angle+i*7.5)*Math.PI/180;return [block.center[0]+(block.inside_rad[0]+block.outside_rad[0])/2*Math.cos(a),block.center[1]+(block.inside_rad[1]+block.outside_rad[1])/2*Math.sin(a)]; });paths += `<path d="M${points.map(p).join('L')}"/>`; }
  }
  return `<svg class="track-mini" viewBox="0 0 38 34" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}
function renderTrackList() {
  $('trackList').replaceChildren();let count = 0, golds = 0;
  for (const t of tracks) {
    const record = recordFor(t);if (record) { count++;if (record.moves <= t.gold) golds++; }
    const b = document.createElement('button');b.className = `track-card${track?.id === t.id ? ' selected' : ''}`;b.setAttribute('aria-pressed', String(track?.id === t.id));b.setAttribute('aria-label', `${t.number}. ${t.name}, ${t.difficulty}${record ? tr("app.record.p0.coups",{p0:(record.moves)}) : ''}`);
    b.innerHTML = `<span class="track-number">${String(t.number).padStart(2,'0')}</span><span><span class="track-name"></span><span class="track-difficulty"></span></span>${trackThumb(t)}${record ? `<span class="track-award">${medal(t,record.moves).symbol}</span>` : ''}`;
    b.querySelector('.track-name').textContent = t.name;b.querySelector('.track-difficulty').textContent = t.difficulty;b.onclick = () => chooseTrack(t);$('trackList').append(b);
  }
  $('completionCount').textContent = `${count}/6`;$('medalCount').textContent = tr("app.p0.medaille.p1.dor.p2.6.termines",{p0:(golds),p1:(golds > 1 || getLocale()==='en'&&golds!==1 ? 's' : ''),p2:(count)});
  renderCustomTracks();
}
function savedRaceTrack(item){const t=makeTrack(item.blocks,{id:`custom:${item.id}`,savedId:item.id,customNumber:data.saved.findIndex(s=>s.id===item.id)+1,name:item.name,subtitle:tr("app.ton.circuit.pret.a.prendre.le.depart"),difficulty:tr("app.circuit.personnel")});t.gold=customMinimums.get(recordKey(t))||null;return t;}
function renderCustomTracks(){
  $('customTrackList').replaceChildren();$('customRaceCount').textContent=data.saved.length;
  if(!data.saved.length){const p=document.createElement('p');p.className='custom-race-empty';p.textContent=tr("app.enregistre.un.trace.dans.latelier.pour.le.retrouver.ici");$('customTrackList').append(p);return;}
  for(const item of data.saved){const t=savedRaceTrack(item),error=validatePlayable(t),record=recordFor(t),b=document.createElement('button');b.className='custom-race-card';b.classList.toggle('selected',track?.id===t.id);b.setAttribute('aria-pressed',String(track?.id===t.id));const name=document.createElement('strong'),detail=document.createElement('span');name.textContent=item.name;detail.textContent=error?tr("app.a.completer.dans.latelier"):record?tr("app.record.p0.coups.jouer",{p0:(record.moves)}):tr("app.p0.blocs.jouer",{p0:(item.blocks.length)});b.append(name,detail);b.onclick=()=>{if(error){setView('editor');loadEditor(item.blocks,item.name,item.id);toast(error,true);return;}chooseTrack(t);updateCustomMinimum(t);};$('customTrackList').append(b);}
}
async function updateCustomMinimum(t){if(t.gold)return;try{const r=await solveInWorker(t);if(!r.actions)return;customMinimums.set(recordKey(t),r.actions.length);t.gold=r.actions.length;if(track===t){updateUI();renderCustomTracks();}}catch{/* The circuit remains playable when a minimum cannot be computed. */}}
function chooseTrack(t, preserve = false) {
  stopSolution(false);cancelAnimation();track = t;hover = null;racePointer = null;padPointer = null;raceFuture=[];hintAction = null;assisted = false;started = false;
  state = initialState(t.starts[Math.floor(t.starts.length/2)] || [0,0]);
  if (preserve && data.session?.signature === recordKey(t)) {
    const restored = replay(t,data.session.start,data.session.actions);
    if (restored) { state = restored;started = data.session.started === true;assisted = data.session.assisted === true; }
  }
  $('gameDialog').close();updateTrackHeading();
  setView('race');renderTrackList();resizeCanvas(raceCanvas, true);updateUI();saveSession();
  if (state.status !== 'racing') showOutcome(false);
}
function updateTrackHeading(){$('trackTitle').textContent = track.name;$('trackSubtitle').textContent = track.subtitle || tr("app.un.circuit.cree.dans.latelier");$('trackEyebrow').textContent = `${track.number ? String(track.number).padStart(2,'0') : tr("app.atelier")} / ${track.difficulty || tr("app.creation.libre")}`;$('trackTip').textContent = track.tip || tr("app.chaque.trajectoire.est.un.choix.anticipe.ton.freinage.pour.tarreter.sur.larrivee");}

const padDefs = [
  [-1,1,'↖','7'],[0,1,'↑','8'],[1,1,'↗','9'],[-1,0,'←','4'],[0,0,'·','5'],[1,0,'→','6'],[-1,-1,'↙','1'],[0,-1,'↓','2'],[1,-1,'↘','3']
];
const padButtons = [];
for (const [x,y,arrow,k] of padDefs) {
  const b = document.createElement('button');b.className='accel-btn';b.innerHTML=`<span class="arrow${!x&&!y?' zero':''}">${arrow}</span><span class="pad-key">${k}</span>`;b.dataset.acceleration=key([x,y]);
  b.onpointerenter=e=>{if(e.pointerType==='touch')return;padPointer=[x,y];racePointer=null;setHover(padPointer);};
  b.onfocus=()=>{racePointer=null;setHover([x,y]);};b.onpointerleave=b.onpointercancel=()=>{padPointer=null;setHover(null);};b.onblur=()=>setHover(padPointer);b.onclick=()=>play([x,y]);$('accelPad').append(b);padButtons.push(b);
}
function updateUI() {
  if (!track || !state) return;
  const displayed=solution?.states?.[Math.floor(solution.cursor)]||state;
  if(racePointer)hover=pointerAcceleration();
  $('movesStat').textContent=String(displayed.moves).padStart(2,'0');$('speedStat').textContent=number(Math.hypot(...displayed.velocity));$('vectorStat').textContent=fmt(displayed.velocity);$('goldStat').replaceChildren(document.createTextNode(track.gold ? `${track.gold} ` : '— '));const small=document.createElement('small');small.textContent=tr("app.coups");$('goldStat').append(small);
  const record=recordFor(track);$('personalBest').replaceChildren(document.createTextNode(record?`${record.moves} `:'— '));const s=document.createElement('small');s.textContent=tr("app.coups");$('personalBest').append(s);
  $('coordinateText').textContent=tr("app.x.p0.y.p1",{p0:(signed(displayed.pos[0])),p1:(signed(displayed.pos[1]))});$('turnIndicator').textContent=solution?tr("app.solution"):tr("app.tour.p0",{p0:(String(state.moves+1).padStart(2,'0'))});
  $('raceStatus').textContent=solution?(solution.phase==='calculating'?tr("app.calcul.du.minimum"):solution.phase==='complete'?tr("app.solution.arret.final"):solution.phase==='paused'?tr("app.solution.pause"):tr("app.solution.lecture")):!started?tr("app.sur.la.grille"):state.status==='won'?tr("app.trace.termine2"):state.status==='crashed'?tr("app.sortie.de.piste"):assisted?tr("app.entrainement"):tr("app.course.en.cours");
  $('undoBtn').disabled=!state.actions.length||busy||Boolean(solution);$('hintBtn').disabled=!started||state.status!=='racing'||busy||Boolean(solution)||pendingHint;
  $('solveBtn').disabled=busy&&!solution;$('solveLabel').textContent=solution?(solution.phase==='calculating'?tr("app.annuler.le.calcul"):tr("app.revenir.a.ma.course")):tr("app.voir.la.solution.optimale");$('solveBtn').setAttribute('aria-expanded',String(Boolean(solution)));$('solutionPanel').hidden=!solution;$('solverHelp').hidden=Boolean(solution);
  // Keep focus and pointer events during animation; play() already blocks extra moves.
  for(let i=0;i<padButtons.length;i++){const b=padButtons[i],a=padDefs[i].slice(0,2),n=candidate(track,state,a);b.disabled=state.status!=='racing'||Boolean(solution);b.setAttribute('aria-disabled',String(b.disabled||busy));b.classList.toggle('danger',!n.safe);b.classList.toggle('hinted',!solution&&hintAction&&key(a)===key(hintAction));b.classList.toggle('preview',!solution&&hover&&key(a)===key(hover));b.setAttribute('aria-label',tr("app.acceleration.p0.vitesse.p1.destination.p2.p3",{p0:(fmt(a)),p1:(fmt(n.velocity)),p2:(fmt(n.pos)),p3:(n.safe?tr("app.trajectoire.possible"):tr("app.sortie.de.piste2"))}));}
  updatePreview();drawRace();
}
function setHover(a){hover=solution?null:a;updatePreview();padButtons.forEach(b=>b.classList.toggle('preview',hover&&b.dataset.acceleration===key(hover)));drawRace();}
function pointerAcceleration(){
  if(!racePointer||!camera||busy||solution||state.status!=='racing')return null;
  let nearest=null,distance=20;
  for(const a of ACCELERATIONS){const p=screen(candidate(track,state,a).pos,camera),d=Math.hypot(p[0]-racePointer[0],p[1]-racePointer[1]);if(d<distance){distance=d;nearest=a;}}
  return nearest;
}
function refreshPointer(){if(racePointer)setHover(pointerAcceleration());}
function updatePreview(){
  if(solution){$('movePreview').classList.toggle('is-danger',false);const s=solution.states?.[Math.floor(solution.cursor)];$('nextVector').textContent=s?fmt(s.velocity):tr("app.recherche.du.minimum");$('nextPosition').textContent=s?tr("app.vecteur.de.la.demonstration.course.en.pause"):tr("app.tous.les.departs.sont.explores");return;}
  const n=hover&&state.status==='racing'?candidate(track,state,hover):null;
  $('movePreview').classList.toggle('is-danger',n&&!n.safe);
  $('nextVector').textContent=n?fmt(n.velocity):!started?tr("app.le.depart.tattend"):state.status==='won'?tr("app.trajectoire.accomplie"):state.status==='crashed'?tr("app.la.piste.avait.une.limite"):tr("app.choisis.une.direction");
  $('nextPosition').textContent=n?`${n.safe?n.win?tr("app.arrivee.a.larret"):tr("app.destination"):tr("app.hors.piste")} : ${fmt(n.pos)}`:!started?tr("app.choisis.ton.point.de.depart.puis.une.premiere.acceleration"):tr("app.survole.une.fleche.pour.previsualiser");
}
function startRace(focusCanvas=true){if(started||solution)return;started=true;sound();if(camera.scale<15){camera.scale=24;camera.cx=state.pos[0];camera.cy=state.pos[1]+4;}updateUI();saveSession();if(focusCanvas)raceCanvas.focus({preventScroll:true});}
function cancelAnimation(){if(animation)cancelAnimationFrame(animation.frame);animation=null;busy=false;}
function play(a,redo=false){
  if(state.status!=='racing'||busy||solution||$('gameDialog').open||$('introDialog').open)return;
  if(!started)startRace(false);
  if(!redo)raceFuture=[];
  const from=[...state.pos];state=move(track,state,a);hintAction=null;busy=true;sound(state.status==='racing'?'move':state.status);updateUI();saveSession();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,duration=reduced?0:190,start=performance.now();
  animation={frame:0};
  const tick=now=>{const t=duration?Math.min((now-start)/duration,1):1,ease=1-(1-t)**3;drawRace([from[0]+(state.pos[0]-from[0])*ease,from[1]+(state.pos[1]-from[1])*ease]);if(t<1){animation.frame=requestAnimationFrame(tick);}else{animation=null;busy=false;keepPlayerVisible();updateUI();if(state.status!=='racing')showOutcome(true);else if(!ACCELERATIONS.some(a=>candidate(track,state,a).safe))showTrapped();}};
  animation.frame=requestAnimationFrame(tick);
}
function keepPlayerVisible(){const p=screen(state.pos,camera),next=screen(add(state.pos,state.velocity),camera);if([p,next].some(q=>q[0]<50||q[0]>camera.w-50||q[1]<65||q[1]>camera.h-60)){camera.cx=state.pos[0]+state.velocity[0]*.6;camera.cy=state.pos[1]+state.velocity[1]*.6;}}
function undo(){if(solution||!state.actions.length)return;raceFuture.push(state.actions.at(-1));cancelAnimation();$('gameDialog').close();assisted=true;hintAction=null;const actions=state.actions.slice(0,-1);state=replay(track,state.history[0],actions);started=true;keepPlayerVisible();updateUI();saveSession();toast(tr("app.dernier.coup.annule.cette.tentative.passe.en.entrainement"));}
function redoRace(){if(!raceFuture.length||busy||solution||state.status!=='racing'||$('gameDialog').open)return;play(raceFuture.pop(),true);}
function restart(){const start=[...state.history[0]];stopSolution(false);cancelAnimation();$('gameDialog').close();state=initialState(start);started=false;assisted=false;hover=null;racePointer=null;raceFuture=[];hintAction=null;resizeCanvas(raceCanvas,true);updateUI();saveSession();}

function showDialog({kicker,art,title,text,actions,extra='',danger=false}){
  dialogModel={kicker,art,title,text,actions,extra,danger};
  $('dialogKicker').textContent=kicker;$('dialogArt').textContent=art;$('dialogArt').classList.toggle('danger',danger);$('dialogTitle').textContent=title;$('dialogText').textContent=text;$('dialogExtra').innerHTML=extra;$('dialogActions').replaceChildren();
  for(const [label,action,primary] of actions){const b=document.createElement('button');b.className=primary?'primary':'secondary';b.textContent=label;b.onclick=()=>{$('gameDialog').close();action();};$('dialogActions').append(b);}
  if(!$('gameDialog').open&&!$('introDialog').open)$('gameDialog').showModal();
}
function showOutcome(save){
  if(state.status==='crashed')return showDialog({kicker:tr("app.sortie.de.piste"),art:'↯',title:tr("app.un.peu.trop.delan"),text:tr("app.ton.segment.a.quitte.la.route.il.faut.parfois.ralentir.pour.trouver"),danger:true,actions:[[tr("app.reprendre.le.dernier.coup.entrainement"),undo,true],[tr("app.recommencer.la.course"),restart]]});
  const award=medal(track,state.moves),previous=recordFor(track),isRecord=!assisted&&(!previous||state.moves<previous.moves);
  if(save&&!assisted&&isRecord){data.records[recordKey(track)]={moves:state.moves,start:state.history[0],actions:state.actions,date:new Date().toISOString()};persist();renderTrackList();updateUI();}
  const next=tracks.find(t=>t.number===track.number+1);
  const actions=[];if(next)actions.push([tr("app.le.circuit.suivant"),()=>chooseTrack(next),true]);else if(track.id==='test')actions.push([tr("app.retour.a.mon.atelier"),()=>setView('editor'),true]);else actions.push([tr("app.retour.au.premier.circuit"),()=>chooseTrack(tracks[0]),true]);actions.push([tr("app.ameliorer.ma.trajectoire"),restart]);
  showDialog({kicker:assisted?tr("app.entrainement.termine"):isRecord?tr("app.nouveau.record.personnel"):award.name.toUpperCase(),art:assisted?'⚑':award.symbol,title:assisted?tr("app.le.trace.est.dans.la.tete"):tr("app.ligne.parfaite.arret.net"),text:assisted?tr("app.bien.joue.relance.une.course.sans.annulation.indice.ni.solution.pour.enregistrer"):tr("app.p0.tu.as.rejoint.larrivee.et.annule.ton.inertie.p1",{p0:(award.name),p1:(track.gold&&state.moves>track.gold?tr("app.le.meilleur.trace.tient.en.p0.coups",{p0:(track.gold)}):'')}),extra:tr("app.ta.course.p0.objectif.or.p1.vitesse.finale.0",{p0:(state.moves),p1:(track.gold||'—')}),actions});
}
function showTrapped(){showDialog({kicker:tr("app.freinage.trop.tardif"),art:'↯',title:tr("app.linertie.a.le.dernier.mot"),text:tr("app.aucune.des.neuf.accelerations.ne.garde.ta.prochaine.trajectoire.sur.la.piste"),danger:true,actions:[[tr("app.reprendre.le.dernier.coup.entrainement"),undo,true],[tr("app.recommencer"),restart]]});}
function solveInWorker(t,start=null,signal=null){
  return new Promise((resolve,reject)=>{const id=++jobId;let worker,timer;try{worker=new Worker(new URL('./solver-worker.js',import.meta.url),{type:'module'});}catch{reject(new Error(tr("app.le.solveur.est.indisponible.dans.ce.navigateur.le.jeu.reste.jouable")));return;}
    const finish=(result,error)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result);};
    const abort=()=>finish(null,new Error(tr("app.calcul.annule")));
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(null,new Error(tr("app.calcul.interrompu.ce.circuit.est.trop.complexe.pour.une.verification.rapide"))),20000);
    worker.onmessage=({data:d})=>{if(d.requestId!==id)return;finish(d.result,d.error?new Error(d.error):null);};worker.onerror=()=>finish(null,new Error(tr("app.le.calcul.du.trace.a.echoue")));worker.postMessage({requestId:id,blocks:t.blocks,start,locale:getLocale()});
  });
}
async function hint(){
  if(!started||busy||solution||state.status!=='racing')return;assisted=true;pendingHint=true;saveSession();updateUI();const snapshot=state,selected=track;$('hintBtn').disabled=true;$('hintBtn').textContent=tr("app.calcul.de.la.trajectoire");
  try{const r=await solveInWorker(track,state);if(snapshot!==state||selected!==track||solution)return;if(r.actions?.length){hintAction=r.actions[0];racePointer=null;setHover(hintAction);updateUI();toast(tr("app.indice.accelere.de.p0.le.bouton.est.surligne",{p0:(fmt(hintAction))}));}else toast(r.limited?tr("app.recherche.limitee.essaie.de.ralentir"):tr("app.il.nexiste.plus.de.trajectoire.gagnante.depuis.cette.position.reprends.un.coup"),true);}
  catch(e){toast(e.message,true);}finally{pendingHint=false;$('hintBtn').innerHTML=tr("app.un.coup.de.pouce");updateUI();}
}

// The demonstration has its own state: it never plays or saves a player's record.
function stopSolution(refresh=true){
  if(!solution)return;const previous=solution;solution=null;previous.controller.abort();if(previous.frame!==null)cancelAnimationFrame(previous.frame);camera=previous.camera;hover=null;racePointer=null;
  if(refresh){resizeCanvas(raceCanvas);updateUI();}
}
async function showOptimalSolution(){
  if(solution){stopSolution();return;}if(busy)return;
  const session={phase:'calculating',controller:new AbortController(),camera:{...camera},frame:null,cursor:0,lastTime:null,speed:Number($('solutionSpeed').value)||1};solution=session;hover=null;racePointer=null;
  $('solutionStatus').textContent=tr("app.recherche.du.minimum.sur.tous.les.departs");$('solutionProgress').removeAttribute('value');$('solutionPause').disabled=true;$('solutionReplay').disabled=true;$('solutionStep').textContent=tr("app.le.calcul.se.fait.en.arriere.plan.tu.peux.lannuler");updateUI();
  try{
    const r=await solveInWorker(track,null,session.controller.signal);if(solution!==session)return;
    if(!r.actions)throw new Error(r.limited?tr("app.limite.de.recherche.atteinte.aucune.solution.optimale.ne.peut.etre.garantie.pour"):tr("app.aucune.trajectoire.ne.permet.de.rejoindre.larrivee.a.larret"));
    const states=[initialState(r.start)];for(const a of r.actions)states.push(move(track,states.at(-1),a));
    if(states.at(-1).status!=='won')throw new Error(tr("app.la.trajectoire.calculee.na.pas.pu.etre.validee"));
    session.states=states;session.actions=r.actions;session.history=states.at(-1).history;assisted=true;hintAction=null;saveSession();
    camera=fitCamera(track,camera.w,camera.h);session.phase=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'paused':'playing';
    $('solutionProgress').max=r.actions.length;$('solutionReplay').disabled=false;updateSolution();if(session.phase==='playing')session.frame=requestAnimationFrame(animateSolution);
  }catch(e){if(solution!==session)return;stopSolution();toast(e.message,true);}
}
function updateSolution(){
  if(!solution?.states)return;const s=solution,n=s.actions.length,step=Math.floor(s.cursor),shown=s.states[step];
  $('solutionStatus').textContent=tr("app.minimum.p0.coups.p1",{p0:(n),p1:(s.phase==='complete'?tr("app.arrivee.a.vitesse.nulle"):s.phase==='paused'?tr("app.en.pause"):tr("app.coup.p0.p1",{p0:(step),p1:(n)}))});
  $('solutionProgress').value=s.cursor;$('solutionPause').disabled=s.phase==='complete';$('solutionPause').textContent=s.phase==='paused'?tr("app.lire"):tr("app.pause");
  const a=s.actions[Math.min(step,n-1)];$('solutionStep').textContent=s.phase==='complete'?tr("app.arrivee.p0.vitesse.0.0.ta.course.tattend",{p0:(fmt(shown.pos))}):tr("app.p0.p1.prochaine.acceleration.p2.demonstration.en.entrainement",{p0:(step===0?tr("app.depart"):tr("app.point.p0",{p0:(step)})),p1:(fmt(shown.pos)),p2:(fmt(a))});
  updateUI();
}
function animateSolution(now){
  const s=solution;if(!s||s.phase!=='playing')return;
  const previousStep=Math.floor(s.cursor);if(s.lastTime!==null)s.cursor=Math.min(s.actions.length,s.cursor+Math.min(now-s.lastTime,120)/650*s.speed);s.lastTime=now;
  if(s.cursor>=s.actions.length){s.phase='complete';s.frame=null;updateSolution();return;}
  if(Math.floor(s.cursor)!==previousStep)updateSolution();else{$('solutionProgress').value=s.cursor;drawRace();}
  s.frame=requestAnimationFrame(animateSolution);
}
function toggleSolution(){
  const s=solution;if(!s?.states||s.phase==='complete')return;
  if(s.phase==='playing'){s.phase='paused';cancelAnimationFrame(s.frame);s.frame=null;}else{s.phase='playing';s.lastTime=null;s.frame=requestAnimationFrame(animateSolution);}updateSolution();
}
function replaySolution(){
  if(!solution?.states)return;const s=solution;if(s.frame!==null)cancelAnimationFrame(s.frame);s.cursor=0;s.lastTime=null;s.phase='playing';updateSolution();s.frame=requestAnimationFrame(animateSolution);
}

function resizeCanvas(canvas,fit=false){
  const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);canvas.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
  if(canvas===raceCanvas){if(!camera||fit)camera=fitCamera(track,box.width,box.height);else{camera.w=box.width;camera.h=box.height;}refreshPointer();drawRace();}
  else{if(!editorCamera||fit)editorCamera=fitCamera(editorTrack,box.width,box.height,true);else{editorCamera.w=box.width;editorCamera.h=box.height;}drawEditor();}
}
function drawRace(animatedPos){
  if(!camera||!track)return;const s=solution?.states?solution:null,step=s?Math.floor(s.cursor):0,shown=s?s.states[step]:state;
  if(s&&step<s.actions.length){const from=shown.pos,to=s.states[step+1].pos,t=s.cursor-step;animatedPos=[from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t];}
  render(raceCanvas.getContext('2d'),camera,track,{state:shown,started:true,choosingStart:!started&&!solution,hover:solution?null:hover,animatedPos,demonstration:Boolean(solution),solutionPath:s?.history,ghost:!solution&&data.settings.ghost?recordFor(track)?.history:null,theme:data.settings.theme});
}
function drawEditor(){if(!editorCamera)return;let previewBlock=null;try{if(editor.point){if(editor.tool==='erase')previewBlock=[...editor.blocks].reverse().find(b=>contains(b,editor.point));else if(!['pan','select','pen'].includes(editor.tool))previewBlock=newEditorBlock();}}catch{}render(editorCanvas.getContext('2d'),editorCamera,editorTrack,{previewBlock,erasing:editor.tool==='erase',selectedBlock:editor.tool==='select'?editor.blocks[editor.selected]:null,activeHandle:editor.activeHandle,snapGuides,theme:data.settings.theme,penDraft:penDraft?{...penDraft,previewPoint:!editorGesture?editor.point:null}:null});}
function zoom(which,factor,anchor=null){let c=which==='race'?camera:editorCamera;if(!c)return;const before=anchor?world(anchor,c):null;c.scale=Math.min(75,Math.max(4,c.scale*factor));if(before){const after=world(anchor,c);c.cx+=before[0]-after[0];c.cy+=before[1]-after[1];}if(which==='race'){refreshPointer();drawRace();}else drawEditor();}
function setView(view){if(view==='guide'){openIntro();return;}if(view!=='race')stopSolution();if(view!=='editor'){cancelEditorGesture();commitFieldEdit();}currentView=view;for(const v of ['race','editor'])$(v+'View').hidden=v!==view;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(view==='race'&&track)requestAnimationFrame(()=>resizeCanvas(raceCanvas));if(view==='editor')requestAnimationFrame(()=>resizeCanvas(editorCanvas));}
function openIntro(){if(solution?.phase==='playing')toggleSolution();if($('gameDialog').open)$('gameDialog').close();if(!$('introDialog').open)$('introDialog').showModal();}
function closeIntro(){$('introDialog').close();if(state&&state.status!=='racing')showOutcome(false);else if(currentView==='race')raceCanvas.focus({preventScroll:true});}

function applyAppearance(){
  const html=document.documentElement||document.querySelector('html');html.setAttribute('data-theme',data.settings.theme);
  const light=data.settings.theme==='light',themeText=tr(light?'ui.activer.le.theme.sombre':'html.activer.le.theme.clair');$('themeBtn').textContent=light?'☾':'☀';$('themeBtn').setAttribute('aria-label',themeText);$('themeBtn').setAttribute('title',themeText);$('themeBtn').setAttribute('aria-pressed',String(light));
  const languageText=tr(getLocale()==='fr'?'html.passer.en.anglais':'ui.passer.en.francais');$('languageBtn').setAttribute('aria-label',languageText);$('languageBtn').setAttribute('title',languageText);$('introLanguageBtn').setAttribute('aria-label',languageText);$('introLanguageBtn').textContent=getLocale()==='fr'?'FR → EN':'EN → FR';
  for(const el of document.querySelectorAll('[data-locale]'))el.classList.toggle('active',el.dataset.locale===getLocale());
  for(const meta of document.querySelectorAll('meta'))if(meta.getAttribute('name')==='theme-color')meta.setAttribute('content',light?'#eef3f5':'#10151c');
}
function relocalizeTracks(){for(const t of [...tracks,...(track&&!tracks.includes(track)?[track]:[])])for(const property of ['name','subtitle','difficulty','tip'])if(typeof t[property]==='string'&&(property!=='name'||t.number))t[property]=relocalize(t[property]);}
function refreshLanguage(){
  applyTranslations();applyAppearance();relocalizeTracks();
  $('hintBtn').innerHTML=tr(pendingHint?'app.calcul.de.la.trajectoire':'app.un.coup.de.pouce');
  if(track){updateTrackHeading();renderTrackList();updateUI();}refreshEditor({save:false});renderSaved();updateSoundButton();magnetLabel();drawGuide();
  if(solution?.states)updateSolution();
  for(const id of ['toast','editorFeedback'])if($(id).textContent)$(id).textContent=relocalize($(id).textContent);
  if($('gameDialog').open&&dialogModel){const d=dialogModel;showDialog({...d,kicker:relocalize(d.kicker),title:relocalize(d.title),text:relocalize(d.text),extra:relocalize(d.extra),actions:d.actions.map(([label,action,primary])=>[relocalize(label),action,primary])});}
}
function toggleLanguage(){data.settings.language=setLocale(getLocale()==='fr'?'en':'fr');persist();refreshLanguage();}
function toggleTheme(){data.settings.theme=data.settings.theme==='dark'?'light':'dark';persist();applyAppearance();drawRace();drawEditor();drawGuide();}

function editorCheckpoint(snapshot=editor.blocks){editor.history.push(clone(snapshot));if(editor.history.length>80)editor.history.shift();editor.future=[];}
function saveDraft(){data.draft={blocks:editor.blocks,name:editor.name,savedId:editor.savedId};persist();}
function refreshEditor({fit=false,save=true}={}){
  editorTrack=makeTrack(editor.blocks);$('blockCount').textContent=tr("app.p0.bloc.p1",{p0:(editor.blocks.length),p1:(editor.blocks.length>1?'S':'')});$('editorTitle').textContent=editor.name||tr("app.circuit.sans.nom");$('trackName').value=editor.name;$('editorUndo').disabled=!editor.history.length;$('editorRedo').disabled=!editor.future.length;
  updateEditorControls();if(fit)resizeCanvas(editorCanvas,true);else drawEditor();if(save)saveDraft();
  const error=validatePlayable(editorTrack);$('validationText').textContent=error||tr("app.piste.reliee.teste.le.circuit.pour.verifier.une.arrivee.a.larret");$('validationText').classList.toggle('error',Boolean(error));
}
function dimension(id){const n=Number($(id).value),min=Number($(id).min),max=Number($(id).max),whole=$(id).step!=='any';if(!Number.isFinite(n)||whole&&!Number.isInteger(n)||n<min||n>max)throw new Error(tr("app.choisis.une.dimension.p0.entre.p1.et.p2",{p0:(whole?tr("app.entiere"):''),p1:(min),p2:(max)}));return n;}
function newEditorBlock(){
  const [x,y]=editor.point||[0,0],w=dimension('blockWidth'),length=dimension('blockLength'),r=editor.rotation%4;
  if(editor.tool==='straight'){const width=r%2?length:w,height=r%2?w:length;return rect(x,x+width-1,y,y+height-1,r%2===0);}
  if(editor.tool==='turn'){
    const rx=dimension('blockRadius'),ry=dimension('blockRadiusY'),start=dimension('turnWidthStart'),end=dimension('turnWidthEnd');
    const outside=[rx+(r%2?end:start)-1,ry+(r%2?start:end)-1];
    if(outside.some(n=>n>60))throw new Error(tr("app.rayon.interieur.largeur.1.60.maximum.sur.chaque.axe"));
    return turn([x,y],r*90,[rx,ry],outside);
  }
  const block=line(Math.round(x),Math.round(y),w,editor.tool==='start',r%2===0);block.is_left_or_down=r>=2;return block;
}
function placeBlock(){
  if(!editor.point||['pan','select','pen'].includes(editor.tool))return;
  try{
    if(editor.tool==='erase'){let i=editor.blocks.findLastIndex(b=>contains(b,editor.point));if(i===-1)return;editorCheckpoint();editor.blocks.splice(i,1);editor.selected=-1;}
    else{const b=newEditorBlock();if(editor.blocks.length>=300)throw new Error(tr("app.la.limite.de.300.blocs.est.atteinte"));makeTrack([...editor.blocks,b]);editorCheckpoint();editor.blocks.push(b);selectEditorBlock(editor.blocks.length-1);}
    refreshEditor();sound();
  }catch(e){toast(e.message,true);}
}
function rotateEditor(){cancelEditorGesture();commitFieldEdit();if(editor.tool==='select'&&editor.selected>=0){try{const blocks=clone(editor.blocks);blocks[editor.selected]=rotateBlock(blocks[editor.selected]);makeTrack(blocks);editorCheckpoint();editor.blocks=blocks;syncSelectionFields();refreshEditor();}catch(e){$('editorFeedback').textContent=e.message;}return;}editor.rotation=(editor.rotation+1)%4;$('rotationText').textContent=`${editor.rotation*90}°`;drawEditor();}
function editorUndo(){cancelEditorGesture();commitFieldEdit();if(penDraft){if(penDraft.nodes.length){penDraft.future||=[];penDraft.future.push(penDraft.nodes.pop());}updateEditorControls();drawEditor();return;}if(!editor.history.length)return;editor.future.push(clone(editor.blocks));editor.blocks=editor.history.pop();editor.selected=-1;refreshEditor();}
function editorRedo(){cancelEditorGesture();commitFieldEdit();if(penDraft){if(penDraft.future?.length)penDraft.nodes.push(penDraft.future.pop());updateEditorControls();drawEditor();return;}if(!editor.future.length)return;editor.history.push(clone(editor.blocks));editor.blocks=editor.future.pop();editor.selected=-1;refreshEditor();}
function loadEditor(blocks,name,savedId=null){cancelEditorGesture();commitFieldEdit();penDraft=null;editorCheckpoint();editor.blocks=clone(blocks);editor.name=name;editor.savedId=savedId;editor.point=null;editor.selected=-1;editor.tool='select';refreshEditor({fit:true});}

function updateEditorControls(){
  const selected=editor.tool==='select'?editor.blocks[editor.selected]:null,type=selected?blockTool(selected):editor.tool;
  document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===editor.tool);b.setAttribute('aria-pressed',String(b.dataset.tool===editor.tool));});
  $('editorDimensions').hidden=['select','erase','pan'].includes(type);$('widthLabel').hidden=type==='turn';$('lengthLabel').hidden=type!=='straight';
  for(const id of ['radiusLabel','radiusYLabel','turnWidthStartLabel','turnWidthEndLabel','turnWidthHelp'])$(id).hidden=type!=='turn';
  $('blockWidth').max=type==='pen'||type==='start'||type==='finish'?'40':'241';$('blockLength').max='241';$('blockRadius').max=$('blockRadiusY').max='60';$('turnWidthStart').max=$('turnWidthEnd').max='60';
  for(const id of ['blockWidth','blockLength','blockRadius','blockRadiusY','turnWidthStart','turnWidthEnd'])$(id).step=id==='blockWidth'&&['start','finish'].includes(type)?'1':'any';
  $('editorSelection').hidden=!selected;$('rotateBtn').disabled=editor.tool==='select'&&!selected||['pan','erase','pen'].includes(editor.tool);
  if(selected){const d=blockDimensions(selected),names={straight:tr("app.route.droite"),turn:tr("app.virage.elliptique"),start:tr("app.depart"),finish:tr("app.arrivee"),pen:tr("app.trace.a.la.plume")};$('selectionTitle').textContent=tr("app.p0.bloc.p12",{p0:(names[type]),p1:(editor.selected+1)});$('selectionDimensions').textContent=type==='turn'?tr("app.largeur.a.p0.b.p1.rayons.p2.p3",{p0:(d.start),p1:(d.end),p2:(d.rx),p3:(d.ry)}):type==='pen'?tr("app.p0.points.largeur.p1.alt.glisser.un.point.cree.ses.tangentes",{p0:(selected.nodes.length),p1:(d.width)}):tr("app.largeur.p0.p1.tire.les.bords.pour.ajuster",{p0:(d.width),p1:(d.length?tr("app.longueur.p0",{p0:(d.length)}):'')});}
  $('penPanel').hidden=editor.tool!=='pen';$('finishPenBtn').disabled=!penDraft||penDraft.nodes.length<2;$('penCount').textContent=tr("app.p0.point.s.entree.pour.terminer",{p0:(penDraft?.nodes.length||0)});
  $('editorUndo').disabled=penDraft?!penDraft.nodes.length:!editor.history.length;$('editorRedo').disabled=penDraft?!penDraft.future?.length:!editor.future.length;
  if(!editorGesture)editorCanvas.style.cursor=editor.tool==='pan'?'grab':editor.tool==='select'?'default':'crosshair';
}
function syncSelectionFields(){
  const b=editor.blocks[editor.selected];if(!b)return;const d=blockDimensions(b);editor.rotation=d.rotation;
  for(const[id,value]of Object.entries({blockWidth:d.width,blockLength:d.length,blockRadius:d.rx,blockRadiusY:d.ry,turnWidthStart:d.start,turnWidthEnd:d.end}))if(value!==undefined)$(id).value=String(precise(value));
  $('rotationText').textContent=`${editor.rotation*90}°`;
}
function selectEditorBlock(index){editor.selected=index;editor.tool='select';editor.activeHandle=null;$('editorFeedback').textContent='';syncSelectionFields();updateEditorControls();drawEditor();}
function setEditorTool(tool){cancelEditorGesture();commitFieldEdit();if(tool!=='pen')penDraft=null;editor.tool=tool;editor.selected=-1;editor.activeHandle=null;snapGuides=null;$('editorFeedback').textContent='';updateEditorControls();if(!['select','pan','erase'].includes(tool)){for(const id of ['blockWidth','blockLength','blockRadius','blockRadiusY','turnWidthStart','turnWidthEnd']){const field=$(id),value=Math.max(Number(field.min),Math.min(Number(field.max),Number(field.value)||Number(field.min)));field.value=String(field.step==='1'?Math.round(value):precise(value));}}drawEditor();}
function commitFieldEdit(){if(!fieldSnapshot)return;const before=fieldSnapshot;fieldSnapshot=null;if(JSON.stringify(before)!==JSON.stringify(editor.blocks)){editorCheckpoint(before);refreshEditor();}}
function editDimension(){
  if(editor.tool==='select'&&editor.selected>=0){
    try{const b=editor.blocks[editor.selected],type=blockTool(b),d=type==='turn'?{rx:dimension('blockRadius'),ry:dimension('blockRadiusY'),start:dimension('turnWidthStart'),end:dimension('turnWidthEnd')}:{width:dimension('blockWidth'),...(type==='straight'?{length:dimension('blockLength')}:{})};
      const blocks=clone(editor.blocks);blocks[editor.selected]=setBlockDimensions(b,d);makeTrack(blocks);fieldSnapshot||=clone(editor.blocks);editor.blocks=blocks;$('editorFeedback').textContent='';refreshEditor({save:false});
    }catch(e){$('editorFeedback').textContent=e.message;}
  }else{if(penDraft){try{penDraft.width=dimension('blockWidth');}catch{}}drawEditor();}
}
function deleteSelected(){cancelEditorGesture();commitFieldEdit();if(editor.selected<0)return;editorCheckpoint();editor.blocks.splice(editor.selected,1);editor.selected=-1;refreshEditor();}
function resetSelected(){cancelEditorGesture();commitFieldEdit();if(editor.selected<0)return;try{const blocks=clone(editor.blocks);blocks[editor.selected]=resetBlock(blocks[editor.selected]);makeTrack(blocks);if(JSON.stringify(blocks)!==JSON.stringify(editor.blocks)){editorCheckpoint();editor.blocks=blocks;}syncSelectionFields();refreshEditor();$('editorFeedback').textContent=tr("app.forme.de.base.retablie.tu.peux.annuler.cette.modification");}catch(e){$('editorFeedback').textContent=e.message;}}
function editorPoint(p,forceGrid=false){if(forceGrid){snapGuides=null;return p.map(Math.round);}const r=magneticPoint(p,editor.blocks,editorCamera?.scale||20,data.settings.snap);snapGuides=r.guides;return r.point;}
function magnetLabel(){$('snapHint').textContent=data.settings.snap?tr("app.grille.et.reperes.m"):tr("app.libre.depart.arrivee.sur.grille");}
function toggleMagnet(){cancelEditorGesture();data.settings.snap=$('snapToggle').checked;snapGuides=null;editor.point=null;magnetLabel();persist();drawEditor();}
function editorHit(p,touch=false,cycle=false){
  const position=world(p,editorCamera),tolerance=touch?18:9;
  if(!cycle&&editor.selected>=0){const handle=hitResize(editor.blocks[editor.selected],p,editorCamera,tolerance);if(handle)return{index:editor.selected,handle};}
  const hits=[];
  for(let i=editor.blocks.length-1;i>=0;i--){const b=editor.blocks[i],handle=hitResize(b,p,editorCamera,tolerance);if(contains(b,position)||handle)hits.push({index:i,handle});}
  if(cycle&&hits.length){const current=hits.findIndex(h=>h.index===editor.selected);return hits[(current+1)%hits.length];}
  return hits[0]||null;
}
function startEditorGesture(e,p){
  commitFieldEdit();
  if(editor.tool==='pen'){
    const point=editorPoint(world(p,editorCamera));if(!penDraft)penDraft={nodes:[],width:dimension('blockWidth'),future:[]};
    if(penDraft.nodes.length>=3){const first=screen(penDraft.nodes[0].point,editorCamera);if(Math.hypot(first[0]-p[0],first[1]-p[1])<12){finishPen(true);return true;}}
    if(penDraft.nodes.length>=64){toast(tr("app.64.points.maximum.par.trace"),true);return true;}
    const before=clone(penDraft);penDraft.future=[];penDraft.nodes.push({point,in:[...point],out:[...point]});editorGesture={kind:'pen',start:world(p,editorCamera),draftBefore:before,pointerId:e.pointerId};updateEditorControls();drawEditor();return true;
  }
  if(editor.tool!=='select')return false;
  const hit=editorHit(p,e.pointerType==='touch',e.altKey);selectEditorBlock(hit?.index??-1);if(!hit)return true;
  editorGesture={kind:hit.handle?'resize':'move',handle:hit.handle,start:world(p,editorCamera),original:clone(editor.blocks[hit.index]),before:clone(editor.blocks),index:hit.index,pointerId:e.pointerId};editor.activeHandle=hit.handle?.id||null;editorCanvas.style.cursor=hit.handle?.cursor||'grabbing';drawEditor();return true;
}
function updateEditorGesture(e,p){
  if(!editorGesture||e.pointerId!==editorGesture.pointerId)return;const g=editorGesture,q=world(p,editorCamera),delta=q.map((v,i)=>v-g.start[i]);
  if(g.kind==='pen'){const n=penDraft.nodes.at(-1),quantize=v=>data.settings.snap?Math.round(v*4)/4:precise(v);n.out=n.point.map((v,i)=>precise(v+quantize(delta[i])));n.in=n.point.map((v,i)=>precise(v-quantize(delta[i])));drawEditor();return;}
  if(Math.hypot(...delta)<.005)return;
  let adjusted=delta;
  if(data.settings.snap&&!(g.original.block_style==='BezierRoadBlock'&&g.handle&&!g.handle.id.startsWith('node-'))){const origin=editReference(g.original,g.handle?.id),r=magneticPoint(origin.map((v,i)=>v+delta[i]),g.before.filter((_,i)=>i!==g.index),editorCamera.scale,true);adjusted=r.point.map((v,i)=>precise(v-origin[i]));snapGuides=r.guides;}else snapGuides=null;
  try{const special=g.original.block_style==='BezierRoadBlock'&&g.handle&&!g.handle.id.startsWith('node-'),blocks=clone(g.before),modifiers={altKey:e.altKey,snap:special&&data.settings.snap};blocks[g.index]=g.kind==='move'?translateBlock(g.original,adjusted,{snap:false}):resizeBlock(g.original,g.handle.id,adjusted,modifiers);makeTrack(blocks);editor.blocks=blocks;syncSelectionFields();$('editorFeedback').textContent='';refreshEditor({save:false});}catch(e){$('editorFeedback').textContent=e.message;}
}
function endEditorGesture(){
  if(!editorGesture)return;const g=editorGesture;editorGesture=null;editor.activeHandle=null;snapGuides=null;
  if(g.kind!=='pen'&&JSON.stringify(g.before)!==JSON.stringify(editor.blocks))editorCheckpoint(g.before);
  refreshEditor({save:g.kind!=='pen'});
}
function cancelEditorGesture(){if(!editorGesture)return;const g=editorGesture;editorGesture=null;editor.activeHandle=null;snapGuides=null;if(g.kind==='pen')penDraft=g.draftBefore;else editor.blocks=g.before;syncSelectionFields();refreshEditor({save:false});}
function finishPen(closed=false){
  if(editorGesture?.kind==='pen')endEditorGesture();
  if(!penDraft||penDraft.nodes.length<2)return;
  try{const b={block_style:'BezierRoadBlock',nodes:clone(penDraft.nodes),width:penDraft.width,closed},blocks=[...editor.blocks,b];makeTrack(blocks);editorCheckpoint();editor.blocks=blocks;penDraft=null;selectEditorBlock(blocks.length-1);refreshEditor();toast(tr("app.trace.cree.deplace.ses.points.et.ses.tangentes.pour.laffiner"));}catch(e){$('editorFeedback').textContent=e.message;}
}
function renderSaved(){
  renderCustomTracks();
  $('savedTracks').replaceChildren();$('savedCount').textContent=data.saved.length;
  if(!data.saved.length){const p=document.createElement('p');p.className='empty-saved';p.textContent=tr("app.tes.circuits.enregistres.apparaitront.ici");$('savedTracks').append(p);return;}
  for(const s of data.saved){const card=document.createElement('div');card.className='saved-track';const text=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=s.name;small.textContent=tr("app.p0.blocs",{p0:(s.blocks.length)});text.append(strong,small);const open=document.createElement('button');open.textContent=tr("app.ouvrir");open.onclick=()=>loadEditor(s.blocks,s.name,s.id);const del=document.createElement('button');del.className='delete-save';del.textContent='×';del.setAttribute('aria-label',tr("app.supprimer.p0",{p0:literal(s.name)}));del.onclick=()=>showDialog({kicker:tr("app.mes.circuits"),art:'⌫',title:tr("app.supprimer.ce.trace"),text:tr("app.p0.sera.retire.de.tes.circuits.enregistres",{p0:literal(s.name)}),actions:[[tr("app.supprimer"),()=>{data.saved=data.saved.filter(t=>t.id!==s.id);if(editor.savedId===s.id)editor.savedId=null;persist();renderSaved();},true],[tr("app.conserver"),()=>{}]]});card.append(text,open,del);$('savedTracks').append(card);}
}
function saveEditor(){
  if(!editor.blocks.length)return toast(tr("app.ajoute.au.moins.un.bloc.avant.denregistrer"),true);
  if(data.saved.length>=30&&!editor.savedId)return toast(tr("app.la.limite.est.de.30.circuits.enregistres.exporte.ou.supprime.un.ancien"),true);
  editor.name=$('trackName').value.trim()||tr("app.mon.circuit");const id=editor.savedId||crypto.randomUUID();const item={id,name:editor.name,blocks:clone(editor.blocks)};const i=data.saved.findIndex(s=>s.id===id);if(i<0)data.saved.push(item);else data.saved[i]=item;editor.savedId=id;saveDraft();renderSaved();toast(tr("app.circuit.enregistre.sur.cet.appareil"));
}
async function testEditor(){
  const error=validatePlayable(editorTrack);if(error)return toast(error,true);
  const snapshot=JSON.stringify(editor.blocks),t=makeTrack(editor.blocks,{id:'test',name:editor.name||tr("app.mon.circuit"),subtitle:tr("app.cree.dans.ton.atelier"),difficulty:tr("app.creation.libre")});$('testTrackBtn').disabled=true;$('validationText').textContent=tr("app.verification.dune.trajectoire.gagnante");
  try{const result=await solveInWorker(t);if(snapshot!==JSON.stringify(editor.blocks))return toast(tr("app.le.circuit.a.change.pendant.le.calcul.relance.le.test"));if(result.impossible)return toast(tr("app.piste.reliee.mais.aucune.arrivee.a.larret.nest.possible.elargis.la.piste"),true);if(result.limited){toast(tr("app.la.verification.a.atteint.sa.limite.le.circuit.reste.testable.en.entrainement"),true);}else t.gold=result.actions.length;chooseTrack(t);}
  catch(e){toast(e.message,true);}finally{$('testTrackBtn').disabled=false;if(currentView==='editor')refreshEditor({save:false});}
}
function exportEditor(){if(!editor.blocks.length)return toast(tr("app.le.circuit.est.encore.vide"),true);const blob=new Blob([JSON.stringify(editor.blocks,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${(editor.name||tr("app.circuit")).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,50)}.trk`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(tr("app.circuit.exporte.au.format.trk"));}

function installCanvasPointer(canvas,isEditor){
  let drag=null;
  const point=e=>{const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  canvas.addEventListener('pointerdown',e=>{if(e.button===2){if(isEditor){cancelEditorGesture();rotateEditor();}return;}if(e.button!==0&&e.button!==1)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);const c=isEditor?editorCamera:camera;if(isEditor&&e.button===0&&editor.tool!=='pan'){try{if(startEditorGesture(e,point(e)))return;}catch(err){$('editorFeedback').textContent=err.message;return;}}drag={start:point(e),last:point(e),moved:false,pan:isEditor&&(e.button===1||editor.tool==='pan'),cx:c.cx,cy:c.cy};});
  canvas.addEventListener('pointermove',e=>{const p=point(e),c=isEditor?editorCamera:camera;if(!c)return;if(!isEditor)racePointer=p;
    if(isEditor&&editorGesture){updateEditorGesture(e,p);return;}
    if(drag){const dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];if(Math.hypot(dx,dy)>7)drag.moved=true;if(drag.moved&&(!isEditor||drag.pan)){c.cx=drag.cx-dx/c.scale;c.cy=drag.cy+dy/c.scale;if(isEditor)drawEditor();else{refreshPointer();drawRace();}return;}}
    const pos=world(p,c);
    if(isEditor){editor.point=editorPoint(pos,['start','finish'].includes(editor.tool));$('editorCoordinates').textContent=tr("app.x.p0.y.p1",{p0:(signed(editor.point[0])),p1:(signed(editor.point[1]))});if(editor.tool==='select'){snapGuides=null;const hit=editorHit(p,e.pointerType==='touch');editorCanvas.style.cursor=hit?.handle?.cursor||(hit?'move':'default');editor.activeHandle=hit?.index===editor.selected?hit.handle?.id||null:null;}drawEditor();}
    else refreshPointer();
  });
  canvas.addEventListener('pointerup',e=>{if(isEditor&&editorGesture){if(e.pointerId!==editorGesture.pointerId)return;updateEditorGesture(e,point(e));endEditorGesture();canvas.releasePointerCapture?.(e.pointerId);return;}if(!drag)return;const d=drag;drag=null;if(d.moved||d.pan)return;const p=point(e),c=isEditor?editorCamera:camera;if(isEditor){editor.point=editorPoint(world(p,c),['start','finish'].includes(editor.tool));placeBlock();}else{racePointer=e.pointerType==='touch'?null:p;if(solution||busy)return;if($('introDialog').open)return;if(!started){let best=null,dist=Math.min(12,c.scale*.38);for(const q of track.starts){const sp=screen(q,c),len=Math.hypot(sp[0]-p[0],sp[1]-p[1]);if(len<dist){dist=len;best=q;}}if(best){state=initialState(best);updateUI();saveSession();return;}}racePointer=p;const best=pointerAcceleration();if(e.pointerType==='touch')racePointer=null;if(best)play(best);}});
  const cancel=()=>{drag=null;if(isEditor)cancelEditorGesture();else{racePointer=null;setHover(null);}};canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('pointerleave',()=>{if(isEditor){if(!editorGesture){editor.point=null;editor.activeHandle=null;snapGuides=null;drawEditor();}}else{racePointer=null;setHover(null);}});canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();if(isEditor&&editorGesture)return;if(!isEditor)racePointer=point(e);zoom(isEditor?'editor':'race',e.deltaY<0?1.13:1/1.13,point(e));},{passive:false});
}
installCanvasPointer(raceCanvas,false);installCanvasPointer(editorCanvas,true);

document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelector('.brand').onclick=e=>{e.preventDefault();setView('race');};
$('soundBtn').onclick=()=>{data.settings.sound=!data.settings.sound;updateSoundButton();persist();sound();};$('helpBtn').onclick=()=>setView('guide');$('customTrackBtn').onclick=()=>setView('editor');$('guidePlayBtn').onclick=closeIntro;$('restartBtn').onclick=restart;$('undoBtn').onclick=undo;$('hintBtn').onclick=hint;$('dialogClose').onclick=()=>$('gameDialog').close();
$('solveBtn').onclick=showOptimalSolution;$('solutionPause').onclick=toggleSolution;$('solutionReplay').onclick=replaySolution;$('solutionSpeed').onchange=()=>{if(solution)solution.speed=Number($('solutionSpeed').value)||1;};
$('practiceInfo').onclick=()=>toast(tr("app.or.minimum.de.coups.argent.minimum.3.bronze.arrivee.valide.annulations.indices"));
$('ghostToggle').checked=data.settings.ghost;$('ghostToggle').onchange=()=>{data.settings.ghost=$('ghostToggle').checked;persist();drawRace();};
$('zoomIn').onclick=()=>zoom('race',1.25);$('zoomOut').onclick=()=>zoom('race',.8);$('fitBtn').onclick=()=>{resizeCanvas(raceCanvas,true);refreshPointer();};$('editorZoomIn').onclick=()=>zoom('editor',1.25);$('editorZoomOut').onclick=()=>zoom('editor',.8);$('editorFit').onclick=()=>resizeCanvas(editorCanvas,true);
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setEditorTool(b.dataset.tool));
for(const id of ['blockWidth','blockLength','blockRadius','blockRadiusY','turnWidthStart','turnWidthEnd']){$(id).onfocus=()=>cancelEditorGesture();$(id).oninput=editDimension;$(id).onchange=()=>{commitFieldEdit();syncSelectionFields();};$(id).onblur=()=>{commitFieldEdit();syncSelectionFields();};}
$('resetBlockBtn').onclick=resetSelected;$('snapToggle').checked=data.settings.snap;magnetLabel();$('snapToggle').onchange=toggleMagnet;
$('deleteBlockBtn').onclick=deleteSelected;$('deselectBtn').onclick=()=>{cancelEditorGesture();selectEditorBlock(-1);};$('finishPenBtn').onclick=()=>finishPen();$('cancelPenBtn').onclick=()=>{cancelEditorGesture();penDraft=null;updateEditorControls();drawEditor();};
$('trackName').oninput=()=>{editor.name=$('trackName').value;$('editorTitle').textContent=editor.name||tr("app.circuit.sans.nom");saveDraft();};$('rotateBtn').onclick=rotateEditor;$('editorUndo').onclick=editorUndo;$('editorRedo').onclick=editorRedo;$('saveTrackBtn').onclick=saveEditor;$('testTrackBtn').onclick=testEditor;$('exportBtn').onclick=exportEditor;$('importBtn').onclick=()=>$('importFile').click();
$('newTrackBtn').onclick=()=>showDialog({kicker:tr("app.latelier"),art:'＋',title:tr("app.une.nouvelle.ligne"),text:tr("app.un.atelier.vide.tattend.ton.trace.actuel.restera.recuperable.avec.annuler.enregistre"),actions:[[tr("app.creer.un.circuit.vide"),()=>loadEditor([],tr("app.mon.nouveau.trace")),true],[tr("app.continuer.mon.trace"),()=>{}]]});
$('loadCurrentBtn').onclick=()=>{loadEditor(track.blocks,tr("app.p0.remix",{p0:(track.name)}));toast(tr("app.circuit.copie.tu.peux.maintenant.le.modifier"));};
$('importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>500000)throw new Error(tr("app.fichier.trop.volumineux.500.ko.maximum"));const t=parseTrack(await file.text());loadEditor(t.blocks,file.name.replace(/\.(trk|json)$/i,'').slice(0,40));toast(tr("app.circuit.importe.ajoute.ou.ajuste.tes.blocs"));}catch(err){toast(err.message,true);}finally{e.target.value='';}};
document.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;
  if($('gameDialog').open||$('introDialog').open)return;
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='z'){
    if(currentView==='editor'){e.preventDefault();e.shiftKey?editorRedo():editorUndo();}
    else if(currentView==='race'&&!solution){e.preventDefault();e.shiftKey?redoRace():undo();}
    return;
  }
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(currentView==='editor'){
    if(e.key==='Escape'){e.preventDefault();if(editorGesture)cancelEditorGesture();else if(penDraft){penDraft=null;updateEditorControls();drawEditor();}else selectEditorBlock(-1);}
    else if(e.key==='Enter'&&editor.tool==='pen'){e.preventDefault();finishPen();}
    else if(e.key.toLowerCase()==='r'){e.preventDefault();rotateEditor();}
    else if(e.key==='Backspace'){e.preventDefault();editorUndo();}
    else if(e.key==='Delete'){e.preventDefault();deleteSelected();}
    else if(e.key.toLowerCase()==='v'){e.preventDefault();setEditorTool('select');}
    else if(e.key.toLowerCase()==='p'){e.preventDefault();setEditorTool('pen');}
    else if(e.key.toLowerCase()==='m'){e.preventDefault();$('snapToggle').checked=!$('snapToggle').checked;toggleMagnet();}
    return;
  }
  if(currentView!=='race')return;
  if(solution){if(e.key==='Escape'){e.preventDefault();stopSolution();}else if(e.key===' '){e.preventDefault();if(e.target.tagName!=='BUTTON')toggleSolution();}else if(e.key.toLowerCase()==='r'){e.preventDefault();replaySolution();}return;}
  if(e.key==='Escape'){e.preventDefault();showDialog({kicker:tr("app.pause2"),art:'Ⅱ',title:tr("app.le.temps.est.a.toi"),text:tr("app.la.course.est.au.tour.par.tour.rien.ne.bouge.tant.que"),actions:[[tr("app.reprendre.la.course"),()=>{},true],[tr("app.recommencer"),restart],[tr("app.voir.les.regles"),()=>setView('guide')]]});return;}
  if(e.key==='Backspace'){e.preventDefault();undo();return;}
  if(e.key.toLowerCase()==='r'){e.preventDefault();restart();return;}
  if((e.key==='Enter'||e.key===' ')&&!started&&e.target.tagName!=='BUTTON'){e.preventDefault();startRace();return;}
  const map={Numpad7:[-1,1],Numpad8:[0,1],Numpad9:[1,1],Numpad4:[-1,0],Numpad5:[0,0],Numpad6:[1,0],Numpad1:[-1,-1],Numpad2:[0,-1],Numpad3:[1,-1],KeyQ:[-1,1],KeyW:[0,1],KeyE:[1,1],KeyA:[-1,0],KeyS:[0,0],KeyD:[1,0],KeyZ:[-1,-1],KeyX:[0,-1],KeyC:[1,-1]};
  const a=map[e.code];if(a&&!e.repeat){e.preventDefault();if(!started)startRace();play(a);}
});
window.addEventListener('resize',()=>{if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;if(currentView==='race')resizeCanvas(raceCanvas);if(currentView==='editor')resizeCanvas(editorCanvas);});});

function drawGuide(){
  const grid='<defs><pattern id="g" width="23" height="23" patternUnits="userSpaceOnUse"><path d="M23 0H0V23" fill="none" stroke="#31404c" stroke-width=".7"/></pattern><marker id="ar" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 5 2.5 0 5" fill="#c5f575"/></marker></defs><rect x="0" y="0" width="280" height="135" fill="url(#g)"/>';
  const svg=(inside)=>(`<svg viewBox="0 0 280 135" aria-hidden="true">${grid}${inside}</svg>`).replace(/#[a-fA-F0-9]{3,8}\b/g,value=>themeColor(value,data.settings.theme));
  $('guideOne').innerHTML=svg('<path d="M48 100 117 77 186 54" fill="none" stroke="#c5f575" stroke-width="2" marker-end="url(#ar)"/><circle cx="48" cy="100" r="4" fill="#91a4ad"/><circle cx="117" cy="77" r="6" fill="#c5f575"/><path d="M186 54 255 31" fill="none" stroke="#c5f57566" stroke-dasharray="4 4"/><text x="100" y="39" fill="#b6c7d0" font-size="11" font-family="monospace">v = (3, 1)</text>');
  $('guideTwo').innerHTML=svg('<path d="M48 100 140 54" fill="none" stroke="#c5f575" stroke-width="2" marker-end="url(#ar)"/><circle cx="48" cy="100" r="6" fill="#c5f575"/><g fill="#bfd98e"><circle cx="117" cy="31" r="3"/><circle cx="140" cy="31" r="3"/><circle cx="163" cy="31" r="3"/><circle cx="117" cy="54" r="3"/><circle cx="140" cy="54" r="6"/><circle cx="163" cy="54" r="3"/><circle cx="117" cy="77" r="3"/><circle cx="140" cy="77" r="3"/><circle cx="163" cy="77" r="3"/></g><text x="179" y="109" fill="#b6c7d0" font-size="10" font-family="monospace">'+tr('guide.9.choix')+'</text>');
  $('guideThree').innerHTML=svg('<path d="M25 77 117 77 186 77 232 77 255 77" fill="none" stroke="#c5f575" stroke-width="2"/><g fill="#c5f575"><circle cx="25" cy="77" r="3"/><circle cx="117" cy="77" r="3"/><circle cx="186" cy="77" r="3"/><circle cx="232" cy="77" r="3"/><circle cx="255" cy="77" r="6"/></g><path d="M255 25V123" stroke="#ff956e" stroke-width="2"/><text x="160" y="32" fill="#ffb399" font-size="11" font-family="monospace">v = (0, 0)</text>');
}

async function init(){
  try{
    const response=await fetch('./original.trk');if(!response.ok)throw new Error(tr("app.le.circuit.dorigine.na.pas.pu.etre.charge"));const original=parseTrack(await response.text());tracks=builtins(original.blocks);tracks.forEach((t,i)=>t.gold=GOLD[i]);relocalizeTracks();
    data.saved=data.saved.filter(s=>{try{return typeof s.id==='string'&&typeof s.name==='string'&&makeTrack(s.blocks);}catch{return false;}});
    if(data.draft){try{editor.blocks=makeTrack(data.draft.blocks).blocks;editor.name=typeof data.draft.name==='string'?data.draft.name.slice(0,40):tr("app.mon.circuit");editor.savedId=data.draft.savedId;}catch{data.draft=null;}}
    refreshEditor({save:false});renderSaved();drawGuide();updateSoundButton();const savedInitial=data.saved.find(s=>`custom:${s.id}`===data.session?.trackId),initial=tracks.find(t=>t.id===data.session?.trackId)||(savedInitial?savedRaceTrack(savedInitial):tracks[1]);chooseTrack(initial,true);if(initial.savedId)updateCustomMinimum(initial);$('loading').hidden=true;
    if(new URLSearchParams(location.search).has('launch')){try{const r=await fetch('./launch.trk');if(!r.ok)throw new Error(tr("app.le.circuit.local.na.pas.pu.etre.charge"));const custom=parseTrack(await r.text());loadEditor(custom.blocks,custom.name);if(location.hash==='#atelier')setView('editor');else{const error=validatePlayable(custom);if(error){setView('editor');toast(error,true);}else chooseTrack(makeTrack(custom.blocks,{id:'local',name:custom.name,difficulty:tr("app.circuit.local")}));}}catch(e){toast(e.message,true);}}
    else if(location.hash==='#atelier')setView('editor');
    openIntro();
  }catch(e){$('loading').replaceChildren();const title=document.createElement('strong');title.textContent=tr("app.la.grille.na.pas.pu.se.charger");const p=document.createElement('p');p.textContent=e.message;const b=document.createElement('button');b.className='primary';b.textContent=tr("app.reessayer");b.onclick=()=>location.reload();$('loading').append(title,p,b);}
}
$('themeBtn').onclick=toggleTheme;$('languageBtn').onclick=toggleLanguage;$('introLanguageBtn').onclick=toggleLanguage;applyTranslations();applyAppearance();$('hintBtn').innerHTML=tr('app.un.coup.de.pouce');
$('introClose').onclick=closeIntro;$('introDialog').addEventListener('cancel',e=>{e.preventDefault();closeIntro();});
init();
