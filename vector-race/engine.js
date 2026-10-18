import { tr } from './i18n.js';
// Vector Race — GPL-3.0. Pure rules shared by the UI, solver and tests.
import { pathGeometry, pathContains, pathIntersections } from './path-geometry.js';
export const BORDER = 1 / 3;
const EPS = 1e-8;
export const key = p => `${p[0]},${p[1]}`;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const clone = value => JSON.parse(JSON.stringify(value));
export const ACCELERATIONS = [-1, 0, 1].flatMap(y => [-1, 0, 1].map(x => [x, y]));

export function boundsOf(b) {
  if (b.block_style === 'BezierRoadBlock') return pathGeometry(b).bounds;
  if (b.block_style === 'StraightRoadBlock') return [b.left - BORDER, b.bottom - BORDER, b.right + BORDER, b.top + BORDER];
  if (b.block_style === 'StartFinishBlock') {
    const [x, y] = b.start_pos;
    return [x - BORDER, y - BORDER, x + (b.is_vertical ? b.width - 1 : 0) + BORDER, y + (b.is_vertical ? 0 : b.width - 1) + BORDER];
  }
  const [x, y] = b.center, [rx, ry] = b.outside_rad.map(r => r + BORDER);
  return [x - (b.angle === 90 || b.angle === 180 ? rx : 0), y - (b.angle >= 180 ? ry : 0), x + (b.angle === 0 || b.angle === 270 ? rx : 0), y + (b.angle < 180 ? ry : 0)];
}

export function contains(b, p) {
  const [l, bottom, r, t] = boundsOf(b), [x, y] = p;
  if (x < l - EPS || x > r + EPS || y < bottom - EPS || y > t + EPS) return false;
  if (b.block_style === 'BezierRoadBlock') return pathContains(b,p);
  if (b.block_style !== 'EllipsisTurnBlock') return true;
  const dx = x - b.center[0], dy = y - b.center[1];
  return dx ** 2 / (b.outside_rad[0] + BORDER) ** 2 + dy ** 2 / (b.outside_rad[1] + BORDER) ** 2 <= 1 + EPS &&
    dx ** 2 / (b.inside_rad[0] - BORDER) ** 2 + dy ** 2 / (b.inside_rad[1] - BORDER) ** 2 >= 1 - EPS;
}

function intersections(block, p, delta, ts) {
  if(block.block_style==='BezierRoadBlock'){pathIntersections(block,p,delta,ts);return;}
  const [l, bottom, r, t] = boundsOf(block);
  for (const [axis, v] of [[0, l], [0, r], [1, bottom], [1, t]]) {
    if (delta[axis] !== 0) {
      const q = (v - p[axis]) / delta[axis];
      if (q > 0 && q < 1) ts.push(q);
    }
  }
  if (block.block_style !== 'EllipsisTurnBlock') return;
  for (const radius of [block.inside_rad.map(x => x - BORDER), block.outside_rad.map(x => x + BORDER)]) {
    const x = (p[0] - block.center[0]) / radius[0], y = (p[1] - block.center[1]) / radius[1];
    const dx = delta[0] / radius[0], dy = delta[1] / radius[1];
    const a = dx * dx + dy * dy, b = 2 * (x * dx + y * dy), c = x * x + y * y - 1, disc = b * b - 4 * a * c;
    if (a > 0 && disc >= 0) for (const q of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) if (q > 0 && q < 1) ts.push(q);
  }
}

/** Exact interval classification of a segment against the union of blocks.
 * Endpoints alone, integer intermediate points, or coarse samples would allow shortcuts through walls.
 */
export function segmentAllowed(track, from, to) {
  if (!track.allowed.has(key(from)) || !track.allowed.has(key(to))) return false;
  const delta = [to[0] - from[0], to[1] - from[1]];
  if (!delta[0] && !delta[1]) return true;
  const minX = Math.min(from[0], to[0]), maxX = Math.max(from[0], to[0]), minY = Math.min(from[1], to[1]), maxY = Math.max(from[1], to[1]);
  const blocks = track.blocks.filter(b => { const q = boundsOf(b); return q[0] <= maxX && q[2] >= minX && q[1] <= maxY && q[3] >= minY; });
  const ts = [0, 1];
  for (const b of blocks) intersections(b, from, delta, ts);
  ts.sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] < EPS) continue;
    const t = (ts[i] + ts[i - 1]) / 2, p = [from[0] + t * delta[0], from[1] + t * delta[1]];
    if (!blocks.some(b => contains(b, p))) return false;
  }
  return true;
}

export function linePositions(block) {
  return Array.from({ length: block.width }, (_, i) => [block.start_pos[0] + (block.is_vertical ? i : 0), block.start_pos[1] + (block.is_vertical ? 0 : i)]);
}

export function makeTrack(blocks, meta = {}) {
  const checked = validateBlocks(blocks), allowed = new Set(), starts = [], finishes = [];
  for (const b of checked) {
    const q = boundsOf(b);
    for (let x = Math.ceil(q[0]); x <= Math.floor(q[2]); x++) for (let y = Math.ceil(q[1]); y <= Math.floor(q[3]); y++) if (contains(b, [x, y])) allowed.add(key([x, y]));
    if (b.block_style === 'StartFinishBlock') (b.is_start ? starts : finishes).push(...linePositions(b));
  }
  if (allowed.size > 15000) throw new Error(tr("engine.circuit.trop.grand.limite.de.15.000.points"));
  const bounds = checked.reduce((a, b) => { const q = boundsOf(b); return [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]);
  if (!checked.length) bounds.splice(0, 4, -10, -10, 10, 10);
  return { ...meta, blocks: checked, allowed, starts, finishes, finishSet: new Set(finishes.map(key)), bounds };
}

export function validateBlocks(raw) {
  if (!Array.isArray(raw) || raw.length > 300) throw new Error(tr("engine.un.circuit.doit.contenir.au.maximum.300.blocs"));
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const numeric = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  const coord = v => Array.isArray(v) && v.length === 2 && v.every(n => integer(n, -120, 120));
  const freeCoord = v => Array.isArray(v) && v.length === 2 && v.every(n => numeric(n,-120,120));
  return raw.map(b => {
    if (!b || typeof b !== 'object') throw new Error(tr("engine.bloc.invalide"));
    if(b.block_style==='BezierRoadBlock'){
      const point=(p,limit)=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=limit);
      if(!numeric(b.width,1,40)||typeof b.closed!=='boolean'||!Array.isArray(b.nodes)||b.nodes.length<2||b.nodes.length>64||b.closed&&b.nodes.length<3||b.nodes.some(n=>!n||!point(n.point,120)||!point(n.in,180)||!point(n.out,180)))throw new Error(tr("engine.trace.a.la.plume.invalide.2.a.64.points.largeur.de.1"));
      const result={block_style:b.block_style,width:b.width,closed:b.closed,nodes:b.nodes.map(n=>({point:[...n.point],in:[...n.in],out:[...n.out]}))};pathGeometry(result);return result;
    }
    if (b.block_style === 'StraightRoadBlock') {
      if (![b.left, b.right, b.bottom, b.top].every(n => numeric(n, -120, 120)) || b.right < b.left || b.top < b.bottom || typeof b.is_vertical !== 'boolean') throw new Error(tr("engine.dimensions.de.route.invalides"));
      return { block_style: b.block_style, left: b.left, right: b.right, bottom: b.bottom, top: b.top, is_vertical: b.is_vertical };
    }
    if (b.block_style === 'StartFinishBlock') {
      if (!coord(b.start_pos) || !integer(b.width, 1, 40) || [b.is_vertical, b.is_left_or_down, b.is_start].some(n => typeof n !== 'boolean')) throw new Error(tr("engine.ligne.de.depart.ou.darrivee.invalide"));
      return { block_style: b.block_style, start_pos: [...b.start_pos], width: b.width, is_vertical: b.is_vertical, is_left_or_down: b.is_left_or_down, is_start: b.is_start };
    }
    if (b.block_style === 'EllipsisTurnBlock') {
      if (!freeCoord(b.center) || ![0, 90, 180, 270].includes(b.angle) || ![b.inside_rad, b.outside_rad].every(v => Array.isArray(v) && v.length === 2 && v.every(n => numeric(n, 1, 60))) || b.outside_rad.some((n, i) => n < b.inside_rad[i])) throw new Error(tr("engine.rayons.du.virage.invalides"));
      return { block_style: b.block_style, center: [...b.center], angle: b.angle, inside_rad: [...b.inside_rad], outside_rad: [...b.outside_rad] };
    }
    throw new Error(tr("engine.type.de.bloc.trk.inconnu"));
  });
}

export function parseTrack(text) {
  if (text.length > 500000) throw new Error(tr("app.fichier.trop.volumineux.500.ko.maximum"));
  let raw;
  try { raw = JSON.parse(text); } catch {
    // The supplied prototype .trk uses Python True/False despite its JSON reader.
    // Convert only unquoted literal tokens; never evaluate imported code.
    const normalized = text.replace(/"(?:\\.|[^"\\])*"|\b(?:True|False|None)\b/g, token => ({ True: 'true', False: 'false', None: 'null' })[token] || token);
    try { raw = JSON.parse(normalized); } catch { throw new Error(tr("engine.ce.fichier.ne.contient.pas.un.circuit.json.valide")); }
  }
  const blocks = Array.isArray(raw) ? raw : raw?.blocks;
  return makeTrack(blocks, { name: typeof raw?.name === 'string' ? raw.name.slice(0, 40) : tr("engine.circuit.importe") });
}

export function initialState(pos) { return { pos: [...pos], velocity: [0, 0], moves: 0, status: 'racing', history: [[...pos]], actions: [] }; }
export function candidate(track, state, acceleration) {
  const velocity = add(state.velocity, acceleration), pos = add(state.pos, velocity);
  const safe = segmentAllowed(track, state.pos, pos);
  return { acceleration, velocity, pos, safe, win: safe && track.finishSet.has(key(pos)) && velocity.every(v => v === 0) };
}
export function move(track, state, acceleration) {
  if (state.status !== 'racing') return state;
  if (!Array.isArray(acceleration) || acceleration.length !== 2 || !acceleration.every(v => [-1, 0, 1].includes(v))) throw new Error(tr("engine.acceleration.invalide"));
  const next = candidate(track, state, acceleration);
  return { pos: next.pos, velocity: next.velocity, moves: state.moves + 1, status: !next.safe ? 'crashed' : next.win ? 'won' : 'racing', history: [...state.history, next.pos], actions: [...state.actions, [...acceleration]] };
}

export function validatePlayable(track) {
  if (!track.starts.length) return tr("engine.ajoute.une.ligne.de.depart");
  if (!track.finishes.length) return tr("engine.ajoute.une.ligne.darrivee");
  if (track.starts.some(p => track.finishSet.has(key(p)))) return tr("engine.le.depart.et.larrivee.doivent.etre.distincts");
  const visited = new Set(track.starts.map(key)), queue = [...track.starts];
  for (let i = 0; i < queue.length; i++) for (const a of ACCELERATIONS) {
    const q = add(queue[i], a), k = key(q);
    if (!visited.has(k) && track.allowed.has(k) && segmentAllowed(track, queue[i], q)) { visited.add(k); queue.push(q); }
  }
  if (!track.finishes.some(p => visited.has(key(p)))) return tr("engine.le.depart.et.larrivee.ne.sont.pas.relies.par.la.piste");
  return null;
}

/** Breadth-first shortest path in (x,y,vx,vy); every edge costs one turn. */
export function solve(track, start = null, maxStates = 400000) {
  const positions = start ? [start.pos] : track.starts;
  const nodes = positions.map(pos => ({ pos, velocity: start?.velocity || [0, 0], parent: -1, action: null }));
  const stateKey = s => `${key(s.pos)},${key(s.velocity)}`;
  const visited = new Set(nodes.map(stateKey)), edges = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const s = nodes[i];
    if (track.finishSet.has(key(s.pos)) && s.velocity.every(v => v === 0)) {
      const actions = []; let n = i;
      while (nodes[n].parent !== -1) { actions.push(nodes[n].action); n = nodes[n].parent; }
      return { actions: actions.reverse(), start: nodes[n].pos, explored: nodes.length };
    }
    for (const a of ACCELERATIONS) {
      const v = add(s.velocity, a), p = add(s.pos, v), k = `${key(p)},${key(v)}`;
      if (!track.allowed.has(key(p)) || visited.has(k)) continue;
      const ek = [key(s.pos), key(p)].sort().join(':');
      let safe = edges.get(ek);
      if (safe === undefined) { safe = segmentAllowed(track, s.pos, p); edges.set(ek, safe); }
      if (!safe) continue;
      visited.add(k); nodes.push({ pos: p, velocity: v, parent: i, action: a });
      if (nodes.length >= maxStates) return { limited: true, explored: nodes.length };
    }
  }
  return { impossible: true, explored: nodes.length };
}

export const rect = (left, right, bottom, top, is_vertical = true) => ({ block_style: 'StraightRoadBlock', left, right, bottom, top, is_vertical });
export const line = (x, y, width, is_start, is_vertical = true) => ({ block_style: 'StartFinishBlock', start_pos: [x, y], width, is_start, is_vertical, is_left_or_down: !is_start });
export const turn = (center, angle, inside_rad, outside_rad) => ({ block_style: 'EllipsisTurnBlock', center, angle, inside_rad, outside_rad });
