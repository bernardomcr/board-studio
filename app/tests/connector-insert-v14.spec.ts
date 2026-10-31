// @ts-nocheck
import {test,expect} from '@playwright/test';
async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();
}

test('inserting a shape splits anchors and captions once, preserves its group, and undoes as one action',async({page})=>{
 await blank(page);
 const result=await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{connectorInsertion}=await import('/src/core/connector-insert.ts'),{connectorGeometry,connectorPointAt}=await import('/src/core/connectors.ts'),{boardToSvg}=await import('/src/core/exportSvg.ts');
  for(const [id,x,y]of[['a',0,0],['b',800,200]]){
   const w={...createWidget('shape',{x,y,width:100,height:80,content:'Ponta'}),id};w.style.fillColor='#ffc4d1';b.bus.exec({op:'WIDGET_CREATE',payload:w});
  }
  b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'original-line',type:'connector',shape:'curved',start:{kind:'anchor',widgetId:'a',x:1,y:.5},end:{kind:'anchor',widgetId:'b',x:0,y:.5},waypoints:[{x:450,y:-150}],style:{strokeColor:'#e94b21',strokeWidth:9,startCap:'circle',endCap:'arrow'},captions:['Entrada','Saída'],captionPositions:[.2,.8],captionStyles:[{fontSize:18,followPath:true,color:'#123456'},{fontSize:22,side:'above',color:'#654321'}],z:1}});
  b.bus.exec({op:'GROUP_CREATE',payload:{id:'family',items:['original-line']}});b.bus.exec({op:'SELECTION_SET',payload:['original-line']});
  const original=structuredClone(b.state.connectors.get('original-line')),center=connectorPointAt(connectorGeometry(original,b.state.widgets),.5),undoCount=b.bus.undoStack.length;
  const plan=connectorInsertion(b.state,original,{type:'shape',shape:'circle'});b.bus.exec({op:'BATCH',payload:{label:'Inserir objeto na conexão',commands:plan.commands}});
  const widget=b.state.widgets.get(plan.widgetId),first=b.state.connectors.get('original-line'),second=[...b.state.connectors.values()].find(c=>c.id!==first.id);
  const after={widget:structuredClone(widget),first:structuredClone(first),second:structuredClone(second),members:[...b.state.groups.get('family')],selection:[...b.state.selection],undoAdded:b.bus.undoStack.length-undoCount,svg:boardToSvg(b.state)};
  b.bus.undo();const undone={line:structuredClone(b.state.connectors.get('original-line')),widgets:b.state.widgets.size,lines:b.state.connectors.size,members:[...b.state.groups.get('family')],selection:[...b.state.selection]};
  b.bus.redo();await b.saveNow();return {original,center,after,undone};
 });
 const {after,original,center}=result;
 expect(after.undoAdded).toBe(1);expect(after.widget.type).toBe('shape');expect(after.widget.shape).toBe('circle');expect(after.widget.style.fillColor).toBe('#ffc4d1');
 expect(after.widget.x+after.widget.width/2).toBeCloseTo(center.x,7);expect(after.widget.y+after.widget.height/2).toBeCloseTo(center.y,7);expect(after.widget.width).toBe(100);expect(after.widget.height).toBe(80);
 expect(after.first.start).toEqual(original.start);expect(after.second.end).toEqual(original.end);expect(after.first.end.widgetId).toBe(after.widget.id);expect(after.second.start.widgetId).toBe(after.widget.id);
 expect(after.first.style).toMatchObject({strokeColor:'#e94b21',strokeWidth:9,startCap:'circle',endCap:'none'});expect(after.second.style).toMatchObject({startCap:'none',endCap:'arrow'});
 expect(after.first.captions).toEqual(['Entrada']);expect(after.second.captions).toEqual(['Saída']);expect(after.first.captionPositions[0]).toBeCloseTo(.4);expect(after.second.captionPositions[0]).toBeCloseTo(.6);
 expect(after.first.captionStyles[0]).toEqual(original.captionStyles[0]);expect(after.second.captionStyles[0]).toEqual(original.captionStyles[1]);expect(after.first.waypoints).toBeNull();expect(after.second.waypoints).toBeNull();
 expect(after.members).toEqual(['original-line',after.widget.id,after.second.id]);expect(after.selection).toEqual([after.widget.id]);expect(after.svg.match(/Entrada/g)).toHaveLength(1);expect(after.svg.match(/Saída/g)).toHaveLength(1);
 expect(result.undone).toEqual({line:original,widgets:2,lines:1,members:['original-line'],selection:['original-line']});
 await page.reload();await page.waitForFunction(()=>window.__board?.booted);
 expect(await page.evaluate(()=>({widgets:window.__board.state.widgets.size,lines:window.__board.state.connectors.size,members:[...window.__board.state.groups.get('family')]}))).toEqual({widgets:3,lines:2,members:after.members});
});

test('insertion refuses occupied midpoint and protected automatic branches without altering the board',async({page})=>{
 await blank(page);
 const result=await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{connectorInsertion,canInsertConnectorObject}=await import('/src/core/connector-insert.ts');
  const a={...createWidget('shape',{x:0,y:0,width:100,height:100}),id:'a'},target={...createWidget('shape',{x:50,y:0,width:100,height:100}),id:'b'};b.bus.exec({op:'WIDGET_CREATE',payload:a});b.bus.exec({op:'WIDGET_CREATE',payload:target});
  const line={id:'test',type:'connector',shape:'straight',start:{kind:'anchor',widgetId:'a',x:1,y:.5},end:{kind:'anchor',widgetId:'b',x:0,y:.5},style:{strokeColor:'#000000',strokeWidth:2},z:0};
  const choices=[{type:'shape',shape:'rectangle'},{type:'text'},{type:'sticky_note',ratio:1.6}],overlap=choices.map(c=>connectorInsertion(b.state,line,c)===null);
  const free={...line,start:{kind:'point',x:0,y:0},end:{kind:'point',x:600,y:0}};
  return {overlap,locked:connectorInsertion(b.state,{...free,locked:true},choices[0])===null,mind:connectorInsertion(b.state,{...free,mindBranch:'a'},choices[0])===null,empty:connectorInsertion(b.state,{...free,end:{kind:'point',x:0,y:0}},choices[0])===null,free:canInsertConnectorObject(b.state,free),counts:[b.state.widgets.size,b.state.connectors.size]};
 });
 expect(result).toEqual({overlap:[true,true,true],locked:true,mind:true,empty:true,free:true,counts:[2,0]});
});

test('inserted free text resolves its natural size before collision checks at every zoom',async({page})=>{
 await blank(page);const cases=await page.evaluate(async()=>{
  const {createWidget}=await import('/src/core/model.ts'),{connectorInsertion}=await import('/src/core/connector-insert.ts'),{widgetAABB,rectsIntersect}=await import('/src/core/geometry.ts');
  return [.02,1,20].map(zoom=>{
   const a={...createWidget('shape',{x:0,y:0,width:100/zoom,height:80/zoom}),id:'a'},b={...createWidget('shape',{x:800/zoom,y:0,width:100/zoom,height:80/zoom}),id:'b'};a.style.fontSize=1e50;a.style.fontWeight='bold';
   const state={widgets:new Map([['a',a],['b',b]]),groups:new Map()},line={id:'line',type:'connector',shape:'straight',start:{kind:'anchor',widgetId:'a',x:1,y:.5},end:{kind:'anchor',widgetId:'b',x:0,y:.5},style:{strokeColor:'#333333',strokeWidth:2},z:0},plan=connectorInsertion(state,line,{type:'text'},zoom),w=plan.commands.find(c=>c.op==='WIDGET_CREATE').payload;
   return {screenFont:w.style.fontSize*zoom,sourceFont:a.style.fontSize,weight:w.style.fontWeight,screenWidth:w.width*zoom,screenHeight:w.height*zoom,overlaps:[a,b].some(end=>rectsIntersect(widgetAABB(w),widgetAABB(end)))};
  });
 });
 for(const item of cases){expect(item.screenFont).toBeCloseTo(24,7);expect(item.sourceFont).toBe(1e50);expect(item.weight).toBe('bold');expect(item.screenWidth).toBeLessThanOrEqual(100);expect(item.screenHeight).toBeLessThanOrEqual(80);expect(item.overlaps).toBe(false);}
});

test('legacy rectangular note insertion choices resolve the same square geometry that the factory publishes',async({page})=>{
 await blank(page);const result=await page.evaluate(async()=>{const b=window.__board,{connectorInsertion}=await import('/src/core/connector-insert.ts');b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'square-line',type:'connector',shape:'straight',start:{kind:'point',x:-500,y:0},end:{kind:'point',x:500,y:0},style:{strokeColor:'#222222',strokeWidth:2,startCap:'none',endCap:'none'},z:0}});const insertion=connectorInsertion(b.state,b.state.connectors.get('square-line'),{type:'sticky_note',ratio:1.6},1);if(!insertion)throw Error('Note must fit in empty span');b.bus.exec({op:'BATCH',payload:{commands:insertion.commands}});const w=b.state.widgets.get(insertion.widgetId);return {square:w.width===w.height,center:{x:w.x+w.width/2,y:w.y+w.height/2},connectors:b.state.connectors.size};});expect(result).toEqual({square:true,center:{x:0,y:0},connectors:2});
});

test('connector menu inserts an editable note and More shapes can insert a nonprimary shape',async({page})=>{
 await blank(page);
 await page.evaluate(()=>{const b=window.__board;b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'menu-line',type:'connector',shape:'straight',start:{kind:'point',x:250,y:320},end:{kind:'point',x:1000,y:320},style:{strokeColor:'#167654',strokeWidth:3,startCap:'none',endCap:'none'},z:0}});b.bus.exec({op:'SELECTION_SET',payload:['menu-line']});});
 await page.getByRole('button',{name:'Inserir objeto no conector',exact:true}).click();
 await page.getByRole('button',{name:'Inserir nota quadrada no conector',exact:true}).click();
 await expect(page.locator('#inline-editor')).toBeVisible();await page.locator('#inline-editor').fill('Etapa intermediária');await page.locator('#inline-editor').press('Control+Enter');
 const note=await page.evaluate(()=>{const b=window.__board,w=[...b.state.widgets.values()][0];return {type:w.type,ratio:w.width/w.height,content:w.content,selection:[...b.state.selection],lines:b.state.connectors.size,id:w.id};});
 expect(note.type).toBe('sticky_note');expect(note.ratio).toBeCloseTo(1);expect(note.content).toContain('Etapa intermediária');expect(note.lines).toBe(2);expect(note.selection).toEqual([note.id]);
 await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');
 await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(0);
 await page.getByRole('button',{name:'Inserir objeto no conector',exact:true}).click();await page.locator('details[data-menu="insert-object"]').getByRole('button',{name:'Mais formas',exact:true}).click();
 await page.locator('#shape-picker').getByRole('button',{name:'Hexágono',exact:true}).click();
 await expect(page.locator('#inline-editor')).toBeVisible();await page.locator('#inline-editor').press('Escape');
 expect(await page.evaluate(()=>({shape:[...window.__board.state.widgets.values()][0]?.shape,lines:window.__board.state.connectors.size}))).toEqual({shape:'hexagon',lines:2});
});
