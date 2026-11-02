import {AlphaFilter,Container,Graphics,StencilMask} from 'pixi.js';
import {strokeGeometry,strokeGeometryRange,strokeOpacity,strokeBounds,type Stroke,type StrokeGeometry} from '../core/strokes';
import type {Vec} from '../core/geometry';
import {strokeRenderPoints,strokeScreenCoverage,strokeMinimumWidth} from './stroke-lod';
import {destroyDisplayTree} from './destroy-tree';
export {strokeScreenCoverage,strokeRenderKey} from './stroke-lod';

interface PaintOptions {
  /** A live preview can reuse its fitted range for painting and filter bounds. */
  geometry?:StrokeGeometry;
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
interface EraserMaskChunk {graphics:Graphics;points:Array<Vec&{r:number}>;density:number;radius:number}
interface EraserMask {container:Container;chunks:EraserMaskChunk[]}
const eraserMasks=new WeakMap<Graphics,EraserMask>();
/** Bound tessellation work to the changing tail of a live eraser path. */
const ERASER_CHUNK_SEGMENTS=32;
const identityPoint=(point:Vec):Vec=>point;
const maskCleanupInstalled=new WeakSet<Graphics>();
const retainedPaints=new WeakMap<Graphics,{geometry:StrokeGeometry;key:string;instruction:unknown}>();
/** Pixi's standard stencil bounds intersect with the mask's bounds even when the
 * mask is inverse. That crops AlphaFilter to the erased hole. An inverse mask
 * only subtracts pixels and must preserve the painted object's original bounds. */
class StrokeInverseMask extends StencilMask{
  constructor(mask:Container){super({mask});}
  override addBounds():void{}
  override addLocalBounds():void{}
  override containsPoint(...args:Parameters<StencilMask['containsPoint']>):boolean{return !super.containsPoint(...args);}
}
const eraserEffects=new WeakMap<Graphics,StrokeInverseMask>();
function removeEraserMask(graphics:Graphics):void{const effect=eraserEffects.get(graphics);if(effect){graphics.removeEffect(effect);effect.destroy();eraserEffects.delete(graphics);}const mask=eraserMasks.get(graphics);if(mask){destroyDisplayTree(mask.container);eraserMasks.delete(graphics);}}
export function clearStrokePaint(graphics:Graphics):void{retainedPaints.delete(graphics);graphics.clear();graphics.filters=null;removeEraserMask(graphics);}

function arcSteps(radius:number,angle:number,density:number):number{
  const screen=Math.max(.001,radius*density),step=2*Math.acos(Math.max(-1,Math.min(1,1-.06/screen)));
  return Math.max(1,Math.min(4096,Math.ceil(Math.abs(angle)/Math.max(.00001,step))));
}
/** Independent convex pieces cannot produce the inverted ribbon triangles of a
 * single wide, self-crossing polyline. Round joins use only their outside sector,
 * so smooth paths avoid a full circle worth of geometry at every sample. */
function capsulePath(graphics:Graphics,points:Array<Vec&{r:number}>,density:number,fullJoins=false):void{
  if(!points.length)return;
  const circle=(p:Vec&{r:number})=>{const count=Math.max(8,arcSteps(p.r,Math.PI*2,density)),coords:number[]=[];for(let i=0;i<count;i++){const a=i/count*Math.PI*2;coords.push(p.x+Math.cos(a)*p.r,p.y+Math.sin(a)*p.r);}graphics.poly(coords);};
  if(points.length===1){circle(points[0]!);return;}
  const directions:Array<Vec|undefined>=[];
  for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-9){directions.push(undefined);continue;}const d={x:(b.x-a.x)/length,y:(b.y-a.y)/length};directions.push(d);const nx=-d.y,ny=d.x,overlap=.06/Math.max(1e-9,density),ax=a.x-d.x*overlap,ay=a.y-d.y*overlap,bx=b.x+d.x*overlap,by=b.y+d.y*overlap;graphics.poly([ax+nx*a.r,ay+ny*a.r,bx+nx*b.r,by+ny*b.r,bx-nx*b.r,by-ny*b.r,ax-nx*a.r,ay-ny*a.r]);}
  circle(points[0]!);circle(points.at(-1)!);
  for(let i=1;i<points.length-1;i++){const p=points[i]!,a=directions[i-1],b=directions[i];if(fullJoins||!a||!b){circle(p);continue;}const cross=a.x*b.y-a.y*b.x,dot=Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y)),angle=Math.atan2(cross,dot);if(Math.abs(angle)<1e-8)continue;const sign=angle>0?-1:1,start=Math.atan2(a.x*sign,-a.y*sign),count=arcSteps(p.r,angle,density),coords=[p.x,p.y];for(let j=0;j<=count;j++){const t=start+angle*j/count;coords.push(p.x+Math.cos(t)*p.r,p.y+Math.sin(t)*p.r);}graphics.poly(coords);}
}

function updateEraserMask(graphics:Graphics,stroke:Stroke,transform:(point:Vec)=>Vec,scale:number,zoom:number):void{
  if(!stroke.erasures?.length){removeEraserMask(graphics);return;}
  let mask=eraserMasks.get(graphics);
  if(!mask){
    const container=new Container();container.label='brush-erasure-mask';container.eventMode='none';container.measurable=false;
    mask={container,chunks:[]};graphics.addChild(container);eraserMasks.set(graphics,mask);
    if(!maskCleanupInstalled.has(graphics)){
      maskCleanupInstalled.add(graphics);
      graphics.on('destroyed',()=>{eraserEffects.get(graphics)?.destroy();eraserEffects.delete(graphics);const current=eraserMasks.get(graphics);if(current)destroyDisplayTree(current.container);eraserMasks.delete(graphics);});
    }
  }
  const density=zoom*Math.min(3,globalThis.devicePixelRatio||1);let index=0;
  for(const area of stroke.erasures){
    const radius=area.radius*scale;
    for(let start=0;start<area.points.length;start+=ERASER_CHUNK_SEGMENTS){
      const end=Math.min(start+ERASER_CHUNK_SEGMENTS,area.points.length-1),length=end-start+1;
      let chunk=mask.chunks[index++];
      if(!chunk){const child=new Graphics();child.eventMode='none';child.measurable=false;mask.container.addChild(child);chunk={graphics:child,points:[],radius:NaN,density:NaN};mask.chunks.push(chunk);}
      // Commands own a fresh clone of erasures. Comparing the actual coordinates
      // retains completed GPU geometry across those copies, while also detecting
      // same-length edits, Undo/Redo and mutable transform closures correctly.
      let changed=chunk.radius!==radius||chunk.density!==density||chunk.points.length!==length;
      if(!changed)for(let i=0;i<length;i++){const point=transform(area.points[start+i]!),old=chunk.points[i]!;if(old.x!==point.x||old.y!==point.y){changed=true;break;}}
      if(changed){
        chunk.points=area.points.slice(start,end+1).map(point=>({...transform(point),r:radius}));chunk.radius=radius;chunk.density=density;
        chunk.graphics.clear();capsulePath(chunk.graphics,chunk.points,density);chunk.graphics.fill(0xffffff);
      }
      if(end===area.points.length-1)break;
    }
  }
  for(const chunk of mask.chunks.splice(index))destroyDisplayTree(chunk.graphics);
  // One shared stencil pass is essential: Pixi's EQUAL/increment-clamp mask
  // state unions overlapping children. Separate inverse effects per chunk
  // would instead nest stencil levels and break overlapping erasures.
  if(!eraserEffects.has(graphics)){const effect=new StrokeInverseMask(mask.container);eraserEffects.set(graphics,effect);graphics.setMask({inverse:true});graphics.addEffect(effect);}
}

/** A stroked centerline is triangulated locally, so loops can never fill their interior. */
export function paintStroke(graphics:Graphics,stroke:Stroke,options:PaintOptions={}):void{
  if(!stroke.points.length){clearStrokePaint(graphics);return;}
  const ranged=options.startSegment!==undefined||options.endSegment!==undefined;
  const geometry=options.geometry??(ranged?strokeGeometryRange(stroke,options.startSegment??0,options.endSegment??stroke.points.length-1):strokeGeometry(stroke)),transform=options.transform??identityPoint,color=stroke.color;
  const scale=Math.abs(options.scale??1),zoom=Math.abs(options.zoom??1),minimum=strokeMinimumWidth(zoom),firstWidth=(stroke.points[0]?.r??0)*2*scale;
  const coverage=options.applyCoverage===false||!geometry.uniform?1:strokeScreenCoverage(firstWidth,zoom),opacity=strokeOpacity(stroke)*coverage;
  const retain=!ranged&&!options.transform&&options.clear!==false,key=[color,scale,zoom,globalThis.devicePixelRatio||1,opacity].join('|'),cached=retainedPaints.get(graphics);
  if(retain&&cached?.geometry===geometry&&cached.key===key&&graphics.context.instructions.length===1&&cached.instruction===graphics.context.instructions[0]){updateEraserMask(graphics,stroke,transform,scale,zoom);return;}
  retainedPaints.delete(graphics);if(options.clear!==false)graphics.clear();
  updateEraserMask(graphics,stroke,transform,scale,zoom);
  if(opacity<1){let filter=opacityFilters.get(graphics);if(!filter){filter=new AlphaFilter({alpha:opacity,resolution:'inherit',antialias:'inherit'});opacityFilters.set(graphics,filter);}filter.alpha=opacity;graphics.filters=[filter];}else graphics.filters=null;
  const from=0,to=geometry.knots.length-1;
  if(geometry.knots.length===1){const p=transform(geometry.knots[0]!);capsulePath(graphics,[{...p,r:Math.max(geometry.radius*scale,minimum/2)}],zoom);graphics.fill(color);if(retain)retainedPaints.set(graphics,{geometry,key,instruction:graphics.context.instructions[0]});return;}
  if(from>=to)return;
  const points=strokeRenderPoints(geometry,scale*zoom).map(p=>({...transform(p),r:Math.max(p.r*scale,geometry.uniform?minimum/2:0)}));
  capsulePath(graphics,points,zoom*Math.min(3,globalThis.devicePixelRatio||1),!geometry.uniform);graphics.fill(color);
  if(retain)retainedPaints.set(graphics,{geometry,key,instruction:graphics.context.instructions[0]});
}

const n=(value:number)=>String(Math.round(value*10000)/10000);
const escaped=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function strokeSvgPaint(stroke:Stroke):string{
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

export function strokeSvgContent(stroke:Stroke):string{
  const content=strokeSvgPaint(stroke);if(!stroke.erasures?.length||!content)return content;
  const bounds=strokeBounds(stroke),x=bounds.minX-1,y=bounds.minY-1,width=bounds.maxX-bounds.minX+2,height=bounds.maxY-bounds.minY+2,id='brush-erasure-'+Array.from(stroke.id).map(char=>char.codePointAt(0)!.toString(16)).join('-');
  const holes=stroke.erasures.map(area=>{const first=area.points[0];if(!first)return '';return area.points.length===1?`<circle cx="${n(first.x)}" cy="${n(first.y)}" r="${n(area.radius)}" fill="black"/>`:`<path d="M${area.points.map(p=>`${n(p.x)} ${n(p.y)}`).join(' L')}" fill="none" stroke="black" stroke-width="${n(area.radius*2)}" stroke-linecap="round" stroke-linejoin="round"/>`;}).join('');
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}"><rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="white"/>${holes}</mask></defs><g mask="url(#${id})">${content}</g>`;
}
