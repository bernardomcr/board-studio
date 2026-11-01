import {connectorCapSegment,type Connector,type ConnectorCubic,type ConnectorGeometry} from '../core/connectors';
import type {Vec} from '../core/geometry';

/** Filled decorations own the tip. Finish the rounded shaft inside their body,
 * so its semicircle cannot protrude through the sharp/front boundary. */
function recess(cap:Connector['style']['endCap'],width:number):number{
  const size=Math.max(8,width*4);
  return cap==='triangle'||cap==='diamond'?size*.5:cap==='circle'?size*.4:0;
}
interface Plane{tip:Vec;unit:Vec;distance:number}
function plane(connector:Connector,geometry:ConnectorGeometry,which:'start'|'end'):Plane{
  const tangent=connectorCapSegment(geometry,which),dx=tangent.to.x-tangent.from.x,dy=tangent.to.y-tangent.from.y,length=Math.hypot(dx,dy)||1;
  return {tip:tangent.to,unit:{x:dx/length,y:dy/length},distance:recess(connector.style[which==='start'?'startCap':'endCap'],connector.style.strokeWidth)};
}
const inward=(point:Vec,p:Plane)=>-((point.x-p.tip.x)*p.unit.x+(point.y-p.tip.y)*p.unit.y);
function trimPoints(points:Vec[],p:Plane,reverse=false):Vec[]{
  if(!p.distance)return points;const source=reverse?[...points].reverse():points;
  for(let index=1;index<source.length;index++){
    const a=source[index-1]!,b=source[index]!,from=inward(a,p),to=inward(b,p);
    if(to<p.distance)continue;
    const t=Math.max(0,Math.min(1,(p.distance-from)/(to-from||1))),cut={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},trimmed=[cut,...source.slice(index)];
    return reverse?trimmed.reverse():trimmed;
  }
  return [];
}
function at(c:ConnectorCubic,t:number):Vec{const u=1-t;return {x:u*u*u*c.p0.x+3*u*u*t*c.p1.x+3*u*t*t*c.p2.x+t*t*t*c.p3.x,y:u*u*u*c.p0.y+3*u*u*t*c.p1.y+3*u*t*t*c.p2.y+t*t*t*c.p3.y};}
function split(c:ConnectorCubic,t:number):[ConnectorCubic,ConnectorCubic]{
  const lerp=(a:Vec,b:Vec)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),a=lerp(c.p0,c.p1),b=lerp(c.p1,c.p2),d=lerp(c.p2,c.p3),e=lerp(a,b),f=lerp(b,d),middle=lerp(e,f);
  return [{p0:c.p0,p1:a,p2:e,p3:middle},{p0:middle,p1:f,p2:d,p3:c.p3}];
}
function trimCurves(curves:ConnectorCubic[],p:Plane,reverse=false):ConnectorCubic[]{
  if(!p.distance)return curves;
  // Find the nearest crossing from the decorated endpoint. De Casteljau keeps
  // the remaining curve exact; no flattening or change to its remote tangents.
  for(let sequence=0;sequence<curves.length;sequence++){
    const index=reverse?curves.length-1-sequence:sequence,c=curves[index]!;let previous=reverse?1:0;
    for(let step=1;step<=32;step++){
      const t=reverse?1-step/32:step/32;
      if(inward(at(c,t),p)<p.distance){previous=t;continue;}
      let outside=previous,inside=t;
      for(let iteration=0;iteration<35;iteration++){const middle=(outside+inside)/2;if(inward(at(c,middle),p)>=p.distance)inside=middle;else outside=middle;}
      return reverse?[...curves.slice(0,index),split(c,inside)[0]]:[split(c,inside)[1],...curves.slice(index+1)];
    }
  }
  return [];
}
const retained=new WeakMap<ConnectorGeometry,{key:string;geometry:ConnectorGeometry}>();
/** Paint geometry only: anchors, path handles, labels and exports' model stay
 * attached to the original endpoints. SVG and GPU share this same trimming. */
export function connectorShaftGeometry(connector:Connector,geometry:ConnectorGeometry):ConnectorGeometry{
  const {strokeWidth,startCap,endCap}=connector.style;
  if(!recess(startCap,strokeWidth)&&!recess(endCap,strokeWidth))return geometry;
  const key=[strokeWidth,startCap,endCap].join('|'),cached=retained.get(geometry);if(cached?.key===key)return cached.geometry;
  const start=plane(connector,geometry,'start'),end=plane(connector,geometry,'end'),points=trimPoints(trimPoints(geometry.points,start),end,true),curves=geometry.cubics??(geometry.cubic?[geometry.cubic]:undefined);
  const trimmed:ConnectorGeometry={points,...(curves?{cubics:trimCurves(trimCurves(curves,start),end,true)}:{})};retained.set(geometry,{key,geometry:trimmed});return trimmed;
}
