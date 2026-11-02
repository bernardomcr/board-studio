// @ts-nocheck
import {test,expect} from '@playwright/test';
import {editMindTopic} from './helpers/mind-edit';

async function fixture(page,zoom=1){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();await page.waitForFunction(()=>location.hash.startsWith('#board/')&&!document.body.classList.contains('board-transitioning'));
  return page.evaluate(async zoom=>{const b=window.__board,m=await import('/src/core/mindmap.ts');b.camera.x=b.camera.y=0;b.camera.scale=zoom;b.bus.exec({op:'BACKGROUND_UPDATE',payload:{color:'#ffffff',grid:false}});const root=m.createMindMap(b.state,b.bus,{x:-240/zoom,y:0},'Centro',1/zoom),child=m.addMindChild(b.state,b.bus,root,'Ramo'),sibling=m.addMindChild(b.state,b.bus,root,'Outro');b.bus.exec({op:'SELECTION_SET',payload:[child]});return {root,child,sibling};},zoom);
}
async function snapshot(page){return page.evaluate(()=>{const b=window.__board;return {widgets:Object.fromEntries(b.state.widgets),connectors:[...b.state.connectors],history:b.bus.undoStack.length};});}
async function openBackground(page,id){await editMindTopic(page,id);const menu=page.locator('[data-menu=mind-background]');if(!await menu.evaluate(el=>el.open))await page.getByRole('button',{name:'Fundo do tópico',exact:true}).click();await expect(menu.locator('>.property-popover')).toBeVisible();return menu;}
async function paint(page,id){return page.evaluate(async id=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const b=window.__board,w=b.state.widgets.get(id),p=b.camera.worldToScreen({x:w.x+8/b.camera.scale,y:w.y+w.height/2}),Rectangle=b.app.screen.constructor;b.app.renderer.render({container:b.app.stage});const result=b.app.renderer.extract.pixels({target:b.app.stage,frame:new Rectangle(Math.floor(p.x),Math.floor(p.y),3,3),resolution:1,clearColor:'#ffffff',antialias:true});return Array.from(result.pixels.slice(16,20));},id);}
async function exportedBackground(page,id){return page.evaluate(async id=>{
  const b=window.__board,{boardToSvg}=await import('/src/core/exportSvg.ts'),node=b.state.widgets.get(id),svg=boardToSvg(b.state),root=new DOMParser().parseFromString(svg,'image/svg+xml');
  // Export the valid, complete hierarchy. The unique topic text identifies its
  // own widget group, rather than accepting another topic's painted rectangle.
  const labels=[...root.querySelectorAll('text')].filter(text=>text.textContent===node.content);
  if(labels.length!==1)throw new Error('Expected one exported label for the target topic');
  const box=labels[0].closest('[data-text-box-id]');if(box?.getAttribute('data-text-box-id')!==id)throw new Error('Exported label belongs to another topic');
  let group=box.parentElement;
  while(group&&group.tagName.toLowerCase()!=='svg'){
    const geometry=[...group.children].find(child=>['rect','ellipse','polygon','path'].includes(child.tagName.toLowerCase())&&child.hasAttribute('fill'));
    if(geometry)return {fill:geometry.getAttribute('fill'),opacity:geometry.getAttribute('fill-opacity')};
    group=group.parentElement;
  }
  throw new Error('Target topic has no exported background geometry');
},id);}

for(const zoom of [.02,1,20])test(`subtopic background paints real canvas pixels, exports and toggles transparency at ${zoom*100}%`,async({page})=>{
  const ids=await fixture(page,zoom),before=await snapshot(page);expect(before.widgets[ids.child].style).toMatchObject({fillColor:'transparent',fillOpacity:0});await openBackground(page,ids.child);
  const transparent=page.getByRole('button',{name:'Cor do fundo do tópico: transparente',exact:true});await expect(transparent).toHaveAttribute('aria-pressed','true');expect(await transparent.locator('svg').count()).toBe(0);expect(await transparent.evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  await page.getByRole('button',{name:'Cor do fundo do tópico: roxo',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).widgets[ids.child].style.fillColor).toBe('#a77bd4');const filled=await snapshot(page);expect(filled.widgets[ids.child].style.fillOpacity).toBe(1);expect(filled.history-before.history).toBe(1);expect(filled.widgets[ids.root]).toEqual(before.widgets[ids.root]);expect(filled.widgets[ids.sibling]).toEqual(before.widgets[ids.sibling]);expect(filled.connectors).toEqual(before.connectors);expect(filled.widgets[ids.child].style.color).toBe(before.widgets[ids.child].style.color);
  expect(await paint(page,ids.child)).toEqual([167,123,212,255]);expect(await exportedBackground(page,ids.child)).toEqual({fill:'#a77bd4',opacity:'1'});
  await page.getByRole('button',{name:'Cor do fundo do tópico: transparente',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).widgets[ids.child].style.fillOpacity).toBe(0);expect(await paint(page,ids.child)).toEqual([255,255,255,255]);expect(await exportedBackground(page,ids.child)).toEqual({fill:'transparent',opacity:'0'});
  await page.keyboard.press('Control+z');expect((await snapshot(page)).widgets[ids.child]).toEqual(filled.widgets[ids.child]);await page.keyboard.press('Control+Shift+z');expect((await snapshot(page)).widgets[ids.child].style).toMatchObject({fillColor:'transparent',fillOpacity:0});
});

test('root and subtopic backgrounds stay independent through custom opacity, branch color, reflow and reload',async({page})=>{
  const ids=await fixture(page),before=await snapshot(page);await openBackground(page,ids.root);await page.getByRole('button',{name:'Cor do fundo do tópico: rosa claro',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).widgets[ids.root].style.fillColor).toBe('#ffc7d9');expect((await snapshot(page)).widgets[ids.child].style).toEqual(before.widgets[ids.child].style);
  await openBackground(page,ids.child);const color=page.locator('input[type=color]').and(page.getByLabel('Cor do fundo do tópico',{exact:true}));await color.fill('#123456');await color.press('Tab');await expect.poll(async()=>(await snapshot(page)).widgets[ids.child].style.fillColor).toBe('#123456');const opacity=page.getByRole('slider',{name:'Opacidade do fundo do tópico',exact:true});await opacity.evaluate(input=>{input.value='.35';input.dispatchEvent(new Event('change',{bubbles:true}));});await expect.poll(async()=>(await snapshot(page)).widgets[ids.child].style.fillOpacity).toBe(.35);expect((await snapshot(page)).widgets[ids.root].style).toMatchObject({fillColor:'#ffc7d9',fillOpacity:1});
  await page.getByRole('button',{name:'Cor do ramo',exact:true}).click();await page.getByRole('button',{name:'Cor do ramo: vermelho',exact:true}).click();await page.getByRole('button',{name:'Mapa',exact:true}).click();await page.getByRole('button',{name:'Reorganizar mapa',exact:true}).click();const saved=await snapshot(page);expect(saved.widgets[ids.child].style).toMatchObject({fillColor:'#123456',fillOpacity:.35,color:before.widgets[ids.child].style.color});expect(saved.widgets[ids.root].style).toMatchObject({fillColor:'#ffc7d9',fillOpacity:1});
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);const loaded=await snapshot(page);expect(loaded.widgets).toEqual(saved.widgets);expect(loaded.connectors).toEqual(saved.connectors);
  await openBackground(page,ids.root);await page.getByRole('button',{name:'Cor do fundo do tópico: transparente',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).widgets[ids.root].style.fillOpacity).toBe(0);expect((await snapshot(page)).widgets[ids.child].style).toEqual(saved.widgets[ids.child].style);await page.keyboard.press('Control+z');expect((await snapshot(page)).widgets[ids.root]).toEqual(saved.widgets[ids.root]);
});
