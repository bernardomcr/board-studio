// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('wheel zoom anchors the pointer while preserving every object coordinate and brush radius',async({page})=>{
 await blank(page);await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');
  b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-200,y:60,width:140,height:90,content:''}),id:'scale-shape'}});
  b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'scale-line',type:'connector',start:{kind:'anchor',widgetId:'scale-shape',x:1,y:.5},end:{kind:'point',x:250,y:220},shape:'curved',style:{strokeColor:'#333333',strokeWidth:4,endCap:'arrow'},z:0}});
  b.bus.exec({op:'STROKE_CREATE',payload:{id:'scale-stroke',type:'stroke',tool:'brush',color:'#4262ff',points:[{x:-120,y:260,r:8},{x:30,y:285,r:8},{x:160,y:220,r:8}],z:0}});
  b.bus.exec({op:'SELECTION_SET',payload:[]});b.camera.x=-330;b.camera.y=110;b.camera.scale=.7;
 });await settle(page);
 const before=await page.evaluate(()=>{const b=window.__board;return {scale:b.camera.scale,anchor:b.camera.screenToWorld({x:420,y:350}),geometry:JSON.stringify({widgets:[...b.state.widgets.values()],connectors:[...b.state.connectors.values()],strokes:[...b.state.strokes.values()]})};});
 await page.mouse.move(420,350);await page.mouse.wheel(0,-170);await expect.poll(()=>page.evaluate(()=>window.__board.camera.scale)).toBeGreaterThan(before.scale);
 const after=await page.evaluate(()=>{const b=window.__board;return {anchor:b.camera.screenToWorld({x:420,y:350}),geometry:JSON.stringify({widgets:[...b.state.widgets.values()],connectors:[...b.state.connectors.values()],strokes:[...b.state.strokes.values()]})};});
 expect(after.anchor.x).toBeCloseTo(before.anchor.x,8);expect(after.anchor.y).toBeCloseTo(before.anchor.y,8);expect(after.geometry).toBe(before.geometry);
 const center=await page.evaluate(()=>({x:window.__board.camera.x,y:window.__board.camera.y}));await page.keyboard.press('Control+0');
 expect(await page.evaluate(()=>({x:window.__board.camera.x,y:window.__board.camera.y,scale:window.__board.camera.scale}))).toEqual({...center,scale:1});
});

test('zoom presets, custom percentages, limits and dismissal behave as one menu',async({page})=>{
 await blank(page);const toggle=page.getByRole('button',{name:'Alterar zoom',exact:true}),menu=page.getByRole('dialog',{name:'Zoom do board',exact:true});
 await toggle.click();await expect(menu).toBeVisible();expect(await page.evaluate(()=>window.__board.camera.scale)).toBe(1);
 for(const percent of [50,70,100,400,1200,2000])await expect(menu.getByRole('button',{name:`${percent}%`,exact:true})).toBeVisible();
 await menu.getByRole('button',{name:'400%',exact:true}).click();await expect(menu).toBeHidden();expect(await page.evaluate(()=>window.__board.camera.scale)).toBe(4);
 await toggle.click();await expect(menu.getByRole('button',{name:'400%',exact:true})).toHaveAttribute('aria-pressed','true');
 const input=menu.getByRole('textbox',{name:'Zoom personalizado (%)',exact:true});await input.fill('175,5%');await input.press('Enter');expect(await page.evaluate(()=>window.__board.camera.scale)).toBeCloseTo(1.755,8);
 for(const [value,expected]of [['9000',20],['-10',.02]]){await toggle.click();await input.fill(value);await input.press('Enter');expect(await page.evaluate(()=>window.__board.camera.scale)).toBe(expected);}
 await toggle.click();await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(toggle).toBeFocused();
 await toggle.click();await page.mouse.click(400,450);await expect(menu).toBeHidden();
 await page.setViewportSize({width:900,height:700});await toggle.click();const rect=await menu.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(8);expect(rect.y).toBeGreaterThanOrEqual(8);expect(rect.x+rect.width).toBeLessThanOrEqual(892);expect(rect.y+rect.height).toBeLessThanOrEqual(692);
 await page.screenshot({path:'../work/v9-zoom-menu.png'});
});

for(const entity of ['stroke','connector'])test(`fit includes a board containing only a ${entity}`,async({page})=>{
 await blank(page);await page.evaluate(entity=>{
  const b=window.__board;
  if(entity==='stroke')b.bus.exec({op:'STROKE_CREATE',payload:{id:'distant',type:'stroke',tool:'brush',color:'#4262ff',points:[{x:8400,y:-2800,r:8},{x:8800,y:-2200,r:8},{x:9200,y:-2600,r:8}],z:0}});
  else b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'distant',type:'connector',start:{kind:'point',x:8400,y:-2800},end:{kind:'point',x:9200,y:-2200},shape:'curved',style:{strokeColor:'#333333',strokeWidth:4,endCap:'arrow'},z:0}});
  b.bus.exec({op:'SELECTION_SET',payload:[]});
 },entity);
 await page.getByRole('button',{name:'Ajustar à tela',exact:true}).click();await settle(page);
 const result=await page.evaluate(async()=>{const b=window.__board,{selectedBounds}=await import('/src/core/groups.ts'),bounds=selectedBounds(b.state,['distant']);return {x:b.camera.x,y:b.camera.y,scale:b.camera.scale,width:b.camera.width,height:b.camera.height,min:b.camera.worldToScreen({x:bounds.minX,y:bounds.minY}),max:b.camera.worldToScreen({x:bounds.maxX,y:bounds.maxY})};});
 expect(result.x).toBeGreaterThan(8000);expect(result.y).toBeLessThan(-2000);expect(result.min.x).toBeGreaterThanOrEqual(119.99);expect(result.min.y).toBeGreaterThanOrEqual(119.99);expect(result.max.x).toBeLessThanOrEqual(result.width-119.99);expect(result.max.y).toBeLessThanOrEqual(result.height-119.99);
});

test('DPR changes rerasterize the canvas and font without changing the board or camera',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:0,y:0,content:'DPR'}),id:'density'}});b.bus.exec({op:'SELECTION_SET',payload:[]});b.camera.scale=.75;});await settle(page);
 const before=await page.evaluate(()=>({world:JSON.stringify([...window.__board.state.widgets.values()]),camera:{x:window.__board.camera.x,y:window.__board.camera.y,scale:window.__board.camera.scale}}));
 for(const [reported,resolution]of [[2.5,2.5],[4,3]]){
  await page.evaluate(reported=>Object.defineProperty(window,'devicePixelRatio',{value:reported,configurable:true}),reported);await expect.poll(()=>page.evaluate(()=>window.__board.app.renderer.resolution)).toBe(resolution);await settle(page);
  const result=await page.evaluate(()=>{const b=window.__board,node=b.app.stage.children[1].children[3].children.find(n=>n.label==='density'),text=node.children[1].children.find(n=>n.style);b.app.renderer.render({container:b.app.stage});const source=b.app.renderer.canvasText._activeTextures[text.styleKey].texture.source;return {physicalRatio:b.app.canvas.width/b.app.screen.width,resolution:text.resolution,mipLevels:source.mipLevelCount,world:JSON.stringify([...b.state.widgets.values()]),camera:{x:b.camera.x,y:b.camera.y,scale:b.camera.scale}};});
  expect(result.physicalRatio).toBeCloseTo(resolution,5);expect(result.resolution).toBeGreaterThanOrEqual(.75*resolution);expect(result.mipLevels).toBeGreaterThan(1);expect(result.world).toBe(before.world);expect(result.camera).toEqual(before.camera);
 }
});
