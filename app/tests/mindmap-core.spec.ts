// @ts-nocheck
import {test,expect} from '@playwright/test';
async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);}

test('mind branches use measured sizes, source-side defaults, no overlapping nodes and atomic undo',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const m=await import('/src/core/mindmap.ts'),{CommandBus}=await import('/src/core/commands.ts');
  const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{});
  const root=m.createMindMap(state,bus,{x:1850,y:-630}),ids=Array.from({length:6},(_,i)=>m.addMindChild(state,bus,root,'Tópico '+i)),child=m.addMindChild(state,bus,ids[0],'Um título bastante mais longo\ncom duas linhas'),leaf=m.addMindChild(state,bus,child,'Detalhe');
  const topic=state.widgets.get(child),original={width:topic.width,height:topic.height};bus.exec({op:'WIDGET_UPDATE',payload:{id:child,patch:{style:{...topic.style,fontSize:78}}}});m.layoutMindMap(state,bus,root);const fitted=(await import('/src/core/text-layout.ts')).fitBoxText(state.widgets.get(child)).fontSize;
  const center={x:state.widgets.get(root).x+state.widgets.get(root).width/2,y:state.widgets.get(root).y+state.widgets.get(root).height/2},nodes=[...state.widgets.values()];
  const overlaps=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)overlaps.push([a.id,b.id]);}
  const sides=ids.map(id=>state.widgets.get(id).mind.side),before=JSON.stringify({nodes:[...state.widgets],connectors:[...state.connectors],order:state.order,selection:[...state.selection]});
  const added=m.addMindSibling(state,bus,leaf,'Irmão');bus.undo();const restored=before===JSON.stringify({nodes:[...state.widgets],connectors:[...state.connectors],order:state.order,selection:[...state.selection]});bus.redo();m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);
  return {center,overlaps,sides,original,width:state.widgets.get(child).width,height:state.widgets.get(child).height,preferred:state.widgets.get(child).style.fontSize,fitted,restored,redone:state.widgets.has(added),curves:[...state.connectors.values()].every(c=>c.shape==='curved'&&c.style.endCap==='none'),count:state.widgets.size};
 });
 expect(result.center).toEqual({x:1850,y:-630});expect(result.overlaps).toEqual([]);expect(result.sides).toEqual(['right','right','right','right','right','left']);expect(result.width).toBe(result.original.width);expect(result.height).toBe(result.original.height);expect(result.preferred).toBe(78);expect(result.fitted).toBeGreaterThan(0);expect(result.fitted).toBeLessThan(78);expect(result.restored).toBe(true);expect(result.redone).toBe(true);expect(result.curves).toBe(true);expect(result.count).toBe(10);
});

test('collapse derives descendant visibility and bounds while preserving manual visibility and one-step delete',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const m=await import('/src/core/mindmap.ts'),g=await import('/src/core/groups.ts'),{CommandBus}=await import('/src/core/commands.ts'),state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{});
  const root=m.createMindMap(state,bus,{x:0,y:0}),branch=m.addMindChild(state,bus,root),leaf=m.addMindChild(state,bus,branch),sub=m.addMindChild(state,bus,leaf);
  bus.exec({op:'WIDGET_UPDATE',payload:{id:sub,patch:{hidden:true}}});m.toggleMindBranch(state,bus,branch);
  const collapsed={branch:m.mindNodeHidden(state,branch),leaf:m.mindNodeHidden(state,leaf),leafBounds:g.entityRect(state,leaf),branchBounds:!!g.entityRect(state,branch),connectorHidden:m.mindConnectorHidden(state,[...state.connectors.values()].find(c=>c.mindBranch===leaf))};
  m.toggleMindBranch(state,bus,branch);const expanded=!m.mindNodeHidden(state,leaf)&&state.widgets.get(sub).hidden;
  const before={nodes:state.widgets.size,lines:state.connectors.size};m.deleteMindSubtree(state,bus,branch);const after={nodes:state.widgets.size,lines:state.connectors.size};bus.undo();m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);return {collapsed,expanded,before,after,undo:{nodes:state.widgets.size,lines:state.connectors.size},hidden:state.widgets.get(sub).hidden};
 });
 expect(result.collapsed).toEqual({branch:false,leaf:true,leafBounds:null,branchBounds:true,connectorHidden:true});expect(result.expanded).toBe(true);expect(result.before).toEqual({nodes:4,lines:3});expect(result.after).toEqual({nodes:1,lines:0});expect(result.undo).toEqual(result.before);expect(result.hidden).toBe(true);
});

test('reparenting rejects cycles and copied complete maps or partial branches remap every hierarchy reference',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const m=await import('/src/core/mindmap.ts'),g=await import('/src/core/groups.ts'),{CommandBus}=await import('/src/core/commands.ts'),state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{});
  const root=m.createMindMap(state,bus,{x:0,y:0}),a=m.addMindChild(state,bus,root,'A'),b=m.addMindChild(state,bus,root,'B'),leaf=m.addMindChild(state,bus,a,'Folha');
  const rejected=!m.reparentMindNode(state,bus,a,leaf),changed=m.reparentMindNode(state,bus,leaf,b),parent=state.widgets.get(leaf).mind.parentId;bus.undo();const undoParent=state.widgets.get(leaf).mind.parentId;
  const whole=g.captureSelection(state,[root]);g.duplicateSnapshot(state,bus,whole,1000,500);const copiedRoot=[...state.widgets.values()].find(w=>w.mind.parentId===null&&w.id!==root).id,copyIds=m.mindSubtree(state,copiedRoot),detached=g.captureSelection(state,[a]);
  g.duplicateSnapshot(state,bus,detached,100,150);const partialRoot=[...state.widgets.values()].find(w=>w.mind.parentId===null&&w.id!==root&&w.id!==copiedRoot).id,partialIds=m.mindSubtree(state,partialRoot);
  m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);const before=copyIds.map(id=>({id,x:state.widgets.get(id).x,y:state.widgets.get(id).y}));m.moveMindSubtree(state,bus,copiedRoot,200,-90);
  return {rejected,changed,parent,expectedParent:b,undoParent,expectedUndo:a,whole:{nodes:whole.widgets.length,lines:whole.connectors.length},copyIds:copyIds.length,partial:{nodes:partialIds.length,parent:state.widgets.get(partialRoot).mind.parentId,root:state.widgets.get(partialRoot).mind.rootId===partialRoot},moved:before.every(p=>state.widgets.get(p.id).x===p.x+200&&state.widgets.get(p.id).y===p.y-90)};
 });
 expect(result.rejected).toBe(true);expect(result.changed).toBe(true);expect(result.parent).toBe(result.expectedParent);expect(result.undoParent).toBe(result.expectedUndo);expect(result.whole).toEqual({nodes:4,lines:3});expect(result.copyIds).toBe(4);expect(result.partial).toEqual({nodes:2,parent:null,root:true});expect(result.moved).toBe(true);
});

test('mind map, organogram and list layouts preserve root center, route branch styles and validate imported hierarchy',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const m=await import('/src/core/mindmap.ts'),{CommandBus}=await import('/src/core/commands.ts'),state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{});
  const root=m.createMindMap(state,bus,{x:700,y:220}),a=m.addMindChild(state,bus,root,'Primeiro'),b=m.addMindChild(state,bus,root,'Segundo'),leaf=m.addMindChild(state,bus,a,'Filho'),centers=[];
  m.setMindLayout(state,bus,root,'org');const center=()=>{const w=state.widgets.get(root);return {x:w.x+w.width/2,y:w.y+w.height/2};};centers.push(center());const org={below:state.widgets.get(a).y>state.widgets.get(root).y+state.widgets.get(root).height,sameRow:state.widgets.get(a).y===state.widgets.get(b).y,anchors:[...state.connectors.values()].every(c=>c.start.kind==='anchor'&&c.start.y===1&&c.end.kind==='anchor'&&c.end.y===0)};
  m.setMindLayout(state,bus,root,'list');centers.push(center());const list={indent:state.widgets.get(leaf).x>state.widgets.get(a).x,sequence:state.widgets.get(a).y<state.widgets.get(leaf).y&&state.widgets.get(leaf).y<state.widgets.get(b).y};
  m.setMindLineShape(state,bus,root,'straight');const lines=[...state.connectors.values()].every(c=>c.shape==='straight');m.setMindLayout(state,bus,root,'balanced');centers.push(center());
  m.setMindTheme(state,bus,root,'ocean');m.setMindDetails(state,bus,a,{notes:'Uma nota persistida',icon:'⭐'});m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);
  const invalid=[{rootId:'missing',parentId:null,side:'right',order:0},{...state.widgets.get(a).mind,parentId:leaf}].map(mind=>{try{m.validateMindMapGraph([...state.widgets.values()].map(w=>w.id===a?{...w,mind}:w),[...state.connectors.values()]);return false;}catch{return true;}});
  return {centers,org,list,lines,invalid,details:m.validateMindMetadata(state.widgets.get(a).mind),topic:m.mindTopicText(state.widgets.get(a))};
 });
 expect(result.centers).toEqual([{x:700,y:220},{x:700,y:220},{x:700,y:220}]);expect(result.org).toEqual({below:true,sameRow:true,anchors:true});expect(result.list).toEqual({indent:true,sequence:true});expect(result.lines).toBe(true);expect(result.invalid).toEqual([true,true]);expect(result.details).toMatchObject({notes:'Uma nota persistida',icon:'⭐'});expect(result.topic).toBe('⭐ Primeiro');
});
