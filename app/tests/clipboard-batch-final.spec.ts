// @ts-nocheck
import {test,expect} from '@playwright/test';

async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);}
async function blank(page){await ready(page);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}

test('a large mixed clipboard snapshot publishes once with remapped anchors, preserved groups and copy-time external geometry',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const {CommandBus}=await import('/src/core/commands.ts'),{createWidget}=await import('/src/core/model.ts'),g=await import('/src/core/groups.ts');
    const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()};
    let publications=0;const bus=new CommandBus(state,()=>publications++),commands=[],ids=[];
    for(let i=0;i<120;i++){
      const id=`w-${i}`;ids.push(id);
      commands.push({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:(i%12)*210,y:Math.floor(i/12)*140,width:160,height:100,content:`Object ${i}`}),id,name:id,hidden:i===10,locked:i===11}});
    }
    commands.push({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:4000,y:700,width:180,height:130,content:'External anchor'}),id:'external',name:'external'}});
    for(let i=0;i<110;i++){
      const id=`c-${i}`;ids.push(id);
      commands.push({op:'CONNECTOR_CREATE',payload:{id,name:id,type:'connector',shape:i%2?'curved':'elbowed',start:{kind:'anchor',widgetId:`w-${i}`,x:1,y:.5},end:{kind:'anchor',widgetId:i===109?'external':`w-${i+1}`,x:0,y:.5},style:{strokeColor:'#3859ff',strokeWidth:3,startCap:'circle',endCap:'arrow'},captions:[`Caption ${i}`],captionPositions:[.31],z:0}});
    }
    for(let i=0;i<20;i++){
      const id=`s-${i}`;ids.push(id);
      commands.push({op:'STROKE_CREATE',payload:{id,name:id,type:'stroke',tool:'brush',color:'#e16c68',opacity:.65,points:[{x:i*90,y:1800,r:3},{x:i*90+70,y:1850,r:5}],z:0}});
    }
    commands.push({op:'GROUP_CREATE',payload:{id:'inner',items:['w-0','w-1','c-0','s-0']}},{op:'GROUP_CREATE',payload:{id:'outer',items:['inner','w-2','c-1','s-1']}},{op:'SELECTION_SET',payload:ids});
    bus.exec({op:'BATCH',payload:{label:'Fixture',commands}});
    const copied=g.captureSelection(state),externalPosition=copied.endpointPositions['c-109'].end;
    bus.exec({op:'WIDGET_UPDATE',payload:{id:'external',patch:{x:8000,y:-900}}});
    bus.exec({op:'WIDGET_REMOVE',payload:'external'});
    const serial=()=>JSON.stringify({widgets:[...state.widgets].sort(([a],[b])=>a.localeCompare(b)),order:state.order,connectors:[...state.connectors].sort(([a],[b])=>a.localeCompare(b)),connectorOrder:state.connectorOrder,strokes:[...state.strokes].sort(([a],[b])=>a.localeCompare(b)),strokeOrder:state.strokeOrder,groups:[...state.groups].sort(([a],[b])=>a.localeCompare(b)),selection:[...state.selection].sort()});
    const before=serial(),history=bus.undoStack.length;publications=0;
    g.duplicateSnapshot(state,bus,copied,600,-350);
    const duplicatePublications=publications,after=serial(),selection=[...state.selection],selected=new Set(selection);
    const entity=id=>state.widgets.get(id)??state.connectors.get(id)??state.strokes.get(id),byName=new Map(selection.map(id=>[entity(id).name,entity(id)])),copiedWidgetIds=new Set(copied.widgets.map(w=>w.id));
    const anchorsRemapped=copied.connectors.every(original=>['start','end'].every(field=>{const old=original[field],next=byName.get(original.name)[field];if(old.kind==='anchor'&&copiedWidgetIds.has(old.widgetId))return next.kind==='anchor'&&next.widgetId!==old.widgetId&&selected.has(next.widgetId)&&state.widgets.get(next.widgetId).name===old.widgetId;return next.kind==='point';}));
    const describe=(id,groups)=>groups.has(id)?groups.get(id).map(member=>describe(member,groups)):entity(id).name;
    const originalDescriptions=copied.groups.map(([id])=>JSON.stringify(describe(id,new Map(copied.groups)))).sort();
    const newGroups=[...state.groups].filter(([id])=>!['inner','outer'].includes(id)),groupDescriptions=newGroups.map(([id])=>JSON.stringify(describe(id,state.groups))).sort();
    const groupsPreserved=JSON.stringify(groupDescriptions)===JSON.stringify(originalDescriptions)&&newGroups.every(([id])=>g.groupLeaves(state,id).every(member=>selected.has(member)));
    const widgetsPreserved=copied.widgets.every(w=>{const next=byName.get(w.name);return next.x===w.x+600&&next.y===w.y-350&&next.width===w.width&&next.height===w.height&&!!next.hidden===!!w.hidden&&!next.locked;});
    const strokesPreserved=copied.strokes.every(st=>{const next=byName.get(st.name);return next.opacity===st.opacity&&next.points.every((p,i)=>p.x===st.points[i].x+600&&p.y===st.points[i].y-350&&p.r===st.points[i].r);});
    const captionsPreserved=copied.connectors.every(c=>{const next=byName.get(c.name);return JSON.stringify(next.captions)===JSON.stringify(c.captions)&&JSON.stringify(next.captionPositions)===JSON.stringify(c.captionPositions);});
    const externalEnd=byName.get('c-109').end,counts={widgets:state.widgets.size,connectors:state.connectors.size,strokes:state.strokes.size,groups:state.groups.size,selection:selection.length};
    const oneUndo=bus.undoStack.length-history===1;bus.undo();const undoExact=serial()===before;bus.redo();const redoExact=serial()===after;
    return {duplicatePublications,anchorsRemapped,groupsPreserved,widgetsPreserved,strokesPreserved,captionsPreserved,externalEnd,expectedExternalEnd:{kind:'point',x:externalPosition.x+600,y:externalPosition.y-350},counts,selectionComplete:selection.every(id=>!!entity(id)),oneUndo,undoExact,redoExact};
  });
  expect(result.duplicatePublications).toBe(1);
  expect(result.counts).toEqual({widgets:240,connectors:220,strokes:40,groups:4,selection:250});
  expect(result.externalEnd).toEqual(result.expectedExternalEnd);
  for(const property of ['anchorsRemapped','groupsPreserved','widgetsPreserved','strokesPreserved','captionsPreserved','selectionComplete','oneUndo','undoExact','redoExact'])expect(result[property],property).toBe(true);
});

test('duplicate joins an existing transaction so one undo reverses both the preceding edit and the paste',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const {CommandBus}=await import('/src/core/commands.ts'),{createWidget}=await import('/src/core/model.ts'),g=await import('/src/core/groups.ts');
    const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()};
    let publications=0;const bus=new CommandBus(state,()=>publications++);
    bus.exec({op:'BATCH',payload:{commands:[{op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:30,y:40,width:160,height:100,content:'Original'}),id:'original'}},{op:'SELECTION_SET',payload:['original']}]}});
    const history=bus.undoStack.length;bus.beginTransaction('Edit and paste');
    bus.exec({op:'WIDGET_UPDATE',payload:{id:'original',patch:{x:330,content:'Edited'}}});
    const beforePaste=publications;g.duplicateSnapshot(state,bus,g.captureSelection(state));
    const duplicatePublications=publications-beforePaste,historyStillOpen=bus.undoStack.length===history,copy=[...state.widgets.values()].find(w=>w.id!=='original');
    bus.endTransaction();const oneUndo=bus.undoStack.length===history+1,pasted={x:copy.x,y:copy.y,content:copy.content};
    bus.undo();const undone={count:state.widgets.size,x:state.widgets.get('original').x,content:state.widgets.get('original').content,selection:[...state.selection]};
    bus.redo();return {duplicatePublications,historyStillOpen,oneUndo,pasted,undone,redone:state.widgets.size===2&&state.widgets.get('original').x===330&&state.widgets.get('original').content==='Edited'};
  });
  expect(result).toEqual({duplicatePublications:1,historyStillOpen:true,oneUndo:true,pasted:{x:354,y:64,content:'Edited'},undone:{count:1,x:30,content:'Original',selection:['original']},redone:true});
});

test('native mixed-object paste at two percent zoom synchronizes the real scene once per paste, undo and redo',async({page})=>{
  await blank(page);
  const result=await page.evaluate(async()=>{
    // Vite may version the application's dependency URL after an HMR update.
    // Import that first-loaded module so this hook observes the live prototype.
    const appSceneURL=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname==='/src/render/scene.ts')?.name;
    if(!appSceneURL)throw new Error('The application scene module was not found in loaded resources.');
    const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{BoardScene}=await import(appSceneURL),commands=[],ids=[];
    for(let i=0;i<104;i++){const id=`native-${i}`;ids.push(id);commands.push({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:(i%13)*420-2600,y:Math.floor(i/13)*300-1000,width:240,height:160,content:`Native ${i}`}),id}});}
    for(let i=0;i<10;i++){const id=`native-line-${i}`;ids.push(id);commands.push({op:'CONNECTOR_CREATE',payload:{id,type:'connector',shape:'curved',start:{kind:'anchor',widgetId:`native-${i}`,x:1,y:.5},end:{kind:'anchor',widgetId:`native-${i+1}`,x:0,y:.5},style:{strokeColor:'#3859ff',strokeWidth:4},z:0}});}
    ids.push('native-stroke');commands.push({op:'STROKE_CREATE',payload:{id:'native-stroke',type:'stroke',tool:'brush',color:'#e16c68',points:[{x:0,y:1800,r:7},{x:600,y:1900,r:9}],z:0}},{op:'GROUP_CREATE',payload:{id:'native-group',items:['native-0','native-1','native-line-0','native-stroke']}},{op:'SELECTION_SET',payload:ids});
    b.bus.exec({op:'BATCH',payload:{label:'Native fixture',commands}});b.camera.scale=.02;
    // Count the real onChange render synchronization and still execute it.
    // One synchronous dispatch excludes unrelated later animation frames.
    let calls=0;const original=BoardScene.prototype.sync;
    BoardScene.prototype.sync=function(...args){calls++;return original.apply(this,args);};
    try{
      document.activeElement?.blur();const data=new DataTransfer(),copy=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(copy);
      const paste=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(paste);
      if(calls===0)throw new Error('The live application scene sync hook was not invoked by native paste.');
      const pasteSyncs=calls,selected=[...b.state.selection],allSelectedExist=selected.every(id=>b.state.widgets.has(id)||b.state.connectors.has(id)||b.state.strokes.has(id)),after={widgets:b.state.widgets.size,connectors:b.state.connectors.size,strokes:b.state.strokes.size,groups:b.state.groups.size,selected:selected.length};
      calls=0;b.bus.undo();const undoSyncs=calls,undone={widgets:b.state.widgets.size,connectors:b.state.connectors.size,strokes:b.state.strokes.size,groups:b.state.groups.size};
      calls=0;b.bus.redo();const redoSyncs=calls;
      return {copyConsumed:copy.defaultPrevented,pasteConsumed:paste.defaultPrevented,pasteSyncs,undoSyncs,redoSyncs,after,undone,allSelectedExist,zoom:b.camera.scale,redone:b.state.widgets.size===208&&b.state.selection.size===115};
    }finally{BoardScene.prototype.sync=original;}
  });
  expect(result).toEqual({copyConsumed:true,pasteConsumed:true,pasteSyncs:1,undoSyncs:1,redoSyncs:1,after:{widgets:208,connectors:20,strokes:2,groups:2,selected:115},undone:{widgets:104,connectors:10,strokes:1,groups:1},allSelectedExist:true,zoom:.02,redone:true});
});
