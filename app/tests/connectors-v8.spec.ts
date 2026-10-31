// @ts-nocheck
import {test,expect,type Page} from '@playwright/test';

async function fixture(page:Page){
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.x=0;b.camera.y=0;b.camera.scale=1;
    for(const widget of [
      {...createWidget('shape',{x:-380,y:-180,width:180,height:110,shape:'rectangle',content:'Origem'}),id:'source'},
      {...createWidget('shape',{x:180,y:80,width:200,height:130,shape:'round_rectangle',content:'Destino'}),id:'target'},
    ])b.bus.exec({op:'WIDGET_CREATE',payload:widget});
    b.bus.exec({op:'SELECTION_SET',payload:[]});
  });
}

async function pullConnector(page:Page){
  await page.mouse.move(350,325);await page.mouse.move(460,325);
  await page.mouse.down();await page.mouse.move(920,595,{steps:20});
}

test('hover dots pull a live curve that commits unchanged and bends without a jump',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
  await page.mouse.move(350,325);
  const pixels=await page.evaluate(()=>{
    const data=window.__board.app.renderer.extract.pixels({target:window.__board.app.stage.children[2]}),p=data.pixels;let blue=0;
    for(let i=0;i<p.length;i+=4)if(p[i]===56&&p[i+1]===89&&p[i+2]===255&&p[i+3]>200)blue++;
    return blue;
  });
  expect(pixels).toBeGreaterThan(100);expect(await page.evaluate(()=>window.__board.state.selection.size)).toBe(0);
  await page.mouse.move(460,325);await expect(page.locator('#app canvas')).toHaveCSS('cursor','pointer');
  await page.mouse.down();await page.mouse.move(920,595,{steps:20});
  expect(await page.evaluate(()=>window.__board.gesture().kind)).toBe('connect');
  // Read the cubic actually painted by Pixi before pointer release, rather than
  // merely calculating the preview with the same geometry helper as the model.
  const preview=await page.evaluate(()=>{
    const painted=window.__board.app.stage.children[2].context.instructions.find(i=>i.action==='stroke'&&i.data?.path?.instructions.some(p=>p.action==='bezierCurveTo'));
    const path=painted.data.path.instructions;
    return {start:path.find(p=>p.action==='moveTo').data.slice(0,2),curve:path.find(p=>p.action==='bezierCurveTo').data.slice(0,6)};
  });
  await page.mouse.up();
  const committed=await page.evaluate(async()=>{
    const b=window.__board,c=[...b.state.connectors.values()][0],api=await import('/src/core/connectors.ts'),g=api.connectorGeometry(c,b.state.widgets),curve=g.cubic;
    const screen=p=>{const s=b.camera.worldToScreen(p);return [s.x,s.y];};
    return {c,points:g.points,start:screen(curve.p0),curve:[...screen(curve.p1),...screen(curve.p2),...screen(curve.p3)],handle:b.camera.worldToScreen(api.connectorEditPoints(c,g)[0])};
  });
  expect(committed.c).toMatchObject({shape:'curved',start:{kind:'anchor',widgetId:'source',x:1,y:.5},end:{kind:'anchor',widgetId:'target'}});
  for(let i=0;i<2;i++)expect(committed.start[i]).toBeCloseTo(preview.start[i],6);
  for(let i=0;i<6;i++)expect(committed.curve[i]).toBeCloseTo(preview.curve[i],6);
  const first=committed.points[0],last=committed.points.at(-1),length=Math.hypot(last.x-first.x,last.y-first.y);
  const deviation=Math.max(...committed.points.map(p=>Math.abs((last.x-first.x)*(p.y-first.y)-(last.y-first.y)*(p.x-first.x))/length));
  expect(deviation).toBeGreaterThan(10);
  const handle=committed.handle;await page.mouse.move(handle.x,handle.y);await page.mouse.down();
  await page.mouse.move(handle.x+.05,handle.y+.05);
  const grabError=await page.evaluate(async original=>{
    const b=window.__board,c=[...b.state.connectors.values()][0],api=await import('/src/core/connectors.ts'),g=api.connectorGeometry(c,b.state.widgets);
    return Math.max(...original.map(p=>api.distanceToConnector(p,g)));
  },committed.points);
  expect(grabError).toBeLessThan(.2);
  await page.mouse.move(handle.x+80,handle.y-90,{steps:15});await page.mouse.up();
  const bent=await page.evaluate(()=>[...window.__board.state.connectors.values()][0]);expect(bent.controlPoint).toBeTruthy();expect(bent.waypoints).toBeNull();
  await page.keyboard.press('Control+z');
  const restored=await page.evaluate(async()=>{const b=window.__board,api=await import('/src/core/connectors.ts');return api.connectorGeometry([...b.state.connectors.values()][0],b.state.widgets).points;});
  expect(restored).toEqual(committed.points);expect(errors).toEqual([]);
});

test('reconnecting into empty space preserves a free endpoint and undoes as one gesture',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);await pullConnector(page);await page.mouse.up();
  const before=await page.evaluate(async()=>{
    const b=window.__board,c=[...b.state.connectors.values()][0],api=await import('/src/core/connectors.ts'),g=api.connectorGeometry(c,b.state.widgets);
    return {end:c.end,screen:b.camera.worldToScreen(g.points.at(-1)),undo:b.bus.undoStack.length};
  });
  await page.mouse.move(before.screen.x,before.screen.y);await page.mouse.down();await page.mouse.move(1150,750,{steps:15});await page.mouse.up();
  await expect(page.locator('#connector-completion')).toBeVisible();
  expect(await page.evaluate(()=>[...window.__board.state.connectors.values()][0].end)).toEqual({kind:'point',x:510,y:300});
  expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(before.undo+1);
  await page.keyboard.press('Escape');await expect(page.locator('#connector-completion')).toBeHidden();
  expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(2);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>[...window.__board.state.connectors.values()][0].end)).toEqual(before.end);
  await page.keyboard.press('Control+Shift+z');
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  expect(await page.evaluate(()=>[...window.__board.state.connectors.values()][0])).toMatchObject({shape:'curved',start:{kind:'anchor',widgetId:'source'},end:{kind:'point',x:510,y:300}});
  expect(errors).toEqual([]);
});
