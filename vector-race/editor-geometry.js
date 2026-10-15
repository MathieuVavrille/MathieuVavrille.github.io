import { tr } from './i18n.js';
// Grid-snapped editing operations, independent of the canvas and application state.
import { BORDER, clone } from './engine.js';
import { pathWidthHandle } from './path-geometry.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Math.round(n)));
export const precise=n=>Math.round(n*100)/100;
const limit=(n,min,max)=>Math.max(min,Math.min(max,precise(n)));
const quadrantSigns=b=>[b.angle===90||b.angle===180?-1:1,b.angle>=180?-1:1];
export const blockTool=b=>b.block_style==='BezierRoadBlock'?'pen':b.block_style==='StraightRoadBlock'?'straight':b.block_style==='EllipsisTurnBlock'?'turn':b.is_start?'start':'finish';

export function editHandles(b){
  if(b.block_style==='BezierRoadBlock')return [...b.nodes.flatMap((n,i)=>[{id:`node-${i}`,point:n.point,cursor:'move',label:tr("app.point.p0",{p0:(i+1)})},...['in','out'].filter(side=>Math.hypot(n[side][0]-n.point[0],n[side][1]-n.point[1])>.05).map(side=>({id:`${side}-${i}`,point:n[side],cursor:'crosshair',label:tr("editor-geometry.tangente")}))]),...(b.nodes.length>1?[{id:'path-width',point:pathWidthHandle(b).point,cursor:'crosshair',label:'Largeur'}]:[])];
  if(b.block_style==='StraightRoadBlock'){
    const l=b.left-BORDER,r=b.right+BORDER,t=b.top+BORDER,d=b.bottom-BORDER,x=(l+r)/2,y=(d+t)/2;
    return [['nw',[l,t],'nwse-resize'],['ne',[r,t],'nesw-resize'],['sw',[l,d],'nesw-resize'],['se',[r,d],'nwse-resize'],['w',[l,y],'ew-resize'],['e',[r,y],'ew-resize'],['n',[x,t],'ns-resize'],['s',[x,d],'ns-resize']].map(([id,point,cursor])=>({id,point,cursor}));
  }
  if(b.block_style==='StartFinishBlock'){
    const axis=b.is_vertical?0:1;
    return ['start','end'].map((id,i)=>{const point=[...b.start_pos];point[axis]+=i?b.width-1+BORDER:-BORDER;return{id,point,cursor:axis===0?'ew-resize':'ns-resize'};});
  }
  const signs=quadrantSigns(b);
  return ['inner','outer'].flatMap(side=>[0,1].map(axis=>{
    const point=[...b.center],radius=side==='inner'?b.inside_rad[axis]-BORDER:b.outside_rad[axis]+BORDER;
    point[axis]+=signs[axis]*radius;
    return{id:`${side}-${axis}`,point,cursor:axis===0?'ew-resize':'ns-resize',label:`${side==='inner'?tr("editor-geometry.int"):tr("editor-geometry.ext")} ${(b.angle/90)%2===axis?'A':'B'}`};
  }));
}

/** Handles first, then the whole straight/curved boundary; tolerance is in screen pixels. */
export function hitResize(b,p,c,tolerance=10){
  const pixel=q=>[c.w/2+(q[0]-c.cx)*c.scale,c.h/2-(q[1]-c.cy)*c.scale];
  let best=null,distance=tolerance;
  for(const h of editHandles(b)){const q=pixel(h.point),d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<distance){best=h;distance=d;}}
  if(best)return best;
  const x=(p[0]-c.w/2)/c.scale+c.cx,y=(c.h/2-p[1])/c.scale+c.cy,t=tolerance/c.scale;
  if(b.block_style==='StraightRoadBlock'){
    if(x<b.left-BORDER-t||x>b.right+BORDER+t||y<b.bottom-BORDER-t||y>b.top+BORDER+t)return null;
    const horizontal=Math.abs(x-(b.left-BORDER))<t?'w':Math.abs(x-(b.right+BORDER))<t?'e':'';
    const vertical=Math.abs(y-(b.top+BORDER))<t?'n':Math.abs(y-(b.bottom-BORDER))<t?'s':'';
    const id=vertical+horizontal;
    return id?{id,cursor:id.length===2?(id==='nw'||id==='se'?'nwse-resize':'nesw-resize'):horizontal?'ew-resize':'ns-resize'}:null;
  }
  if(b.block_style==='BezierRoadBlock')return null;
  if(b.block_style!=='EllipsisTurnBlock')return null;
  const signs=quadrantSigns(b),dx=x-b.center[0],dy=y-b.center[1];
  if(dx*signs[0]<0||dy*signs[1]<0)return null;
  for(const side of ['inner','outer']){
    const radii=(side==='inner'?b.inside_rad:b.outside_rad).map(r=>r+(side==='inner'?-BORDER:BORDER));
    const length=Math.hypot(dx/radii[0],dy/radii[1]);if(!length)continue;
    if(Math.hypot(dx-dx/length,dy-dy/length)*c.scale<tolerance)return{id:`${side}-curve`,cursor:signs[0]===signs[1]?'nesw-resize':'nwse-resize'};
  }
  return null;
}

export function resizeBlock(original,handle,delta,modifiers={}){
  const b=clone(original),quantize=modifiers.snap===false?precise:Math.round,[dx,dy]=delta.map(quantize),bound=modifiers.snap===false?limit:clamp;
  if(b.block_style==='BezierRoadBlock'){
    if(handle==='path-width'){const{normal}=pathWidthHandle(original);b.width=bound(b.width+2*(delta[0]*normal[0]+delta[1]*normal[1]),1,40);}
    else{const[side,index]=handle.split('-'),n=b.nodes[Number(index)],offset=delta.map(v=>modifiers.snap===false?precise(v):Math.round(v*4)/4);
      if(side==='node'&&!modifiers.altKey){for(const field of ['point','in','out'])n[field]=n[field].map((v,i)=>v+(i===0?dx:dy));}
      else if(side==='node'){n.out=n.point.map((v,i)=>v+offset[i]);n.in=n.point.map((v,i)=>v-offset[i]);}
      else{n[side]=n[side].map((v,i)=>v+offset[i]);if(!modifiers.altKey)n[side==='in'?'out':'in']=n.point.map((v,i)=>2*v-n[side][i]);}
    }
  }else if(b.block_style==='StraightRoadBlock'){
    if(handle.includes('w'))b.left=bound(b.left+dx,-120,b.right);
    if(handle.includes('e'))b.right=bound(b.right+dx,b.left,120);
    if(handle.includes('s'))b.bottom=bound(b.bottom+dy,-120,b.top);
    if(handle.includes('n'))b.top=bound(b.top+dy,b.bottom,120);
  }else if(b.block_style==='StartFinishBlock'){
    const axis=b.is_vertical?0:1,d=Math.round(axis===0?dx:dy);
    if(handle==='start'){
      const end=b.start_pos[axis]+b.width-1,start=clamp(b.start_pos[axis]+d,Math.max(-120,end-39),Math.min(120,end));
      b.start_pos[axis]=start;b.width=end-start+1;
    }else b.width=clamp(b.width+d,1,40);
  }else{
    const [side,axis]=handle.split('-'),signs=quadrantSigns(b),axes=axis==='curve'?[0,1]:[Number(axis)];
    for(const i of axes){const d=(i===0?dx:dy)*signs[i];if(side==='inner')b.inside_rad[i]=bound(b.inside_rad[i]+d,1,b.outside_rad[i]);else b.outside_rad[i]=bound(b.outside_rad[i]+d,b.inside_rad[i],60);}
  }
  return b;
}

export function translateBlock(original,delta,{snap=true}={}){
  const b=clone(original),bound=snap||b.block_style==='StartFinishBlock'?clamp:limit;
  if(b.block_style==='BezierRoadBlock'){
    const movement=delta.map((v,axis)=>bound(v,Math.max(...b.nodes.flatMap(n=>[-120-n.point[axis],-180-n.in[axis],-180-n.out[axis]])),Math.min(...b.nodes.flatMap(n=>[120-n.point[axis],180-n.in[axis],180-n.out[axis]]))));
    for(const n of b.nodes)for(const field of ['point','in','out'])n[field]=n[field].map((v,i)=>v+movement[i]);
  }else if(b.block_style==='StraightRoadBlock'){
    const dx=bound(delta[0],-120-b.left,120-b.right),dy=bound(delta[1],-120-b.bottom,120-b.top);
    b.left=precise(b.left+dx);b.right=precise(b.right+dx);b.bottom=precise(b.bottom+dy);b.top=precise(b.top+dy);
  }else{const p=b.center||b.start_pos;p[0]=bound(p[0]+delta[0],-120,120);p[1]=bound(p[1]+delta[1],-120,120);}
  return b;
}

export function rotateBlock(original){
  const b=clone(original);
  if(b.block_style==='BezierRoadBlock'){const origin=b.nodes[0].point;for(const n of b.nodes)for(const field of ['point','in','out']){const[x,y]=n[field];n[field]=[origin[0]-(y-origin[1]),origin[1]+(x-origin[0])];}}
  else if(b.block_style==='StraightRoadBlock'){const width=b.right-b.left,height=b.top-b.bottom;b.right=b.left+height;b.top=b.bottom+width;b.is_vertical=!b.is_vertical;}
  else if(b.block_style==='EllipsisTurnBlock'){b.angle=(b.angle+90)%360;b.inside_rad.reverse();b.outside_rad.reverse();}
  else{const r=(b.is_vertical?0:1)+(b.is_left_or_down?2:0),next=(r+1)%4;b.is_vertical=next%2===0;b.is_left_or_down=next>=2;}
  return b;
}

export function blockDimensions(b){
  if(b.block_style==='BezierRoadBlock')return{width:b.width,rotation:0};
  if(b.block_style==='StraightRoadBlock')return{rotation:b.is_vertical?0:1,width:b.is_vertical?b.right-b.left+1:b.top-b.bottom+1,length:b.is_vertical?b.top-b.bottom+1:b.right-b.left+1};
  if(b.block_style==='StartFinishBlock')return{rotation:(b.is_vertical?0:1)+(b.is_left_or_down?2:0),width:b.width};
  const axis=(b.angle/90)%2;
  return{rotation:b.angle/90,rx:b.inside_rad[0],ry:b.inside_rad[1],start:b.outside_rad[axis]-b.inside_rad[axis]+1,end:b.outside_rad[1-axis]-b.inside_rad[1-axis]+1};
}

export function setBlockDimensions(original,d){
  const b=clone(original);
  if(b.block_style==='BezierRoadBlock')b.width=d.width;
  else if(b.block_style==='StraightRoadBlock'){b.right=b.left+(b.is_vertical?d.width:d.length)-1;b.top=b.bottom+(b.is_vertical?d.length:d.width)-1;}
  else if(b.block_style==='StartFinishBlock')b.width=d.width;
  else{const axis=(b.angle/90)%2;b.inside_rad=[d.rx,d.ry];b.outside_rad=[d.rx+(axis?d.end:d.start)-1,d.ry+(axis?d.start:d.end)-1];}
  return b;
}

export function resetBlock(original){
  const b=clone(original);
  if(b.block_style==='BezierRoadBlock'){b.width=5;for(const n of b.nodes){n.in=[...n.point];n.out=[...n.point];}}
  else if(b.block_style==='EllipsisTurnBlock'){b.inside_rad=[4,4];b.outside_rad=[8,8];}
  else if(b.block_style==='StartFinishBlock')b.width=5;
  else return setBlockDimensions(b,{width:5,length:12});
  return b;
}

/** Snap to the grid and nearby anchors, keeping a constant screen-space attraction radius. */
export function magneticPoint(point,blocks,scale=20,enabled=true){
  if(!enabled)return{point:point.map(precise),guides:null};
  const result=point.map(Math.round),guides={},targets=blocks.flatMap(b=>{
    if(b.block_style==='StraightRoadBlock')return[[b.left,b.bottom],[b.right,b.top]];
    if(b.block_style==='StartFinishBlock'){const end=[...b.start_pos];end[b.is_vertical?0:1]+=b.width-1;return[b.start_pos,end];}
    if(b.block_style==='BezierRoadBlock')return b.nodes.map(n=>n.point);
    const signs=quadrantSigns(b);return[b.center,...[b.inside_rad,b.outside_rad].flatMap(r=>[[b.center[0]+signs[0]*r[0],b.center[1]],[b.center[0],b.center[1]+signs[1]*r[1]]])];
  });
  for(let axis=0;axis<2;axis++){
    let distance=Math.min(7/scale,.35),best=null;
    for(const target of targets){const d=Math.abs(target[axis]-point[axis]);if(d<distance){distance=d;best=target[axis];}}
    if(best!==null){result[axis]=precise(best);guides[axis===0?'x':'y']=result[axis];}
  }
  return{point:result,guides:Object.keys(guides).length?guides:null};
}

export function editReference(b,handle=null){
  if(b.block_style==='StraightRoadBlock')return[handle?.includes('e')?b.right:b.left,handle?.includes('n')?b.top:b.bottom];
  if(b.block_style==='StartFinishBlock')return[...b.start_pos];
  if(b.block_style==='BezierRoadBlock'){if(handle&&handle!=='path-width'){const[side,i]=handle.split('-');return[...b.nodes[Number(i)][side==='node'?'point':side]];}return[...b.nodes[0].point];}
  if(handle){const signs=quadrantSigns(b),radius=handle.startsWith('inner')?b.inside_rad:b.outside_rad;return b.center.map((v,i)=>v+signs[i]*radius[i]);}return[...b.center];
}
