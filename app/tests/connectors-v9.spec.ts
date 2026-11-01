// @ts-nocheck
import {test,expect} from '@playwright/test';

async function fixture(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
  await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');for(const w of [
    {...createWidget('shape',{x:-500,y:-160,width:180,height:110}),id:'source'},
    {...createWidget('shape',{x:0,y:30,width:200,height:130}),id:'target'},
    {...createWidget('shape',{x:-40,y:260,width:160,height:100}),id:'hidden',hidden:true},
    {...createWidget('shape',{x:-200,y:250,width:180,height:110}),id:'locked',locked:true},
  ])b.bus.exec({op:'WIDGET_CREATE',payload:w});b.bus.exec({op:'SELECTION_SET',payload:[]});});
}
async function selectionPixels(page,x,y){return page.evaluate(({x,y})=>{const b=window.__board,data=b.app.renderer.extract.pixels({target:b.app.stage,frame:new b.app.screen.constructor(x-9,y-9,18,18),resolution:1}).pixels;let n=0;for(let i=0;i<data.length;i+=4)if(data[i]===169&&data[i+1]===112&&data[i+2]===240&&data[i+3]>200)n++;return n;},{x,y});}
async function paintedEndpoint(page){return page.evaluate(()=>{const b=window.__board,instruction=b.app.stage.children[2].context.instructions.find(i=>i.action==='stroke'&&i.data?.path?.instructions.some(p=>p.action==='bezierCurveTo'));const curve=instruction.data.path.instructions.filter(p=>p.action==='bezierCurveTo').at(-1);return curve.data.slice(4,6);});}

test('connector ports advertise nearby targets and magnetize without a crosshair or snap flicker',async({page})=>{
  await fixture(page);await page.mouse.move(390,395);await page.mouse.move(500,395);await expect(page.locator('#app canvas')).toHaveCSS('cursor','pointer');
  await page.mouse.down();await expect(page.locator('#app canvas')).toHaveCSS('cursor','default');await page.mouse.move(700,560,{steps:15});
  // The visible destination port is ahead of the wire, not merely its end marker.
  expect(await selectionPixels(page,800,595)).toBeGreaterThan(12);expect(await selectionPixels(page,760,810)).toBe(0);expect(await selectionPixels(page,600,805)).toBe(0);
  await page.screenshot({path:'../work/v9-connector-target-ports.png'});
  await page.mouse.move(790,595,{steps:6});let end=await paintedEndpoint(page);expect(end[0]).toBeCloseTo(800,5);expect(end[1]).toBeCloseTo(595,5);
  await page.mouse.move(780,595);end=await paintedEndpoint(page);expect(end[0]).toBeCloseTo(800,5);expect(end[1]).toBeCloseTo(595,5);
  await page.mouse.move(776,595);end=await paintedEndpoint(page);expect(end[0]).toBeCloseTo(776,5);expect(end[1]).toBeCloseTo(595,5);
  await page.mouse.move(790,595);await page.mouse.up();const connector=await page.evaluate(()=>[...window.__board.state.connectors.values()][0]);expect(connector).toMatchObject({shape:'curved',end:{kind:'anchor',widgetId:'target',x:0,y:.5}});
  await page.mouse.move(800,595);await expect(page.locator('#app canvas')).toHaveCSS('cursor','grab');
});

test('line choices in Shapes remain remembered when pulling the next connection from a port',async({page})=>{
  await fixture(page);await expect(page.locator('#toolbar [data-tool="connector"]')).toHaveCount(0);const button=page.getByRole('button',{name:'Formas',exact:true});await button.click();await page.getByRole('button',{name:'Linha reta sem seta',exact:true}).click();await expect(button).toHaveClass(/active/);
  // A deliberate free straight line remains a straight line.
  await page.mouse.move(100,850);await page.mouse.down();await page.mouse.move(450,900,{steps:10});await page.mouse.up();
  expect(await page.evaluate(()=>[...window.__board.state.connectors.values()][0])).toMatchObject({shape:'straight',style:{endCap:'none'}});
  await page.mouse.move(390,395);await page.mouse.move(500,395);await page.mouse.down();await page.mouse.move(790,595,{steps:15});await page.mouse.up();
  const line=await page.evaluate(()=>[...window.__board.state.connectors.values()].find(c=>c.start.kind==='anchor'));expect(line).toMatchObject({shape:'straight',style:{endCap:'none'},start:{widgetId:'source'},end:{widgetId:'target'}});
});

test('Control leaves an endpoint free near a port and Shift constrains the carried endpoint',async({page})=>{
  await fixture(page);await page.mouse.move(390,395);await page.mouse.move(500,395);await page.mouse.down();await page.keyboard.down('Control');await page.mouse.move(790,595,{steps:15});
  const preview=await paintedEndpoint(page);expect(preview[0]).toBeCloseTo(790,5);expect(preview[1]).toBeCloseTo(595,5);await page.mouse.up();await page.keyboard.up('Control');
  expect(await page.evaluate(()=>[...window.__board.state.connectors.values()][0].end)).toEqual({kind:'point',x:-10,y:95});await page.keyboard.press('Escape');await page.keyboard.press('Control+z');
  await page.mouse.move(390,395);await page.mouse.move(500,395);await page.mouse.down();await page.keyboard.down('Shift');await page.keyboard.down('Control');await page.mouse.move(700,500,{steps:10});
  const carried=await page.evaluate(()=>{const b=window.__board,g=b.gesture(),w=b.state.widgets.get('source');return {dx:g.current.x-(w.x+w.width),dy:g.current.y-(w.y+w.height/2)};});expect(carried.dx).toBeCloseTo(carried.dy,5);
  await page.mouse.up();await page.keyboard.up('Control');await page.keyboard.up('Shift');const c=await page.evaluate(()=>[...window.__board.state.connectors.values()][0]);expect(c.end.kind).toBe('point');expect(c.end.x-(-320)).toBeCloseTo(c.end.y-(-105),5);
});
