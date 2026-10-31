import {AlphaFilter,Container,Graphics,Rectangle} from 'pixi.js';
import type {Camera} from './core/camera';
import type {StrokePoint,Stroke,StrokeGeometry} from './core/strokes';
import {PRECISION_LOOKAHEAD,strokeGeometryRange} from './core/strokes';
import type {DrawingSettings} from './drawing-ui';
import {paintStroke,clearStrokePaint,strokeScreenCoverage} from './render/stroke-paint';
import {destroyDisplayTree} from './render/destroy-tree';

interface BrushBounds {minX:number;minY:number;maxX:number;maxY:number}
function rangeBounds(geometry:StrokeGeometry):BrushBounds|undefined {
  if(!geometry.knots.length)return;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,radius=0;
  for(const point of geometry.knots){minX=Math.min(minX,point.x);minY=Math.min(minY,point.y);maxX=Math.max(maxX,point.x);maxY=Math.max(maxY,point.y);radius=Math.max(radius,point.r);}
  // Cubic curves stay inside their control hull, including tangent overshoot.
  for(const curve of geometry.curves){minX=Math.min(minX,curve.p1.x,curve.p2.x);minY=Math.min(minY,curve.p1.y,curve.p2.y);maxX=Math.max(maxX,curve.p1.x,curve.p2.x);maxY=Math.max(maxY,curve.p1.y,curve.p2.y);}
  return {minX:minX-radius,minY:minY-radius,maxX:maxX+radius,maxY:maxY+radius};
}
const unionBounds=(a:BrushBounds|undefined,b:BrushBounds|undefined):BrushBounds|undefined=>!a?b:!b?a:{minX:Math.min(a.minX,b.minX),minY:Math.min(a.minY,b.minY),maxX:Math.max(a.maxX,b.maxX),maxY:Math.max(a.maxY,b.maxY)};

/** Completed sections remain immutable: one input sample never rebuilds the whole scribble. */
export function installBrushPreview(stage:Container,camera:Camera){
  const layer=new Container();layer.label='brush-preview';layer.eventMode='none';stage.addChild(layer);
  const opacity=new AlphaFilter({alpha:1,resolution:'inherit',antialias:'inherit'});let tail=new Graphics();layer.addChild(tail);
  let frozen=0,scheduled=0,current:{points:StrokePoint[];settings:DrawingSettings}|undefined,cameraKey='',pointsReference:StrokePoint[]|undefined,geometryStyle='',frozenBounds:BrushBounds|undefined;
  const filterArea=new Rectangle();
  const resetGeometry=()=>{for(const child of layer.removeChildren())destroyDisplayTree(child);tail=new Graphics();layer.addChild(tail);frozen=0;frozenBounds=undefined;};
  function paint(){
    scheduled=0;if(!current)return;
    const key=[camera.x,camera.y,camera.scale,camera.width,camera.height,devicePixelRatio].join('|'),style=[current.settings.color,current.settings.precision,current.settings.precisionSmoothing,current.settings.width].join('|');
    if(key!==cameraKey||current.points!==pointsReference||style!==geometryStyle){resetGeometry();cameraKey=key;pointsReference=current.points;geometryStyle=style;}
    const {points,settings}=current,stroke:Stroke={id:'live-brush',type:'stroke',tool:'brush',points,color:settings.color,precision:settings.precision,precisionSmoothing:settings.precisionSmoothing,opacity:1,z:0};
    opacity.alpha=settings.opacity*strokeScreenCoverage(settings.width*camera.scale,1);layer.filters=opacity.alpha<1?[opacity]:null;
    const options={transform:(p:{x:number;y:number})=>camera.worldToScreen(p),scale:camera.scale,zoom:1,applyCoverage:false};
    const lookahead=settings.precision?PRECISION_LOOKAHEAD:1,complete=Math.max(0,Math.floor((points.length-1-lookahead)/128)*128);
    while(frozen<complete){const g=new Graphics(),geometry=strokeGeometryRange(stroke,frozen,frozen+128);paintStroke(g,stroke,{...options,geometry,startSegment:frozen,endSegment:frozen+128});frozenBounds=unionBounds(frozenBounds,rangeBounds(geometry));layer.addChildAt(g,layer.children.length-1);frozen+=128;}
    const geometry=strokeGeometryRange(stroke,frozen,Math.max(0,points.length-1));
    paintStroke(tail,stroke,{...options,geometry,startSegment:frozen,endSegment:Math.max(0,points.length-1)});
    const bounds=unionBounds(frozenBounds,rangeBounds(geometry));
    if(bounds){const a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY}),left=Math.max(0,Math.min(camera.width,a.x-2)),top=Math.max(0,Math.min(camera.height,a.y-2)),right=Math.max(0,Math.min(camera.width,b.x+2)),bottom=Math.max(0,Math.min(camera.height,b.y+2));filterArea.x=left;filterArea.y=top;filterArea.width=Math.max(1,right-left);filterArea.height=Math.max(1,bottom-top);layer.filterArea=filterArea;}
  }
  const request=()=>{if(!scheduled&&current)scheduled=requestAnimationFrame(paint);};
  function clear(){if(scheduled)cancelAnimationFrame(scheduled);scheduled=0;current=undefined;resetGeometry();layer.filters=null;cameraKey='';pointsReference=undefined;geometryStyle='';clearStrokePaint(tail);}
  return {update:(points:StrokePoint[],settings:DrawingSettings)=>{current={points,settings};request();},request,flush:()=>{if(scheduled)cancelAnimationFrame(scheduled);paint();},clear,layer};
}

/** A circular tip and an explicit Alt adjustment HUD, independent from the drawing geometry. */
export function installBrushCursor(api:{camera:Camera;getTool():string;getSettings():DrawingSettings;getEraserRadius?():number;temporaryHand():boolean}){
  const ring=document.createElement('div'),hud=document.createElement('div');ring.id='brush-tip';hud.id='brush-adjustment';
  ring.style.cssText='position:fixed;border:1px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #15171b99;pointer-events:none;transform:translate(-50%,-50%);z-index:48;display:none;box-sizing:border-box';
  hud.style.cssText='position:fixed;background:#fff;color:#292823;border:1px solid #e0e2e8;border-radius:7px;padding:9px 12px;box-shadow:0 4px 16px #0002;font:12px Inter,Segoe UI,sans-serif;white-space:nowrap;pointer-events:none;z-index:49;display:none';
  document.body.append(ring,hud);let x=0,y=0,inside=false,adjusting=false;
  const update=()=>{const tool=api.getTool(),erasing=tool==='eraser',active=['brush','highlighter','eraser'].includes(tool)&&inside&&!api.temporaryHand()&&!document.body.classList.contains('home-visible');ring.style.display=active?'block':'none';hud.style.display=active&&adjusting?'block':'none';if(!active)return;const s=api.getSettings(),radius=api.getEraserRadius?.()??12,size=Math.max(2,erasing?radius*2:s.width*api.camera.scale);ring.dataset.brushTool=tool;Object.assign(ring.style,{left:`${x}px`,top:`${y}px`,width:`${size}px`,height:`${size}px`,background:adjusting?(erasing?'#4262ff22':s.color+'22'):'transparent'});hud.textContent=erasing?`Raio ${Math.round(radius*10)/10}`:`Tamanho ${Math.round(s.width*10)/10}  ·  Opacidade ${Math.round(s.opacity*100)}%`;hud.style.left=`${Math.max(10,Math.min(innerWidth-250,x+24))}px`;hud.style.top=`${Math.max(10,Math.min(innerHeight-50,y+24))}px`;};
  return {move:(px:number,py:number)=>{x=px;y=py;inside=true;update();},leave:()=>{inside=false;update();},adjusting:(value:boolean)=>{adjusting=value;update();},update};
}
