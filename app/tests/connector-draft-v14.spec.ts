// @ts-nocheck
import {test,expect} from '@playwright/test';
async function fixture(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
 await page.evaluate(()=>{const b=window.__board;b.camera.x=0;b.camera.y=0;b.camera.scale=1;b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'line',type:'connector',shape:'straight',start:{kind:'point',x:-300,y:0},end:{kind:'point',x:300,y:0},style:{strokeColor:'#4273d9',strokeWidth:4,startCap:'none',endCap:'none'},z:0}});b.bus.exec({op:'SELECTION_SET',payload:['line']});});
}

test('cancelling a new caption leaves content, Undo and Redo intact',async({page})=>{
 await fixture(page);const before=await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:100,y:200}),id:'redo-object'}});b.bus.undo();b.bus.exec({op:'SELECTION_SET',payload:['line']});return {undo:b.bus.undoStack.length,redo:b.bus.redoStack.length};});
 await page.getByRole('button',{name:'Adicionar texto ao conector',exact:true}).click();const draft=page.getByRole('textbox',{name:'Texto do conector',exact:true});await expect(draft).toBeFocused();await draft.fill('Rascunho cancelado');await draft.press('Escape');await expect(draft).toHaveCount(0);
 expect(await page.evaluate(()=>{const b=window.__board;return {undo:b.bus.undoStack.length,redo:b.bus.redoStack.length,captions:b.state.connectors.get('line').captions??[]};})).toEqual({...before,captions:[]});
 await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(()=>window.__board.state.widgets.has('redo-object'))).toBe(true);
});

test('a double click commits one caption, and double clicking its text edits it without duplication',async({page})=>{
 await fixture(page);const before=await page.evaluate(()=>window.__board.bus.undoStack.length);await page.mouse.dblclick(800,500);const draft=page.getByRole('textbox',{name:'Texto do conector',exact:true});await expect(draft).toBeVisible();await draft.fill('Relação entre ideias');await draft.press('Enter');await expect(draft).toHaveCount(0);
 expect(await page.evaluate(()=>({captions:window.__board.state.connectors.get('line').captions,undo:window.__board.bus.undoStack.length}))).toEqual({captions:['Relação entre ideias'],undo:before+1});
 await page.mouse.dblclick(800,500);const existing=page.getByRole('textbox',{name:'Rótulo 1',exact:true});await expect(existing).toBeFocused();expect(await page.evaluate(()=>window.__board.state.connectors.get('line').captions)).toEqual(['Relação entre ideias']);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(before+1);
 await existing.fill('Relação editada');await existing.press('Tab');expect(await page.evaluate(()=>window.__board.state.connectors.get('line').captions)).toEqual(['Relação editada']);
});

test('blur commits typed text once, keeps the newly selected object, and survives reload',async({page})=>{
 await fixture(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:350,y:150,width:100,height:100}),id:'other'}});});
 await page.getByRole('button',{name:'Adicionar texto ao conector',exact:true}).click();const draft=page.getByRole('textbox',{name:'Texto do conector',exact:true});await draft.fill('Texto confirmado');await page.mouse.click(1200,700);await expect(draft).toHaveCount(0);
 const value=await page.evaluate(()=>{const b=window.__board;return {captions:b.state.connectors.get('line').captions,selected:[...b.state.selection]};});expect(value).toEqual({captions:['Texto confirmado'],selected:['other']});
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(()=>window.__board.state.connectors.get('line').captions)).toEqual(['Texto confirmado']);
});

test('committing a draft before dragging another object keeps their Undo steps separate',async({page})=>{
 await fixture(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:350,y:150,width:100,height:100}),id:'other'}});});
 await page.getByRole('button',{name:'Adicionar texto ao conector',exact:true}).click();const draft=page.getByRole('textbox',{name:'Texto do conector',exact:true});await draft.fill('Texto independente');
 await page.mouse.move(1200,700);await page.mouse.down();await page.mouse.move(1280,740,{steps:5});await page.mouse.up();await expect(draft).toHaveCount(0);
 expect(await page.evaluate(()=>window.__board.state.widgets.get('other').x)).toBe(430);
 await page.keyboard.press('Control+z');expect(await page.evaluate(()=>({x:window.__board.state.widgets.get('other').x,captions:window.__board.state.connectors.get('line').captions}))).toEqual({x:350,captions:['Texto independente']});
 await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.connectors.get('line').captions??[])).toEqual([]);
});
