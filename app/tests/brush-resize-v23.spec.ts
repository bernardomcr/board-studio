// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page,zoom=1,width=20/zoom){
  await page.addInitScript(({width})=>localStorage.setItem('board-app:drawing-settings',JSON.stringify({brush:{width,color:'#299d70',opacity:1,precision:false}})),{width});
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();await page.waitForFunction(()=>location.hash.startsWith('#board/')&&!document.body.classList.contains('board-transitioning'));
  await page.evaluate(zoom=>{const c=window.__board.camera;c.x=c.y=0;c.scale=zoom;},zoom);
}
async function draw(page,thin=false){
  await page.getByRole('button',{name:'Pincel',exact:true}).click();await page.mouse.move(640,620);await page.mouse.down();await page.mouse.move(740,thin?620:660,{steps:12});await page.mouse.move(840,620,{steps:12});await page.mouse.up();
  const id=await page.evaluate(()=>[...window.__board.state.strokes.keys()][0]);expect(id).toBeTruthy();await page.keyboard.press('v');await page.mouse.click(740,thin?620:660);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual([id]);return id;
}
async function snapshot(page,id){return page.evaluate(async id=>{const b=window.__board,{strokeBounds}=await import('/src/core/strokes.ts');return {stroke:b.state.strokes.get(id),bounds:strokeBounds(b.state.strokes.get(id)),history:b.bus.undoStack.length};},id);}
async function corner(page,id){return page.evaluate(async id=>{const b=window.__board,{strokeBounds}=await import('/src/core/strokes.ts'),r=b.app.canvas.getBoundingClientRect(),box=strokeBounds(b.state.strokes.get(id)),a=b.camera.worldToScreen({x:box.minX,y:box.minY}),z=b.camera.worldToScreen({x:box.maxX,y:box.maxY});return {x:z.x+r.left,y:z.y+r.top,anchorX:a.x+r.left,anchorY:a.y+r.top};},id);}
async function resize(page,id,factor,inspect=false){
  const p=await corner(page,id);await page.mouse.move(p.x,p.y);await expect(page.locator('#app canvas')).toHaveCSS('cursor','nwse-resize');await page.keyboard.down('Shift');await page.mouse.down();
  if(inspect)expect(await page.evaluate(()=>({kind:window.__board.gesture().kind,handle:window.__board.gesture().handle}))).toEqual({kind:'multi-resize',handle:'se'});
  await page.mouse.move(p.anchorX+(p.x-p.anchorX)*factor,p.anchorY+(p.y-p.anchorY)*factor,{steps:10});await page.mouse.up();await page.keyboard.up('Shift');
}
function transformed(actual,before,factor){
  const origin=before.bounds,point=p=>({x:origin.minX+(p.x-origin.minX)*factor,y:origin.minY+(p.y-origin.minY)*factor});
  expect(actual.stroke.points).toHaveLength(before.stroke.points.length);
  before.stroke.points.forEach((p,i)=>{const q=point(p),got=actual.stroke.points[i];expect(got.x).toBeCloseTo(q.x,5);expect(got.y).toBeCloseTo(q.y,5);expect(got.r).toBeCloseTo(p.r*factor,5);});
  expect(actual.stroke).toMatchObject({id:before.stroke.id,color:before.stroke.color,opacity:before.stroke.opacity,precision:before.stroke.precision,layerId:before.stroke.layerId});
  if(before.stroke.precisionSmoothing!==undefined)expect(actual.stroke.precisionSmoothing).toBeCloseTo(before.stroke.precisionSmoothing*factor,5);
  if(before.stroke.erasures){expect(actual.stroke.erasures).toHaveLength(before.stroke.erasures.length);before.stroke.erasures.forEach((cut,i)=>{expect(actual.stroke.erasures[i].radius).toBeCloseTo(cut.radius*factor,5);cut.points.forEach((p,j)=>{const q=point(p);expect(actual.stroke.erasures[i].points[j].x).toBeCloseTo(q.x,5);expect(actual.stroke.erasures[i].points[j].y).toBeCloseTo(q.y,5);});});}
}

for(const zoom of [.02,1,20])test(`a real single brush stroke resizes with its radii and precision cuts, one Undo and reload at ${zoom*100}%`,async({page})=>{
  await blank(page,zoom);const id=await draw(page);await page.evaluate(({id,zoom})=>{const b=window.__board,s=b.state.strokes.get(id),p=s.points[0];b.bus.exec({op:'STROKE_UPDATE',payload:{id,patch:{precision:true,precisionSmoothing:4/zoom,erasures:[{radius:3/zoom,points:[{x:p.x+5/zoom,y:p.y},{x:p.x+10/zoom,y:p.y+3/zoom}]}]}}});},{id,zoom});
  const before=await snapshot(page,id);await resize(page,id,2);const after=await snapshot(page,id);expect(after.history-before.history).toBe(1);transformed(after,before,2);
  await page.keyboard.press('Control+z');expect((await snapshot(page,id)).stroke).toEqual(before.stroke);await page.keyboard.press('Control+Shift+z');expect((await snapshot(page,id)).stroke).toEqual(after.stroke);
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect((await snapshot(page,id)).stroke).toEqual(after.stroke);
});

test('a two-pixel horizontal brush stroke exposes resize handles and the lower corner stays distinct from the upper corner',async({page})=>{
  await blank(page,1,2);const id=await draw(page,true),before=await snapshot(page,id);expect(before.bounds.maxY-before.bounds.minY).toBeCloseTo(2,5);await resize(page,id,1.5,true);const after=await snapshot(page,id);transformed(after,before,1.5);expect(after.bounds.maxY-after.bounds.minY).toBeCloseTo(3,5);expect(after.history-before.history).toBe(1);
});

test('a locked brush stroke remains unchanged even when its former resize corner is dragged',async({page})=>{
  await blank(page);const id=await draw(page),p=await corner(page,id);await page.evaluate(id=>window.__board.bus.exec({op:'ENTITY_LOCK',payload:{ids:[id],locked:true}}),id);const before=await snapshot(page,id);
  await page.mouse.move(p.x,p.y);expect(await page.locator('#app canvas').evaluate(c=>c.style.cursor)).not.toMatch(/resize/);await page.mouse.down();await page.mouse.move(p.x+100,p.y+80,{steps:10});await page.mouse.up();expect((await snapshot(page,id)).stroke).toEqual(before.stroke);expect((await snapshot(page,id)).history).toBe(before.history);
});
