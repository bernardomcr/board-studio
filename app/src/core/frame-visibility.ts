import type {BoardState} from './commands';
import type {Widget} from './model';
import {pointInWidget,widgetCenter,widgetCorners,worldToLocal,type Vec} from './geometry';
import {mindNodeHidden} from './mindmap';

/** The renderer and input surfaces must use the same implicit frame ownership. */
export function visibleFrames(state:BoardState):Widget[]{
 return [...state.widgets.values()].filter(w=>w.type==='frame'&&!w.hidden&&!mindNodeHidden(state,w.id));
}

/** Frames do not clip other frames. The smallest frame containing the center wins;
 * equal areas retain map order, independently of the widget's layer position. */
export function frameForWidget(w:Widget,frames:readonly Widget[]):Widget|undefined{
 if(w.type==='frame')return;
 const center=widgetCenter(w);let best:Widget|undefined,bestArea=Infinity;
 for(const frame of frames){
  if(frame.type!=='frame'||frame.id===w.id||frame.hidden||!pointInWidget(frame,center))continue;
  const area=frame.width*frame.height;if(area<bestArea){best=frame;bestArea=area;}
 }
 return best;
}

/** Tests the frame mask only, so callers may also check nearby anchors/controls. */
export function framePointVisible(w:Widget,point:Vec,frames:readonly Widget[]):boolean{
 const frame=frameForWidget(w,frames);return !frame||pointInWidget(frame,point);
}

export function pointInVisibleWidget(w:Widget,point:Vec,frames:readonly Widget[]):boolean{
 return pointInWidget(w,point)&&framePointVisible(w,point,frames);
}

export interface FrameLocalRect {x:number;y:number;width:number;height:number}

/** Visible polygon of an HTML control in its own, unscaled local coordinates.
 * Intersecting the whole rectangle (rather than testing its center) preserves
 * narrow visible fragments and clips rotated frames exactly like the Pixi mask. */
export function localRectFramePolygon(w:Widget,rect:FrameLocalRect,frames:readonly Widget[]):Vec[]{
 let polygon:Vec[]=[{x:0,y:0},{x:rect.width,y:0},{x:rect.width,y:rect.height},{x:0,y:rect.height}];
 const frame=frameForWidget(w,frames);if(!frame)return polygon;
 const clip=widgetCorners(frame).map(point=>{const local=worldToLocal(w,point);return {x:local.x-rect.x,y:local.y-rect.y};});
 const side=(a:Vec,b:Vec,p:Vec)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
 for(let i=0;i<clip.length&&polygon.length;i++){
  const a=clip[i]!,b=clip[(i+1)%clip.length]!,input=polygon;polygon=[];
  let previous=input[input.length-1]!,previousSide=side(a,b,previous);
  for(const current of input){
   const currentSide=side(a,b,current),inside=currentSide>=0,previousInside=previousSide>=0;
   if(inside!==previousInside){const t=previousSide/(previousSide-currentSide);polygon.push({x:previous.x+(current.x-previous.x)*t,y:previous.y+(current.y-previous.y)*t});}
   if(inside)polygon.push(current);
   previous=current;previousSide=currentSide;
  }
 }
 const twiceArea=polygon.reduce((sum,p,i)=>{const next=polygon[(i+1)%polygon.length]!;return sum+p.x*next.y-next.x*p.y;},0);
 return polygon.length>=3&&Math.abs(twiceArea)>Number.EPSILON?polygon:[];
}

export function framePolygonCss(polygon:readonly Vec[]):string{
 return `polygon(${polygon.map(p=>`${p.x}px ${p.y}px`).join(',')})`;
}
