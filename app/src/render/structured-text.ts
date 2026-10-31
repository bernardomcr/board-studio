import {CanvasTextMetrics,Container,Graphics,Text} from 'pixi.js';
import {destroyDisplayTree} from './destroy-tree';
import type {Widget} from '../core/model';
import {checklistLayout,tableLayout,tableTracks,type LocalRect} from '../core/structured-text';
import {resolvedWidgetStyle} from '../core/style-scale';
import {TEXT_SAMPLING,fitTextResolution} from './text-quality';
import {screenStroke} from './screen-coverage';
import {plainText} from '../core/richtext';

const cache=new WeakMap<Container,string>();
function headerText(color:string){const value=parseInt(color.slice(1),16),luma=.2126*(value>>16)+.7152*(value>>8&255)+.0722*(value&255);return luma>155?'#242832':'#ffffff';}
function checkInk(color:string){const hex=color.replace(/^#/,'');if(/^[a-f\d]{6}$/i.test(hex))return headerText('#'+hex);if(/^[a-f\d]{3}$/i.test(hex))return headerText('#'+Array.from(hex,c=>c+c).join(''));return color==='white'?'#242832':'#ffffff';}
function textInCell(target:Container,w:Widget,value:string,rect:LocalRect,resolution:number,fill:string,bold=false){
 if(!value)return;const pad=w.checklist?0:Math.min(w.style.fontSize*.8,rect.width*.08),node=new Text({...TEXT_SAMPLING,text:value,resolution,style:{fontFamily:w.style.fontFamily,fontSize:w.style.fontSize,fontWeight:bold?'700':w.style.fontWeight==='bold'?'700':'400',fontStyle:w.style.fontStyle??'normal',fill,wordWrap:true,wordWrapWidth:Math.max(.01,rect.width-pad*2),breakWords:true,lineHeight:w.style.fontSize*1.3}});node.resolution=fitTextResolution(node,resolution);node.position.set(rect.x+pad,rect.y+Math.max(0,(rect.height-node.height)/2));
 const cell=new Container(),mask=new Graphics().rect(rect.x,rect.y,rect.width,rect.height).fill('#ffffff');cell.addChild(node);target.addChild(cell,mask);cell.mask=mask;return node;
}
/** Return true when ordinary rich text must be replaced by this structured view. */
export function renderStructuredText(target:Container,w:Widget,resolution:number,zoom=1):boolean{
 if(!w.checklist&&!w.table){cache.delete(target);return false;}
 const key=JSON.stringify([w.checklist,w.table,w.width,w.height,w.style,resolution,zoom,globalThis.devicePixelRatio||1]);target.position.set(0,0);if(cache.get(target)===key)return true;cache.set(target,key);for(const child of target.removeChildren())destroyDisplayTree(child);
 const style=resolvedWidgetStyle(w),graphics=new Graphics();target.addChild(graphics);
 if(w.checklist){for(const row of checklistLayout(w)){const {box,item}=row;graphics.roundRect(box.x,box.y,box.width,box.height,Math.min(4,box.width*.2));if(item.checked){graphics.fill(style.color);graphics.moveTo(box.x+box.width*.22,box.y+box.height*.52).lineTo(box.x+box.width*.44,box.y+box.height*.72).lineTo(box.x+box.width*.8,box.y+box.height*.28).stroke({...screenStroke(Math.max(.001,box.width*.1),zoom),color:checkInk(style.color),cap:'round',join:'round'});}else graphics.stroke({...screenStroke(Math.max(.001,box.width*.07),zoom),color:style.color});const node=textInCell(target,w,plainText(item.text),row.text,resolution,style.color);if(item.checked&&node){node.alpha=.55;const metrics=CanvasTextMetrics.measureText(plainText(item.text),node.style);metrics.lines.forEach((line,index)=>{const y=node.y+index*node.style.lineHeight+w.style.fontSize*.6;if(y<row.text.y||y>row.text.y+row.text.height)return;graphics.moveTo(node.x,y).lineTo(node.x+Math.min(row.text.width,metrics.lineWidths[index]??0),y).stroke({...screenStroke(Math.max(.001,w.style.fontSize/18),zoom,undefined,.55),color:style.color});});}}return true;}
 const table=w.table!,layout=tableLayout(w),stroke={...screenStroke(style.borderWidth,zoom,undefined,style.borderOpacity??1),color:style.borderColor};if(layout.title)textInCell(target,w,table.title,layout.title,resolution,style.color,true);
 const top=layout.title?.height??0,tracks=tableTracks(w),header=layout.cells[0]!.rect;graphics.rect(0,top,w.width,header.height).fill({color:table.headerColor,alpha:style.fillOpacity});
 if(style.borderWidth>0){for(const y of tracks.rows.slice(1,-1))graphics.moveTo(0,y).lineTo(w.width,y).stroke(stroke);for(const x of tracks.columns.slice(1,-1))graphics.moveTo(x,top).lineTo(x,w.height).stroke(stroke);}
 for(const cell of layout.cells)textInCell(target,w,cell.text,cell.rect,resolution,cell.row===0?headerText(table.headerColor):style.color,cell.row===0);return true;
}

const esc=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const n=(value:number)=>String(Number(value.toPrecision(12)));
function cellSvg(w:Widget,value:string,rect:LocalRect,fill:string,bold:boolean,suffix:string,checked=false){
 if(!value)return '';const pad=w.checklist?0:Math.min(w.style.fontSize*.8,rect.width*.08),width=Math.max(1,rect.width-pad*2),characters=Math.max(1,Math.floor(width/(w.style.fontSize*.55))),lines=value.split('\n').flatMap(line=>{const parts:string[]=[];for(let index=0;index<line.length;index+=characters)parts.push(line.slice(index,index+characters));return parts.length?parts:[''];});
 const lineHeight=w.style.fontSize*1.3,top=rect.y+Math.max(0,(rect.height-lines.length*lineHeight)/2)+w.style.fontSize,clip=`structured-${w.id.replace(/[^\w-]/g,'')}-${suffix.replace(/[^\w-]/g,'')}`;
 return `<defs><clipPath id="${clip}"><rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.width)}" height="${n(rect.height)}"/></clipPath></defs><text clip-path="url(#${clip})" x="${n(rect.x+pad)}" y="${n(top)}" fill="${esc(fill)}" font-family="${esc(w.style.fontFamily)}" font-size="${n(w.style.fontSize)}" font-weight="${bold?'700':w.style.fontWeight==='bold'?'700':'400'}"${checked?' text-decoration="line-through"':''}>${lines.map((line,index)=>`<tspan x="${n(rect.x+pad)}" dy="${index?n(lineHeight):'0'}">${esc(line)}</tspan>`).join('')}</text>`;
}
/** Inner SVG content; the caller supplies the widget transform and outer shape. */
export function structuredSvgContent(w:Widget):string|null{
 const style=resolvedWidgetStyle(w);if(w.checklist)return checklistLayout(w).map((row,index)=>{const {box,item}=row,checkbox=`<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" rx="${n(Math.min(4,box.width*.2))}" fill="${item.checked?esc(style.color):'none'}" stroke="${esc(style.color)}" stroke-width="${n(box.width*.07)}"/>`,check=item.checked?`<path d="M${n(box.x+box.width*.22)} ${n(box.y+box.height*.52)} L${n(box.x+box.width*.44)} ${n(box.y+box.height*.72)} L${n(box.x+box.width*.8)} ${n(box.y+box.height*.28)}" fill="none" stroke="${checkInk(style.color)}" stroke-width="${n(box.width*.1)}" stroke-linecap="round" stroke-linejoin="round"/>`:'';
 return `<g data-checklist-item="${esc(item.id)}" data-checked="${item.checked}">${checkbox}${check}<g${item.checked?' opacity="0.55"':''}>${cellSvg(w,plainText(item.text),row.text,style.color,false,`item-${index}`,item.checked)}</g></g>`;}).join('');
 if(!w.table)return null;const layout=tableLayout(w),top=layout.title?.height??0,tracks=tableTracks(w),header=layout.cells[0]!.rect,parts=[`<rect data-table-header="true" x="0" y="${n(top)}" width="${n(w.width)}" height="${n(header.height)}" fill="${esc(w.table.headerColor)}" fill-opacity="${style.fillOpacity}"/>`];if(layout.title)parts.push(cellSvg(w,w.table.title,layout.title,style.color,true,'title'));
 if(style.borderWidth>0){let d='';for(const y of tracks.rows.slice(1,-1))d+=`M0 ${n(y)}H${n(w.width)} `;for(const x of tracks.columns.slice(1,-1))d+=`M${n(x)} ${n(top)}V${n(w.height)} `;parts.push(`<path d="${d}" fill="none" stroke="${esc(style.borderColor)}" stroke-width="${n(style.borderWidth)}" stroke-opacity="${style.borderOpacity??1}"/>`);}
 for(const cell of layout.cells)parts.push(cellSvg(w,cell.text,cell.rect,cell.row===0?headerText(w.table.headerColor):style.color,cell.row===0,`cell-${cell.row}-${cell.column}`));return parts.join('');
}
