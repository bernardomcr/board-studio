import {AlphaFilter,Container,Graphics,Rectangle} from 'pixi.js';
import type {Camera} from './core/camera';
import type {StrokePoint,Stroke} from './core/strokes';
import type {DrawingSettings} from './drawing-ui';
import {paintStroke,clearStrokePaint} from './render/stroke-paint';

/** Completed sections remain immutable: one input sample never rebuilds the whole scribble. */
export function installBrushPreview(stage:Container,camera:Camera){
  const layer=new Container();layer.label='brush-preview';layer.eventMode='none';stage.addChild(layer);
  const opacity=new AlphaFilter({alpha:1});let tail=new Graphics();layer.addChild(tail);
  let frozen=0,scheduled=0,current:{points:StrokePoint[];settings:DrawingSettings}|undefined,cameraKey='',pointsReference:StrokePoint[]|undefined,geometryStyle='';
  const resetGeometry=()=>{for(const child of layer.removeChildren())child.destroy({children:true});tail=new Graphics();layer.addChild(tail);frozen=0;};
  function paint(){
    scheduled=0;if(!current)return;
    const key=[camera.x,camera.y,camera.scale,camera.width,camera.height].join('|'),style=[current.settings.color,current.settings.precision,current.settings.width].join('|');
    if(key!==cameraKey||current.points!==pointsReference||style!==geometryStyle){resetGeometry();cameraKey=key;pointsReference=current.points;geometryStyle=style;}
    const {points,settings}=current,stroke:Stroke={id:'live-brush',type:'stroke',tool:'brush',points,color:settings.color,precision:settings.precision,opacity:1,z:0};
    opacity.alpha=settings.opacity;layer.filters=settings.opacity<1?[opacity]:null;layer.filterArea=new Rectangle(0,0,camera.width,camera.height);
    const options={transform:(p:{x:number;y:number})=>camera.worldToScreen(p),scale:camera.scale};
    const complete=Math.max(0,Math.floor((points.length-1-4)/128)*128);
    while(frozen<complete){const g=new Graphics();paintStroke(g,stroke,{...options,startSegment:frozen,endSegment:frozen+128});layer.addChildAt(g,layer.children.length-1);frozen+=128;}
    paintStroke(tail,stroke,{...options,startSegment:frozen,endSegment:Math.max(0,points.length-1)});
  }
  const request=()=>{if(!scheduled&&current)scheduled=requestAnimationFrame(paint);};
  function clear(){if(scheduled)cancelAnimationFrame(scheduled);scheduled=0;current=undefined;resetGeometry();layer.filters=null;cameraKey='';pointsReference=undefined;geometryStyle='';clearStrokePaint(tail);}
  return {update:(points:StrokePoint[],settings:DrawingSettings)=>{current={points,settings};request();},request,flush:()=>{if(scheduled)cancelAnimationFrame(scheduled);paint();},clear,layer};
}

/** A circular tip and an explicit Alt adjustment HUD, independent from the drawing geometry. */
export function installBrushCursor(api:{camera:Camera;getTool():string;getSettings():DrawingSettings;temporaryHand():boolean}){
  const ring=document.createElement('div'),hud=document.createElement('div');ring.id='brush-tip';hud.id='brush-adjustment';
  ring.style.cssText='position:fixed;border:1px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #15171b99;pointer-events:none;transform:translate(-50%,-50%);z-index:48;display:none;box-sizing:border-box';
  hud.style.cssText='position:fixed;background:#fff;color:#292823;border:1px solid #e0e2e8;border-radius:7px;padding:9px 12px;box-shadow:0 4px 16px #0002;font:12px Inter,Segoe UI,sans-serif;white-space:nowrap;pointer-events:none;z-index:49;display:none';
  document.body.append(ring,hud);let x=0,y=0,inside=false,adjusting=false;
  const update=()=>{const active=['brush','highlighter'].includes(api.getTool())&&inside&&!api.temporaryHand()&&!document.body.classList.contains('home-visible');ring.style.display=active?'block':'none';hud.style.display=active&&adjusting?'block':'none';if(!active)return;const s=api.getSettings(),size=Math.max(2,s.width*api.camera.scale);Object.assign(ring.style,{left:`${x}px`,top:`${y}px`,width:`${size}px`,height:`${size}px`,background:adjusting?s.color+'22':'transparent'});hud.textContent=`Tamanho ${Math.round(s.width*10)/10}  ·  Opacidade ${Math.round(s.opacity*100)}%`;hud.style.left=`${Math.max(10,Math.min(innerWidth-250,x+24))}px`;hud.style.top=`${Math.max(10,Math.min(innerHeight-50,y+24))}px`;};
  return {move:(px:number,py:number)=>{x=px;y=py;inside=true;update();},leave:()=>{inside=false;update();},adjusting:(value:boolean)=>{adjusting=value;update();},update};
}
