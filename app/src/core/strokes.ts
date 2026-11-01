import type {LayerMembership} from './layer-model';
/**
 * Vector brush centerlines with optional locally fitted precision curves.
 * Legacy pressure samples retain their individual radii. Painting uses local
 * stroke geometry, never a self-intersecting closed ribbon polygon.
 */

import type { Vec } from "./geometry";

export interface StrokePoint {
  x: number;
  y: number;
  /** raio em unidades de mundo */
  r: number;
}

export type StrokeTool = "brush" | "pen" | "highlighter" | "eraser";

/** Swept circular eraser paths subtract coverage without changing brush samples. */
export interface StrokeErasure {points:Vec[];radius:number}

export interface Stroke extends LayerMembership {
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  id: string;
  type: "stroke";
  tool: Exclude<StrokeTool, "eraser">;
  color: string;
  /** One opacity for the complete painted stroke, including self-crossings. */
  opacity?: number;
  /** Fit a smooth local spline; ordinary brush keeps the sampled centerline. */
  precision?: boolean;
  /** World-space precision window, captured from the drawing zoom. */
  precisionSmoothing?:number;
  erasures?:StrokeErasure[];
  points: StrokePoint[];
  z: number;
}

export interface StrokeCubic {p0:StrokePoint;p1:Vec;p2:Vec;p3:StrokePoint}
export interface StrokeGeometry {knots:StrokePoint[];points:StrokePoint[];curves:StrokeCubic[];uniform:boolean;radius:number}
const geometryCache=new WeakMap<StrokePoint[],{length:number;lastX:number;lastY:number;lastR:number;precision:boolean;smoothing:number;geometry:StrokeGeometry}>();
interface FittingCache {
  length:number;lastX:number;lastY:number;lastR:number;precision:boolean;smoothing:number;
  raw:Array<StrokePoint|undefined>;fitted:Array<StrokePoint|undefined>;lengths:Array<number|undefined>;
}
const fittingCache=new WeakMap<StrokePoint[],FittingCache>();
/** A fitted point plus its tangent needs at most this many future raw samples. */
export const PRECISION_LOOKAHEAD=98;
export const strokeOpacity=(stroke:Stroke):number=>Math.max(0,Math.min(1,stroke.opacity??(stroke.tool==='highlighter'?.35:1)));
const safePoint=(point:StrokePoint):StrokePoint=>({x:point.x,y:point.y,r:Math.max(.01,point.r)});

function fittingFor(raw:StrokePoint[],precision:boolean,smoothing:number):FittingCache {
  let cached=fittingCache.get(raw);const previousLast=cached&&raw[cached.length-1];
  if(!cached||cached.precision!==precision||cached.smoothing!==smoothing||raw.length<cached.length||previousLast?.x!==cached.lastX||previousLast?.y!==cached.lastY||previousLast?.r!==cached.lastR){
    cached={length:0,lastX:NaN,lastY:NaN,lastR:NaN,precision,smoothing,raw:[],fitted:[],lengths:[]};fittingCache.set(raw,cached);
  }else if(raw.length!==cached.length){
    // Only the live tail can acquire new future neighbours. Completed prefix
    // fits stay immutable and are shared by preview ranges and final painting.
    cached.fitted.length=Math.min(cached.fitted.length,Math.max(0,cached.length-PRECISION_LOOKAHEAD));
    cached.lengths.length=Math.min(cached.lengths.length,Math.max(0,cached.length-1));
  }
  const last=raw.at(-1);cached.length=raw.length;cached.lastX=last?.x??NaN;cached.lastY=last?.y??NaN;cached.lastR=last?.r??NaN;return cached;
}

/** Transfer expensive preview fits across the command bus's ownership copy.
 * Every cached point is copied too: later caller/cache mutation cannot alter
 * rendering or hit testing of the independently owned committed stroke. */
export function inheritStrokeFittingCache(source:Stroke,target:Stroke):void {
  const precision=target.precision??target.tool==='pen',smoothing=target.precisionSmoothing??8,cache=fittingCache.get(source.points);
  if(!precision||!cache||source.points===target.points||cache.length!==target.points.length||cache.precision!==precision||cache.smoothing!==smoothing)return;
  const last=target.points.at(-1);if(last?.x!==cache.lastX||last?.y!==cache.lastY||last?.r!==cache.lastR)return;
  // The live preview appends immutable samples, but other command callers may
  // have edited a middle sample after fitting. Never seed a stale approximation.
  for(let i=0;i<cache.raw.length;i++){const retained=cache.raw[i];if(!retained)continue;const point=target.points[i];if(!point||point.x!==retained.x||point.y!==retained.y||Math.max(.01,point.r)!==retained.r)return;}
  fittingCache.set(target.points,{...cache,raw:cache.raw.map(point=>point?{...point}:undefined),fitted:cache.fitted.map(point=>point?{...point}:undefined),lengths:cache.lengths.slice()});
}

/** Local smoothing never changes the finished interior when more input arrives. */
function precisionPoint(points:StrokePoint[],index:number,smoothing:number,at:(i:number)=>StrokePoint,segmentLength:(i:number)=>number):StrokePoint{
  const point=at(index);
  if(points.length<3||index===0||index===points.length-1||smoothing<=0)return point;
  // Integrate over arc length rather than sample count. Fast/coalesced input and
  // dense slow input therefore receive the same visible smoothing window.
  const requested=smoothing*1.5,reach=(direction:number)=>{let travel=0;for(let step=1;step<=PRECISION_LOOKAHEAD-2;step++){const next=index+step*direction;if(next<0||next>=points.length)break;travel+=segmentLength(Math.min(next,next-direction));if(travel>=requested)return requested;}return travel;};
  // A symmetric window preserves position on a straight gesture and smoothly
  // shrinks at either endpoint. Blending a large asymmetric window with the raw
  // points reintroduced hand jitter at high strengths in the previous filter.
  const window=Math.min(requested,reach(-1),reach(1));if(window<1e-8)return point;
  const sigma=window/3,variance=2*sigma*sigma;let sumX=0,sumY=0,total=0;
  for(const direction of [-1,1]){
    let previous=point,travel=0;
    for(let step=1;step<=PRECISION_LOOKAHEAD-2;step++){
      const nextIndex=index+step*direction;if(nextIndex<0||nextIndex>=points.length)break;
      const next=at(nextIndex),length=segmentLength(Math.min(nextIndex,nextIndex-direction));if(length<1e-8){previous=next;continue;}
      const segment=Math.min(length,window-travel),middle=travel+segment*.5,weight=segment*Math.exp(-middle*middle/variance),fraction=segment/(2*length);
      sumX+=(previous.x+(next.x-previous.x)*fraction)*weight;sumY+=(previous.y+(next.y-previous.y)*fraction)*weight;total+=weight;travel+=segment;
      if(travel>=window)break;previous=next;
    }
  }
  if(total<1e-12)return point;
  return {x:sumX/total,y:sumY/total,r:point.r};
}
function cubicBetween(a:StrokePoint,b:StrokePoint,c:StrokePoint,d:StrokePoint):StrokeCubic{
  const ab=Math.max(.0001,Math.sqrt(Math.hypot(b.x-a.x,b.y-a.y))),bc=Math.max(.0001,Math.sqrt(Math.hypot(c.x-b.x,c.y-b.y))),cd=Math.max(.0001,Math.sqrt(Math.hypot(d.x-c.x,d.y-c.y)));
  const tangent=(key:'x'|'y')=>{
    const m1=((b[key]-a[key])/ab-(c[key]-a[key])/(ab+bc)+(c[key]-b[key])/bc)*bc;
    const m2=((c[key]-b[key])/bc-(d[key]-b[key])/(bc+cd)+(d[key]-c[key])/cd)*bc;
    return [b[key]+m1/3,c[key]-m2/3];
  };
  const x=tangent('x'),y=tangent('y');return {p0:b,p1:{x:x[0]!,y:y[0]!},p2:{x:x[1]!,y:y[1]!},p3:c};
}
export function strokeGeometry(stroke:Stroke):StrokeGeometry{
  const raw=stroke.points,last=raw[raw.length-1],precision=stroke.precision??stroke.tool==='pen',smoothing=stroke.precisionSmoothing??8,cached=geometryCache.get(raw);
  if(cached&&cached.length===raw.length&&cached.lastX===last?.x&&cached.lastY===last?.y&&cached.lastR===last?.r&&cached.precision===precision&&cached.smoothing===smoothing)return cached.geometry;
  const geometry=strokeGeometryRange(stroke,0,raw.length-1);geometryCache.set(raw,{length:raw.length,lastX:last?.x??NaN,lastY:last?.y??NaN,lastR:last?.r??NaN,precision,smoothing,geometry});return geometry;
}
/** Compute only the requested raw-segment range and its local tangent neighbours. */
export function strokeGeometryRange(stroke:Stroke,start=0,end=stroke.points.length-1):StrokeGeometry{
  const raw=stroke.points,precision=stroke.precision??stroke.tool==='pen',smoothing=stroke.precisionSmoothing??8,from=Math.max(0,start),to=Math.min(raw.length-1,end),cache=fittingFor(raw,precision,smoothing),exposed=new Map<number,StrokePoint>();
  const rawAt=(i:number)=>{let point=cache.raw[i];if(!point){point=safePoint(raw[i]!);cache.raw[i]=point;}return point;};
  const segmentLength=(i:number)=>{let length=cache.lengths[i];if(length===undefined){const a=rawAt(i),b=rawAt(i+1);length=Math.hypot(b.x-a.x,b.y-a.y);cache.lengths[i]=length;}return length;};
  const at=(i:number)=>{const index=Math.max(0,Math.min(raw.length-1,i));if(!precision)return rawAt(index);let point=exposed.get(index);if(point)return point;let fitted=cache.fitted[index];if(!fitted){fitted=precisionPoint(raw,index,smoothing,rawAt,segmentLength);cache.fitted[index]=fitted;}point={...fitted};exposed.set(index,point);return point;};
  const knots:StrokePoint[]=[],curves:StrokeCubic[]=[],points:StrokePoint[]=[];
  for(let i=from;i<=to;i++)knots.push(at(i));
  if(precision&&raw.length>2&&knots.length>1){
    points.push(knots[0]!);
    for(let i=from;i<to;i++){
      const b=at(i),c=at(i+1),a=i>0?at(i-1):{...b,x:2*b.x-c.x,y:2*b.y-c.y},d=i+2<raw.length?at(i+2):{...c,x:2*c.x-b.x,y:2*c.y-b.y};
      const curve=cubicBetween(a,b,c,d);curves.push(curve);
      const length=Math.hypot(curve.p1.x-b.x,curve.p1.y-b.y)+Math.hypot(curve.p2.x-curve.p1.x,curve.p2.y-curve.p1.y)+Math.hypot(c.x-curve.p2.x,c.y-curve.p2.y);
      const count=Math.max(2,Math.min(24,Math.ceil(length/Math.max(.75,Math.min(b.r,c.r)*.45))));
      for(let j=1;j<=count;j++){const t=j/count,u=1-t;points.push({x:u*u*u*b.x+3*u*u*t*curve.p1.x+3*u*t*t*curve.p2.x+t*t*t*c.x,y:u*u*u*b.y+3*u*u*t*curve.p1.y+3*u*t*t*curve.p2.y+t*t*t*c.y,r:b.r+(c.r-b.r)*t});}
    }
  }else for(const point of knots)points.push(point);
  const radius=knots[0]?.r??0,uniform=knots.every(p=>Math.abs(p.r-radius)<=Math.max(.0001,radius*.001));
  return {knots,points,curves,uniform,radius};
}

const boundsCache=new WeakMap<StrokeGeometry,{minX:number;minY:number;maxX:number;maxY:number}>();
export function strokeBounds(stroke: Stroke) {
  const geometry=strokeGeometry(stroke),cached=boundsCache.get(geometry);if(cached)return cached;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of geometry.points) {
    minX = Math.min(minX, p.x - p.r);
    minY = Math.min(minY, p.y - p.r);
    maxX = Math.max(maxX, p.x + p.r);
    maxY = Math.max(maxY, p.y + p.r);
  }
  const bounds={minX,minY,maxX,maxY};boundsCache.set(geometry,bounds);return bounds;
}

export function strokeErasuresContain(stroke:Stroke,p:Vec):boolean{
  for(const area of stroke.erasures??[]){const points=area.points;if(points.length===1&&Math.hypot(p.x-points[0]!.x,p.y-points[0]!.y)<=area.radius)return true;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=area.radius)return true;}}
  return false;
}

interface SegmentBounds {minX:number;minY:number;maxX:number;maxY:number}
interface SegmentNode extends SegmentBounds {from:number;to:number;left?:SegmentNode;right?:SegmentNode}
const segmentIndexes=new WeakMap<StrokeGeometry,SegmentNode>();
function segmentIndex(geometry:StrokeGeometry):SegmentNode|undefined {
  const points=geometry.points;if(points.length<2)return;
  const existing=segmentIndexes.get(geometry);if(existing)return existing;
  const build=(from:number,to:number):SegmentNode=>{
    if(to-from>64){const middle=(from+to)>>>1,left=build(from,middle),right=build(middle,to);return {from,to,left,right,minX:Math.min(left.minX,right.minX),minY:Math.min(left.minY,right.minY),maxX:Math.max(left.maxX,right.maxX),maxY:Math.max(left.maxY,right.maxY)};}
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(let i=from;i<to;i++){const a=points[i-1]!,b=points[i]!;minX=Math.min(minX,a.x-a.r,b.x-b.r);minY=Math.min(minY,a.y-a.r,b.y-b.r);maxX=Math.max(maxX,a.x+a.r,b.x+b.r);maxY=Math.max(maxY,a.y+a.r,b.y+b.r);}
    return {from,to,minX,minY,maxX,maxY};
  };
  const root=build(1,points.length);segmentIndexes.set(geometry,root);return root;
}

/** Visit the exact sampled segments intersecting a conservative query box.
 * Radius-aware hierarchy skips distant parts without simplifying paint/cuts. */
export function visitStrokeSegmentsInBounds(stroke:Stroke,bounds:SegmentBounds,visit:(a:StrokePoint,b:StrokePoint)=>boolean):boolean {
  const geometry=strokeGeometry(stroke),points=geometry.points;
  if(points.length<512){for(let i=1;i<points.length;i++)if(visit(points[i-1]!,points[i]!))return true;return false;}
  const root=segmentIndex(geometry);if(!root)return false;const pending=[root];
  while(pending.length){const node=pending.pop()!;if(node.maxX<bounds.minX||node.minX>bounds.maxX||node.maxY<bounds.minY||node.minY>bounds.maxY)continue;if(node.left&&node.right){pending.push(node.right,node.left);continue;}for(let i=node.from;i<node.to;i++)if(visit(points[i-1]!,points[i]!))return true;}
  return false;
}

export function distanceToStroke(p: Vec, stroke: Stroke): number {
  if(strokeErasuresContain(stroke,p))return Infinity;
  let best = Infinity;
  const geometry=strokeGeometry(stroke),points=geometry.points,check=(from:number,to:number)=>{for(let i=from;i<to;i++){const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)-(a.r+(b.r-a.r)*t));if(best<=0)return true;}return false;};
  if(points.length<512)check(1,points.length);
  else {
    const distanceSquared=(node:SegmentBounds)=>{const dx=Math.max(node.minX-p.x,0,p.x-node.maxX),dy=Math.max(node.minY-p.y,0,p.y-node.maxY);return dx*dx+dy*dy;},root=segmentIndex(geometry),pending=root?[root]:[];
    while(pending.length){const node=pending.pop()!;if(distanceSquared(node)>=best*best)continue;if(node.left&&node.right){const a=distanceSquared(node.left),b=distanceSquared(node.right);if(a<b)pending.push(node.right,node.left);else pending.push(node.left,node.right);}else if(check(node.from,node.to))break;}
  }
  if (points.length === 1) {
    best = Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y)-points[0]!.r;
  }
  return Math.max(0, best);
}
