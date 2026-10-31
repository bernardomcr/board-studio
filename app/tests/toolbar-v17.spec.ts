// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill('Dock do Studio');await dialog.getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();await expect(dialog).toHaveCount(0);
 const title=page.getByRole('textbox',{name:'Nome do board',exact:true});await title.fill('Ateliê criativo com título comprido · '.repeat(30).slice(0,800));await title.press('Enter');
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function workspace(page){return page.evaluate(async()=>(await import('/src/context-position.ts')).workspaceTop());}
async function contained(page,selector){
 await expect(page.locator(selector)).toBeVisible();const box=await page.locator(selector).boundingBox(),view=page.viewportSize(),top=await workspace(page);expect(box.x).toBeGreaterThanOrEqual(7.5);expect(box.x+box.width).toBeLessThanOrEqual(view.width-7.5);expect(box.y).toBeGreaterThanOrEqual(top-.5);expect(box.y+box.height).toBeLessThanOrEqual(view.height-7.5);return box;
}

for(const width of [360,800,1280,1600,1920])test(`tools dock at the actual top edge and long header commands remain usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await blank(page);
 for(const dark of [false,true]){
  if(dark)await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();await settle(page);
  const dock=await page.evaluate(()=>{
   const bounds=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   const bar=document.getElementById('toolbar'),header=document.getElementById('topbar');return {tools:bounds(bar),header:bounds(header),title:document.getElementById('board-title').textContent,rounding:getComputedStyle(bar).borderRadius,surface:getComputedStyle(bar).backgroundColor,scenery:getComputedStyle(document.body,'::before').backgroundColor,shadow:getComputedStyle(bar).boxShadow,overflow:getComputedStyle(bar).overflowX,
    controls:[...document.querySelectorAll('#toolbar button,#topbar button,#board-title,#theme-toggle,#layers-toggle')].filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0;}).map(element=>{const rect=bounds(element),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {name:element.id||element.getAttribute('aria-label')||element.textContent.trim(),...rect,usable:element===hit||element.contains(hit)};})};
  });
  expect(dock.title.length).toBe(800);expect(dock.tools.x).toBe(0);expect(dock.tools.y).toBe(0);expect(dock.tools.width).toBe(width);expect(dock.rounding).toBe('0px');expect(dock.shadow).toBe('none');expect(dock.surface).toBe(dock.scenery);expect(['auto','scroll']).not.toContain(dock.overflow);expect(dock.header.y).toBeCloseTo(dock.tools.bottom,5);
  const top=await workspace(page);
  for(const control of dock.controls){expect(control.x,control.name).toBeGreaterThanOrEqual(-.5);expect(control.right,control.name).toBeLessThanOrEqual(width+.5);expect(control.bottom,control.name).toBeLessThanOrEqual(top-9.5);expect(control.usable,`${width}: ${control.name}`).toBe(true);
   for(const other of dock.controls){if(other===control)continue;const overlap=Math.min(control.right,other.right)-Math.max(control.x,other.x)>1&&Math.min(control.bottom,other.bottom)-Math.max(control.y,other.y)>1;expect(overlap,`${width}: ${control.name} overlaps ${other.name}`).toBe(false);}
  }
  for(const name of ['Salvar arquivo','Abrir arquivo','Exportar PNG','Exportar SVG','Atalhos','Camadas'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
 }
});

test('shape, note, layer and selection menus respect the complete dock through a narrow resize',async({page})=>{
 await page.setViewportSize({width:1600,height:900});await blank(page);await page.locator('#toolbar [data-tool="shape"]').click();await page.locator('#shape-picker [data-more-shapes]').click();await contained(page,'#shape-picker');
 await page.setViewportSize({width:360,height:640});await settle(page);await contained(page,'#shape-picker');await page.keyboard.press('Escape');
 await page.locator('#toolbar [data-tool="sticky_note"]').click();await contained(page,'#sticky-picker');await page.locator('#sticky-picker [data-sticky-pad]').click();await contained(page,'#sticky-picker');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Camadas',exact:true}).click();const layers=await page.locator('#layers-panel').boundingBox();expect(layers.y).toBeGreaterThanOrEqual((await workspace(page))-2);await page.getByRole('button',{name:'Fechar camadas',exact:true}).click();
 await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),p=b.camera.screenToWorld({x:110,y:20});b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{...p,width:140,height:80,content:'Perto do dock'}),id:'dock-object'}});b.bus.exec({op:'SELECTION_SET',payload:['dock-object']});});
 await page.keyboard.press('v');await contained(page,'#selection-properties');await page.locator('#selection-properties details[data-menu="shape"] > summary').click();await page.locator('#selection-properties [data-action="more-shapes"]').click();await contained(page,'#shape-picker');await expect(page.locator('#shape-search')).toBeFocused();
});
