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

export interface Stroke {
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
  points: StrokePoint[];
  z: number;
}

export interface StrokeCubic {p0:StrokePoint;p1:Vec;p2:Vec;p3:StrokePoint}
export interface StrokeGeometry {knots:StrokePoint[];points:StrokePoint[];curves:StrokeCubic[];uniform:boolean;radius:number}
const geometryCache=new WeakMap<StrokePoint[],{length:number;lastX:number;lastY:number;lastR:number;precision:boolean;smoothing:number;geometry:StrokeGeometry}>();
/** A fitted point plus its tangent needs at most this many future raw samples. */
export const PRECISION_LOOKAHEAD=98;
export const strokeOpacity=(stroke:Stroke):number=>Math.max(0,Math.min(1,stroke.opacity??(stroke.tool==='highlighter'?.35:1)));
const safePoint=(point:StrokePoint):StrokePoint=>({x:point.x,y:point.y,r:Math.max(.01,point.r)});

/** Local smoothing never changes the finished interior when more input arrives. */
function precisionPoint(points:StrokePoint[],index:number,smoothing:number,at:(i:number)=>StrokePoint):StrokePoint{
  const point=at(index);
  if(points.length<3||index===0||index===points.length-1||smoothing<=0)return point;
  // Integrate over arc length rather than sample count. Fast/coalesced input and
  // dense slow input therefore receive the same visible smoothing window.
  const sigma=smoothing*.5,window=smoothing*1.5,variance=2*sigma*sigma;
  let sumX=0,sumY=0,total=0,left=0,right=0;
  for(const direction of [-1,1]){
    let previous=point,travel=0;
    for(let step=1;step<=PRECISION_LOOKAHEAD-2;step++){
      const nextIndex=index+step*direction;if(nextIndex<0||nextIndex>=points.length)break;
      const next=at(nextIndex),length=Math.hypot(next.x-previous.x,next.y-previous.y);if(length<1e-8){previous=next;continue;}
      const segment=Math.min(length,window-travel),middle=travel+segment*.5,weight=segment*Math.exp(-middle*middle/variance),fraction=segment/(2*length);
      sumX+=(previous.x+(next.x-previous.x)*fraction)*weight;sumY+=(previous.y+(next.y-previous.y)*fraction)*weight;total+=weight;travel+=segment;
      if(travel>=window)break;previous=next;
    }
    if(direction<0)left=travel;else right=travel;
  }
  if(total<1e-12)return point;
  // Preserve the exact pen-down/up position and ease the nearby fit into it.
  const amount=Math.min(1,left/window,right/window);
  return {x:point.x+(sumX/total-point.x)*amount,y:point.y+(sumY/total-point.y)*amount,r:point.r};
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
  const raw=stroke.points,precision=stroke.precision??stroke.tool==='pen',smoothing=stroke.precisionSmoothing??8,from=Math.max(0,start),to=Math.min(raw.length-1,end),memo=new Map<number,StrokePoint>(),rawMemo=new Map<number,StrokePoint>();
  const rawAt=(i:number)=>{let point=rawMemo.get(i);if(!point){point=safePoint(raw[i]!);rawMemo.set(i,point);}return point;};
  const at=(i:number)=>{const index=Math.max(0,Math.min(raw.length-1,i));let p=memo.get(index);if(!p){p=precision?precisionPoint(raw,index,smoothing,rawAt):rawAt(index);memo.set(index,p);}return p;};
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

export function distanceToStroke(p: Vec, stroke: Stroke): number {
  let best = Infinity;
  const points=strokeGeometry(stroke).points;
  for (let i = 1; i < points.length; i++) {
    const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
    best = Math.min(best, Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)-(a.r+(b.r-a.r)*t));
  }
  if (points.length === 1) {
    best = Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y)-points[0]!.r;
  }
  return Math.max(0, best);
}
