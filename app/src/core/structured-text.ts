import {createWidget,nextId,type Widget} from './model';
import type {BoardState,CommandBus} from './commands';
import type {Vec} from './geometry';

export interface ChecklistItem {id:string;text:string;checked:boolean}
export interface ChecklistData {items:ChecklistItem[]}
export interface TableData {title:string;headerColor:string;cells:string[][];columnSizes?:number[];rowSizes?:number[]}
const MAX_CELLS=20000,MAX_TEXT=1000000;
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Conteúdo estruturado inválido.');return value as Record<string,unknown>;};
const text=(value:unknown,max=MAX_TEXT):string=>{if(typeof value!=='string'||value.length>max)throw Error('Texto estruturado inválido ou muito extenso.');return value;};
export function validateChecklist(value:unknown):ChecklistData{
 const data=object(value);if(!Array.isArray(data.items)||data.items.length<1||data.items.length>MAX_CELLS)throw Error('Lista inválida ou extensa demais.');let length=0;const ids=new Set<string>();
 const items=data.items.map(value=>{const row=object(value),id=text(row.id,256),label=text(row.text);length+=label.length;if(!id||ids.has(id)||typeof row.checked!=='boolean'||length>MAX_TEXT)throw Error('Itens de lista inválidos.');ids.add(id);return {id,text:label,checked:row.checked};});return {items};
}
export function validateTable(value:unknown):TableData{
 const data=object(value),title=text(data.title,10000),headerColor=text(data.headerColor,32);if(!/^#[0-9a-f]{6}$/i.test(headerColor))throw Error('Cor do cabeçalho inválida.');
 if(!Array.isArray(data.cells)||data.cells.length<1||!Array.isArray(data.cells[0])||data.cells[0].length<1)throw Error('A tabela precisa de linhas e colunas.');const columns=data.cells[0].length;if(data.cells.length*columns>MAX_CELLS)throw Error('A tabela excede 20.000 células. Divida o conteúdo em outras tabelas.');let length=title.length;
 const cells=data.cells.map(row=>{if(!Array.isArray(row)||row.length!==columns)throw Error('As linhas da tabela têm quantidades de colunas diferentes.');return row.map(value=>{const valueText=text(value);length+=valueText.length;if(length>MAX_TEXT)throw Error('O conteúdo da tabela é muito extenso.');return valueText;});});
 const sizes=(value:unknown,count:number)=>{if(value===undefined)return undefined;if(!Array.isArray(value)||value.length!==count||value.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0)||!Number.isFinite(value.reduce((sum,n)=>sum+n,0)))throw Error('Dimensões das células inválidas.');return [...value] as number[];};
 const columnSizes=sizes(data.columnSizes,columns),rowSizes=sizes(data.rowSizes,cells.length+(title?1:0));return {title,headerColor,cells,...(columnSizes?{columnSizes}:{}),...(rowSizes?{rowSizes}:{})};
}
export function validateStructuredMetadataFields(value:Record<string,unknown>):{checklist?:ChecklistData;table?:TableData}{
 if(value.checklist!==undefined&&value.table!==undefined)throw Error('Um objeto não pode ser lista e tabela ao mesmo tempo.');
 return {...(value.checklist===undefined?{}:{checklist:validateChecklist(value.checklist)}),...(value.table===undefined?{}:{table:validateTable(value.table)})};
}
export function checklistFromLines(source:string):ChecklistData{
 const items=source.split(/\r?\n/).filter(line=>line.trim()).map(line=>({id:nextId('item'),text:line.replace(/^\s*(?:[-*]\s+)?\[[ xX]\]\s*/,''),checked:/^\s*(?:[-*]\s+)?\[[xX]\]/.test(line)}));
 return validateChecklist({items:items.length?items:[{id:nextId('item'),text:'Novo item',checked:false}]});
}
export function tableGrid(rows:number,columns:number,current?:TableData):string[][]{
 if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(columns)||rows<1||columns<1||rows*columns>MAX_CELLS)throw Error('Escolha linhas e colunas inteiras, com até 20.000 células por tabela.');
 return Array.from({length:rows},(_,row)=>Array.from({length:columns},(_,column)=>current?.cells[row]?.[column]??(row===0?`Coluna ${column+1}`:'')));
}
export function createChecklistWidget(center:Vec,checklist:ChecklistData):Widget{
 const height=Math.max(64,checklist.items.length*38+24),width=340,widget=createWidget('shape',{x:center.x-width/2,y:center.y-height/2,width,height,shape:'round_rectangle',content:''});
 return {...widget,name:'Lista de tarefas',checklist,style:{...widget.style,fillColor:'#ffffff',borderColor:'#d4d9e2',borderWidth:1,cornerRadius:10,textAlign:'left',fontSize:16,color:'#292823'}};
}
export function createTableWidget(center:Vec,table:TableData):Widget{
 const rows=table.cells.length,columns=table.cells[0]!.length,width=columns*160,height=(rows+(table.title?1:0))*42,widget=createWidget('shape',{x:center.x-width/2,y:center.y-height/2,width,height,shape:'rectangle',content:''});
 return {...widget,name:table.title||'Tabela',table,style:{...widget.style,fillColor:'#ffffff',borderColor:'#cfd5df',borderWidth:1,fontSize:15,color:'#292823',textAlign:'left'}};
}
export function setChecklistItem(state:BoardState,bus:CommandBus,id:string,itemId:string,checked?:boolean){
 const widget=state.widgets.get(id);if(!widget?.checklist||widget.locked)return;const items=widget.checklist.items.map(item=>item.id===itemId?{...item,checked:checked??!item.checked}:item);bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{checklist:{items}}}});
}
export function setTableCell(state:BoardState,bus:CommandBus,id:string,row:number,column:number,value:string){
 const widget=state.widgets.get(id);if(!widget?.table||widget.locked||widget.table.cells[row]?.[column]===undefined)return;
 const cells=widget.table.cells.map((values,index)=>index===row?values.map((text,index)=>index===column?value:text):values);bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{table:validateTable({...widget.table,cells})}}});
}
export function resizeTable(state:BoardState,bus:CommandBus,id:string,rows:number,columns:number){
 const widget=state.widgets.get(id);if(!widget?.table||widget.locked||widget.hidden)return;const table=tableWithGrid(widget.table,rows,columns),scale=tableTrackScale(widget.table,table);
 bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{table,width:widget.width*scale.x,height:widget.height*scale.y}}});
}
export function tableTrackScale(before:TableData,after:TableData):{x:number;y:number}{
 const sum=(table:TableData,axis:'column'|'row')=>(axis==='column'?table.columnSizes:table.rowSizes)?.reduce((sum,value)=>sum+value,0)??(axis==='column'?table.cells[0]!.length:table.cells.length+(table.title?1:0));
 return {x:sum(after,'column')/sum(before,'column'),y:sum(after,'row')/sum(before,'row')};
}
export function tableWithGrid(table:TableData,rows:number,columns:number,title=table.title):TableData{
 const resized=(values:number[]|undefined,count:number)=>{if(!values)return undefined;const average=values.reduce((a,b)=>a+b,0)/values.length;return Array.from({length:count},(_,i)=>values[i]??average);};
 let rowSizes=table.rowSizes;if(!!title!==!!table.title&&rowSizes)rowSizes=title?[rowSizes[0]??1,...rowSizes]:rowSizes.slice(1);
 return {...table,title,cells:tableGrid(rows,columns,table),...(table.columnSizes?{columnSizes:resized(table.columnSizes,columns)}:{}),...(rowSizes?{rowSizes:resized(rowSizes,rows+(title?1:0))}:{})};
}
export interface LocalRect {x:number;y:number;width:number;height:number}
export function checklistLayout(widget:Widget):Array<{item:ChecklistItem;box:LocalRect;text:LocalRect}>{
 if(!widget.checklist)return [];const pad=Math.min(widget.style.fontSize*.2,widget.width*.05),gap=widget.style.fontSize*.35,rowHeight=widget.height/widget.checklist.items.length;
 return widget.checklist.items.map((item,index)=>{const size=Math.max(.001,Math.min(widget.style.fontSize*.8,rowHeight*.66,widget.width*.1));return {item,box:{x:pad,y:rowHeight*(index+.5)-size/2,width:size,height:size},text:{x:pad+size+gap,y:rowHeight*index,width:Math.max(.001,widget.width-pad*2-size-gap),height:rowHeight}};});
}
export function tableTracks(widget:Widget):{columns:number[];rows:number[]}{
 if(!widget.table)return {columns:[],rows:[]};
 const tracks=(sizes:number[]|undefined,count:number,total:number)=>{const values=sizes?.length===count?sizes:Array(count).fill(1),sum=values.reduce((a,b)=>a+b,0);let at=0;return [0,...values.map((value,index)=>at=index===count-1?total:at+total*value/sum)];};
 return {columns:tracks(widget.table.columnSizes,widget.table.cells[0]!.length,widget.width),rows:tracks(widget.table.rowSizes,widget.table.cells.length+(widget.table.title?1:0),widget.height)};
}
export function tableLayout(widget:Widget):{title:LocalRect|null;cells:Array<{row:number;column:number;text:string;rect:LocalRect}>}{
 if(!widget.table)return {title:null,cells:[]};const {columns,rows}=tableTracks(widget),offset=widget.table.title?1:0;
 return {title:widget.table.title?{x:0,y:0,width:widget.width,height:rows[1]!}:null,cells:widget.table.cells.flatMap((values,row)=>values.map((text,column)=>({row,column,text,rect:{x:columns[column]!,y:rows[row+offset]!,width:columns[column+1]!-columns[column]!,height:rows[row+offset+1]!-rows[row+offset]!}})))};
}
/** Move one internal divider without scaling the table or its typography. */
export function resizedTableTracks(widget:Widget,axis:'column'|'row',index:number,delta:number):TableData|null{
 if(!widget.table)return null;const tracks=tableTracks(widget),positions=axis==='column'?tracks.columns:tracks.rows;if(index<1||index>=positions.length-1)return null;
 const sizes=positions.slice(1).map((p,i)=>p-positions[i]!),a=sizes[index-1]!,b=sizes[index]!,minimum=Math.min((a+b)*.01,Math.max(.001,(axis==='column'?widget.width:widget.height)*.00001));
 const shift=Math.max(minimum-a,Math.min(b-minimum,delta));sizes[index-1]=a+shift;sizes[index]=b-shift;
 return {...widget.table,[axis==='column'?'columnSizes':'rowSizes']:sizes};
}
