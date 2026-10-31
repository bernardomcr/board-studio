// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function shape(page,id){
  await page.locator('[data-tool="shape"]').click();
  const choice=page.locator(`#shape-picker [data-shape="${id}"]`);
  if(!await choice.count())await page.getByRole('button',{name:'Mais formas',exact:true}).click();
  await choice.click();
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function preview(page){return page.evaluate(()=>{
  const b=window.__board,visit=(n,label)=>n.label===label?n:n.children?.map(c=>visit(c,label)).find(Boolean),layer=visit(b.app.stage,'creation-preview'),node=visit(layer,'creation-preview-widget');
  if(!layer.visible||!node)return null;
  const width=node.pivot.x*2,height=node.pivot.y*2,x=node.x-node.pivot.x,y=node.y-node.pivot.y,Rectangle=b.app.screen.constructor;
  const canvas=b.app.renderer.extract.canvas({target:layer,frame:new Rectangle(x-8,y-8,width+16,height+16),resolution:1}),ctx=canvas.getContext('2d');
  const alpha=(px,py)=>ctx.getImageData(Math.floor(px+8),Math.floor(py+8),1,1).data[3];
  return {x,y,width,height,corner:alpha(5,5),center:alpha(width/2,height/2),hasText:node.children[1].children.some(n=>typeof n.text==='string'&&n.text.length>0),backgroundCommands:node.children[0].context.instructions.length,count:b.state.widgets.size};
});}

test('circle, triangle and star preview their real silhouette only after pointer down without creating board content',async({page})=>{
  await blank(page);
  for(const id of ['circle','triangle','star']){
    await shape(page,id);await page.mouse.move(950,550);await settle(page);
    expect(await preview(page)).toBeNull();await page.mouse.down();await settle(page);
    const ghost=await preview(page);expect(ghost).not.toBeNull();expect(ghost.count).toBe(0);expect(ghost.corner).toBe(0);expect(ghost.center).toBeGreaterThan(100);
    await page.keyboard.press('Escape');await page.mouse.up();
    await page.mouse.move(20,30);await settle(page);expect(await preview(page)).toBeNull();
  }
  await shape(page,'circle');await page.mouse.move(950,550);await page.mouse.down();await settle(page);await page.screenshot({path:'../work/v12-shape-preview.png'});
  await page.keyboard.press('Escape');expect(await preview(page)).toBeNull();
  await page.mouse.up();
});

test('drag preview and committed geometry agree with Shift, reverse drag, pan and zoom',async({page})=>{
  await blank(page);await page.evaluate(()=>{const c=window.__board.camera;c.x=1850;c.y=-630;c.scale=1.75;});
  await shape(page,'triangle');await page.mouse.move(1050,650);await page.mouse.down();await page.keyboard.down('Shift');await page.mouse.move(760,480,{steps:12});await settle(page);
  const live=await preview(page);expect(live.count).toBe(0);expect(live.width).toBeCloseTo(live.height,7);expect(live.corner).toBe(0);expect(live.center).toBeGreaterThan(100);
  await page.mouse.up();await page.keyboard.up('Shift');await settle(page);
  const final=await page.evaluate(()=>{const w=[...window.__board.state.widgets.values()][0];return {shape:w.shape,x:w.x,y:w.y,width:w.width,height:w.height};});
  expect(final.shape).toBe('triangle');for(const key of ['x','y','width','height'])expect(final[key]).toBeCloseTo(live[key],7);
  expect(await preview(page)).toBeNull();
});

test('notes, frames and text show their actual renderer during the press and placement matches that preview',async({page})=>{
  await blank(page);
  for(const [key,type]of [['s','sticky_note'],['f','frame'],['t','text']]){
    await page.keyboard.press(key);await page.mouse.move(1000,600);await settle(page);expect(await preview(page)).toBeNull();await page.mouse.down();await settle(page);const ghost=await preview(page);
    expect(ghost).not.toBeNull();if(type==='text'){expect(ghost.hasText).toBe(true);expect(ghost.backgroundCommands).toBe(0);}if(type==='frame')expect(ghost.hasText).toBe(true);if(type==='sticky_note')expect(ghost.center).toBeGreaterThan(100);
    await page.mouse.up();await settle(page);
    const actual=await page.evaluate(()=>{const w=window.__board.state.widgets.get([...window.__board.state.selection][0]);return {type:w.type,x:w.x,y:w.y,width:w.width,height:w.height};});
    expect(actual.type).toBe(type);for(const property of ['x','y','width','height'])expect(actual[property]).toBeCloseTo(ghost[property],7);
    expect(await preview(page)).toBeNull();await page.keyboard.press('Escape');
  }
});
