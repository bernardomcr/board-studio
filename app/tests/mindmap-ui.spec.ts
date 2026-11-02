// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function fixture(page){return page.evaluate(async()=>{
  const b=window.__board,m=await import('/src/core/mindmap.ts'),root=m.createMindMap(b.state,b.bus,{x:0,y:0},'Projeto'),a=m.addMindChild(b.state,b.bus,root,'Planejar','right'),c=m.addMindChild(b.state,b.bus,a,'Detalhar'),d=m.addMindChild(b.state,b.bus,root,'Executar','right');
  b.bus.exec({op:'SELECTION_SET',payload:[a]});return {root,a,c,d};
});}
async function select(page,id){await page.evaluate(id=>window.__board.bus.exec({op:'SELECTION_SET',payload:[id]}),id);}

test('the mind-map toolbar creates an editable root and Tab/Enter build its hierarchy',async({page})=>{
  await blank(page);await page.getByRole('button',{name:'Mapa mental',exact:true}).click();await expect(page.locator('#inline-editor')).toBeVisible();
  await page.keyboard.insertText('Minha ideia');await page.keyboard.press('Tab');await expect(page.locator('#inline-editor')).toBeVisible();await page.keyboard.insertText('Primeiro ramo');await page.keyboard.press('Enter');await expect(page.locator('#inline-editor')).toBeHidden();await page.keyboard.press('Enter');await page.keyboard.insertText('Segundo ramo');await page.keyboard.press('Control+Enter');
  const nodes=await page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.mind).map(w=>({id:w.id,parent:w.mind.parentId,text:w.content})));
  expect(nodes).toHaveLength(3);const root=nodes.find(w=>!w.parent);expect(root.text).toBe('Minha ideia');expect(nodes.filter(w=>w.parent===root.id).map(w=>w.text)).toEqual(['Primeiro ramo','Segundo ramo']);
  await expect(page.locator('#mindmap-properties')).toBeVisible();await expect(page.locator('#selection-properties')).toBeHidden();
  await page.getByRole('button',{name:'Adicionar subtópico no board',exact:true}).click();await page.keyboard.insertText('Detalhe');await page.keyboard.press('Control+Enter');
  const child=await page.evaluate(()=>{const b=window.__board,w=b.state.widgets.get([...b.state.selection][0]);return {id:w.id,parent:w.mind.parentId,side:w.mind.side};});
  expect(child.parent).toBe(nodes.find(w=>w.text==='Segundo ramo').id);
  await page.keyboard.press(child.side==='left'?'ArrowRight':'ArrowLeft');expect(await page.evaluate(()=>[...window.__board.state.selection][0])).toBe(child.parent);
});

test('mind-map menus recolor a branch, change layout, collapse descendants and delete with one undo',async({page})=>{
  await blank(page);const ids=await fixture(page);await expect(page.locator('#mindmap-properties')).toBeVisible();
  await page.getByRole('button',{name:'Recolher ramo',exact:true}).click();
  expect(await page.evaluate(async id=>(await import('/src/core/mindmap.ts')).mindNodeHidden(window.__board.state,id),ids.c)).toBe(true);
  await page.getByRole('button',{name:'Expandir ramo',exact:true}).click();
  expect(await page.evaluate(async id=>(await import('/src/core/mindmap.ts')).mindNodeHidden(window.__board.state,id),ids.c)).toBe(false);
  await page.getByRole('button',{name:'Cor do ramo',exact:true}).click();await page.getByRole('button',{name:'Cor do ramo: vermelho',exact:true}).click();
  expect(await page.evaluate(ids=>({a:window.__board.state.widgets.get(ids.a).mind.color,c:window.__board.state.widgets.get(ids.c).mind.color}),ids)).toEqual({a:'#e25767',c:'#e25767'});
  await page.getByRole('button',{name:'Mapa',exact:true}).click();await page.getByRole('button',{name:'Organização do mapa',exact:true}).click();await page.getByRole('button',{name:'Ramos à esquerda',exact:true}).click();
  expect(await page.evaluate(ids=>{const b=window.__board,r=b.state.widgets.get(ids.root);return [ids.a,ids.d].every(id=>{const w=b.state.widgets.get(id);return w.x+w.width<r.x;});},ids)).toBe(true);
  await page.keyboard.press('Escape');await select(page,ids.a);await page.getByRole('button',{name:'Excluir ramo',exact:true}).click();
  expect(await page.evaluate(ids=>[window.__board.state.widgets.has(ids.a),window.__board.state.widgets.has(ids.c),window.__board.state.widgets.has(ids.d)],ids)).toEqual([false,false,true]);
  await page.keyboard.press('Control+z');expect(await page.evaluate(ids=>[window.__board.state.widgets.has(ids.a),window.__board.state.widgets.has(ids.c)],ids)).toEqual([true,true]);
});

test('dragging a branch onto another topic reparents its complete subtree and undo restores the hierarchy',async({page})=>{
  await blank(page);const ids=await fixture(page);
  const points=await page.evaluate(ids=>{const b=window.__board,center=id=>{const w=b.state.widgets.get(id);return b.camera.worldToScreen({x:w.x+w.width/2,y:w.y+w.height/2});};return {from:center(ids.a),to:center(ids.d)};},ids);
  await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await page.mouse.move(points.to.x,points.to.y,{steps:16});await expect(page.locator('#mindmap-drop-target')).toBeVisible();await page.mouse.up();
  expect(await page.evaluate(ids=>({a:window.__board.state.widgets.get(ids.a).mind.parentId,c:window.__board.state.widgets.get(ids.c).mind.parentId}),ids)).toEqual({a:ids.d,c:ids.a});
  await page.keyboard.press('Control+z');expect(await page.evaluate(ids=>window.__board.state.widgets.get(ids.a).mind.parentId,ids)).toBe(ids.root);
});

test('an imported topic image is a real collapsible branch with one-step insertion undo and persistent hierarchy',async({page})=>{
  await blank(page);const ids=await fixture(page);
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='#93d275';ctx.fillRect(0,0,320,180);ctx.fillStyle='#4262ff';ctx.fillRect(0,0,160,180);return canvas.toDataURL();});
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Imagem no tópico',exact:true}).click();await(await chooser).setFiles({name:'ramo.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
  await expect.poll(()=>page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.type==='image'&&w.mind).length)).toBe(1);
  const image=await page.evaluate(()=>[...window.__board.state.widgets.values()].find(w=>w.type==='image'));
  expect(image.mind).toMatchObject({rootId:ids.root,parentId:ids.a});expect(image.width).toBe(320);expect(image.height).toBe(180);expect(image.src).toBe(png);
  expect(await page.evaluate(id=>[...window.__board.state.connectors.values()].some(c=>c.mindBranch===id),image.id)).toBe(true);
  await page.keyboard.press('Control+z');expect(await page.evaluate(id=>window.__board.state.widgets.has(id),image.id)).toBe(false);expect(await page.evaluate(id=>[...window.__board.state.connectors.values()].some(c=>c.mindBranch===id),image.id)).toBe(false);
  await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.parentId,image.id)).toBe(ids.a);
  await select(page,ids.a);await page.getByRole('button',{name:'Recolher ramo',exact:true}).click();
  const hidden=await page.evaluate(async id=>{const b=window.__board,{mindNodeHidden}=await import('/src/core/mindmap.ts'),{boardToSvg}=await import('/src/core/exportSvg.ts');return {hidden:mindNodeHidden(b.state,id),svg:boardToSvg(b.state)};},image.id);expect(hidden.hidden).toBe(true);expect(hidden.svg).not.toContain(png);
  await page.getByRole('button',{name:'Expandir ramo',exact:true}).click();await select(page,image.id);
  const points=await page.evaluate(({image,ids})=>{const b=window.__board,center=id=>{const w=b.state.widgets.get(id);return b.camera.worldToScreen({x:w.x+w.width/2,y:w.y+w.height/2});};return {from:center(image.id),to:center(ids.d)};},{image,ids});
  await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await page.mouse.move(points.to.x,points.to.y,{steps:16});await page.mouse.up();
  expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.parentId,image.id)).toBe(ids.d);
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Salvar arquivo',exact:true}).click();const data=JSON.parse((await readFile(await(await saved).path())).toString());expect(data.widgets.find(w=>w.id===image.id)).toMatchObject({type:'image',src:png,width:320,height:180,mind:{rootId:ids.root,parentId:ids.d}});
  const svg=await page.evaluate(async()=>{const b=window.__board,{boardToSvg}=await import('/src/core/exportSvg.ts');return boardToSvg(b.state);});expect(svg).toContain(png);
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  expect(await page.evaluate(id=>{const w=window.__board.state.widgets.get(id);return {parent:w.mind.parentId,width:w.width,height:w.height,src:w.src};},image.id)).toEqual({parent:ids.d,width:320,height:180,src:png});
});
