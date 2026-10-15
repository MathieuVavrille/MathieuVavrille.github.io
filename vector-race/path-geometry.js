import { tr } from './i18n.js';
// Cubic Bézier roads share the same flattened centerline in rendering and collisions.
const cache=new WeakMap(),mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
export function distanceToSegment(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function flatten(a,b,c,d,points,depth=0){
  if(depth>=10||Math.max(distanceToSegment(b,a,d),distanceToSegment(c,a,d))<=.02){points.push(d);return;}
  const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
  flatten(a,ab,abc,center,points,depth+1);flatten(center,bcd,cd,d,points,depth+1);
}
export function pathGeometry(block){
  if(cache.has(block))return cache.get(block);
  const points=[block.nodes[0].point],n=block.nodes.length;
  for(let i=0;i<n-1+(block.closed?1:0);i++){const a=block.nodes[i],b=block.nodes[(i+1)%n];flatten(a.point,a.out,b.in,b.point,points);}
  if(points.length>4096)throw new Error(tr("path-geometry.trace.trop.complexe.simplifie.les.tangentes"));
  const radius=(block.width-1)/2+1/3;
  const bounds=[Math.min(...points.map(p=>p[0]))-radius,Math.min(...points.map(p=>p[1]))-radius,Math.max(...points.map(p=>p[0]))+radius,Math.max(...points.map(p=>p[1]))+radius];
  const result={points,radius,bounds};cache.set(block,result);return result;
}
export function pathContains(block,p){const{points,radius}=pathGeometry(block);for(let i=1;i<points.length;i++)if(distanceToSegment(p,points[i-1],points[i])<=radius+1e-8)return true;return false;}
export function pathIntersections(block,p,d,ts){
  const{points,radius}=pathGeometry(block),aa=d[0]**2+d[1]**2;if(!aa)return;
  for(const q of points){const x=p[0]-q[0],y=p[1]-q[1],bb=2*(x*d[0]+y*d[1]),cc=x*x+y*y-radius*radius,disc=bb*bb-4*aa*cc;if(disc>=0)for(const t of [(-bb-Math.sqrt(disc))/(2*aa),(-bb+Math.sqrt(disc))/(2*aa)])if(t>0&&t<1)ts.push(t);}
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;
    const nx=-dy/length,ny=dx/length,denom=d[0]*nx+d[1]*ny;if(!denom)continue;
    const distance=(p[0]-a[0])*nx+(p[1]-a[1])*ny;
    for(const sign of [-1,1]){const t=(sign*radius-distance)/denom;if(t>0&&t<1)ts.push(t);}
  }
}
export function pathWidthHandle(block){
  const{points,radius}=pathGeometry(block),i=Math.max(1,Math.floor(points.length/2)),a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1])||1,normal=[-(b[1]-a[1])/length,(b[0]-a[0])/length];
  return{point:[(a[0]+b[0])/2+normal[0]*radius,(a[1]+b[1])/2+normal[1]*radius],normal};
}
