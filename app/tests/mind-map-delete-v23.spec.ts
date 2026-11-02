// @ts-nocheck
import {test,expect} from '@playwright/test';
import {editMindTopic} from './helpers/mind-edit';

async function state(page){return page.evaluate(()=>{const b=window.__board,s=b.state;return {widgets:[...s.widgets.values()].sort((a,b)=>a.id.localeCompare(b.id)),order:s.order,connectors:[...s.connectors.values()].sort((a,b)=>a.id.localeCompare(b.id)),connectorOrder:s.connectorOrder,groups:[...s.groups],selection:[...s.selection]};});}

test('Delete whole map in the floating toolbar removes locked descendants and one Undo restores their original locks',async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
  const ids=await page.evaluate(async()=>{const b=window.__board,m=await import('/src/core/mindmap.ts'),{createWidget}=await import('/src/core/model.ts'),root=m.createMindMap(b.state,b.bus,{x:0,y:0},'Centro'),child=m.addMindChild(b.state,b.bus,root,'Bloqueado'),leaf=m.addMindChild(b.state,b.bus,child,'Detalhe'),outside=createWidget('shape',{x:-400,y:180,width:100,height:80}),branch=[...b.state.connectors.values()].find(c=>c.mindBranch===child).id;b.bus.exec({op:'WIDGET_CREATE',payload:outside});b.bus.exec({op:'ENTITY_LOCK',payload:{ids:[child,branch],locked:true}});b.bus.exec({op:'SELECTION_SET',payload:[root]});return {root,child,leaf,outside:outside.id};});
  await editMindTopic(page,ids.root);const before=await state(page),history=await page.evaluate(()=>window.__board.bus.undoStack.length);await page.getByRole('button',{name:'Excluir mapa inteiro',exact:true}).click();
  expect((await state(page)).widgets.map(w=>w.id)).toEqual([ids.outside]);expect((await state(page)).connectors).toHaveLength(0);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)-history).toBe(1);
  await page.keyboard.press('Control+z');expect(await state(page)).toEqual(before);expect(await page.evaluate(id=>window.__board.state.widgets.get(id).locked,ids.child)).toBe(true);
  await page.keyboard.press('Control+Shift+z');expect((await state(page)).widgets.map(w=>w.id)).toEqual([ids.outside]);
});
