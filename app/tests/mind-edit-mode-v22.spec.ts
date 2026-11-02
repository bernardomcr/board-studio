// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function fixture(page,zoom=1){
  await blank(page);
  return page.evaluate(async zoom=>{const b=window.__board,m=await import('/src/core/mindmap.ts');b.camera.x=b.camera.y=0;b.camera.scale=zoom;const root=m.createMindMap(b.state,b.bus,{x:-280/zoom,y:-50/zoom},'Ideia central',1/zoom),child=m.addMindChild(b.state,b.bus,root,'Detalhar');b.bus.exec({op:'SELECTION_SET',payload:[root]});return {root,child};},zoom);
}
async function point(page,id,handle){return page.evaluate(({id,handle})=>{const b=window.__board,w=b.state.widgets.get(id),r=b.app.canvas.getBoundingClientRect(),p=b.camera.worldToScreen(handle?b.geom.handleWorld(w,handle):{x:w.x+w.width/2,y:w.y+w.height/2});return {x:r.left+p.x,y:r.top+p.y};},{id,handle});}
async function node(page,id){return page.evaluate(id=>window.__board.state.widgets.get(id),id);}
const panel=page=>page.locator('#mindmap-properties');

for(const zoom of [.02,1,20])test(`ready Mind moves freely without editor chrome; right click and check delimit editing at ${zoom*100}%`,async({page})=>{
  const ids=await fixture(page,zoom),before=await node(page,ids.root),center=await point(page,ids.root),corner=await point(page,ids.root,'se');
  await page.mouse.click(center.x,center.y);await expect(panel(page)).toBeHidden();await expect(page.locator('#selection-properties')).toBeHidden();await expect(page.locator('[data-mind-add]')).toHaveCount(0);await expect(page.locator('[data-mind-fold]')).toBeVisible();
  await page.mouse.move(corner.x,corner.y);expect(await page.locator('#app canvas').evaluate(c=>c.style.cursor)).not.toMatch(/resize/);
  await page.keyboard.down('Alt');await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+45,center.y+30,{steps:8});await page.mouse.up();await page.keyboard.up('Alt');
  const moved=await node(page,ids.root);expect((moved.x-before.x)*zoom).toBeCloseTo(45,4);expect((moved.y-before.y)*zoom).toBeCloseTo(30,4);expect(moved.width).toBe(before.width);expect(moved.height).toBe(before.height);await expect(panel(page)).toBeHidden();
  const next=await point(page,ids.root);await page.mouse.click(next.x,next.y,{button:'right'});await expect(panel(page)).toBeVisible();await expect(page.locator('#editor-context')).toBeHidden();await expect(page.locator('[data-mind-add]')).toBeVisible();
  const resize=await point(page,ids.root,'se');await page.mouse.move(resize.x,resize.y);expect(await page.locator('#app canvas').evaluate(c=>c.style.cursor)).toMatch(/resize/);
  await page.getByRole('button',{name:'Concluir edição do mapa mental',exact:true}).click();await expect(panel(page)).toBeHidden();await expect(page.locator('[data-mind-add]')).toHaveCount(0);await expect(page.locator('[data-mind-fold]')).toBeVisible();
  await page.locator('[data-mind-fold]').click();expect(await node(page,ids.root)).toMatchObject({mind:{collapsed:true}});await expect(panel(page)).toBeHidden();await page.locator('[data-mind-fold]').click();expect((await node(page,ids.root)).mind.collapsed).toBe(false);
  const saved=await node(page,ids.root);await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);const again=await point(page,ids.root);await page.mouse.click(again.x,again.y);await expect(panel(page)).toBeHidden();expect(await node(page,ids.root)).toEqual(saved);
});

test('new maps start in editing, check commits text, and a completed map ignores double click editing',async({page})=>{
  await blank(page);await page.getByRole('button',{name:'Mapa mental',exact:true}).click();await expect(page.locator('#inline-editor')).toBeVisible();await expect(panel(page)).toBeVisible();
  const id=await page.evaluate(()=>[...window.__board.state.selection][0]);await page.locator('#inline-editor').fill('Projeto pronto');await page.getByRole('button',{name:'Concluir edição do mapa mental',exact:true}).click();
  await expect(page.locator('#inline-editor')).toBeHidden();await expect(panel(page)).toBeHidden();expect((await node(page,id)).content).toBe('Projeto pronto');
  const p=await point(page,id);await page.mouse.dblclick(p.x,p.y);await expect(page.locator('#inline-editor')).toBeHidden();await page.keyboard.press('Enter');await expect(page.locator('#inline-editor')).toBeHidden();
  await page.mouse.click(p.x,p.y,{button:'right'});await expect(panel(page)).toBeVisible();await page.mouse.dblclick(p.x,p.y);await expect(page.locator('#inline-editor')).toBeVisible();await page.locator('#inline-editor').fill('Editado de novo');await page.getByRole('button',{name:'Concluir edição do mapa mental',exact:true}).click();expect((await node(page,id)).content).toBe('Editado de novo');await expect(panel(page)).toBeHidden();
});

test('editing belongs to one map and finishing removes edit controls from every topic of it',async({page})=>{
  const ids=await fixture(page),other=await page.evaluate(async()=>{const b=window.__board,m=await import('/src/core/mindmap.ts');return m.createMindMap(b.state,b.bus,{x:180,y:170},'Outro mapa');});
  const root=await point(page,ids.root);await page.mouse.click(root.x,root.y,{button:'right'});await expect(panel(page)).toBeVisible();const child=await point(page,ids.child);await page.mouse.click(child.x,child.y);await expect(panel(page)).toBeVisible();
  await page.getByRole('button',{name:'Concluir edição do mapa mental',exact:true}).click();await page.mouse.click(root.x,root.y);await expect(panel(page)).toBeHidden();
  await page.mouse.click(root.x,root.y,{button:'right'});const p=await point(page,other);await page.mouse.click(p.x,p.y);await expect(panel(page)).toBeHidden();await expect(page.locator('[data-mind-add]')).toHaveCount(0);
});

test('multiple ready topics and internal branches never expose the generic connector or object editors',async({page})=>{
  const ids=await fixture(page);await page.evaluate(ids=>window.__board.bus.exec({op:'SELECTION_SET',payload:[ids.root,ids.child]}),ids);
  await expect(page.locator('#selection-properties')).toBeHidden();await expect(panel(page)).toBeHidden();
  const branch=await page.evaluate(id=>[...window.__board.state.connectors.values()].find(c=>c.mindBranch===id).id,ids.child);
  const mid=await page.evaluate(async id=>{const b=window.__board,{connectorGeometry,connectorPointAt}=await import('/src/core/connectors.ts'),c=b.state.connectors.get(id),g=connectorGeometry(c,b.state.widgets),p=connectorPointAt(g,.5),r=b.app.canvas.getBoundingClientRect(),s=b.camera.worldToScreen(p);return {x:s.x+r.left,y:s.y+r.top};},branch);
  await page.mouse.click(mid.x,mid.y);await expect(page.locator('#selection-properties')).toBeHidden();expect(await page.evaluate(id=>window.__board.state.selection.has(id),branch)).toBe(false);expect(await page.evaluate(()=>window.__board.state.connectors.size)).toBe(1);
  await page.evaluate(id=>window.__board.bus.exec({op:'SELECTION_SET',payload:[id]}),branch);await expect(page.locator('#selection-properties')).toBeHidden();await page.mouse.dblclick(mid.x,mid.y);await expect(page.locator('#connector-caption-editor')).toHaveCount(0);
  await page.mouse.click(mid.x,mid.y,{button:'right'});await expect(panel(page)).toBeVisible();expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual([ids.child]);await expect(page.locator('#editor-context')).toBeHidden();
});
