// @ts-nocheck
import {test,expect} from '@playwright/test';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function shape(page,zoom=1){await page.evaluate(async zoom=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:0,y:0,width:160,height:100,content:''}),id:'subject'}});b.bus.exec({op:'SELECTION_SET',payload:['subject']});b.camera.scale=zoom;},zoom);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}

test('at two percent zoom a tiny selected object moves without its resize handles stealing the gesture',async({page})=>{
 await blank(page);await shape(page,.02);await page.mouse.move(801.5,501);await page.mouse.down();expect(await page.evaluate(()=>window.__board.gesture().kind)).toBe('drag');await page.keyboard.down('Alt');await page.mouse.move(901.5,551,{steps:12});await page.mouse.up();await page.keyboard.up('Alt');
 const result=await page.evaluate(()=>{const w=window.__board.state.widgets.get('subject');return {x:w.x,y:w.y,width:w.width,height:w.height};});expect(result).toEqual({x:5000,y:2500,width:160,height:100});await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.get('subject').x)).toBe(0);
});

test('many pointer samples in one frame commit one transform and retain the final position and one-step undo',async({page})=>{
 await blank(page);await shape(page);await page.mouse.move(870,550);await page.mouse.down();await page.evaluate(()=>{
  const b=window.__board,original=b.bus.exec.bind(b.bus);window.__moveCalls=0;b.bus.exec=command=>{if(command.op==='BATCH'&&command.payload.label==='Mover')window.__moveCalls++;original(command);};const canvas=b.app.canvas;
  for(let i=1;i<=120;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',buttons:1,clientX:870+i,clientY:550+i/2,altKey:true}));
 });await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 expect(await page.evaluate(()=>window.__moveCalls)).toBe(1);expect(await page.evaluate(()=>({x:window.__board.state.widgets.get('subject').x,y:window.__board.state.widgets.get('subject').y}))).toEqual({x:120,y:60});await page.mouse.up();await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.get('subject').x)).toBe(0);
});

test('a selected text range becomes a working link and survives a reload',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:-180,y:0,content:'Visite o site'}),id:'linked-text'}});b.bus.exec({op:'SELECTION_SET',payload:['linked-text']});});await page.keyboard.press('Enter');await expect(page.locator('#inline-editor')).toBeVisible();
 await page.evaluate(()=>{const editor=document.getElementById('inline-editor'),walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT),text=walker.nextNode(),range=document.createRange();range.setStart(text,0);range.setEnd(text,6);const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);});
 await page.keyboard.press('Control+k');const dialog=page.getByRole('dialog',{name:'Adicionar link'});await expect(dialog).toBeVisible();await dialog.getByRole('textbox',{name:'Endereço do link'}).fill('example.com');await dialog.getByRole('button',{name:'Salvar link',exact:true}).click();await expect(dialog).toBeHidden();
 expect(await page.evaluate(()=>window.__board.state.widgets.get('linked-text').content)).toBe('[Visite](https://example.com/) o site');expect(await page.evaluate(()=>window.__board.linksFor('linked-text').length)).toBe(1);await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(()=>window.__board.state.widgets.get('linked-text').content)).toContain('https://example.com/');
});

test('shape links open on a short click while dragging still moves the same linked shape',async({page,context})=>{
 await context.route('https://example.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Link de teste</title>Destino do link'}));await blank(page);await shape(page);await page.getByRole('button',{name:'Adicionar link',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Adicionar link'});await dialog.getByRole('textbox',{name:'Endereço do link'}).fill('https://example.com/');await dialog.getByRole('button',{name:'Salvar link',exact:true}).click();
 const popup=context.waitForEvent('page');await page.mouse.click(870,550);const destination=await popup;await destination.waitForLoadState();expect(destination.url()).toBe('https://example.com/');await destination.close();
 await page.mouse.move(870,550);await page.mouse.down();await page.keyboard.down('Alt');await page.mouse.move(970,600,{steps:10});await page.mouse.up();await page.keyboard.up('Alt');expect(await page.evaluate(()=>window.__board.state.widgets.get('subject').x)).toBe(100);expect(context.pages()).toHaveLength(1);
 const svg=await page.evaluate(async()=>{const {boardToSvg}=await import('/src/core/exportSvg.ts');return boardToSvg(window.__board.state);});expect(svg).toContain('<a href="https://example.com/" target="_blank">');
});
