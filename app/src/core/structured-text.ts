import {createWidget,nextId,type Widget} from './model';
import type {BoardState,CommandBus} from './commands';
import type {Vec} from './geometry';

export interface ChecklistItem {id:string;text:string;checked:boolean}
export interface ChecklistData {items:ChecklistItem[]}
export interface TableData {title:string;headerColor:string;cells:string[][]}
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
 const cells=data.cells.map(row=>{if(!Array.isArray(row)||row.length!==columns)throw Error('As linhas da tabela têm quantidades de colunas diferentes.');return row.map(value=>{const valueText=text(value);length+=valueText.length;if(length>MAX_TEXT)throw Error('O conteúdo da tabela é muito extenso.');return valueText;});});return {title,headerColor,cells};
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
 const widget=state.widgets.get(id);if(!widget?.table||widget.locked)return;const table={...widget.table,cells:tableGrid(rows,columns,widget.table)},oldRows=widget.table.cells.length+(widget.table.title?1:0),newRows=rows+(widget.table.title?1:0);
 bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{table,width:widget.width*columns/widget.table.cells[0]!.length,height:widget.height*newRows/oldRows}}});
}
export interface LocalRect {x:number;y:number;width:number;height:number}
export function checklistLayout(widget:Widget):Array<{item:ChecklistItem;box:LocalRect;text:LocalRect}>{
 if(!widget.checklist)return [];const pad=Math.min(16,widget.width*.05),rowHeight=widget.height/widget.checklist.items.length;
 return widget.checklist.items.map((item,index)=>{const size=Math.max(.001,Math.min(22,rowHeight*.55,widget.width*.1));return {item,box:{x:pad,y:rowHeight*(index+.5)-size/2,width:size,height:size},text:{x:pad+size+12,y:rowHeight*index,width:Math.max(.001,widget.width-pad*2-size-12),height:rowHeight}};});
}
export function tableLayout(widget:Widget):{title:LocalRect|null;cells:Array<{row:number;column:number;text:string;rect:LocalRect}>}{
 if(!widget.table)return {title:null,cells:[]};const columns=widget.table.cells[0]!.length,rowHeight=widget.height/(widget.table.cells.length+(widget.table.title?1:0)),cellWidth=widget.width/columns,top=widget.table.title?rowHeight:0;
 return {title:widget.table.title?{x:0,y:0,width:widget.width,height:rowHeight}:null,cells:widget.table.cells.flatMap((values,row)=>values.map((text,column)=>({row,column,text,rect:{x:column*cellWidth,y:top+row*rowHeight,width:cellWidth,height:rowHeight}})))};
}
