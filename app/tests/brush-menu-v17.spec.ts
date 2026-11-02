// @ts-nocheck
import {test,expect} from '@playwright/test';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function right(page,x=1100,y=650){await page.mouse.click(x,y,{button:'right'});}
const brush=page=>page.locator('#toolbar [data-tool="brush"]');

test('brush options are closed on selection and right click toggles them without leaving the brush',async({page})=>{
 await blank(page);await brush(page).click();const panel=page.locator('#drawing-palette');await expect(panel).toBeHidden();const undo=await page.evaluate(()=>window.__board.bus.undoStack.length);
 for(let i=0;i<3;i++){await right(page);await expect(panel).toBeVisible();await right(page);await expect(panel).toBeHidden();await expect(brush(page)).toHaveClass(/active/);}
 await right(page);await panel.getByRole('button',{name:'Fechar opções do pincel',exact:true}).click();await expect(panel).toBeHidden();await expect(brush(page)).toHaveClass(/active/);await right(page);await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(brush(page)).toHaveClass(/active/);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(undo);
 await page.mouse.move(600,400);await page.mouse.down();await page.mouse.move(800,460,{steps:20});await page.mouse.up();expect(await page.evaluate(()=>window.__board.state.strokes.size)).toBe(1);
});

test('drawing dismisses options and they remain closed through painting and subsequent settings gestures',async({page})=>{
 await blank(page);await brush(page).click();await right(page);const panel=page.locator('#drawing-palette');await expect(panel).toBeVisible();await panel.getByRole('slider',{name:'Tamanho do pincel',exact:true}).evaluate(el=>{el.value='18';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.mouse.move(450,420);await page.mouse.down();await expect(panel).toBeHidden();await page.mouse.move(850,520,{steps:50});await page.mouse.up();await expect(panel).toBeHidden();
 await page.evaluate(()=>{window.paletteMutations=0;window.paletteObserver=new MutationObserver(records=>window.paletteMutations+=records.length);window.paletteObserver.observe(document.getElementById('drawing-palette'),{attributes:true,subtree:true,childList:true,characterData:true});});
 await page.keyboard.down('Alt');await page.mouse.move(650,650);await page.mouse.down({button:'right'});await page.mouse.move(750,670,{steps:25});await page.mouse.up({button:'right'});await page.keyboard.up('Alt');await expect(panel).toBeHidden();expect(await page.evaluate(()=>window.paletteMutations)).toBe(0);expect(await page.evaluate(()=>window.__board.state.strokes.size)).toBe(1);
 await right(page);await expect(panel).toBeVisible();await expect(panel.getByRole('slider',{name:'Tamanho do pincel',exact:true})).toHaveValue('58');await expect(panel.getByRole('slider',{name:'Opacidade do pincel',exact:true})).toHaveValue('90');
});

test('right click on an object opens brush settings without selecting the object or showing the object menu',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),point=b.camera.screenToWorld({x:700,y:450});b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{...point,width:160,height:100,content:'Objeto'}),id:'keep-selection'}});b.bus.exec({op:'SELECTION_SET',payload:[]});});await brush(page).click();await right(page,740,490);await expect(page.locator('#drawing-palette')).toBeVisible();await expect(page.locator('#editor-context')).toBeHidden();expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual([]);expect(await page.evaluate(()=>window.__board.state.strokes.size)).toBe(0);await right(page,740,490);await expect(page.locator('#drawing-palette')).toBeHidden();
});

test('eraser options use the same contextual toggle and keep the selected erase mode',async({page})=>{
 await blank(page);const eraser=page.locator('#toolbar [data-tool="eraser"]');await eraser.click();const panel=page.locator('#drawing-palette');await expect(panel).toBeHidden();await right(page);await panel.getByRole('radio',{name:'Borracha de precisão',exact:true}).click();await right(page);await expect(panel).toBeHidden();await expect(eraser).toHaveClass(/active/);await right(page);await expect(panel.getByRole('radio',{name:'Borracha de precisão',exact:true})).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(eraser).toHaveClass(/active/);
});

test('a brand-color modal owns Escape before the brush palette beneath it',async({page})=>{
 await blank(page);await brush(page).click();await right(page);const panel=page.locator('#drawing-palette');await panel.getByRole('button',{name:'Gerenciar cores da marca',exact:true}).click();const modal=page.getByRole('dialog',{name:'Cores da marca',exact:true});await expect(modal).toBeVisible();await page.keyboard.press('Escape');await expect(modal).toBeHidden();await expect(brush(page)).toHaveClass(/active/);await expect(panel).toBeVisible();await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(brush(page)).toHaveClass(/active/);
});

test('contextual brush options stay beside the side rail and within a small viewport',async({page})=>{
 const workspace=()=>page.evaluate(async()=>{
  const {workspaceTop,workspaceLeft}=await import('/src/context-position.ts'),rail=document.getElementById('toolbar').getBoundingClientRect(),panel=document.getElementById('drawing-palette'),box=panel.getBoundingClientRect();
  return {top:workspaceTop(),left:workspaceLeft(),rail:{right:rail.right,width:rail.width,height:rail.height},foreground:panel.contains(document.elementFromPoint(box.left+Math.min(24,box.width/2),box.top+Math.min(20,box.height/2)))};
 });
 await page.setViewportSize({width:360,height:480});await blank(page);await brush(page).click();await right(page,330,330);const panel=page.locator('#drawing-palette');await expect(panel).toBeVisible();
 const bounds=await panel.boundingBox(),available=await workspace();
 expect(available.rail.height).toBeGreaterThan(available.rail.width);expect(available.left).toBeGreaterThanOrEqual(available.rail.right+8);expect(bounds.x).toBeGreaterThanOrEqual(available.left);expect(bounds.x+bounds.width).toBeLessThanOrEqual(348);expect(bounds.y).toBeGreaterThanOrEqual(available.top);expect(bounds.y+bounds.height).toBeLessThanOrEqual(468);expect(available.foreground).toBe(true);
 await page.setViewportSize({width:800,height:600});await expect(panel).toBeVisible();const resized=await panel.boundingBox(),resizedAvailable=await workspace();
 expect(resized.x).toBeGreaterThanOrEqual(resizedAvailable.left);expect(resized.x).toBeGreaterThanOrEqual(resizedAvailable.rail.right+8);expect(resized.y).toBeGreaterThanOrEqual(resizedAvailable.top);expect(resized.x+resized.width).toBeLessThanOrEqual(788);expect(resized.y+resized.height).toBeLessThanOrEqual(588);expect(resizedAvailable.foreground).toBe(true);
});
