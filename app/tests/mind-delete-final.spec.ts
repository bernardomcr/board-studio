// @ts-nocheck
import {test,expect} from '@playwright/test';

async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);}

test('generic widget removal preserves a mind branch with a locked descendant',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const m=await import('/src/core/mindmap.ts'),{CommandBus}=await import('/src/core/commands.ts');
    const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{});
    const root=m.createMindMap(state,bus,{x:0,y:0},'Root'),branch=m.addMindChild(state,bus,root,'Branch'),leaf=m.addMindChild(state,bus,branch,'Locked leaf');
    bus.exec({op:'WIDGET_UPDATE',payload:{id:leaf,patch:{locked:true}}});
    const snapshot=()=>JSON.stringify({widgets:[...state.widgets],order:state.order,connectors:[...state.connectors],connectorOrder:state.connectorOrder,groups:[...state.groups],selection:[...state.selection]});
    const before=snapshot(),history=bus.undoStack.length;
    bus.exec({op:'WIDGET_REMOVE',payload:branch});
    const branchUnchanged=snapshot()===before;
    bus.exec({op:'WIDGET_REMOVE',payload:root});
    m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);
    return {branchUnchanged,rootUnchanged:snapshot()===before,historyUnchanged:bus.undoStack.length===history};
  });
  expect(result).toEqual({branchUnchanged:true,rootUnchanged:true,historyUnchanged:true});
});

test('generic branch removal retains ordinary links as detached geometry and restores all composition data in one undo',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const m=await import('/src/core/mindmap.ts'),{CommandBus}=await import('/src/core/commands.ts'),{createWidget}=await import('/src/core/model.ts'),{resolveEndpoint}=await import('/src/core/connectors.ts');
    const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{});
    const root=m.createMindMap(state,bus,{x:0,y:0},'Root'),branch=m.addMindChild(state,bus,root,'Branch'),leaf=m.addMindChild(state,bus,branch,'Leaf'),sibling=m.addMindChild(state,bus,root,'Sibling');
    bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:1200,y:300,width:160,height:100,content:'External'}),id:'external'}});
    for(const connector of [
      {id:'ordinary',start:{kind:'anchor',widgetId:leaf,x:1,y:.5},end:{kind:'anchor',widgetId:'external',x:0,y:.5}},
      {id:'loop',start:{kind:'anchor',widgetId:branch,x:0,y:.5},end:{kind:'anchor',widgetId:branch,x:1,y:.5}},
    ])bus.exec({op:'CONNECTOR_CREATE',payload:{...connector,type:'connector',shape:'curved',style:{strokeColor:'#123456',strokeWidth:7},captions:['Preserve me'],captionPositions:[.37],z:0}});
    bus.exec({op:'GROUP_CREATE',payload:{id:'composition',items:[branch,leaf,'loop']}});
    bus.exec({op:'SELECTION_SET',payload:[branch,'loop']});
    const endpointPositions=Object.fromEntries(['ordinary','loop'].map(id=>{const c=state.connectors.get(id);return [id,{start:resolveEndpoint(c.start,state.widgets),end:resolveEndpoint(c.end,state.widgets)}];}));
    const snapshot=()=>JSON.stringify({widgets:[...state.widgets].sort(([a],[b])=>a.localeCompare(b)),order:state.order,connectors:[...state.connectors].sort(([a],[b])=>a.localeCompare(b)),connectorOrder:state.connectorOrder,groups:[...state.groups],selection:[...state.selection].sort()});
    const before=snapshot(),history=bus.undoStack.length;
    // Layers wraps the same command with its own final selection update.
    bus.exec({op:'BATCH',payload:{label:'Delete from layers',commands:[{op:'WIDGET_REMOVE',payload:branch},{op:'SELECTION_SET',payload:[]}]}});
    m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);
    const after={nodes:[...state.widgets.keys()].sort(),branches:[...state.connectors.values()].filter(c=>c.mindBranch).map(c=>c.mindBranch),ordinary:state.connectors.get('ordinary'),loop:state.connectors.get('loop'),group:state.groups.get('composition'),selection:[...state.selection],history:bus.undoStack.length-history};
    bus.undo();m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);const restored=snapshot()===before;
    bus.redo();m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);
    return {after,endpointPositions,root,sibling,branch,leaf,restored,redoValid:!state.widgets.has(branch)&&!state.widgets.has(leaf)&&state.connectors.has('ordinary')&&state.connectors.has('loop')};
  });
  expect(result.after.nodes).toEqual([result.root,result.sibling,'external'].sort());
  expect(result.after.branches).toEqual([result.sibling]);
  expect(result.after.ordinary.start).toEqual({kind:'point',...result.endpointPositions.ordinary.start});
  expect(result.after.ordinary.end).toEqual({kind:'anchor',widgetId:'external',x:0,y:.5});
  expect(result.after.loop.start).toEqual({kind:'point',...result.endpointPositions.loop.start});
  expect(result.after.loop.end).toEqual({kind:'point',...result.endpointPositions.loop.end});
  expect(result.after.ordinary.captions).toEqual(['Preserve me']);
  expect(result.after.ordinary.captionPositions).toEqual([.37]);
  expect(result.after.group).toEqual(['loop']);
  expect(result.after.selection).toEqual([]);
  expect(result.after.history).toBe(1);
  expect(result.restored).toBe(true);
  expect(result.redoValid).toBe(true);
});
