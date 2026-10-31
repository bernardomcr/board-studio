import type {Graphics} from 'pixi.js';
import type {Camera} from '../core/camera';
import {DEFAULT_BACKGROUND,type BoardBackground} from '../core/background';
import {gridStateAt} from '../core/grid';

export type GridPattern='dots'|'lines'|'crosses'|'none';
export function boardGridPattern(background?:BoardBackground):GridPattern{return background?.grid===false?'none':background?.gridStyle??'dots';}

/** Screen-sized marks stay anchored in world space; changing the scenery does
 * not alter snapping or introduce extra selectable canvas objects. */
export function paintBoardGrid(g:Graphics,camera:Camera,background?:BoardBackground):void{
 const pattern=boardGridPattern(background);g.clear();g.label='board-grid';if(pattern==='none')return;
 const cell=gridStateAt(camera.scale).visualCell,step=cell*camera.scale;if(step<6)return;
 const alpha=Math.min(1,Math.max(.18,step/24)),rect=camera.visibleWorldRect(),startX=Math.floor(rect.minX/cell)*cell,startY=Math.floor(rect.minY/cell)*cell;
 const columns=Math.min(2000,Math.ceil(camera.width/step)+2),rows=Math.min(2000,Math.ceil(camera.height/step)+2);
 const rgb=Number.parseInt((background?.color??DEFAULT_BACKGROUND.color).slice(1),16),dark=((rgb>>16)*.2126+((rgb>>8)&255)*.7152+(rgb&255)*.0722)<110,color=dark?0x767b88:0xc9c8c3;
 if(pattern==='lines'){
  for(const major of [false,true]){
   const isMajor=(value:number)=>Math.abs(Math.round(value/cell)%5)===0;
   for(let i=0;i<columns;i++){const x=startX+i*cell;if(isMajor(x)===major){const p=camera.worldToScreen({x,y:0});g.moveTo(p.x,0).lineTo(p.x,camera.height);}}
   for(let i=0;i<rows;i++){const y=startY+i*cell;if(isMajor(y)===major){const p=camera.worldToScreen({x:0,y});g.moveTo(0,p.y).lineTo(camera.width,p.y);}}
   g.stroke({width:1,color,alpha:dark?alpha*(major?.5:.28):alpha*(major?.7:.4)});
  }
  return;
 }
 let count=0;const radius=Math.min(2,Math.max(.75,step/40));
 for(let i=0;i<columns;i++){const x=startX+i*cell;for(let j=0;j<rows;j++){const y=startY+j*cell;if(++count>60_000)break;const p=camera.worldToScreen({x,y});if(pattern==='crosses')g.moveTo(p.x-2,p.y).lineTo(p.x+2,p.y).moveTo(p.x,p.y-2).lineTo(p.x,p.y+2);else g.circle(p.x,p.y,radius);}if(count>60_000)break;}
 if(pattern==='crosses')g.stroke({width:1,color,alpha:dark?alpha*.5:alpha});else g.fill({color,alpha:dark?alpha*.45:alpha});
}
