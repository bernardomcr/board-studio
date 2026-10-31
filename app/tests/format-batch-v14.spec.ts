// @ts-nocheck
import {test,expect} from '@playwright/test';

test('formatting many selected objects updates once, preserves font focus and undoes atomically',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
 const before=await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),commands=[],ids=[];
  for(let i=0;i<40;i++){const id='batch-font-'+i;ids.push(id);commands.push({op:'WIDGET_CREATE',payload:{...createWidget(i%2?'text':'shape',{x:(i%8)*90-400,y:Math.floor(i/8)*80-200,width:80,height:60,content:'Fonte '+i}),id}});}
  commands.push({op:'SELECTION_SET',payload:ids});b.bus.exec({op:'BATCH',payload:{commands}});
  const original=[...b.state.widgets.values()].map(w=>w.style.fontFamily),exec=b.bus.exec.bind(b.bus);window.__formatCommands=[];b.bus.exec=command=>{window.__formatCommands.push(command.op);return exec(command);};
  return {original,undo:b.bus.undoStack.length};
 });
 const trigger=page.getByRole('button',{name:'Fonte do texto',exact:true});await trigger.click();const search=page.getByRole('combobox',{name:'Buscar fontes',exact:true});await search.fill('Caveat');await search.press('Enter');
 await expect.poll(()=>page.evaluate(()=>[...window.__board.state.widgets.values()].every(w=>w.style.fontFamily==='Caveat'))).toBe(true);await expect(trigger).toBeFocused();
 expect(await page.evaluate(()=>window.__formatCommands)).toEqual(['BATCH']);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(before.undo+1);
 await page.keyboard.press('Control+z');expect(await page.evaluate(()=>[...window.__board.state.widgets.values()].map(w=>w.style.fontFamily))).toEqual(before.original);
 await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(()=>[...window.__board.state.widgets.values()].every(w=>w.style.fontFamily==='Caveat'))).toBe(true);
});
