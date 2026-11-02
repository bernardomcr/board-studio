// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page,zoom=1){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  await page.evaluate(zoom=>{const b=window.__board;b.camera.x=b.camera.y=0;b.camera.scale=zoom;},zoom);
}
async function fixture(page,zoom=1){
  await blank(page,zoom);return page.evaluate(async zoom=>{const b=window.__board,m=await import('/src/core/mindmap.ts'),root=m.createMindMap(b.state,b.bus,{x:-280/zoom,y:0},'Projeto',1/zoom),a=m.addMindChild(b.state,b.bus,root,'Planejar'),leaf=m.addMindChild(b.state,b.bus,a,'Detalhar');b.bus.exec({op:'SELECTION_SET',payload:[a]});return {root,a,leaf};},zoom);
}
async function select(page,id){await page.evaluate(id=>window.__board.bus.exec({op:'SELECTION_SET',payload:[id]}),id);}
async function screenBox(page,id){return page.evaluate(id=>{const b=window.__board,w=b.state.widgets.get(id),r=b.app.canvas.getBoundingClientRect(),a=b.camera.worldToScreen({x:w.x,y:w.y}),z=b.camera.scale;return {x:a.x+r.left,y:a.y+r.top,width:w.width*z,height:w.height*z};},id);}
async function center(locator){const box=await locator.boundingBox();expect(box).toBeTruthy();return {x:box.x+box.width/2,y:box.y+box.height/2};}
// DOM positions use 1/64 CSS-pixel layout units; comparing a rounded button
// center with the canvas transform can accumulate two such rounding steps.
const aligned=(actual,expected)=>expect(Math.abs(actual-expected)).toBeLessThanOrEqual(1/32);

for(const zoom of [.02,1,20])test(`inline Mind child/sibling controls remain clickable at ${zoom*100}% and a ring folds the branch`,async({page})=>{
  const ids=await fixture(page,zoom),add=page.getByRole('button',{name:'Adicionar subtópico no board',exact:true}),sibling=page.getByRole('button',{name:'Adicionar tópico irmão no board',exact:true}),fold=page.getByRole('button',{name:'Recolher 1 subtópico',exact:true}),box=await screenBox(page,ids.a);
  await expect(add).toBeVisible();await expect(sibling).toBeVisible();await expect(fold).toBeVisible();
  await add.click({trial:true});const childPosition=await center(add),siblingPosition=await center(sibling);expect(childPosition.x).toBeGreaterThan(box.x+box.width);aligned(childPosition.y,box.y+box.height/2);expect(siblingPosition.y).toBeGreaterThan(box.y+box.height);aligned(siblingPosition.x,box.x+box.width/2);
  for(const locator of [add,sibling,fold]){const rect=await locator.boundingBox();expect(rect.width).toBeCloseTo(24,3);expect(rect.height).toBeCloseTo(24,3);expect(await locator.evaluate(button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===button;})).toBe(true);}
  const circle=await fold.evaluate(button=>{const s=getComputedStyle(button,'::before');return {radius:s.borderRadius,width:parseFloat(s.width),border:s.borderStyle};});expect(circle.radius).toBe('50%');expect(circle.width).toBeLessThan(20);expect(circle.border).toBe('solid');await expect(fold).toHaveAttribute('title',/1 subtópico/);
  await fold.click();expect(await page.evaluate(async id=>(await import('/src/core/mindmap.ts')).mindNodeHidden(window.__board.state,id),ids.leaf)).toBe(true);await expect(page.getByRole('button',{name:'Expandir 1 subtópico',exact:true})).toBeVisible();
  await page.keyboard.press('Control+z');expect(await page.evaluate(async id=>(await import('/src/core/mindmap.ts')).mindNodeHidden(window.__board.state,id),ids.leaf)).toBe(false);
  await sibling.click();await expect(page.locator('#inline-editor')).toBeVisible();let added=await page.evaluate(()=>{const b=window.__board;return b.state.widgets.get([...b.state.selection][0]);});expect(added.mind.parentId).toBe(ids.root);await page.keyboard.press('Control+Enter');
  await select(page,ids.a);await add.click();await expect(page.locator('#inline-editor')).toBeVisible();added=await page.evaluate(()=>{const b=window.__board;return b.state.widgets.get([...b.state.selection][0]);});expect(added.mind.parentId).toBe(ids.a);await page.keyboard.press('Control+Enter');
});

test('Org inline child and sibling controls follow their vertical tree axes',async({page})=>{
  const ids=await fixture(page);await page.evaluate(async id=>{const b=window.__board;(await import('/src/core/mindmap.ts')).setMindLayout(b.state,b.bus,id,'org');},ids.root);
  const box=await screenBox(page,ids.a),child=await center(page.locator('[data-mind-add]')),sibling=await center(page.locator('[data-mind-sibling]'));
  expect(child.y).toBeGreaterThan(box.y+box.height);aligned(child.x,box.x+box.width/2);expect(sibling.x).toBeGreaterThan(box.x+box.width);aligned(sibling.y,box.y+box.height/2);
  await page.locator('[data-mind-sibling]').click();await expect(page.locator('#inline-editor')).toBeVisible();expect(await page.evaluate(()=>{const b=window.__board;return b.state.widgets.get([...b.state.selection][0]).mind.parentId;})).toBe(ids.root);
});

test('reduced motion still expands a branch with the outward arrow and navigates to its child',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});const ids=await fixture(page);await page.locator('[data-mind-fold]').click();await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(id=>!!window.__board.state.widgets.get(id).mind.collapsed,ids.a)).toBe(false);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual([ids.leaf]);await expect(page.locator('[data-mind-add]')).toHaveCSS('animation-name','none');
});

test('a freely dragged branch retains its placement after adding a child, while Reorganize and Undo remain explicit',async({page})=>{
  const ids=await fixture(page),before=await screenBox(page,ids.a),from={x:before.x+before.width/2,y:before.y+before.height/2};
  await page.keyboard.down('Alt');await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+70,from.y+170,{steps:12});await page.mouse.up();await page.keyboard.up('Alt');
  const pinned=await page.evaluate(ids=>[ids.a,ids.leaf].map(id=>{const w=window.__board.state.widgets.get(id);return {id,x:w.x,y:w.y,manual:w.mind.manualPosition};}),ids);expect(pinned.every(w=>w.manual)).toBe(true);
  await page.locator('[data-mind-add]').click();await page.keyboard.press('Control+Enter');for(const old of pinned)expect(await page.evaluate(id=>{const w=window.__board.state.widgets.get(id);return {x:w.x,y:w.y};},old.id)).toEqual({x:old.x,y:old.y});
  await select(page,ids.a);await page.getByRole('button',{name:'Mapa',exact:true}).click();await page.getByRole('button',{name:'Reorganizar mapa',exact:true}).click();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.manualPosition,ids.a)).toBeUndefined();await page.keyboard.press('Control+z');
  for(const old of pinned)expect(await page.evaluate(id=>{const w=window.__board.state.widgets.get(id);return {x:w.x,y:w.y,manual:w.mind.manualPosition};},old.id)).toEqual({x:old.x,y:old.y,manual:true});
});
