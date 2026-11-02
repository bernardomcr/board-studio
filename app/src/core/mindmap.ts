import type {BoardState,Command,CommandBus} from './commands';
import {createWidget,nextId,type Widget,type ShapeWidget,type MindMetadata,type MindAttachment} from './model';
import {validateMindAttachments,validateMindAttachmentBoardBudget} from './mind-attachments';
import type {Connector} from './connectors';
import type {Vec} from './geometry';
import {naturalTextSize} from './text-layout';

export type MindSide='left'|'right';
export type MindLayout='balanced'|'right'|'left'|'org'|'list';
export const MIND_COLORS=['#5865d8','#e99b38','#2eaa83','#be5caa','#4f9dd9','#e16c68'] as const;
// Observed MindMeister editor defaults: horizontal50, siblings10, first-level32.
const GAP_X=50,GAP_Y=10,ROOT_GAP_Y=32,TREE_GAP=16,ORG_GAP_X=20,ORG_GAP_Y=48,LIST_INDENT=38,LIST_FIRST_GAP=20;
export const MIND_THEMES={
  classic:{label:'Clássica',colors:[...MIND_COLORS]},
  ocean:{label:'Oceano',colors:['#2577bc','#329eac','#4669a8','#6a99c2','#376c93','#4eaaaa']},
  forest:{label:'Floresta',colors:['#287658','#69a34b','#498a77','#98a94b','#4c9274','#87a967']},
  warm:{label:'Cores quentes',colors:['#de684e','#e99b38','#b45c67','#d5a04b','#cf7955','#9b586b']},
  mono:{label:'Monocromática',colors:['#526179','#66758b','#7b8798','#566a80','#8b95a6','#657287']},
} as const;
export function mindTopicText(widget:Widget):string{const content=widget.type==='frame'?widget.title:widget.content,text=widget.mind?.icon?`${widget.mind.icon} ${content}`:content;return widget.mind?.attachments?.length?`${text} 📎${widget.mind.attachments.length}`:text;}

export function mindRoot(state:BoardState,id:string):Widget|undefined{
  const widget=state.widgets.get(id),root=widget?.mind?state.widgets.get(widget.mind.rootId):undefined;
  return root?.mind&&root.mind.parentId===null&&root.mind.rootId===root.id?root:undefined;
}
export function mindChildren(state:BoardState,parentId:string):Widget[]{
  const rootId=state.widgets.get(parentId)?.mind?.rootId;
  return [...state.widgets.values()].filter(w=>w.mind?.parentId===parentId&&w.mind.rootId===rootId).sort((a,b)=>a.mind!.order-b.mind!.order||a.id.localeCompare(b.id));
}
export function mindSubtree(state:BoardState,id:string):string[]{
  if(!state.widgets.get(id)?.mind)return [];
  const output:string[]=[],seen=new Set<string>(),pending=[id],index=childIndex(state);
  while(pending.length){const current=pending.pop()!;if(seen.has(current))continue;seen.add(current);output.push(current);pending.push(...(index.get(current)??[]).slice().reverse().map(w=>w.id));}
  return output;
}
/** Collapse never changes hidden: manual layer visibility survives expansion. */
export function mindNodeHidden(state:BoardState,id:string):boolean{
  let node=state.widgets.get(id),parentId=node?.mind?.parentId;const seen=new Set<string>([id]);
  while(parentId){if(seen.has(parentId))return true;seen.add(parentId);node=state.widgets.get(parentId);if(!node?.mind)return true;if(node.mind.collapsed)return true;parentId=node.mind.parentId;}
  return false;
}
export function mindConnectorHidden(state:BoardState,connector:Connector):boolean{
  return !!connector.mindBranch&&(!state.widgets.has(connector.mindBranch)||mindNodeHidden(state,connector.mindBranch)||[connector.start,connector.end].some(e=>e.kind==='anchor'&&state.widgets.get(e.widgetId)?.hidden));
}

function staged(state:BoardState):BoardState{return {...state,widgets:new Map(state.widgets),order:[...state.order],connectors:new Map(state.connectors),connectorOrder:[...state.connectorOrder],selection:new Set(state.selection)};}
function changedMind(state:BoardState,id:string,patch:Partial<MindMetadata>):Command|undefined{
  const w=state.widgets.get(id);if(!w?.mind)return;const mind={...w.mind,...patch};state.widgets.set(id,{...w,mind});return {op:'WIDGET_UPDATE',payload:{id,patch:{mind}}};
}
function run(bus:CommandBus,label:string,commands:Command[]):boolean{if(!commands.length)return false;bus.exec({op:'BATCH',payload:{label,commands}});return true;}
function dimensions(widget:Widget,initial=false,unitScale=widget.mind?.layoutScale??1){
  // Existing topic boxes are user geometry. Reflow positions the tree without
  // silently expanding a box as its content or preferred font changes.
  if(!initial||widget.type==='image')return {width:widget.width,height:widget.height};
  const content=mindTopicText(widget);
  const size=naturalTextSize({...widget,type:'text',content} as Parameters<typeof naturalTextSize>[0]);
  const root=widget.mind?.parentId===null;
  return {width:Math.max((root?168:92)*unitScale,size.width+32*unitScale),height:Math.max((root?64:44)*unitScale,size.height+20*unitScale)};
}
function childIndex(state:BoardState):Map<string,Widget[]>{
  const index=new Map<string,Widget[]>();
  for(const node of state.widgets.values())if(node.mind?.parentId){const siblings=index.get(node.mind.parentId)??[];siblings.push(node);index.set(node.mind.parentId,siblings);}
  for(const siblings of index.values())siblings.sort((a,b)=>a.mind!.order-b.mind!.order||a.id.localeCompare(b.id));
  return index;
}

/** Build a deterministic variable-size tree layout without mutating the live board. */
export function mindLayoutCommands(state:BoardState,id:string):Command[]{
  const root=mindRoot(state,id);if(!root?.mind)return [];
  const unitScale=root.mind.layoutScale??1,gapX=GAP_X*unitScale,gapY=GAP_Y*unitScale,rootGapY=ROOT_GAP_Y*unitScale,treeGap=TREE_GAP*unitScale,orgGapX=ORG_GAP_X*unitScale,orgGapY=ORG_GAP_Y*unitScale;
  const nodes=[...state.widgets.values()].filter(w=>w.mind?.rootId===root.id),index=childIndex(state),sizes=new Map(nodes.map(w=>[w.id,dimensions(w)]));
  const sequence:Widget[]=[],seen=new Set<string>(),stack=[root];
  while(stack.length){const w=stack.pop()!;if(seen.has(w.id))continue;seen.add(w.id);sequence.push(w);stack.push(...(index.get(w.id)??[]).filter(c=>c.mind?.rootId===root.id).reverse());}
  const span=new Map<string,number>();
  for(let i=sequence.length-1;i>=0;i--){const node=sequence[i]!,children=node.mind!.collapsed?[]:(index.get(node.id)??[]),own=sizes.get(node.id)!.height;span.set(node.id,Math.max(own,children.reduce((sum,c)=>sum+(span.get(c.id)??0),0)+Math.max(0,children.length-1)*gapY));}
  const rootSize=sizes.get(root.id)!,center={x:root.x+root.width/2,y:root.y+root.height/2},positions=new Map<string,{x:number;y:number;side:MindSide}>();
  positions.set(root.id,{x:center.x-rootSize.width/2,y:center.y-rootSize.height/2,side:root.mind.side});
  const layout=root.mind.layout??'balanced',rootChildren=root.mind.collapsed?[]:(index.get(root.id)??[]);
  // Only automatic boxes yield to freely placed siblings. Their coordinates are
  // anchors, so adding another topic must neither move them nor cover them.
  const besideAnchors=(node:Widget,x:number,y:number,axis:'x'|'y',gap:number,side:MindSide)=>{
    if(node.mind?.manualPosition)return {x:node.x,y:node.y};
    const siblings=(index.get(node.mind!.parentId!)??[]).filter(sibling=>sibling.id!==node.id&&(layout!=='balanced'||sibling.mind!.side===side));
    if(!siblings.some(sibling=>sibling.mind?.manualPosition))return {x,y};
    const size=sizes.get(node.id)!,cross=axis==='x'?'y':'x',extent=axis==='x'?'width':'height',crossExtent=axis==='x'?'height':'width',origin={x,y};
    const obstacles=siblings.flatMap(sibling=>{const position=sibling.mind?.manualPosition?sibling:positions.get(sibling.id);if(!position)return [];const otherSize=sizes.get(sibling.id)!;return origin[cross]+size[crossExtent]>position[cross]&&origin[cross]<position[cross]+otherSize[crossExtent]?[{start:position[axis],end:position[axis]+otherSize[extent]}]:[];});
    const intervals=obstacles.map(other=>({start:other.start-size[extent]-gap,end:other.end+gap})).sort((a,b)=>a.start-b.start),merged:Array<{start:number;end:number}>=[],epsilon=unitScale*1e-7;
    for(const interval of intervals){const previous=merged[merged.length-1];if(previous&&interval.start<previous.end-epsilon)previous.end=Math.max(previous.end,interval.end);else merged.push({...interval});}
    const blocked=merged.find(interval=>origin[axis]>interval.start+epsilon&&origin[axis]<interval.end-epsilon),value=blocked?(origin[axis]-blocked.start<=blocked.end-origin[axis]?blocked.start:blocked.end):origin[axis];
    return {...origin,[axis]:value};
  };
  if(layout==='org'){
    const widths=new Map<string,number>();
    for(let i=sequence.length-1;i>=0;i--){const node=sequence[i]!,children=node.mind!.collapsed?[]:index.get(node.id)??[];widths.set(node.id,Math.max(sizes.get(node.id)!.width,children.reduce((sum,c)=>sum+widths.get(c.id)!,0)+Math.max(0,children.length-1)*orgGapX));}
    const pending=[root];
    while(pending.length){const parent=pending.pop()!;if(parent.mind!.collapsed)continue;const children=index.get(parent.id)??[],own=positions.get(parent.id)!,size=sizes.get(parent.id)!,total=children.reduce((sum,c)=>sum+widths.get(c.id)!,0)+Math.max(0,children.length-1)*orgGapX;let left=own.x+size.width/2-total/2;
      for(const child of children){const childSize=sizes.get(child.id)!,width=widths.get(child.id)!;positions.set(child.id,{...besideAnchors(child,left+width/2-childSize.width/2,own.y+size.height+orgGapY,'x',orgGapX,'right'),side:'right'});left+=width+orgGapX;pending.push(child);}
    }
  }else if(layout==='list'){
    let top=positions.get(root.id)!.y+rootSize.height+LIST_FIRST_GAP*unitScale;const pending=(root.mind.collapsed?[]:(index.get(root.id)??[])).slice().reverse().map(node=>({node,parentId:root.id}));
    while(pending.length){const {node,parentId}=pending.pop()!,size=sizes.get(node.id)!,parent=positions.get(parentId)!;positions.set(node.id,{...besideAnchors(node,parent.x+LIST_INDENT*unitScale,top,'y',treeGap,'right'),side:'right'});top=Math.max(top,positions.get(node.id)!.y)+size.height+treeGap;if(!node.mind!.collapsed)pending.push(...(index.get(node.id)??[]).slice().reverse().map(child=>({node:child,parentId:node.id})));}
  }else for(const side of ['left','right'] as const){
    const children=rootChildren.filter(c=>(layout==='balanced'?c.mind!.side:layout)===side);
    let cursor=center.y-(children.reduce((sum,c)=>sum+span.get(c.id)!,0)+Math.max(0,children.length-1)*rootGapY)/2;
    const placements:Array<{node:Widget;parent:Widget;parentX:number;top:number;side:MindSide}>=[];
    for(const node of children){placements.push({node,parent:root,parentX:positions.get(root.id)!.x,top:cursor,side});cursor+=span.get(node.id)!+rootGapY;}
    while(placements.length){
      const item=placements.pop()!,{node,parent,parentX,top}=item,size=sizes.get(node.id)!,parentSize=sizes.get(parent.id)!;
      const intendedY=top+span.get(node.id)!/2-size.height/2,{x,y}=besideAnchors(node,side==='right'?parentX+parentSize.width+gapX:parentX-gapX-size.width,intendedY,'y',parent.id===root.id?rootGapY:gapY,side);
      positions.set(node.id,{x,y,side});
      if(node.mind!.collapsed)continue;
      const descendants=index.get(node.id)??[],childrenSpan=descendants.reduce((sum,c)=>sum+span.get(c.id)!,0)+Math.max(0,descendants.length-1)*gapY;
      let childTop=top+(y-intendedY)+span.get(node.id)!/2-childrenSpan/2;
      for(const child of descendants){placements.push({node:child,parent:node,parentX:x,top:childTop,side});childTop+=span.get(child.id)!+gapY;}
    }
  }
  const commands:Command[]=[],resolved=new Map<string,Widget>();
  for(const node of nodes){
    // Automatic layout must not transform a locked topic as a side effect.
    if(node.locked){resolved.set(node.id,node);continue;}
    const size=sizes.get(node.id)!,position=positions.get(node.id),mind={...node.mind!,...(position?{side:position.side}:{})};
    const next={...node,...size,...(position?{x:position.x,y:position.y}:{}),rotation:0,mind};resolved.set(node.id,next);
    if(node.x!==next.x||node.y!==next.y||node.width!==next.width||node.height!==next.height||node.rotation!==0||node.mind!.side!==mind.side)commands.push({op:'WIDGET_UPDATE',payload:{id:node.id,patch:{x:next.x,y:next.y,width:next.width,height:next.height,rotation:0,mind}}});
  }
  const behind=Math.min(0,...nodes.map(w=>w.z))-.5,branches=new Map([...state.connectors.values()].filter(c=>c.mindBranch).map(c=>[c.mindBranch!,c]));
  for(const node of nodes){
    const mind=resolved.get(node.id)!.mind!;if(!mind.parentId)continue;
    const parent=resolved.get(mind.parentId);if(!parent)continue;
    const side=mind.side,start=layout==='org'?{kind:'anchor' as const,widgetId:parent.id,x:.5,y:1}:layout==='list'?{kind:'anchor' as const,widgetId:parent.id,x:0,y:1}:{kind:'anchor' as const,widgetId:parent.id,x:side==='left'?0:1,y:.5},end=layout==='org'?{kind:'anchor' as const,widgetId:node.id,x:.5,y:0}:{kind:'anchor' as const,widgetId:node.id,x:side==='left'?1:0,y:.5};
    const old=branches.get(node.id),color=mind.color??parent.mind?.color??MIND_COLORS[0];
    const shape=root.mind.lineShape??(layout==='org'||layout==='list'?'elbowed':'curved');
    if(!old){
      const inherited=branches.get(parent.id)??(index.get(parent.id)??[]).map(sibling=>branches.get(sibling.id)).find(Boolean);
      const branch:Connector={id:nextId('mind-branch'),type:'connector',mindBranch:node.id,start,end,shape,style:{...inherited?.style,strokeColor:color,strokeWidth:inherited?.style.strokeWidth??2.5*unitScale,startCap:'none',endCap:'none'},z:behind};commands.push({op:'CONNECTOR_CREATE',payload:branch},{op:'CONNECTOR_UPDATE',payload:{id:branch.id,patch:{z:behind}}});
    }
    else{
      const patch={start,end,shape,controlPoint:null,waypoints:null,z:behind,style:{...old.style,strokeColor:color,startCap:'none' as const,endCap:'none' as const}};
      if(old.shape!==patch.shape||old.z!==behind||old.controlPoint||old.waypoints?.length||JSON.stringify(old.start)!==JSON.stringify(start)||JSON.stringify(old.end)!==JSON.stringify(end)||old.style.strokeColor!==color||old.style.startCap!=='none'||old.style.endCap!=='none')commands.push({op:'CONNECTOR_UPDATE',payload:{id:old.id,patch}});
    }
  }
  return commands;
}
function resetManualPositions(state:BoardState,id:string):Command[]{const root=mindRoot(state,id);if(!root)return [];const commands:Command[]=[];for(const nodeId of mindSubtree(state,root.id)){const node=state.widgets.get(nodeId)!;if(node.mind?.manualPosition&&!node.locked)commands.push(changedMind(state,nodeId,{manualPosition:undefined})!);}return commands;}
export function layoutMindMap(state:BoardState,bus:CommandBus,id:string):boolean{const copy=staged(state),commands=resetManualPositions(copy,id);return run(bus,'Organizar mapa mental',[...commands,...mindLayoutCommands(copy,id)]);}
export const normalizeMindMap=layoutMindMap;

/** A free drag is part of the existing gesture transaction, not a reparent. */
export function markMindManualPosition(state:BoardState,bus:CommandBus,id:string):boolean{const ids=mindSubtree(state,id);if(!ids.length||ids.some(nodeId=>state.widgets.get(nodeId)?.locked))return false;return run(bus,'Posicionar ramo livremente',ids.filter(nodeId=>!state.widgets.get(nodeId)!.mind!.manualPosition).map(nodeId=>({op:'WIDGET_UPDATE',payload:{id:nodeId,patch:{mind:{...state.widgets.get(nodeId)!.mind!,manualPosition:true}}}})));}

function topic(content:string,mind:MindMetadata,point:Vec,unitScale=1,inherit?:Widget,dark=false):ShapeWidget{
  const root=mind.parentId===null,color=mind.color??MIND_COLORS[0],widget=createWidget('shape',{x:point.x,y:point.y,shape:'round_rectangle',content}) as ShapeWidget;
  widget.mind={...mind,layoutScale:unitScale};widget.style={...widget.style,fontFamily:'Inter',fontSize:(root?26:20)*unitScale,fontWeight:root?'bold':'normal',textAlign:'center',textAlignVertical:'middle',color:dark?'#f7edf4':'#342a3a',fillColor:root?(dark?'#643d55':'#f3c1d3'):'transparent',fillOpacity:root?1:0,borderColor:color,borderWidth:0,borderScale:0,cornerRadius:(root?16:11)*unitScale};
  if(inherit){widget.style={...inherit.style,borderColor:color};if(inherit.type==='shape')widget.shape=inherit.shape;}
  const size=dimensions(widget,true,unitScale);return {...widget,...size,x:point.x-size.width/2,y:point.y-size.height/2};
}
export function createMindMap(state:BoardState,bus:CommandBus,point:Vec,content='Ideia central',unitScale=1,appearance:{dark?:boolean}={}):string{
  if(!Number.isFinite(unitScale)||unitScale<=0)throw new Error('Escala do mapa mental inválida.');
  const id=nextId('mind'),node=topic(content,{rootId:id,parentId:null,side:'right',order:0,layout:'balanced',color:MIND_COLORS[0]},point,unitScale,undefined,appearance.dark);node.id=id;
  run(bus,'Criar mapa mental',[{op:'WIDGET_CREATE',payload:node},{op:'SELECTION_SET',payload:[id]}]);return id;
}
function addTopic(state:BoardState,bus:CommandBus,parentId:string,content:string,side?:MindSide,afterId?:string,before=false):string|null{
  const parent=state.widgets.get(parentId),root=mindRoot(state,parentId);if(!parent?.mind||!root||parent.locked)return null;
  const copy=staged(state),siblings=mindChildren(copy,parentId),order=afterId?Math.max(0,siblings.findIndex(w=>w.id===afterId)+(before?0:1)):siblings.length;
  if(!side){if(parent.mind.parentId===null){const right=siblings.filter(w=>w.mind!.side==='right').length;side=right<5?'right':'left';}else side=parent.mind.side;}
  if(root.mind!.layout==='left'||root.mind!.layout==='right')side=root.mind!.layout;
  const colors=MIND_THEMES[root.mind!.theme as keyof typeof MIND_THEMES]?.colors??MIND_COLORS,color=parent.id===root.id?colors[siblings.length%colors.length]!:parent.mind.color??colors[0]!,unitScale=root.mind!.layoutScale??1;
  const inherit=afterId?state.widgets.get(afterId):parent.id!==root.id?parent:siblings.find(node=>node.type==='shape'||node.type==='text');
  const node=topic(content,{rootId:root.id,parentId,side,order,color},{x:parent.x+parent.width/2,y:parent.y+parent.height/2},unitScale,inherit),commands:Command[]=[{op:'WIDGET_CREATE',payload:node}];
  if(!inherit)node.style={...node.style,color:root.style.color};
  copy.widgets.set(node.id,node);copy.order.push(node.id);
  const sequence=[...siblings];sequence.splice(order,0,node);for(let i=0;i<sequence.length;i++)if(sequence[i]!.mind!.order!==i){const command=changedMind(copy,sequence[i]!.id,{order:i});if(command)commands.push(command);}
  if(parent.mind.collapsed){const command=changedMind(copy,parentId,{collapsed:false});if(command)commands.push(command);}
  commands.push(...mindLayoutCommands(copy,root.id),{op:'SELECTION_SET',payload:[node.id]});run(bus,'Adicionar tópico',commands);return node.id;
}
export function addMindChild(state:BoardState,bus:CommandBus,parentId:string,content='Novo tópico',side?:MindSide):string|null{return addTopic(state,bus,parentId,content,side);}
/** Attach an existing object as a real topic; imports can group this with creation. */
export function attachMindWidget(state:BoardState,bus:CommandBus,parentId:string,widgetId:string):boolean{
  const parent=state.widgets.get(parentId),widget=state.widgets.get(widgetId),root=mindRoot(state,parentId);
  if(!parent?.mind||!root?.mind||!widget||widgetId===parentId||parent.locked||widget.locked||widget.type==='frame')return false;
  if(widget.mind)return reparentMindNode(state,bus,widgetId,parentId);
  const copy=staged(state),siblings=mindChildren(copy,parentId),theme=MIND_THEMES[root.mind.theme as keyof typeof MIND_THEMES],colors=theme?.colors??MIND_COLORS;
  let side:MindSide=parent.id===root.id?(siblings.filter(node=>node.mind!.side==='right').length<5?'right':'left'):parent.mind.side;
  if(root.mind.layout==='left'||root.mind.layout==='right')side=root.mind.layout;
  const color=parent.id===root.id?colors[siblings.length%colors.length]!:parent.mind.color??colors[0]!,mind:MindMetadata={rootId:root.id,parentId,side,order:siblings.length,color,layoutScale:root.mind.layoutScale??1};
  copy.widgets.set(widgetId,{...widget,mind});const commands:Command[]=[{op:'WIDGET_UPDATE',payload:{id:widgetId,patch:{mind}}}];
  if(parent.mind.collapsed){const expanded=changedMind(copy,parentId,{collapsed:false});if(expanded)commands.push(expanded);}
  commands.push(...mindLayoutCommands(copy,root.id),{op:'SELECTION_SET',payload:[widgetId]});return run(bus,'Adicionar objeto ao tópico',commands);
}
export function addMindSibling(state:BoardState,bus:CommandBus,id:string,content='Novo tópico',before=false):string|null{
  const node=state.widgets.get(id);return node?.mind&&!node.locked?addTopic(state,bus,node.mind.parentId??node.id,content,node.mind.parentId?node.mind.side:undefined,node.mind.parentId?id:undefined,before):null;
}
export function toggleMindBranch(state:BoardState,bus:CommandBus,id:string):boolean{
  const node=state.widgets.get(id);if(!node?.mind||node.locked||!mindChildren(state,id).length)return false;
  const copy=staged(state),command=changedMind(copy,id,{collapsed:!node.mind.collapsed});return run(bus,node.mind.collapsed?'Expandir ramo':'Recolher ramo',[command!,...mindLayoutCommands(copy,id),{op:'SELECTION_SET',payload:[id]}]);
}
/** Reveal relative descendant levels without changing explicit layer visibility. */
export function showMindLevels(state:BoardState,bus:CommandBus,id:string,level:number):boolean{
  const node=state.widgets.get(id);if(!node?.mind||node.locked||!Number.isInteger(level)||level<0||level>9)return false;
  const copy=staged(state),index=childIndex(state),pending=[{id,depth:0}],seen=new Set<string>(),commands:Command[]=[];
  while(pending.length){
    const current=pending.pop()!;if(seen.has(current.id))continue;seen.add(current.id);
    const topic=copy.widgets.get(current.id),children=index.get(current.id)??[];if(!topic?.mind)continue;
    const collapsed=level>0&&current.depth>=level&&children.length>0;
    if(!topic.locked&&!!topic.mind.collapsed!==collapsed)commands.push(changedMind(copy,current.id,{collapsed})!);
    pending.push(...children.map(child=>({id:child.id,depth:current.depth+1})));
  }
  if(!commands.length)return false;
  commands.push(...mindLayoutCommands(copy,id));return run(bus,level===0?'Expandir todos os níveis':'Mostrar níveis do ramo',commands);
}
export function selectMindSubtopics(state:BoardState,bus:CommandBus,id:string):boolean{
  if(!state.widgets.get(id)?.mind)return false;
  const ids=mindSubtree(state,id).filter(nodeId=>nodeId!==id).filter(nodeId=>{const node=state.widgets.get(nodeId)!;return !node.hidden&&!node.locked&&!mindNodeHidden(state,nodeId);});
  if(ids.length===state.selection.size&&ids.every(nodeId=>state.selection.has(nodeId)))return false;
  bus.exec({op:'SELECTION_SET',payload:ids});return true;
}
export function setMindLayout(state:BoardState,bus:CommandBus,id:string,layout:MindLayout):boolean{
  const root=mindRoot(state,id);if(!root?.mind||root.locked||!['balanced','right','left','org','list'].includes(layout))return false;
  const copy=staged(state),commands:Command[]=[...resetManualPositions(copy,root.id),changedMind(copy,root.id,{layout})!];
  if(layout==='balanced'){const children=mindChildren(copy,root.id);for(let i=0;i<children.length;i++)if(!children[i]!.locked)commands.push(changedMind(copy,children[i]!.id,{side:i<children.length-5?'left':'right'})!);}
  commands.push(...mindLayoutCommands(copy,root.id));return run(bus,'Mudar organização do mapa',commands);
}
export function setMindColor(state:BoardState,bus:CommandBus,id:string,color:string):boolean{
  if(!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color))return false;
  const ids=mindSubtree(state,id);if(!ids.length||ids.some(id=>state.widgets.get(id)?.locked))return false;
  const copy=staged(state),commands:Command[]=[];
  for(const nodeId of ids){const node=copy.widgets.get(nodeId)!,mind={...node.mind!,color},style={...node.style,borderColor:color};copy.widgets.set(nodeId,{...node,mind,style});commands.push({op:'WIDGET_UPDATE',payload:{id:nodeId,patch:{mind,style}}});}
  commands.push(...mindLayoutCommands(copy,id));return run(bus,'Mudar cor do ramo',commands);
}
export function setMindLineShape(state:BoardState,bus:CommandBus,id:string,shape:'straight'|'curved'|'elbowed'):boolean{
  const root=mindRoot(state,id);if(!root?.mind||root.locked||!['straight','curved','elbowed'].includes(shape))return false;
  const copy=staged(state),command=changedMind(copy,root.id,{lineShape:shape});return run(bus,'Mudar linhas do mapa',[command!,...mindLayoutCommands(copy,root.id)]);
}
export function setMindDetails(state:BoardState,bus:CommandBus,id:string,patch:{notes?:string;icon?:string}):boolean{
  const node=state.widgets.get(id);if(!node?.mind||node.locked)return false;
  if(patch.notes!==undefined&&(typeof patch.notes!=='string'||patch.notes.length>1000000))return false;
  if(patch.icon!==undefined&&(typeof patch.icon!=='string'||patch.icon.length>128))return false;
  const copy=staged(state),command=changedMind(copy,id,patch);return run(bus,'Editar detalhes do tópico',[command!,...(patch.icon===undefined?[]:mindLayoutCommands(copy,id))]);
}
export function addMindAttachments(state:BoardState,bus:CommandBus,id:string,files:MindAttachment[]):boolean{
  const node=state.widgets.get(id);if(!node?.mind||node.locked||!files.length)return false;
  const attachments=validateMindAttachments([...(node.mind.attachments??[]),...files]);
  validateMindAttachmentBoardBudget([...state.widgets.values()].map(widget=>widget.id===id?{...widget,mind:{...node.mind!,attachments}}:widget));
  return run(bus,'Adicionar anexos ao tópico',[{op:'WIDGET_UPDATE',payload:{id,patch:{mind:{...node.mind,attachments}}}}]);
}
export function removeMindAttachment(state:BoardState,bus:CommandBus,id:string,attachmentId:string):boolean{
  const node=state.widgets.get(id);if(!node?.mind||node.locked||!node.mind.attachments?.some(file=>file.id===attachmentId))return false;
  return run(bus,'Remover anexo do tópico',[{op:'WIDGET_UPDATE',payload:{id,patch:{mind:{...node.mind,attachments:node.mind.attachments.filter(file=>file.id!==attachmentId)}}}}]);
}
export function setMindTheme(state:BoardState,bus:CommandBus,id:string,theme:keyof typeof MIND_THEMES):boolean{
  const root=mindRoot(state,id),colors=MIND_THEMES[theme]?.colors;if(!root?.mind||root.locked||!colors)return false;
  const copy=staged(state),commands:Command[]=[],assigned=new Map<string,string>([[root.id,colors[0]]]);
  const children=mindChildren(state,root.id);for(let i=0;i<children.length;i++)for(const nodeId of mindSubtree(state,children[i]!.id))assigned.set(nodeId,colors[i%colors.length]!);
  if([...assigned].some(([nodeId])=>state.widgets.get(nodeId)?.locked))return false;
  for(const [nodeId,color] of assigned){const node=copy.widgets.get(nodeId)!,mind={...node.mind!,color,...(nodeId===root.id?{theme}:{})},style={...node.style,borderColor:color};copy.widgets.set(nodeId,{...node,mind,style});commands.push({op:'WIDGET_UPDATE',payload:{id:nodeId,patch:{mind,style}}});}
  commands.push(...mindLayoutCommands(copy,root.id));return run(bus,'Mudar paleta do mapa',commands);
}
export function reparentMindNode(state:BoardState,bus:CommandBus,id:string,parentId:string,side?:MindSide,order?:number):boolean{
  const node=state.widgets.get(id),parent=state.widgets.get(parentId),root=mindRoot(state,parentId),ids=mindSubtree(state,id);
  if(!node?.mind?.parentId||!parent?.mind||!root||ids.includes(parentId)||ids.some(id=>state.widgets.get(id)?.locked)||parent.locked)return false;
  if([...state.connectors.values()].some(connector=>connector.locked&&connector.mindBranch&&ids.includes(connector.mindBranch)))return false;
  const oldRoot=node.mind.rootId,copy=staged(state),commands:Command[]=[],siblings=mindChildren(copy,parentId).filter(w=>w.id!==id);
  const nextSide=parent.id===root.id?(side??node.mind.side):parent.mind.side,index=Number.isFinite(order)?Math.max(0,Math.min(siblings.length,Math.floor(order!))):siblings.length;
  const color=parent.id===root.id?(node.mind.color??MIND_COLORS[0]):parent.mind.color??MIND_COLORS[0];
  if(node.mind.parentId===parentId&&node.mind.side===nextSide&&mindChildren(state,parentId).findIndex(sibling=>sibling.id===id)===index)return false;
  for(const descendantId of ids){const descendant=copy.widgets.get(descendantId)!,mind={...descendant.mind!,rootId:root.id,side:nextSide,color,manualPosition:undefined,...(descendantId===id?{parentId,order:index}:{})},style={...descendant.style,borderColor:color};copy.widgets.set(descendantId,{...descendant,mind,style});commands.push({op:'WIDGET_UPDATE',payload:{id:descendantId,patch:{mind,style}}});}
  siblings.splice(index,0,copy.widgets.get(id)!);
  const sequences=node.mind.parentId===parentId?[siblings]:[siblings,mindChildren(copy,node.mind.parentId)];
  for(const sequence of sequences)for(let i=0;i<sequence.length;i++){const sibling=sequence[i]!;if(sibling.mind!.order!==i){if(sibling.locked)return false;commands.push(changedMind(copy,sibling.id,{order:i})!);}}
  if(parent.mind.collapsed)commands.push(changedMind(copy,parentId,{collapsed:false})!);
  commands.push(...mindLayoutCommands(copy,oldRoot),...(oldRoot===root.id?[]:mindLayoutCommands(copy,root.id)),{op:'SELECTION_SET',payload:[id]});return run(bus,'Mover ramo',commands);
}
export function moveMindSubtree(state:BoardState,bus:CommandBus,id:string,dx:number,dy:number):boolean{
  const ids=mindSubtree(state,id);if(!ids.length||!Number.isFinite(dx)||!Number.isFinite(dy)||ids.some(id=>state.widgets.get(id)?.locked))return false;
  return run(bus,'Mover ramo',ids.map(nodeId=>{const node=state.widgets.get(nodeId)!;return {op:'WIDGET_UPDATE',payload:{id:nodeId,patch:{x:node.x+dx,y:node.y+dy}}};}));
}
export function deleteMindSubtree(state:BoardState,bus:CommandBus,id:string):boolean{
  const node=state.widgets.get(id),ids=mindSubtree(state,id),removed=new Set(ids);if(!node?.mind||!ids.length||ids.some(id=>state.widgets.get(id)?.locked))return false;
  if([...state.connectors.values()].some(connector=>connector.locked&&connector.mindBranch&&removed.has(connector.mindBranch)))return false;
  const copy=staged(state),commands:Command[]=[];
  for(const connector of copy.connectors.values())if(connector.mindBranch&&removed.has(connector.mindBranch)){commands.push({op:'CONNECTOR_REMOVE',payload:connector.id});copy.connectors.delete(connector.id);}
  for(const nodeId of [...ids].reverse()){commands.push({op:'WIDGET_REMOVE',payload:nodeId});copy.widgets.delete(nodeId);}
  copy.order=copy.order.filter(id=>!removed.has(id));commands.push(...mindLayoutCommands(copy,node.mind.rootId),{op:'SELECTION_SET',payload:node.mind.parentId?[node.mind.parentId]:[]});return run(bus,'Excluir ramo',commands);
}
export function navigateMindNode(state:BoardState,id:string,key:string):string|null{
  const node=state.widgets.get(id);if(!node?.mind)return null;
  const children=mindChildren(state,id).filter(w=>!w.hidden&&!mindNodeHidden(state,w.id));
  if(!node.mind.parentId)return (key==='ArrowLeft'?children.find(w=>w.mind!.side==='left'):key==='ArrowRight'?children.find(w=>w.mind!.side==='right'):undefined)?.id??null;
  const siblings=mindChildren(state,node.mind.parentId).filter(w=>!w.hidden&&!mindNodeHidden(state,w.id)),index=siblings.findIndex(w=>w.id===id);
  if(key==='ArrowUp'||key==='ArrowDown')return siblings[index+(key==='ArrowDown'?1:-1)]?.id??null;
  const outward=node.mind.side==='left'?'ArrowLeft':'ArrowRight';return key===outward?(node.mind.collapsed?null:children[0]?.id??null):key===(outward==='ArrowLeft'?'ArrowRight':'ArrowLeft')?node.mind.parentId:null;
}

/** Parse fields separately; graph validation runs once all entities are available. */
export function validateMindMetadata(value:unknown):MindMetadata{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Estrutura de mapa mental inválida.');
  const data=value as Record<string,unknown>,id=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=256;
  if(!id(data.rootId)||(data.parentId!==null&&!id(data.parentId))||!['left','right'].includes(String(data.side))||typeof data.order!=='number'||!Number.isFinite(data.order)||data.order<0)throw new Error('Referência de tópico inválida.');
  if(data.collapsed!==undefined&&typeof data.collapsed!=='boolean')throw new Error('Estado de ramo inválido.');
  if(data.layout!==undefined&&!['balanced','right','left','org','list'].includes(String(data.layout)))throw new Error('Organização de mapa inválida.');
  if(data.color!==undefined&&(typeof data.color!=='string'||!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(data.color)))throw new Error('Cor de ramo inválida.');
  if(data.lineShape!==undefined&&!['straight','curved','elbowed'].includes(String(data.lineShape)))throw new Error('Linha de mapa inválida.');
  if(data.notes!==undefined&&(typeof data.notes!=='string'||data.notes.length>1000000))throw new Error('Notas de tópico inválidas.');
  if(data.icon!==undefined&&(typeof data.icon!=='string'||data.icon.length>128))throw new Error('Ícone de tópico inválido.');
  const attachments=data.attachments===undefined?undefined:validateMindAttachments(data.attachments);
  if(data.theme!==undefined&&(typeof data.theme!=='string'||!Object.hasOwn(MIND_THEMES,data.theme)))throw new Error('Paleta de mapa inválida.');
  if(data.layoutScale!==undefined&&(typeof data.layoutScale!=='number'||!Number.isFinite(data.layoutScale)||data.layoutScale<=0))throw new Error('Escala de mapa inválida.');
  if(data.manualPosition!==undefined&&typeof data.manualPosition!=='boolean')throw new Error('Posição manual de tópico inválida.');
  return {rootId:data.rootId as string,parentId:data.parentId as string|null,side:data.side as MindSide,order:data.order,...(data.collapsed===undefined?{}:{collapsed:data.collapsed as boolean}),...(data.layout===undefined?{}:{layout:data.layout as MindLayout}),...(data.color===undefined?{}:{color:data.color as string}),...(data.lineShape===undefined?{}:{lineShape:data.lineShape as 'straight'|'curved'|'elbowed'}),...(data.notes===undefined?{}:{notes:data.notes as string}),...(data.icon===undefined?{}:{icon:data.icon as string}),...(attachments===undefined?{}:{attachments}),...(data.theme===undefined?{}:{theme:data.theme as string}),...(data.layoutScale===undefined?{}:{layoutScale:data.layoutScale as number}),...(data.manualPosition===undefined?{}:{manualPosition:data.manualPosition as boolean})};
}
export function validateMindMapGraph(widgets:Widget[],connectors:Connector[]):void{
  validateMindAttachmentBoardBudget(widgets);
  const nodes=new Map(widgets.filter(w=>w.mind).map(w=>[w.id,w])),done=new Set<string>();
  for(const node of nodes.values()){
    validateMindMetadata(node.mind);const root=nodes.get(node.mind!.rootId);
    if(!root||root.mind!.rootId!==root.id||root.mind!.parentId!==null)throw new Error('Raiz de mapa mental ausente.');
    if(node.mind!.parentId===null&&node.id!==root.id)throw new Error('Raiz de mapa mental inconsistente.');
    const pending=new Set<string>();let current:Widget|undefined=node;
    while(current&&!done.has(current.id)){
      if(pending.has(current.id))throw new Error('Ciclo em mapa mental.');pending.add(current.id);
      const parentId=current.mind!.parentId;if(parentId===null)break;
      const parent=nodes.get(parentId);if(!parent||parent.mind!.rootId!==node.mind!.rootId)throw new Error('Tópico aponta para ramo ausente.');current=parent;
    }
    for(const id of pending)done.add(id);
  }
  const branches=new Set<string>();
  for(const connector of connectors)if(connector.mindBranch!==undefined){
    const child=nodes.get(connector.mindBranch);if(!child?.mind?.parentId||branches.has(child.id))throw new Error('Ligação de mapa mental inválida.');branches.add(child.id);
    const ends=[connector.start,connector.end];if(!ends.every(e=>e.kind==='anchor')||!ends.some(e=>e.kind==='anchor'&&e.widgetId===child.id)||!ends.some(e=>e.kind==='anchor'&&e.widgetId===child.mind!.parentId))throw new Error('Ligação de ramo inconsistente.');
  }
}
