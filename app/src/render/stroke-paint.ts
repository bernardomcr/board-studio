import {AlphaFilter,type Graphics} from 'pixi.js';
import {strokeGeometry,strokeGeometryRange,strokeOpacity,type Stroke} from '../core/strokes';
import type {Vec} from '../core/geometry';
import {strokeRenderPoints,strokeScreenCoverage,strokeMinimumWidth} from './stroke-lod';
export {strokeScreenCoverage,strokeRenderKey} from './stroke-lod';

interface PaintOptions {
  clear?:boolean;
  transform?:(point:Vec)=>Vec;
  scale?:number;
  /** CSS screen pixels per output coordinate (world render uses camera zoom). */
  zoom?:number;
  /** Preview chunks apply opacity/coverage once on their common parent. */
  applyCoverage?:boolean;
  /** Optional stable centerline segment range, for bounded live-preview chunks. */
  startSegment?:number;
  endSegment?:number;
}
const opacityFilters=new WeakMap<Graphics,AlphaFilter>();
export function clearStrokePaint(graphics:Graphics):void{graphics.clear();graphics.filters=null;}

/** A stroked centerline is triangulated locally, so loops can never fill their interior. */
export function paintStroke(graphics:Graphics,stroke:Stroke,options:PaintOptions={}):void{
  if(options.clear!==false)graphics.clear();
  if(!stroke.points.length){graphics.filters=null;return;}
  const ranged=options.startSegment!==undefined||options.endSegment!==undefined;
  const geometry=ranged?strokeGeometryRange(stroke,options.startSegment??0,options.endSegment??stroke.points.length-1):strokeGeometry(stroke),transform=options.transform??((p:Vec)=>p),color=stroke.color;
  const scale=Math.abs(options.scale??1),zoom=Math.abs(options.zoom??1),minimum=strokeMinimumWidth(zoom),firstWidth=(stroke.points[0]?.r??0)*2*scale;
  const coverage=options.applyCoverage===false||!geometry.uniform?1:strokeScreenCoverage(firstWidth,zoom),opacity=strokeOpacity(stroke)*coverage;
  if(opacity<1){let filter=opacityFilters.get(graphics);if(!filter){filter=new AlphaFilter({alpha:opacity});opacityFilters.set(graphics,filter);}filter.alpha=opacity;graphics.filters=[filter];}else graphics.filters=null;
  const from=0,to=geometry.knots.length-1;
  if(geometry.knots.length===1){const p=transform(geometry.knots[0]!);graphics.circle(p.x,p.y,Math.max(geometry.radius*scale,minimum/2)).fill(color);return;}
  if(from>=to)return;
  if(geometry.uniform){
    const points=ranged?geometry.knots:strokeRenderPoints(geometry,scale*zoom),first=transform(points[0]!);graphics.moveTo(first.x,first.y);
    if(ranged&&geometry.curves.length){const smoothness=Math.max(0,Math.min(.99,1-.15/(zoom*Math.min(3,globalThis.devicePixelRatio||1))));for(const curve of geometry.curves){const a=transform(curve.p1),b=transform(curve.p2),c=transform(curve.p3);graphics.bezierCurveTo(a.x,a.y,b.x,b.y,c.x,c.y,smoothness);}}
    else for(const point of points.slice(1)){const p=transform(point);graphics.lineTo(p.x,p.y);}
    graphics.stroke({color,width:Math.max(geometry.radius*2*scale,minimum),cap:'round',join:'round'});return;
  }
  // Legacy pressure strokes: each segment is a local trapezoid with round joins.
  // There is no global polygon for earcut to connect across a loop or reversal.
  const points=(ranged?geometry.points:strokeRenderPoints(geometry,scale*zoom)).map(p=>({...transform(p),r:p.r*scale}));
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.00001)continue;
    const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
    graphics.poly([a.x+nx*a.r,a.y+ny*a.r,b.x+nx*b.r,b.y+ny*b.r,b.x-nx*b.r,b.y-ny*b.r,a.x-nx*a.r,a.y-ny*a.r]).fill(color);
  }
  for(const p of points)graphics.circle(p.x,p.y,p.r).fill(color);
}

const n=(value:number)=>String(Math.round(value*10000)/10000);
const escaped=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function strokeSvgContent(stroke:Stroke):string{
  const geometry=strokeGeometry(stroke),color=escaped(stroke.color),opacity=strokeOpacity(stroke),first=geometry.knots[0];if(!first)return '';
  if(geometry.knots.length===1)return `<circle cx="${n(first.x)}" cy="${n(first.y)}" r="${n(first.r)}" fill="${color}" opacity="${opacity}"/>`;
  if(geometry.uniform){
    const d=`M${n(first.x)} ${n(first.y)} `+(geometry.curves.length?geometry.curves.map(c=>`C${n(c.p1.x)} ${n(c.p1.y)} ${n(c.p2.x)} ${n(c.p2.y)} ${n(c.p3.x)} ${n(c.p3.y)}`).join(' '):geometry.knots.slice(1).map(p=>`L${n(p.x)} ${n(p.y)}`).join(' '));
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(geometry.radius*2)}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  }
  const parts:string[]=[];
  for(let i=1;i<geometry.points.length;i++){
    const a=geometry.points[i-1]!,b=geometry.points[i]!,length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.00001)continue;
    const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
    parts.push(`<polygon points="${[a.x+nx*a.r,a.y+ny*a.r,b.x+nx*b.r,b.y+ny*b.r,b.x-nx*b.r,b.y-ny*b.r,a.x-nx*a.r,a.y-ny*a.r].map(n).join(' ')}"/>`);
  }
  for(const p of geometry.points)parts.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}"/>`);
  return `<g fill="${color}" opacity="${opacity}">${parts.join('')}</g>`;
}
