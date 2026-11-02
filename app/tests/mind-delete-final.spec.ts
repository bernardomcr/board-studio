// @ts-nocheck
import {test,expect} from '@playwright/test';

async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);}

for(const route of ['direct','helper'])test(`${route} removal respects locked branches but an unlocked centre deletes the whole map with one undo`,async({page})=>{
  await ready(page);
  const result=await page.evaluate(async route=>{
    const m=await import('/src/core/mindmap.ts'),{CommandBus}=await import('/src/core/commands.ts');
    const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{});
    const root=m.createMindMap(state,bus,{x:0,y:0},'Root'),branch=m.addMindChild(state,bus,root,'Branch'),leaf=m.addMindChild(state,bus,branch,'Locked leaf');
    bus.exec({op:'ENTITY_LOCK',payload:{ids:[leaf,...state.connectors.keys()],locked:true}});
    bus.exec({op:'SELECTION_SET',payload:[root]});
    const snapshot=()=>JSON.stringify({widgets:[...state.widgets].sort(([a],[b])=>a.localeCompare(b)),order:state.order,connectors:[...state.connectors].sort(([a],[b])=>a.localeCompare(b)),connectorOrder:state.connectorOrder,groups:[...state.groups],selection:[...state.selection]});
    const before=snapshot(),history=bus.undoStack.length;
    bus.exec({op:'WIDGET_REMOVE',payload:branch});
    const branchUnchanged=snapshot()===before&&!m.deleteMindSubtree(state,bus,branch)&&bus.undoStack.length===history;
    const helperResult=route==='helper'?m.deleteMindSubtree(state,bus,root):(bus.exec({op:'WIDGET_REMOVE',payload:root}),true),removed=state.widgets.size===0&&state.connectors.size===0,historyDelta=bus.undoStack.length-history;
    m.validateMindMapGraph([...state.widgets.values()],[...state.connectors.values()]);
    bus.undo();const restored=snapshot()===before;bus.redo();const redone=state.widgets.size===0&&state.connectors.size===0;
    bus.undo();bus.exec({op:'ENTITY_LOCK',payload:{ids:[root],locked:true}});const locked=snapshot(),lockedHistory=bus.undoStack.length;bus.exec({op:'WIDGET_REMOVE',payload:root});const lockedVeto=!m.deleteMindSubtree(state,bus,root)&&snapshot()===locked&&bus.undoStack.length===lockedHistory;
    return {branchUnchanged,helperResult,removed,historyDelta,restored,redone,lockedVeto};
  },route);
  expect(result).toEqual({branchUnchanged:true,helperResult:true,removed:true,historyDelta:1,restored:true,redone:true,lockedVeto:true});
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
