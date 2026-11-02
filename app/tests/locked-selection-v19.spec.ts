// @ts-nocheck
import {test,expect} from '@playwright/test';

async function fixture(page,zoom=1){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();
 await page.evaluate(async zoom=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.x=b.camera.y=0;b.camera.scale=zoom;
  b.bus.exec({op:'BACKGROUND_UPDATE',payload:{grid:false}});
  const shape=(id,x,y,width,height,type='shape')=>({...createWidget(type,{x:x/zoom,y:y/zoom,width:width/zoom,height:height/zoom}),id,...(type==='image'?{src:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#b68aff"/></svg>'),originalWidth:100,originalHeight:80}:{})});
  b.bus.exec({op:'WIDGET_CREATE',payload:shape('backdrop',-550,-350,1100,700)});
  b.bus.exec({op:'WIDGET_CREATE',payload:shape('one',-180,-50,100,80,'image')});
  b.bus.exec({op:'WIDGET_CREATE',payload:shape('two',70,-50,100,80)});
  b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'far-wire',type:'connector',shape:'straight',start:{kind:'point',x:-2000/zoom,y:-2000/zoom},end:{kind:'point',x:2000/zoom,y:1000/zoom},style:{strokeColor:'#b68aff',strokeWidth:3/zoom,startCap:'none',endCap:'none'},z:0}});
  b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['backdrop'],locked:true}});b.bus.exec({op:'SELECTION_SET',payload:[]});
 },zoom);
}
async function point(page,x,y){return page.evaluate(({x,y})=>{const b=window.__board,r=b.app.canvas.getBoundingClientRect(),p=b.camera.worldToScreen({x:x/b.camera.scale,y:y/b.camera.scale});return {x:p.x+r.left,y:p.y+r.top};},{x,y});}
async function hold(page,button){await button.hover();await page.mouse.down();await page.waitForTimeout(760);await page.mouse.up();}

for(const zoom of [.02,1,6])test(`marquee ignores locked backdrop and distant connector AABB at ${zoom*100}%`,async({page})=>{
 await fixture(page,zoom);const a=await point(page,-230,-110),b=await point(page,220,110);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:16});await page.mouse.up();
 expect(await page.evaluate(()=>[...window.__board.state.selection].sort())).toEqual(['one','two']);
 const blank=await point(page,-400,220);await page.mouse.move(blank.x,blank.y);await expect(page.locator('#app canvas')).not.toHaveCSS('cursor','not-allowed');await page.mouse.click(blank.x,blank.y);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual([]);
 const image=await point(page,-130,0);await page.mouse.click(image.x,image.y);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['one']);
});

test('right click respects visual stack and unlock requires a completed hold',async({page})=>{
 await fixture(page);const image=await point(page,-130,0);await page.mouse.click(image.x,image.y,{button:'right'});await expect(page.locator('#editor-context [data-action="duplicate"]')).toBeVisible();await expect(page.locator('#editor-context [data-hold-unlock]')).toHaveCount(0);
 const background=await point(page,-400,220);await page.mouse.click(background.x,background.y,{button:'right'});const unlock=page.locator('#editor-context [data-hold-unlock]');await expect(unlock).toBeVisible();await expect(page.locator('#editor-context button')).toHaveCount(1);await expect(page.locator('#selection-properties')).toBeHidden();await expect(page.locator('#selection-properties [data-hold-unlock]')).toHaveCount(0);await unlock.click();expect(await page.evaluate(()=>window.__board.state.widgets.get('backdrop').locked)).toBe(true);
 await hold(page,unlock);expect(await page.evaluate(()=>window.__board.state.widgets.get('backdrop').locked)).toBe(false);await expect(page.locator('#editor-context')).toBeHidden();await page.evaluate(()=>window.__board.bus.undo());expect(await page.evaluate(()=>window.__board.state.widgets.get('backdrop').locked)).toBe(true);
});

test('cancelled pointer and keyboard holds keep object locked and layers provide unlock without a floating duplicate',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Camadas',exact:true}).click();const caret=page.getByRole('button',{name:/^Expandir objetos da camada /}).first();await caret.click();await page.locator('[data-layer-id="backdrop"] [data-layer-select]').click();const unlock=page.locator('[data-layer-id="backdrop"] [data-layer-lock][data-hold-unlock]');await expect(unlock).toBeVisible();await expect(page.locator('#selection-properties')).toBeHidden();await expect(page.locator('#selection-properties [data-hold-unlock]')).toHaveCount(0);
 // Pause at a future instant derived from the installed clock, so transport
 // latency cannot turn the requested time into the past on slower CI runners.
 const clockStart=Date.now();await page.clock.install({time:clockStart});await page.clock.pauseAt(clockStart+60_000);
 await unlock.hover();await page.mouse.down();await page.clock.runFor(150);await page.mouse.move(300,800);await page.mouse.up();await page.clock.runFor(760);expect(await page.evaluate(()=>window.__board.state.widgets.get('backdrop').locked)).toBe(true);
 await unlock.focus();await page.keyboard.down('Enter');await page.clock.runFor(760);await page.keyboard.up('Enter');expect(await page.evaluate(()=>window.__board.state.widgets.get('backdrop').locked)).toBe(false);await expect(page.locator('#selection-properties')).toBeVisible();await expect(page.locator('#selection-properties [data-hold-unlock]')).toHaveCount(0);expect(await page.locator('#selection-properties button').count()).toBeGreaterThan(0);
});

test('locked entity command guard blocks edits deletion transforms and patch-unlock without consuming history',async({page})=>{
 await fixture(page);const result=await page.evaluate(()=>{
  const b=window.__board;b.bus.exec({op:'STROKE_CREATE',payload:{id:'locked-ink',type:'stroke',tool:'brush',color:'#b68aff',points:[{x:0,y:200,r:3},{x:80,y:200,r:3}],z:0}});b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['far-wire','locked-ink'],locked:true}});
  const snapshot=()=>JSON.stringify([b.state.widgets.get('backdrop'),b.state.connectors.get('far-wire'),b.state.strokes.get('locked-ink')]),before=snapshot(),n=b.bus.undoStack.length;
  for(const command of [
   {op:'WIDGET_UPDATE',payload:{id:'backdrop',patch:{x:999,content:'changed',style:{fillColor:'#ff0000'}}}},
   {op:'WIDGET_UPDATE',payload:{id:'backdrop',patch:{locked:false}}},
   {op:'WIDGET_REMOVE',payload:'backdrop'},
   {op:'WIDGET_TRANSLATE',payload:{ids:['backdrop'],dx:12,dy:12}},
   {op:'WIDGET_REORDER',payload:{ids:['backdrop'],direction:'front'}},
   {op:'CONNECTOR_UPDATE',payload:{id:'far-wire',patch:{captions:['changed'],locked:false,style:{strokeColor:'#ff0000',strokeWidth:99}}}},
   {op:'CONNECTOR_REMOVE',payload:'far-wire'},
   {op:'STROKE_UPDATE',payload:{id:'locked-ink',patch:{points:[],color:'#ff0000',locked:false}}},
   {op:'STROKE_REMOVE',payload:'locked-ink'},
   {op:'BATCH',payload:{commands:[{op:'WIDGET_UPDATE',payload:{id:'backdrop',patch:{width:9000}}},{op:'WIDGET_REMOVE',payload:'backdrop'}]}}
  ])b.bus.exec(command);
  return {same:before===snapshot(),history:b.bus.undoStack.length-n};
 });expect(result).toEqual({same:true,history:0});
});

test('inherited layer lock cannot be bypassed from object unlock and layer hold restores own flags',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Camadas',exact:true}).click();const row=page.locator('#layers-list [data-board-layer-id]').first();await row.locator('[data-board-layer-lock]').click();
 const blocked=await page.evaluate(()=>{const b=window.__board,w=b.state.widgets.get('one'),before=JSON.stringify(w),n=b.bus.undoStack.length;b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['one'],locked:false}});b.bus.exec({op:'WIDGET_UPDATE',payload:{id:'one',patch:{layerOwnLocked:false,locked:false,x:100}}});return {same:before===JSON.stringify(b.state.widgets.get('one')),history:b.bus.undoStack.length-n};});expect(blocked).toEqual({same:true,history:0});
 await row.locator('[data-board-layer-expand]').click();await page.locator('[data-layer-id="one"] [data-layer-select]').click();await expect(page.locator('#selection-properties')).toBeHidden();await expect(page.locator('[data-layer-id="one"] [data-layer-lock]')).toBeDisabled();
 await hold(page,row.locator('[data-board-layer-lock]'));expect(await page.evaluate(()=>[window.__board.state.widgets.get('one').locked,window.__board.state.widgets.get('backdrop').locked])).toEqual([false,true]);
});

test('group member picking skips locked leaves without changing group membership',async({page})=>{
 await fixture(page);await page.evaluate(()=>{const b=window.__board;b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['backdrop'],locked:false}});b.bus.exec({op:'GROUP_CREATE',payload:{id:'mixed',items:['one','backdrop']}});b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['backdrop'],locked:true}});b.bus.exec({op:'SELECTION_SET',payload:[]});});
 const a=await point(page,-130,0);await page.mouse.click(a.x,a.y);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['one']);expect(await page.evaluate(()=>window.__board.state.groups.get('mixed'))).toEqual(['one','backdrop']);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+40,a.y+20,{steps:8});await page.mouse.up();expect(await page.evaluate(()=>[window.__board.state.widgets.get('backdrop').x,window.__board.state.widgets.get('backdrop').y])).toEqual([-550,-350]);
});

test('locked layer ancestors cannot be escaped by reparenting ungrouping or document edits',async({page})=>{
 await fixture(page);const result=await page.evaluate(async()=>{
  const b=window.__board,{snapshotBoardLayers}=await import('/src/core/board-layers.ts'),doc=snapshotBoardLayers(b.state),child=doc.activeId;
  doc.nodes[0].parentId='locked-folder';doc.nodes.push({id:'locked-folder',kind:'group',name:'Base protegida'},{id:'outside',kind:'layer',name:'Acima'});b.bus.exec({op:'LAYERS_SET',payload:{document:doc}});b.bus.exec({op:'LAYERS_LOCK',payload:{ids:['locked-folder'],locked:true}});
  const snapshot=()=>JSON.stringify({layers:b.state.layers,widgets:[...b.state.widgets]}),before=snapshot(),n=b.bus.undoStack.length;
  for(const change of ['reparent','ungroup','unlock-patch','rename','reorder']){const next=snapshotBoardLayers(b.state);if(change==='reparent')delete next.nodes.find(node=>node.id===child).parentId;if(change==='ungroup'){next.nodes=next.nodes.filter(node=>node.id!=='locked-folder');delete next.nodes.find(node=>node.id===child).parentId;}if(change==='unlock-patch')next.nodes.find(node=>node.id==='locked-folder').locked=false;if(change==='rename')next.nodes.find(node=>node.id==='locked-folder').name='Alterado';if(change==='reorder'){const group=next.nodes.find(node=>node.id==='locked-folder');next.nodes=next.nodes.filter(node=>node.id!==group.id);next.nodes.push(group);}b.bus.exec({op:'LAYERS_SET',payload:{document:next}});}
  b.bus.exec({op:'LAYERS_LOCK',payload:{ids:[child],locked:false}});
  return {same:snapshot()===before,history:b.bus.undoStack.length-n,child};
 });expect(result.same).toBe(true);expect(result.history).toBe(0);
 await page.getByRole('button',{name:'Camadas',exact:true}).click();const folder=page.locator('[data-board-layer-id="locked-folder"]');await expect(folder).toHaveAttribute('draggable','false');await folder.locator('[data-board-layer-select]').click();await expect(page.getByRole('button',{name:'Desagrupar camadas',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Mover camada abaixo',exact:true})).toBeDisabled();
 await hold(page,folder.locator('[data-board-layer-lock]'));expect(await page.evaluate(()=>window.__board.state.widgets.get('one').locked)).toBe(false);await page.evaluate(()=>window.__board.bus.undo());expect(await page.evaluate(()=>window.__board.state.widgets.get('one').locked)).toBe(true);await page.evaluate(()=>window.__board.bus.redo());expect(await page.evaluate(()=>window.__board.state.widgets.get('one').locked)).toBe(false);
});

test('a locked mind branch vetoes complete subtree deletion before any sibling can be removed',async({page})=>{
 await fixture(page);const result=await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{deleteMindSubtree}=await import('/src/core/mindmap.ts');
  for(const [id,parent,order]of [['root',null,0],['child','root',0],['sibling','root',1]])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:400+order*50,y:-200+order*90,width:100,height:60,content:id}),id,mind:{rootId:'root',parentId:parent,side:'right',order}}});
  for(const child of ['child','sibling'])b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'branch-'+child,type:'connector',mindBranch:child,shape:'curved',start:{kind:'anchor',widgetId:'root',x:1,y:.5},end:{kind:'anchor',widgetId:child,x:0,y:.5},style:{strokeColor:'#b68aff',strokeWidth:2},z:0}});
  b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['branch-child'],locked:true}});const snapshot=()=>JSON.stringify({widgets:[...b.state.widgets],connectors:[...b.state.connectors],selection:[...b.state.selection]}),before=snapshot(),n=b.bus.undoStack.length;
  b.bus.exec({op:'WIDGET_REMOVE',payload:'root'});const directSame=snapshot()===before,helper=deleteMindSubtree(b.state,b.bus,'root'),helperSame=snapshot()===before,history=b.bus.undoStack.length-n;
  b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['branch-child'],locked:false}});const allowed=deleteMindSubtree(b.state,b.bus,'root'),removed=['root','child','sibling'].every(id=>!b.state.widgets.has(id));b.bus.undo();const restored=['root','child','sibling'].every(id=>b.state.widgets.has(id))&&['branch-child','branch-sibling'].every(id=>b.state.connectors.has(id));
  return {directSame,helper,helperSame,history,allowed,removed,restored};
 });expect(result).toEqual({directSame:true,helper:false,helperSame:true,history:0,allowed:true,removed:true,restored:true});
});

test('text creation refused by a locked active layer completes the gesture without opening a missing object',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);
 const before=await page.evaluate(()=>{const b=window.__board;b.bus.exec({op:'LAYERS_LOCK',payload:{ids:[b.state.layers.activeId],locked:true}});return {widgets:b.state.widgets.size,history:b.bus.undoStack.length};});
 await page.keyboard.press('t');const location=await point(page,300,160);await page.mouse.click(location.x,location.y);
 await expect(page.locator('#inline-editor')).toBeHidden();await expect(page.locator('[data-tool="select"]')).toHaveClass(/active/);
 const after=await page.evaluate(()=>{const b=window.__board;return {widgets:b.state.widgets.size,history:b.bus.undoStack.length,gesture:b.gesture().kind};});
 expect(after).toEqual({...before,gesture:'none'});expect(errors).toEqual([]);
});
