import { tr } from './i18n.js';
import { themeColor } from './palette.js';
import { BORDER, boundsOf, contains, key, ACCELERATIONS, candidate, add } from './engine.js';
import { pathGeometry } from './path-geometry.js';
import { editHandles } from './editor-geometry.js';

export const COLORS = { lime: '#c5f575', orange: '#ff956e', red: '#f27979' };
let renderTheme='dark';
const ink=value=>themeColor(value,renderTheme);
export function fitCamera(track, width, height, editor = false) {
  const [l, b, r, t] = track.bounds, usableW = Math.max(150, width - 125), usableH = Math.max(160, height - (editor ? 110 : 155));
  return { cx: (l + r) / 2, cy: (b + t) / 2 - (editor ? 0 : 25 / Math.min(usableW / (r - l + 3), usableH / (t - b + 3), 34)), scale: Math.min(usableW / (r - l + 3), usableH / (t - b + 3), editor ? 32 : 34), w: width, h: height };
}
export function screen(p, c) { return [c.w / 2 + (p[0] - c.cx) * c.scale, c.h / 2 - (p[1] - c.cy) * c.scale]; }
export function world(p, c) { return [(p[0] - c.w / 2) / c.scale + c.cx, (c.h / 2 - p[1]) / c.scale + c.cy]; }

export function blockPath(ctx, b) {
  ctx.beginPath();
  if(b.block_style==='BezierRoadBlock'){
    const{points,radius}=pathGeometry(b);
    for(let i=1;i<points.length;i++){const a=points[i-1],z=points[i],angle=Math.atan2(z[1]-a[1],z[0]-a[0]),nx=-Math.sin(angle)*radius,ny=Math.cos(angle)*radius;
      ctx.moveTo(a[0]+nx,a[1]+ny);ctx.lineTo(z[0]+nx,z[1]+ny);ctx.arc(z[0],z[1],radius,angle+Math.PI/2,angle-Math.PI/2,true);ctx.lineTo(a[0]-nx,a[1]-ny);ctx.arc(a[0],a[1],radius,angle-Math.PI/2,angle+Math.PI/2,true);ctx.closePath();}
  }else if (b.block_style === 'EllipsisTurnBlock') {
    const a = b.angle * Math.PI / 180, [x, y] = b.center;
    ctx.ellipse(x, y, b.outside_rad[0] + BORDER, b.outside_rad[1] + BORDER, 0, a, a + Math.PI / 2);
    ctx.ellipse(x, y, b.inside_rad[0] - BORDER, b.inside_rad[1] - BORDER, 0, a + Math.PI / 2, a, true);
    ctx.closePath();
  } else { const q = boundsOf(b); ctx.rect(q[0], q[1], q[2] - q[0], q[3] - q[1]); }
}

export function render(ctx, camera, track, options = {}) {
  renderTheme=options.theme||'dark';
  const c = camera, w = c.w, h = c.h, s = c.scale;
  ctx.clearRect(0, 0, w, h);
  ctx.save();ctx.translate(w / 2 - c.cx * s, h / 2 + c.cy * s);ctx.scale(s, -s);
  const left = c.cx - w / (2 * s), right = c.cx + w / (2 * s), bottom = c.cy - h / (2 * s), top = c.cy + h / (2 * s);
  const step = s < 9 ? 5 : 1;
  ctx.lineWidth = .65 / s;ctx.strokeStyle = ink('#24303c70');ctx.beginPath();
  for (let x = Math.floor(left / step) * step; x <= right; x += step) { ctx.moveTo(x, bottom);ctx.lineTo(x, top); }
  for (let y = Math.floor(bottom / step) * step; y <= top; y += step) { ctx.moveTo(left, y);ctx.lineTo(right, y); }
  ctx.stroke();
  // Outline first, then fill the entire union. Fills cover internal block seams,
  // leaving only the exterior half of the boundary stroke visible.
  ctx.strokeStyle = ink('#728795');ctx.lineWidth = 2.6 / s;
  for (const b of track.blocks) { blockPath(ctx, b);ctx.stroke(); }
  ctx.fillStyle = ink('#293745');
  for (const b of track.blocks) { blockPath(ctx, b);ctx.fill(); }
  if (s >= 5) {
    ctx.fillStyle = ink('#697f8b');ctx.beginPath();
    for (const k of track.allowed) { const p = k.split(',').map(Number);if (p[0] < left || p[0] > right || p[1] < bottom || p[1] > top) continue;ctx.moveTo(p[0] + 1.05 / s, p[1]);ctx.arc(p[0], p[1], 1.05 / s, 0, Math.PI * 2); }
    ctx.fill();
  }
  for (const b of track.blocks.filter(b => b.block_style === 'StartFinishBlock')) {
    const [x, y] = b.start_pos;
    ctx.fillStyle = b.is_start ? ink('#c5f57540') : ink('#ff956e55');
    if (b.is_vertical) ctx.fillRect(x - BORDER, y - .22, b.width - 1 + 2 * BORDER, .44);
    else ctx.fillRect(x - .22, y - BORDER, .44, b.width - 1 + 2 * BORDER);
    ctx.strokeStyle = b.is_start ? ink(COLORS.lime) : ink(COLORS.orange);ctx.lineWidth = 2.5 / s;ctx.beginPath();ctx.moveTo(x - (b.is_vertical ? BORDER : 0), y - (b.is_vertical ? 0 : BORDER));ctx.lineTo(x + (b.is_vertical ? b.width - 1 + BORDER : 0), y + (b.is_vertical ? 0 : b.width - 1 + BORDER));ctx.stroke();
    if (!b.is_start) {
      ctx.fillStyle = ink(COLORS.orange);
      for (let i = 0; i < b.width * 2; i++) if (i % 2 === 0) { if (b.is_vertical) ctx.fillRect(x - .25 + i * .5, y - .24, .25, .48);else ctx.fillRect(x - .24, y - .25 + i * .5, .48, .25); }
    }
  }
  if (options.ghost?.length > 1) drawHistory(ctx, options.ghost, ink('#7d9d9955'), 1.4 / s, true, s);
  if (options.solutionPath?.length > 1) drawHistory(ctx, options.solutionPath, ink('#ff956e66'), 1.8 / s, true, s);
  const st = options.state;
  if (st) {
    if (st.history.length > 1) drawHistory(ctx, st.history, ink('#c5f575aa'), 2.1 / s, false, s);
    if (options.demonstration && options.animatedPos) drawHistory(ctx, [st.pos, options.animatedPos], ink(COLORS.lime), 2.8 / s, false, s);
    if (options.started && st.status === 'racing' && !options.demonstration) {
      const projected = add(st.pos, st.velocity);
      ctx.setLineDash([4 / s, 5 / s]);ctx.strokeStyle = ink('#9dafba55');ctx.lineWidth = 1 / s;ctx.beginPath();ctx.moveTo(...st.pos);ctx.lineTo(...projected);ctx.stroke();ctx.setLineDash([]);
      ctx.strokeStyle = ink('#bccbdc77');ctx.lineWidth = 1 / s;ctx.beginPath();ctx.rect(projected[0] - .16, projected[1] - .16, .32, .32);ctx.stroke();
      for (const a of ACCELERATIONS) {
        const n = candidate(track, st, a), active = options.hover && key(a) === key(options.hover);
        ctx.fillStyle = n.safe ? (active ? ink(COLORS.lime) : ink('#b8e789')) : ink('#e8808038');ctx.strokeStyle = n.safe ? ink('#c5f57588') : ink('#eb939366');ctx.lineWidth = 1 / s;
        ctx.beginPath();ctx.arc(...n.pos, (active ? 6.5 : 4.3) / s, 0, Math.PI * 2);ctx.fill();ctx.stroke();
        if (!n.safe) { ctx.strokeStyle = ink('#ff9898aa');ctx.beginPath();ctx.moveTo(n.pos[0] - 2 / s, n.pos[1] - 2 / s);ctx.lineTo(n.pos[0] + 2 / s, n.pos[1] + 2 / s);ctx.moveTo(n.pos[0] - 2 / s, n.pos[1] + 2 / s);ctx.lineTo(n.pos[0] + 2 / s, n.pos[1] - 2 / s);ctx.stroke(); }
      }
      if (options.hover) {
        const n = candidate(track, st, options.hover);
        arrow(ctx, st.pos, n.pos, n.safe ? ink(COLORS.lime) : ink(COLORS.red), 2 / s, s);
      } else if (st.velocity.some(v => v)) arrow(ctx, st.pos, projected, ink('#c5f57555'), 1.5 / s, s);
    }
    if (options.choosingStart) for (const p of track.starts) {
      ctx.strokeStyle = ink('#c5f575aa');ctx.fillStyle = ink('#14251f');ctx.lineWidth = 1 / s;ctx.beginPath();ctx.arc(...p, 4.5 / s, 0, Math.PI * 2);ctx.fill();ctx.stroke();
    }
    const playerPos = options.animatedPos || st.pos;
    ctx.beginPath();ctx.fillStyle = st.status === 'crashed' ? ink('#f2797922') : ink('#c5f57512');ctx.arc(...playerPos, 15 / s, 0, Math.PI * 2);ctx.fill();
    ctx.beginPath();ctx.fillStyle = st.status === 'crashed' ? ink(COLORS.red) : ink(COLORS.lime);ctx.strokeStyle = ink('#122019');ctx.lineWidth = 2 / s;ctx.arc(...playerPos, 6.5 / s, 0, Math.PI * 2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.fillStyle = ink('#f4ffd2');ctx.arc(...playerPos, 2 / s, 0, Math.PI * 2);ctx.fill();
  }
  if (options.previewBlock) {
    ctx.globalAlpha = .45;ctx.fillStyle = options.erasing ? ink(COLORS.red) : ink(COLORS.lime);blockPath(ctx, options.previewBlock);ctx.fill();ctx.globalAlpha = 1;ctx.strokeStyle = ink(COLORS.lime);ctx.lineWidth = 1 / s;blockPath(ctx, options.previewBlock);ctx.stroke();
  }
  if(options.selectedBlock){ctx.fillStyle=ink('#c5f57517');blockPath(ctx,options.selectedBlock);ctx.fill();ctx.strokeStyle=ink(COLORS.lime);ctx.lineWidth=2/s;ctx.setLineDash([6/s,4/s]);blockPath(ctx,options.selectedBlock);ctx.stroke();ctx.setLineDash([]);}
  ctx.restore();
  if(options.snapGuides){ctx.save();ctx.strokeStyle=ink('#ff956eaa');ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.beginPath();if(options.snapGuides.x!==undefined){const[x]=screen([options.snapGuides.x,0],c);ctx.moveTo(x,0);ctx.lineTo(x,h);}if(options.snapGuides.y!==undefined){const[,y]=screen([0,options.snapGuides.y],c);ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();ctx.restore();}
  if(options.selectedBlock)drawEditHandles(ctx,c,options.selectedBlock,options.activeHandle);
  if(options.penDraft)drawPenDraft(ctx,c,options.penDraft);
  // A/B mark the independently adjustable ends of a previewed ellipse.
  if ((options.selectedBlock||options.previewBlock)?.block_style === 'EllipsisTurnBlock') {
    const b=options.selectedBlock||options.previewBlock;
    for(const [i,label] of [[0,'A'],[1,'B']]){
      const angle=(b.angle+i*90)*Math.PI/180,axis=(b.angle/90+i)%2;
      const q=screen([b.center[0]+(b.inside_rad[0]+b.outside_rad[0])/2*Math.round(Math.cos(angle)),b.center[1]+(b.inside_rad[1]+b.outside_rad[1])/2*Math.round(Math.sin(angle))],c);
      ctx.fillStyle=label==='A'?ink(COLORS.lime):ink(COLORS.orange);ctx.beginPath();ctx.arc(q[0],q[1],10,0,Math.PI*2);ctx.fill();ctx.fillStyle=ink('#142019');ctx.font='bold 10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText(label,q[0],q[1]+3);
      ctx.fillStyle=ink('#e5ecef');ctx.font='10px ui-monospace, monospace';ctx.fillText(tr("renderer.p0.pts",{p0:(b.outside_rad[axis]-b.inside_rad[axis]+1)}),q[0],q[1]-16);
    }
  }
  // Labels stay upright, independent of world coordinates.
  for (const b of track.blocks.filter(b => b.block_style === 'StartFinishBlock')) {
    const p = [b.start_pos[0] + (b.is_vertical ? (b.width - 1) / 2 : 0), b.start_pos[1] + (b.is_vertical ? 0 : (b.width - 1) / 2)];
    const q = screen(p, c);ctx.font = '8px ui-monospace, monospace';ctx.textAlign = 'center';ctx.fillStyle = b.is_start ? ink('#c5f575cc') : ink('#ff956ecc');
    if (b.is_vertical) ctx.fillText(b.is_start ? tr("renderer.depart") : tr("renderer.arrivee"), q[0], q[1] + (b.is_start ? 22 : -14));
    else { ctx.save();ctx.translate(q[0] + 20, q[1]);ctx.rotate(-Math.PI / 2);ctx.fillText(b.is_start ? tr("renderer.depart") : tr("renderer.arrivee"), 0, 0);ctx.restore(); }
  }
}

function drawEditHandles(ctx,c,b,active){
  if(b.block_style==='BezierRoadBlock'){
    ctx.strokeStyle=ink('#ff956eaa');ctx.lineWidth=1;
    for(const n of b.nodes){const a=screen(n.in,c),p=screen(n.point,c),z=screen(n.out,c);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...p);ctx.lineTo(...z);ctx.stroke();}
  }
  for(const h of editHandles(b)){const p=screen(h.point,c),isActive=h.id===active;
    ctx.fillStyle=isActive?ink(COLORS.orange):ink('#15251d');ctx.strokeStyle=isActive?ink(COLORS.orange):ink(COLORS.lime);ctx.lineWidth=1.7;ctx.beginPath();
    if(h.id.startsWith('in-')||h.id.startsWith('out-'))ctx.arc(...p,4.5,0,Math.PI*2);else ctx.rect(p[0]-5,p[1]-5,10,10);ctx.fill();ctx.stroke();
    if(h.label&&(isActive||b.block_style==='EllipsisTurnBlock')){ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillStyle=ink('#edf2f6');ctx.fillText(h.label,p[0],p[1]+20);}
  }
}
function drawPenDraft(ctx,c,draft){
  if(draft.nodes.length>1){const b={block_style:'BezierRoadBlock',nodes:draft.nodes,width:draft.width,closed:false};ctx.save();ctx.translate(c.w/2-c.cx*c.scale,c.h/2+c.cy*c.scale);ctx.scale(c.scale,-c.scale);ctx.globalAlpha=.5;ctx.fillStyle=ink(COLORS.orange);blockPath(ctx,b);ctx.fill();ctx.restore();}
  if(draft.nodes.length&&draft.previewPoint){const p=draft.previewPoint,last=draft.nodes.at(-1);if(Math.hypot(p[0]-last.point[0],p[1]-last.point[1])>.5){const b={block_style:'BezierRoadBlock',nodes:[last,{point:p,in:p,out:p}],width:draft.width,closed:false};ctx.save();ctx.translate(c.w/2-c.cx*c.scale,c.h/2+c.cy*c.scale);ctx.scale(c.scale,-c.scale);ctx.globalAlpha=.2;ctx.fillStyle=ink(COLORS.orange);blockPath(ctx,b);ctx.fill();ctx.restore();}}
  if(draft.nodes.length)drawEditHandles(ctx,c,{block_style:'BezierRoadBlock',nodes:draft.nodes,width:draft.width,closed:false},null);
}

function drawHistory(ctx, positions, color, width, dashed, scale) {
  ctx.beginPath();ctx.moveTo(...positions[0]);for (const p of positions.slice(1)) ctx.lineTo(...p);
  ctx.strokeStyle = color;ctx.lineWidth = width;ctx.lineJoin = 'round';if (dashed) ctx.setLineDash([4 / scale, 5 / scale]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle = color;
  for (const p of positions.slice(0, -1)) { ctx.beginPath();ctx.arc(...p, 2.2 / scale, 0, Math.PI * 2);ctx.fill(); }
}
function arrow(ctx, from, to, color, width, scale) {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
  if (!length) return;
  ctx.strokeStyle = color;ctx.lineWidth = width;ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.stroke();
  const head = Math.min(8 / scale, length * .35), angle = Math.atan2(dy, dx);
  ctx.fillStyle = color;ctx.beginPath();ctx.moveTo(...to);ctx.lineTo(to[0] - head * Math.cos(angle - .5), to[1] - head * Math.sin(angle - .5));ctx.lineTo(to[0] - head * Math.cos(angle + .5), to[1] - head * Math.sin(angle + .5));ctx.fill();
}
