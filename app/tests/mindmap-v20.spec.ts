// @ts-nocheck
import {test,expect} from '@playwright/test';
import {editMindTopic} from './helpers/mind-edit';

async function blank(page,zoom=1){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  await page.evaluate(zoom=>{const b=window.__board;b.camera.x=b.camera.y=0;b.camera.scale=zoom;},zoom);
}
async function fixture(page,zoom=1){
  await blank(page,zoom);const ids=await page.evaluate(async zoom=>{
    const b=window.__board,m=await import('/src/core/mindmap.ts'),root=m.createMindMap(b.state,b.bus,{x:-300/zoom,y:0},'Projeto',1/zoom),a=m.addMindChild(b.state,b.bus,root,'Planejar','right'),a1=m.addMindChild(b.state,b.bus,a,'Detalhar'),a11=m.addMindChild(b.state,b.bus,a1,'Executar'),a2=m.addMindChild(b.state,b.bus,a,'Revisar'),sibling=m.addMindChild(b.state,b.bus,root,'Produzir','right'),source=m.addMindChild(b.state,b.bus,root,'Publicar','right');
    b.bus.exec({op:'SELECTION_SET',payload:[a]});return {root,a,a1,a11,a2,sibling,source};
  },zoom);await editMindTopic(page,ids.a);return ids;
}
async function select(page,id){await page.evaluate(id=>window.__board.bus.exec({op:'SELECTION_SET',payload:[id]}),id);}
async function openMap(page,label){await page.getByRole('button',{name:'Mapa',exact:true}).click();if(label)await page.getByRole('button',{name:label,exact:true}).click();}
async function dragPoints(page,source,target,zone='inside'){
  return page.evaluate(({source,target,zone})=>{const b=window.__board,s=b.state.widgets.get(source),t=b.state.widgets.get(target),r=b.app.canvas.getBoundingClientRect(),screen=p=>{const q=b.camera.worldToScreen(p);return {x:q.x+r.left,y:q.y+r.top};};return {from:screen({x:s.x+s.width/2,y:s.y+s.height/2}),to:screen({x:t.x+t.width*(zone==='left'?.25:zone==='right'?.75:.5),y:zone==='before'?t.y-7/b.camera.scale:zone==='after'?t.y+t.height+7/b.camera.scale:t.y+t.height/2})};},{source,target,zone});
}
async function dragStart(page,points){await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await page.mouse.move(points.to.x,points.to.y,{steps:18});}
async function children(page,id){return page.evaluate(async id=>(await import('/src/core/mindmap.ts')).mindChildren(window.__board.state,id).map(w=>w.id),id);}

for(const zoom of [.02,1,20])test(`mind-map creation uses a legible screen scale and stores world geometry at ${zoom*100}%`,async({page})=>{
  await blank(page,zoom);await page.getByRole('button',{name:'Mapa mental',exact:true}).click();await expect(page.locator('#inline-editor')).toBeVisible();
  const value=await page.evaluate(()=>{const b=window.__board,w=[...b.state.widgets.values()].find(w=>w.mind);return {font:w.style.fontSize*b.camera.scale,width:w.width*b.camera.scale,height:w.height*b.camera.scale,unit:w.mind.layoutScale,center:b.camera.worldToScreen({x:w.x+w.width/2,y:w.y+w.height/2}),camera:{x:b.camera.x,y:b.camera.y},viewport:{width:b.camera.width,height:b.camera.height}};});
  expect(value.font).toBeCloseTo(26,5);expect(value.width).toBeGreaterThanOrEqual(168);expect(value.width).toBeLessThan(500);expect(value.height).toBeGreaterThanOrEqual(64);expect(value.unit).toBeCloseTo(1/zoom,5);expect(value.center.x).toBeCloseTo(value.viewport.width/2,4);expect(value.center.y).toBeCloseTo(value.viewport.height/2,4);expect(value.camera).toEqual({x:0,y:0});
  await page.keyboard.press('Control+Enter');
});

test('topic appearance has shape previews and horizontal/vertical alignment without changing its fixed text box',async({page})=>{
  const ids=await fixture(page);const before=await page.evaluate(id=>{const w=window.__board.state.widgets.get(id);return {width:w.width,height:w.height,font:w.style.fontSize};},ids.a);
  await page.getByRole('button',{name:'Texto e aparência',exact:true}).click();
  await expect(page.locator('[data-mind-shape]')).toHaveCount(4);await expect(page.locator('[data-mind-shape] svg')).toHaveCount(4);await expect(page.getByLabel('Prévia do tópico',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Forma do tópico: elipse',exact:true}).click();await page.getByRole('button',{name:'Alinhar texto do tópico à esquerda',exact:true}).click();await page.getByRole('button',{name:'Alinhar texto do tópico na base',exact:true}).click();
  const value=await page.evaluate(id=>{const w=window.__board.state.widgets.get(id);return {shape:w.shape,width:w.width,height:w.height,font:w.style.fontSize,h:w.style.textAlign,v:w.style.textAlignVertical};},ids.a);
  expect(value).toEqual({shape:'circle',...before,h:'left',v:'bottom'});await page.keyboard.press('Escape');
  await openMap(page,'Organização do mapa');await expect(page.locator('[data-mind-layout]')).toHaveCount(5);await expect(page.locator('[data-mind-layout] svg')).toHaveCount(5);
  await page.getByRole('button',{name:'Ramos à esquerda',exact:true}).click();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.layout,ids.root)).toBe('left');
});

test('Alt levels act relative to the selected topic and subtopic selection excludes hidden or locked descendants',async({page})=>{
  const ids=await fixture(page);await page.keyboard.press('Alt+1');
  let visible=await page.evaluate(async ids=>{const b=window.__board,m=await import('/src/core/mindmap.ts');return Object.fromEntries([ids.a1,ids.a11,ids.a2,ids.sibling].map(id=>[id,!m.mindNodeHidden(b.state,id)]));},ids);
  expect(visible).toEqual({[ids.a1]:true,[ids.a11]:false,[ids.a2]:true,[ids.sibling]:true});
  await page.keyboard.press('Alt+0');expect(await page.evaluate(async id=>(await import('/src/core/mindmap.ts')).mindNodeHidden(window.__board.state,id),ids.a11)).toBe(false);
  await page.keyboard.press('Control+z');expect(await page.evaluate(async id=>(await import('/src/core/mindmap.ts')).mindNodeHidden(window.__board.state,id),ids.a11)).toBe(true);
  await page.keyboard.press('Alt+0');await page.evaluate(ids=>{const b=window.__board;b.bus.exec({op:'ENTITY_LOCK',payload:{ids:[ids.a11],locked:true}});b.bus.exec({op:'WIDGET_UPDATE',payload:{id:ids.a2,patch:{hidden:true}}});},ids);
  await page.getByRole('button',{name:'Ramos e níveis',exact:true}).click();await page.getByRole('button',{name:'Selecionar subtópicos',exact:true}).click();expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual([ids.a1]);
});

test('branch and whole-map fold actions collapse their root and expand descendants with one undo',async({page})=>{
  const ids=await fixture(page);await page.getByRole('button',{name:'Ramos e níveis',exact:true}).click();await page.getByRole('button',{name:'Recolher todo o ramo',exact:true}).click();
  expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.collapsed,ids.a)).toBe(true);await page.keyboard.press('Control+z');expect(await page.evaluate(id=>!!window.__board.state.widgets.get(id).mind.collapsed,ids.a)).toBe(false);
  await openMap(page);await page.getByRole('button',{name:'Recolher mapa inteiro',exact:true}).click();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.collapsed,ids.root)).toBe(true);
  await select(page,ids.root);await openMap(page);await page.getByRole('button',{name:'Expandir mapa inteiro',exact:true}).click();expect(await page.evaluate(ids=>[ids.root,ids.a,ids.a1].every(id=>!window.__board.state.widgets.get(id).mind.collapsed),ids)).toBe(true);
});

for(const zoom of [.02,1,20])test(`drop zones insert siblings using a fixed-pixel indicator and accept a near-edge miss at ${zoom*100}%`,async({page})=>{
  const ids=await fixture(page,zoom);const before=await children(page,ids.root),points=await dragPoints(page,ids.source,ids.sibling,'before');await dragStart(page,points);
  await expect(page.locator('#mindmap-drop-target')).toBeVisible();await expect(page.locator('#mindmap-drop-target')).toHaveAttribute('data-kind','before');await expect(page.locator('#mindmap-drop-target')).toHaveCSS('height','3px');await page.mouse.up();
  expect(await children(page,ids.root)).toEqual([ids.a,ids.source,ids.sibling]);expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.parentId,ids.source)).toBe(ids.root);
  await page.keyboard.press('Control+z');expect(await children(page,ids.root)).toEqual(before);
  const after=await dragPoints(page,ids.source,ids.a,'after');await dragStart(page,after);await expect(page.locator('#mindmap-drop-target')).toHaveAttribute('data-kind','after');await page.mouse.up();expect(await children(page,ids.root)).toEqual([ids.a,ids.source,ids.sibling]);
});

test('dropping inside a topic creates a child and the root left zone transfers the whole branch to the left',async({page})=>{
  const ids=await fixture(page);let points=await dragPoints(page,ids.source,ids.sibling);await dragStart(page,points);await expect(page.locator('#mindmap-drop-target')).toHaveAttribute('data-kind','child');await page.mouse.up();
  expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.parentId,ids.source)).toBe(ids.sibling);await page.keyboard.press('Control+z');
  points=await dragPoints(page,ids.a,ids.root,'left');await dragStart(page,points);await expect(page.locator('#mindmap-drop-target')).toHaveAttribute('data-kind','left');await page.mouse.up();
  expect(await page.evaluate(ids=>[ids.a,ids.a1,ids.a11,ids.a2].map(id=>window.__board.state.widgets.get(id).mind.side),ids)).toEqual(['left','left','left','left']);await page.keyboard.press('Control+z');expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.side,ids.a)).toBe('right');
});

for(const layout of ['left','right','org','list'])test(`root drop hints respect the ${layout} layout and never promise an unused side`,async({page})=>{
  const ids=await fixture(page);await page.evaluate(async({id,layout})=>{const b=window.__board;const m=await import('/src/core/mindmap.ts');m.setMindLayout(b.state,b.bus,id,layout);},{id:ids.root,layout});
  const points=await dragPoints(page,ids.a,ids.root,layout==='left'?'right':'left');await dragStart(page,points);
  const kind=layout==='org'||layout==='list'?'child':layout;await expect(page.locator('#mindmap-drop-target')).toHaveAttribute('data-kind',kind);await expect(page.locator('#mindmap-drop-target span')).toHaveText(kind==='child'?'Adicionar como subtópico':`Ramo à ${kind==='left'?'esquerda':'direita'}`);await page.mouse.up();
  const result=await page.evaluate(ids=>{const b=window.__board;return {layout:b.state.widgets.get(ids.root).mind.layout,parent:b.state.widgets.get(ids.a).mind.parentId,sides:[ids.a,ids.a1,ids.a11,ids.a2].map(id=>b.state.widgets.get(id).mind.side)};},ids);
  expect(result).toEqual({layout,parent:ids.root,sides:Array(4).fill(layout==='left'?'left':'right')});expect(await children(page,ids.root)).toEqual([ids.sibling,ids.source,ids.a]);
});

test('locked topics expose only hold-to-unlock; cancellation, commands and keyboard cannot edit them',async({page})=>{
  const ids=await fixture(page);await page.evaluate(id=>window.__board.bus.exec({op:'ENTITY_LOCK',payload:{ids:[id],locked:true}}),ids.a);await select(page,ids.a);
  const unlock=page.getByRole('button',{name:'Mantenha pressionado para desbloquear tópico',exact:true});await expect(unlock).toBeVisible();await expect(page.locator('#mindmap-properties button')).toHaveCount(1);await expect(page.locator('#mindmap-node-controls')).toBeHidden();
  const before=await page.evaluate(id=>JSON.stringify(window.__board.state.widgets.get(id)),ids.a);await page.keyboard.press('Tab');await page.keyboard.press('Alt+0');await page.keyboard.press('Space');await page.keyboard.press('Delete');expect(await page.evaluate(id=>JSON.stringify(window.__board.state.widgets.get(id)),ids.a)).toBe(before);
  await unlock.hover();await page.mouse.down();await page.waitForTimeout(150);await page.mouse.move(1450,900);await page.mouse.up();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).locked,ids.a)).toBe(true);
  await unlock.focus();await page.keyboard.down('Enter');await page.waitForTimeout(760);await page.keyboard.up('Enter');expect(await page.evaluate(id=>window.__board.state.widgets.get(id).locked,ids.a)).toBe(false);await expect(page.getByRole('button',{name:'Texto e aparência',exact:true})).toBeVisible();
});

test('drag ignores a locked target and the source own descendants instead of creating cycles',async({page})=>{
  const ids=await fixture(page);await page.evaluate(id=>window.__board.bus.exec({op:'ENTITY_LOCK',payload:{ids:[id],locked:true}}),ids.sibling);
  let points=await dragPoints(page,ids.source,ids.sibling);await dragStart(page,points);await expect(page.locator('#mindmap-drop-target')).toBeHidden();await page.mouse.up();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.parentId,ids.source)).toBe(ids.root);
  points=await dragPoints(page,ids.a,ids.a1);await dragStart(page,points);await expect(page.locator('#mindmap-drop-target')).toBeHidden();await page.mouse.up();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).mind.parentId,ids.a)).toBe(ids.root);
});
