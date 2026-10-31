import type { Vec } from "./geometry";
import {strokeGeometry,visitStrokeSegmentsInBounds,type Stroke,type StrokePoint} from "./strokes";

const EPS = 1e-9;
const copy = (point: StrokePoint): StrokePoint => ({ ...point });
const at = (a: StrokePoint, b: StrokePoint, t: number): StrokePoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t });
const same = (a: StrokePoint, b: StrokePoint): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.r - b.r) < EPS;

const distanceToSegment=(p:Vec,a:Vec,b:Vec):number=>{const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
function segmentDistance(a:Vec,b:Vec,c:Vec,d:Vec):number{
  const cross=(u:Vec,v:Vec,w:Vec)=>(v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x),abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(abC*abD<0&&cdA*cdB<0)return 0;
  return Math.min(distanceToSegment(a,c,d),distanceToSegment(b,c,d),distanceToSegment(c,a,b),distanceToSegment(d,a,b));
}
type Disk={kind:'disk';center:Vec;radius:number};
type Polygon={kind:'polygon';points:Vec[]};
type Primitive=Disk|Polygon;
type Interval={lo:number;hi:number};
type Bounds={minX:number;minY:number;maxX:number;maxY:number};
type Edge={kind:'line';a:Vec;b:Vec}|Disk;
const cross2=(a:Vec,b:Vec)=>a.x*b.y-a.y*b.x;
const sub=(a:Vec,b:Vec):Vec=>({x:a.x-b.x,y:a.y-b.y});
function primitiveBounds(p:Primitive):Bounds{
  if(p.kind==='disk')return {minX:p.center.x-p.radius,minY:p.center.y-p.radius,maxX:p.center.x+p.radius,maxY:p.center.y+p.radius};
  return {minX:Math.min(...p.points.map(v=>v.x)),minY:Math.min(...p.points.map(v=>v.y)),maxX:Math.max(...p.points.map(v=>v.x)),maxY:Math.max(...p.points.map(v=>v.y))};
}
const boundsOverlap=(a:Bounds,b:Bounds)=>a.minX<b.maxX&&b.minX<a.maxX&&a.minY<b.maxY&&b.minY<a.maxY;
function segmentPolygon(a:Vec,b:Vec,ar:number,br:number):Polygon|undefined{
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)return;
  const nx=-dy/length,ny=dx/length;
  return {kind:'polygon',points:[{x:a.x+nx*ar,y:a.y+ny*ar},{x:b.x+nx*br,y:b.y+ny*br},{x:b.x-nx*br,y:b.y-ny*br},{x:a.x-nx*ar,y:a.y-ny*ar}]};
}
/** These are the same tapered quadrilateral and circular caps used by painting,
 * rather than a maximum-radius approximation along a pressure-varying segment. */
function segmentPrimitives(a:Vec,b:Vec,ar:number,br:number):Primitive[]{
  const polygon=segmentPolygon(a,b,ar,br),parts:Primitive[]=[{kind:'disk',center:a,radius:ar}];
  if(polygon)parts.push(polygon,{kind:'disk',center:b,radius:br});else if(br>ar)parts[0]={kind:'disk',center:b,radius:br};
  return parts;
}
function polygonContains(p:Polygon,point:Vec,strict=false):boolean{
  let positive=false,negative=false;
  for(let i=0;i<p.points.length;i++){const a=p.points[i]!,b=p.points[(i+1)%p.points.length]!,value=cross2(sub(b,a),sub(point,a));if(strict&&value===0)return false;positive ||= value>0;negative ||= value<0;if(positive&&negative)return false;}
  return true;
}
function primitiveContains(p:Primitive,point:Vec,strict=false):boolean{
  if(p.kind==='polygon')return polygonContains(p,point,strict);
  const distance=Math.hypot(point.x-p.center.x,point.y-p.center.y);return strict?distance<p.radius:distance<=p.radius;
}
function primitivesIntersect(a:Primitive,b:Primitive):boolean{
  if(!boundsOverlap(primitiveBounds(a),primitiveBounds(b)))return false;
  if(a.kind==='disk'&&b.kind==='disk')return Math.hypot(a.center.x-b.center.x,a.center.y-b.center.y)<a.radius+b.radius;
  if(a.kind==='disk'||b.kind==='disk'){
    const disk=(a.kind==='disk'?a:b) as Disk,polygon=(a.kind==='polygon'?a:b) as Polygon;
    return polygonContains(polygon,disk.center)||polygon.points.some((p,i)=>distanceToSegment(disk.center,p,polygon.points[(i+1)%polygon.points.length]!)<disk.radius);
  }
  // Separating axes reject mere boundary contact as well as disjoint polygons.
  for(const polygon of [a,b])for(let i=0;i<polygon.points.length;i++){
    const p=polygon.points[i]!,q=polygon.points[(i+1)%polygon.points.length]!,nx=p.y-q.y,ny=q.x-p.x;
    if(!nx&&!ny)continue;const project=(shape:Polygon)=>shape.points.map(v=>v.x*nx+v.y*ny),left=project(a),right=project(b);
    if(Math.max(...left)<=Math.min(...right)||Math.max(...right)<=Math.min(...left))return false;
  }
  return true;
}
function edges(p:Primitive):Edge[]{return p.kind==='disk'?[p]:p.points.map((a,i)=>({kind:'line' as const,a,b:p.points[(i+1)%p.points.length]!}));}
function edgeBounds(e:Edge):Bounds{return e.kind==='disk'?primitiveBounds(e):{minX:Math.min(e.a.x,e.b.x),minY:Math.min(e.a.y,e.b.y),maxX:Math.max(e.a.x,e.b.x),maxY:Math.max(e.a.y,e.b.y)};}
function edgeIntersections(a:Edge,b:Edge):Vec[]{
  if(a.kind==='line'&&b.kind==='line'){
    const u=sub(a.b,a.a),v=sub(b.b,b.a),d=cross2(u,v);if(!d)return [];
    const w=sub(b.a,a.a),t=cross2(w,v)/d,s=cross2(w,u)/d;
    return t>=0&&t<=1&&s>=0&&s<=1?[{x:a.a.x+t*u.x,y:a.a.y+t*u.y}]:[];
  }
  if(a.kind==='disk'&&b.kind==='disk'){
    const dx=b.center.x-a.center.x,dy=b.center.y-a.center.y,d=Math.hypot(dx,dy);
    if(!d||d>a.radius+b.radius||d<Math.abs(a.radius-b.radius))return [];
    const along=(a.radius*a.radius-b.radius*b.radius+d*d)/(2*d),height=Math.sqrt(Math.max(0,a.radius*a.radius-along*along)),x=a.center.x+dx*along/d,y=a.center.y+dy*along/d;
    return [{x:x-dy*height/d,y:y+dx*height/d},{x:x+dy*height/d,y:y-dx*height/d}];
  }
  const circle=(a.kind==='disk'?a:b) as Disk,line=(a.kind==='line'?a:b) as Extract<Edge,{kind:'line'}>,v=sub(line.b,line.a),w=sub(line.a,circle.center),A=v.x*v.x+v.y*v.y;
  if(!A)return [];const B=2*(w.x*v.x+w.y*v.y),C=w.x*w.x+w.y*w.y-circle.radius*circle.radius,discriminant=B*B-4*A*C;
  if(discriminant<0)return [];const root=Math.sqrt(discriminant),q=-.5*(B+(B>=0?root:-root)),parameters=q?[q/A,C/q]:[-B/(2*A)];
  return parameters.filter(t=>t>=0&&t<=1).map(t=>({x:line.a.x+t*v.x,y:line.a.y+t*v.y}));
}
function verticalInterval(p:Primitive,x:number):Interval|undefined{
  if(p.kind==='disk'){const dx=x-p.center.x,height2=p.radius*p.radius-dx*dx;if(height2<=0)return;const h=Math.sqrt(height2);return {lo:p.center.y-h,hi:p.center.y+h};}
  const values:number[]=[];
  for(let i=0;i<p.points.length;i++){const a=p.points[i]!,b=p.points[(i+1)%p.points.length]!;if(a.x===b.x||x<Math.min(a.x,b.x)||x>Math.max(a.x,b.x))continue;values.push(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x));}
  return values.length?{lo:Math.min(...values),hi:Math.max(...values)}:undefined;
}
/** Exact vertical decomposition of paint ∩ eraser minus the complete old mask
 * union. Boundary crossings and extrema partition x into slabs of fixed topology;
 * one interior scanline per slab is sufficient. This also finds uncovered islands
 * surrounded by several old cuts, without sampling pixels or dilating geometry. */
function visibleIntersection(paint:Primitive,query:Primitive,allHoles:Primitive[]):boolean{
  if(!primitivesIntersect(paint,query))return false;
  const a=primitiveBounds(paint),b=primitiveBounds(query),bounds={minX:Math.max(a.minX,b.minX),minY:Math.max(a.minY,b.minY),maxX:Math.min(a.maxX,b.maxX),maxY:Math.min(a.maxY,b.maxY)},holes=allHoles.filter(h=>boundsOverlap(primitiveBounds(h),bounds));
  if(!holes.length)return true;
  // Confirm a real interior witness before a destructive hit. This rejects
  // numerical boundary slivers without enlarging cuts by a geometric epsilon.
  const uncovered=(x:number,lo:number,hi:number)=>{const y=lo+(hi-lo)/2,point={x,y};return y>lo&&y<hi&&primitiveContains(paint,point,true)&&primitiveContains(query,point,true)&&!holes.some(h=>primitiveContains(h,point));};
  const boundaries=[paint,query,...holes].flatMap(edges),edgeBoxes=boundaries.map(edgeBounds),xs=[bounds.minX,bounds.maxX],addX=(x:number)=>{if(x>bounds.minX&&x<bounds.maxX)xs.push(x);};
  for(const edge of boundaries)if(edge.kind==='disk'){addX(edge.center.x-edge.radius);addX(edge.center.x+edge.radius);}else{addX(edge.a.x);addX(edge.b.x);}
  const order=boundaries.map((_,i)=>i).sort((i,j)=>edgeBoxes[i]!.minX-edgeBoxes[j]!.minX);
  for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){
    const a=order[i]!,b=order[j]!,left=edgeBoxes[a]!,right=edgeBoxes[b]!;
    if(right.minX>left.maxX)break;
    if(left.maxY<right.minY||right.maxY<left.minY)continue;
    for(const point of edgeIntersections(boundaries[a]!,boundaries[b]!))addX(point.x);
  }
  xs.sort((x,y)=>x-y);
  for(let i=1;i<xs.length;i++){
    const left=xs[i-1]!,right=xs[i]!,x=left+(right-left)/2;if(x<=left||x>=right)continue;
    const p=verticalInterval(paint,x),q=verticalInterval(query,x);if(!p||!q)continue;
    let lo=Math.max(p.lo,q.lo);const hi=Math.min(p.hi,q.hi);if(lo>=hi)continue;
    const cuts=holes.map(h=>verticalInterval(h,x)).filter((h):h is Interval=>!!h&&h.hi>lo&&h.lo<hi).sort((l,r)=>l.lo-r.lo);
    for(const cut of cuts){if(cut.lo>lo&&uncovered(x,lo,Math.min(hi,cut.lo)))return true;lo=Math.max(lo,cut.hi);if(lo>=hi)break;}
    if(lo<hi&&uncovered(x,lo,hi))return true;
  }
  return false;
}
/** A continuous sweep catches a stroke even when no input event lands on it. */
export function strokeIntersectsEraser(stroke:Stroke,from:Vec,to:Vec,radius:number):boolean{
  if(![from.x,from.y,to.x,to.y,radius].every(Number.isFinite)||radius<=0)return false;
  // A sweep contained in an existing erased capsule touches no visible paint.
  for(const area of stroke.erasures??[]){const margin=area.radius-radius;if(margin<0)continue;if(area.points.length===1){const p=area.points[0]!;if(Math.hypot(from.x-p.x,from.y-p.y)<=margin&&Math.hypot(to.x-p.x,to.y-p.y)<=margin)return false;}for(let i=1;i<area.points.length;i++)if(distanceToSegment(from,area.points[i-1]!,area.points[i]!)<=margin&&distanceToSegment(to,area.points[i-1]!,area.points[i]!)<=margin)return false;}
  const points=strokeGeometry(stroke).points;if(!points.length)return false;
  const query=segmentPrimitives(from,to,radius,radius),queryBounds={minX:Math.min(from.x,to.x)-radius,minY:Math.min(from.y,to.y)-radius,maxX:Math.max(from.x,to.x)+radius,maxY:Math.max(from.y,to.y)+radius},holes:Primitive[]=[];
  for(const area of stroke.erasures??[]){for(let i=1;i<Math.max(2,area.points.length);i++){
    const a=area.points[i-1],b=area.points[Math.min(i,area.points.length-1)];if(!a||!b)continue;
    for(const primitive of segmentPrimitives(a,b,area.radius,area.radius))if(boundsOverlap(primitiveBounds(primitive),queryBounds))holes.push(primitive);
  }}
  const hits=(paint:Primitive)=>query.some(part=>visibleIntersection(paint,part,holes));
  if(points.length===1)return hits({kind:'disk',center:points[0]!,radius:points[0]!.r});
  return visitStrokeSegmentsInBounds(stroke,queryBounds,(a,b)=>{
    // A cheap conservative phase precedes the actual tapered coverage test.
    if(segmentDistance(a,b,from,to)>=radius+Math.max(a.r,b.r))return false;
    return segmentPrimitives(a,b,a.r,b.r).some(hits);
  });
}
/** Exact area erasing is a persistent vector mask. The original brush samples,
 * radius and smoothing never change, even for a grazing or interior circular cut. */
export function eraseStrokeArea(stroke:Stroke,from:Vec,to:Vec,radius:number):Stroke{
  if(![from.x,from.y,to.x,to.y,radius].every(Number.isFinite)||radius<=0||!strokeIntersectsEraser(stroke,from,to,radius))return stroke;
  const erasures=[...(stroke.erasures??[])],last=erasures.at(-1),end=last?.points.at(-1),samePoint=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y)<EPS;
  if(last&&last.radius===radius&&end&&samePoint(end,from)){if(samePoint(from,to))return stroke;erasures[erasures.length-1]={...last,points:[...last.points,{...to}]};}
  else erasures.push({radius,points:samePoint(from,to)?[{...to}]:[{...from},{...to}]});
  return {...stroke,erasures};
}

/**
 * Removes a circular brush from the path, including intersections between sparse
 * samples. Each surviving array is a separate stroke; renderer supplies round caps.
 * Stroke radius is interpolated along each segment rather than assumed constant.
 */
export function eraseStrokePoints(stroke: Stroke, center: Vec, radius: number): StrokePoint[][] {
  const points = stroke.points;
  if (!points.length) return [];
  if (![center.x, center.y, radius].every(Number.isFinite)) return [points.map(copy)];
  radius = Math.max(0, radius);
  if (points.length === 1) {
    const p = points[0]!;
    return Math.hypot(p.x - center.x, p.y - center.y) <= radius + p.r ? [] : [[copy(p)]];
  }
  const parts: StrokePoint[][] = [];
  let current: StrokePoint[] | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dy = b.y - a.y, dr = b.r - a.r;
    const x = a.x - center.x, y = a.y - center.y, reach = radius + a.r;
    // |a + t(b-a) - center|² - (radius + r(t))² = A t²+B t+C.
    const A = dx * dx + dy * dy - dr * dr;
    const B = 2 * (x * dx + y * dy - reach * dr);
    const C = x * x + y * y - reach * reach;
    const cuts = [0, 1];
    if (Math.abs(A) <= EPS) {
      if (Math.abs(B) > EPS) { const t = -C / B; if (t > EPS && t < 1 - EPS) cuts.push(t); }
    } else {
      const discriminant = B * B - 4 * A * C;
      if (discriminant >= -EPS) {
        const root = Math.sqrt(Math.max(0, discriminant));
        // Stable quadratic formula avoids cancellation for distant sparse samples.
        const q = -.5 * (B + (B >= 0 ? root : -root));
        for (const t of Math.abs(q) > EPS ? [q / A, C / q] : [-B / (2 * A)]) if (t > EPS && t < 1 - EPS) cuts.push(t);
      }
    }
    cuts.sort((left, right) => left - right);
    for (let j = 1; j < cuts.length; j++) {
      const lo = cuts[j - 1]!, hi = cuts[j]!;
      if (hi - lo <= EPS) continue;
      const middle = (lo + hi) / 2;
      if ((A * middle + B) * middle + C <= 0) { current = null; continue; }
      const start = at(a, b, lo), end = at(a, b, hi);
      if (!current || !same(current[current.length - 1]!, start)) { current = [start]; parts.push(current); }
      if (!same(current[current.length - 1]!, end)) current.push(end);
    }
  }
  return parts;
}
