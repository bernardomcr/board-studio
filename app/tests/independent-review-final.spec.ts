// Regressions from the first cold review: actual edit state and rendered hit geometry.
// @ts-nocheck
import {test,expect} from '@playwright/test';
import {editMindTopic} from './helpers/mind-edit';
import {boardAction} from './helpers/board-actions';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function fixture(page){const ids=await page.evaluate(async()=>{const b=window.__board,m=await import('/src/core/mindmap.ts'),root=m.createMindMap(b.state,b.bus,{x:0,y:0},'Projeto'),first=m.addMindChild(b.state,b.bus,root,'Primeiro'),second=m.addMindChild(b.state,b.bus,root,'Segundo');b.bus.exec({op:'SELECTION_SET',payload:[second]});return {root,first,second};});await editMindTopic(page,ids.second);return ids;}
async function edit(page,id){const p=await page.evaluate(id=>{const b=window.__board,w=b.state.widgets.get(id);return b.camera.worldToScreen({x:w.x+w.width/2,y:w.y+w.height/2});},id);await page.mouse.dblclick(p.x,p.y);await expect(page.locator('#inline-editor')).toBeVisible();}

test('mind editing Escape cancels, Enter commits without a new node, Shift+Enter keeps multiline editing',async({page})=>{
  await blank(page);const ids=await fixture(page);await edit(page,ids.second);await page.keyboard.insertText('Descartar');await page.keyboard.press('Escape');
  expect(await page.evaluate(id=>window.__board.state.widgets.get(id).content,ids.second)).toBe('Segundo');await expect(page.locator('#inline-editor')).toBeHidden();
  await edit(page,ids.second);await page.keyboard.insertText('Linha um');await page.keyboard.press('Shift+Enter');await page.keyboard.insertText('Linha dois');await expect(page.locator('#inline-editor')).toBeVisible();await page.keyboard.press('Enter');
  await expect(page.locator('#inline-editor')).toBeHidden();const result=await page.evaluate(id=>({count:window.__board.state.widgets.size,text:window.__board.state.widgets.get(id).content}),ids.second);expect(result.count).toBe(3);expect(result.text).toContain('Linha um\nLinha dois');
  await page.keyboard.press('Control+z');expect(await page.evaluate(id=>window.__board.state.widgets.get(id).content,ids.second)).toBe('Segundo');
});

test('selected mind Shift+Enter creates a sibling above with atomic undo',async({page})=>{
  await blank(page);const ids=await fixture(page);await page.keyboard.press('Shift+Enter');await expect(page.locator('#inline-editor')).toBeVisible();await page.keyboard.insertText('Inserido acima');await page.keyboard.press('Enter');
  const read=()=>page.evaluate(async root=>{const b=window.__board,m=await import('/src/core/mindmap.ts');return m.mindChildren(b.state,root).map(w=>w.content);},ids.root);
  expect(await read()).toEqual(['Primeiro','Inserido acima','Segundo']);await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');expect(await read()).toEqual(['Primeiro','Segundo']);
});

test('automatic mind reflow and sibling creation preserve locked topic geometry',async({page})=>{
  await blank(page);const result=await page.evaluate(async()=>{const b=window.__board,m=await import('/src/core/mindmap.ts'),root=m.createMindMap(b.state,b.bus,{x:0,y:0}),child=m.addMindChild(b.state,b.bus,root);b.bus.exec({op:'WIDGET_UPDATE',payload:{id:child,patch:{locked:true}}});const before=structuredClone(b.state.widgets.get(child));for(let i=0;i<5;i++)m.addMindChild(b.state,b.bus,root);m.setMindLayout(b.state,b.bus,root,'org');m.setMindLayout(b.state,b.bus,root,'balanced');return {before,after:b.state.widgets.get(child)};});expect(result.after).toEqual(result.before);
});

test('a visible modal owns native copy and internal paste without changing the board',async({page})=>{
  await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:0,y:0}),id:'keep'}});b.bus.exec({op:'SELECTION_SET',payload:['keep']});window.__copiedData=new DataTransfer();document.dispatchEvent(new ClipboardEvent('copy',{clipboardData:window.__copiedData,bubbles:true,cancelable:true}));});
  await boardAction(page,'Atalhos');const result=await page.evaluate(()=>{const b=window.__board,before=b.bus.undoStack.length,paste=new ClipboardEvent('paste',{clipboardData:window.__copiedData,bubbles:true,cancelable:true});document.dispatchEvent(paste);const data=new DataTransfer(),copy=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(copy);return {count:b.state.widgets.size,history:b.bus.undoStack.length-before,pasteConsumed:paste.defaultPrevented,copyConsumed:copy.defaultPrevented,token:data.getData('application/x-board-studio')};});
  expect(result).toEqual({count:1,history:0,pasteConsumed:false,copyConsumed:false,token:''});await page.keyboard.press('Escape');await page.evaluate(()=>document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:window.__copiedData,bubbles:true,cancelable:true})));expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(2);await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
});

for(const scale of [1,.02])test(`custom rounded image corners pass selection through transparent pixels at ${scale*100}%`,async({page})=>{
  await blank(page);const points=await page.evaluate(async scale=>{const b=window.__board,{createWidget,SHAPE_STYLE}=await import('/src/core/model.ts');b.camera.scale=scale;const side=100/scale,x=-side/2,y=-side/2;b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x,y,width:side,height:side}),id:'behind'}});const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d').fillRect(0,0,2,2);b.bus.exec({op:'WIDGET_CREATE',payload:{id:'photo',type:'image',src:c.toDataURL(),naturalWidth:2,naturalHeight:2,x,y,width:side,height:side,rotation:0,z:1,content:'',maskShape:'round_rectangle',style:{...SHAPE_STYLE,fillColor:'transparent',borderWidth:0,cornerRadius:side/2}}});return {corner:b.camera.worldToScreen({x:x+10/scale,y:y+10/scale}),center:b.camera.worldToScreen({x:0,y:0})};},scale);
  await page.mouse.click(points.corner.x,points.corner.y,{button:'right'});expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['behind']);await page.keyboard.press('Escape');await page.mouse.click(points.center.x,points.center.y,{button:'right'});expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['photo']);
});
