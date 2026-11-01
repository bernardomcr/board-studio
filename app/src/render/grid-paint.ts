import type {Graphics} from 'pixi.js';
import type {Camera} from '../core/camera';
import {DEFAULT_BACKGROUND,type BoardBackground} from '../core/background';
import {gridStateAt} from '../core/grid';

export type GridPattern='dots'|'lines'|'crosses'|'none';
export function boardGridPattern(background?:BoardBackground):GridPattern{return background?.grid===false?'none':background?.gridStyle??'dots';}
const retained=new WeakMap<Graphics,string>();
const phase=(value:number,period:number)=>((value%period)+period)%period;

/** Screen-sized marks stay anchored in world space; changing the scenery does
 * not alter snapping or introduce extra selectable canvas objects. */
export function paintBoardGrid(g:Graphics,camera:Camera,background?:BoardBackground):void{
 const pattern=boardGridPattern(background);g.label='board-grid';
 if(pattern==='none'){if(retained.get(g)!=='none'){g.clear();retained.set(g,'none');}g.position.set(0,0);g.alpha=1;g.visible=false;return;}
 const cell=gridStateAt(camera.scale).visualCell,step=cell*camera.scale;if(step<6){g.visible=false;return;}
 g.visible=true;g.alpha=background?.gridOpacity??1;
 const alpha=Math.min(1,Math.max(.18,step/24)),period=step*(pattern==='lines'?5:1);
 // The visible pattern repeats. Retain its vector geometry with one period of
 // overscan and translate only the subpixel phase while panning. Rebuilding ten
 // thousand circles every camera frame spent more CPU than the board itself.
 g.position.set(phase(camera.width/2-camera.x*camera.scale,period),phase(camera.height/2-camera.y*camera.scale,period));
 const rgb=Number.parseInt((background?.color??DEFAULT_BACKGROUND.color).slice(1),16),dark=((rgb>>16)*.2126+((rgb>>8)&255)*.7152+(rgb&255)*.0722)<110,color=dark?0x767b88:0xc9c8c3;
 const key=[pattern,step,camera.width,camera.height,dark,color,alpha].join('|');if(retained.get(g)===key)return;retained.set(g,key);g.clear();
 const first=pattern==='lines'?-5:-1,columns=Math.min(2000,Math.ceil(camera.width/step)-first+2),rows=Math.min(2000,Math.ceil(camera.height/step)-first+2);
 if(pattern==='lines'){
  for(const major of [false,true]){
   for(let i=0;i<columns;i++){const n=first+i;if((Math.abs(n%5)===0)===major)g.moveTo(n*step,-period).lineTo(n*step,camera.height+period);}
   for(let i=0;i<rows;i++){const n=first+i;if((Math.abs(n%5)===0)===major)g.moveTo(-period,n*step).lineTo(camera.width+period,n*step);}
   g.stroke({width:1,color,alpha:dark?alpha*(major?.5:.28):alpha*(major?.7:.4)});
  }
  return;
 }
 let count=0;const radius=Math.min(2,Math.max(.75,step/40));
 for(let i=0;i<columns;i++){const x=(first+i)*step;for(let j=0;j<rows;j++){const y=(first+j)*step;if(++count>60_000)break;if(pattern==='crosses')g.moveTo(x-2,y).lineTo(x+2,y).moveTo(x,y-2).lineTo(x,y+2);else g.circle(x,y,radius);}if(count>60_000)break;}
 if(pattern==='crosses')g.stroke({width:1,color,alpha:dark?alpha*.5:alpha});else g.fill({color,alpha:dark?alpha*.45:alpha});
}
