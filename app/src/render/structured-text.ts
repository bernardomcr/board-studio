import {Container,Graphics,Text} from 'pixi.js';
import type {Widget} from '../core/model';
import {checklistLayout,tableLayout,type LocalRect} from '../core/structured-text';
import {resolvedWidgetStyle} from '../core/style-scale';
import {TEXT_SAMPLING,fitTextResolution} from './text-quality';

const cache=new WeakMap<Container,string>();
function headerText(color:string){const value=parseInt(color.slice(1),16),luma=.2126*(value>>16)+.7152*(value>>8&255)+.0722*(value&255);return luma>155?'#242832':'#ffffff';}
function textInCell(target:Container,w:Widget,value:string,rect:LocalRect,resolution:number,fill:string,bold=false){
 if(!value)return;const pad=Math.min(12,rect.width*.08),node=new Text({...TEXT_SAMPLING,text:value,resolution,style:{fontFamily:w.style.fontFamily,fontSize:w.style.fontSize,fontWeight:bold?'700':w.style.fontWeight==='bold'?'700':'400',fontStyle:w.style.fontStyle??'normal',fill,wordWrap:true,wordWrapWidth:Math.max(.01,rect.width-pad*2),breakWords:true,lineHeight:w.style.fontSize*1.3}});node.resolution=fitTextResolution(node,resolution);node.position.set(rect.x+pad,rect.y+Math.max(0,(rect.height-node.height)/2));
 const cell=new Container(),mask=new Graphics().rect(rect.x,rect.y,rect.width,rect.height).fill('#ffffff');cell.addChild(node);target.addChild(cell,mask);cell.mask=mask;return node;
}
/** Return true when ordinary rich text must be replaced by this structured view. */
export function renderStructuredText(target:Container,w:Widget,resolution:number):boolean{
 if(!w.checklist&&!w.table){cache.delete(target);return false;}
 const key=JSON.stringify([w.checklist,w.table,w.width,w.height,w.style,resolution]);target.position.set(0,0);if(cache.get(target)===key)return true;cache.set(target,key);for(const child of target.removeChildren())child.destroy({children:true});
 const style=resolvedWidgetStyle(w),graphics=new Graphics();target.addChild(graphics);
 if(w.checklist){for(const row of checklistLayout(w)){const {box,item}=row;graphics.roundRect(box.x,box.y,box.width,box.height,Math.min(4,box.width*.2));if(item.checked){graphics.fill('#4262ff');graphics.moveTo(box.x+box.width*.22,box.y+box.height*.52).lineTo(box.x+box.width*.44,box.y+box.height*.72).lineTo(box.x+box.width*.8,box.y+box.height*.28).stroke({width:Math.max(.001,box.width*.1),color:'#ffffff',cap:'round',join:'round'});}else graphics.stroke({width:Math.max(.001,box.width*.07),color:'#9aa3b2'});const node=textInCell(target,w,item.text,row.text,resolution,style.color);if(item.checked&&node){node.alpha=.55;graphics.moveTo(row.text.x+Math.min(12,row.text.width*.08),row.text.y+row.text.height/2).lineTo(row.text.x+Math.min(row.text.width,node.width+12),row.text.y+row.text.height/2).stroke({width:Math.max(.5,w.style.fontSize/18),color:style.color,alpha:.5});}}return true;}
 const table=w.table!,layout=tableLayout(w),stroke={width:style.borderWidth,color:style.borderColor,alpha:style.borderOpacity??1};if(layout.title)textInCell(target,w,table.title,layout.title,resolution,style.color,true);
 const top=layout.title?.height??0,rows=table.cells.length,columns=table.cells[0]!.length,rowHeight=(w.height-top)/rows,cellWidth=w.width/columns;graphics.rect(0,top,w.width,rowHeight).fill({color:table.headerColor,alpha:style.fillOpacity});
 if(style.borderWidth>0){for(let row=layout.title?0:1;row<rows;row++)graphics.moveTo(0,top+row*rowHeight).lineTo(w.width,top+row*rowHeight).stroke(stroke);for(let column=1;column<columns;column++)graphics.moveTo(column*cellWidth,top).lineTo(column*cellWidth,w.height).stroke(stroke);}
 for(const cell of layout.cells)textInCell(target,w,cell.text,cell.rect,resolution,cell.row===0?headerText(table.headerColor):style.color,cell.row===0);return true;
}

const esc=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const n=(value:number)=>String(Number(value.toPrecision(12)));
function cellSvg(w:Widget,value:string,rect:LocalRect,fill:string,bold:boolean,suffix:string){
 if(!value)return '';const pad=Math.min(12,rect.width*.08),width=Math.max(1,rect.width-pad*2),characters=Math.max(1,Math.floor(width/(w.style.fontSize*.55))),lines=value.split('\n').flatMap(line=>{const parts:string[]=[];for(let index=0;index<line.length;index+=characters)parts.push(line.slice(index,index+characters));return parts.length?parts:[''];});
 const lineHeight=w.style.fontSize*1.3,top=rect.y+Math.max(0,(rect.height-lines.length*lineHeight)/2)+w.style.fontSize,clip=`structured-${w.id.replace(/[^\w-]/g,'')}-${suffix}`;
 return `<defs><clipPath id="${clip}"><rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.width)}" height="${n(rect.height)}"/></clipPath></defs><text clip-path="url(#${clip})" x="${n(rect.x+pad)}" y="${n(top)}" fill="${esc(fill)}" font-family="${esc(w.style.fontFamily)}" font-size="${n(w.style.fontSize)}" font-weight="${bold?'700':w.style.fontWeight==='bold'?'700':'400'}">${lines.map((line,index)=>`<tspan x="${n(rect.x+pad)}" dy="${index?n(lineHeight):'0'}">${esc(line)}</tspan>`).join('')}</text>`;
}
/** Inner SVG content; the caller supplies the widget transform and outer shape. */
export function structuredSvgContent(w:Widget):string|null{
 const style=resolvedWidgetStyle(w);if(w.checklist)return checklistLayout(w).map((row,index)=>{const {box,item}=row,checkbox=`<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" rx="${n(Math.min(4,box.width*.2))}" fill="${item.checked?'#4262ff':'none'}" stroke="${item.checked?'#4262ff':'#9aa3b2'}" stroke-width="${n(box.width*.07)}"/>`,check=item.checked?`<path d="M${n(box.x+box.width*.22)} ${n(box.y+box.height*.52)} L${n(box.x+box.width*.44)} ${n(box.y+box.height*.72)} L${n(box.x+box.width*.8)} ${n(box.y+box.height*.28)}" fill="none" stroke="#ffffff" stroke-width="${n(box.width*.1)}" stroke-linecap="round" stroke-linejoin="round"/>`:'';
 const strike=item.checked?`<path d="M${n(row.text.x+Math.min(12,row.text.width*.08))} ${n(row.text.y+row.text.height/2)}h${n(Math.max(0,Math.min(row.text.width-12,item.text.length*w.style.fontSize*.55)))}" stroke="${esc(style.color)}" stroke-width="${n(Math.max(.5,w.style.fontSize/18))}" fill="none"/>`:'';
 return `<g data-checklist-item="${esc(item.id)}" data-checked="${item.checked}">${checkbox}${check}<g${item.checked?' opacity="0.55"':''}>${cellSvg(w,item.text,row.text,style.color,false,`item-${index}`)}${strike}</g></g>`;}).join('');
 if(!w.table)return null;const layout=tableLayout(w),top=layout.title?.height??0,rows=w.table.cells.length,columns=w.table.cells[0]!.length,rowHeight=(w.height-top)/rows,cellWidth=w.width/columns,parts=[`<rect data-table-header="true" x="0" y="${n(top)}" width="${n(w.width)}" height="${n(rowHeight)}" fill="${esc(w.table.headerColor)}" fill-opacity="${style.fillOpacity}"/>`];if(layout.title)parts.push(cellSvg(w,w.table.title,layout.title,style.color,true,'title'));
 if(style.borderWidth>0){let d='';for(let row=layout.title?0:1;row<rows;row++)d+=`M0 ${n(top+row*rowHeight)}H${n(w.width)} `;for(let column=1;column<columns;column++)d+=`M${n(column*cellWidth)} ${n(top)}V${n(w.height)} `;parts.push(`<path d="${d}" fill="none" stroke="${esc(style.borderColor)}" stroke-width="${n(style.borderWidth)}" stroke-opacity="${style.borderOpacity??1}"/>`);}
 for(const cell of layout.cells)parts.push(cellSvg(w,cell.text,cell.rect,cell.row===0?headerText(w.table.headerColor):style.color,cell.row===0,`cell-${cell.row}-${cell.column}`));return parts.join('');
}
