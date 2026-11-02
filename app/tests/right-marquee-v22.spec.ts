// @ts-nocheck
import {test,expect} from '@playwright/test';

async function fixture(page,zoom=1){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  await page.evaluate(async zoom=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.x=b.camera.y=0;b.camera.scale=zoom;
    for(const [id,x,y]of [['one',-170,-90],['two',90,-90],['free',-30,-30]])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:x/zoom,y:y/zoom,width:80/zoom,height:70/zoom}),id}});
    const wire=(id,start,end)=>({id,type:'connector',shape:'straight',start:{kind:'point',x:start[0]/zoom,y:start[1]/zoom},end:{kind:'point',x:end[0]/zoom,y:end[1]/zoom},style:{strokeColor:'#b68aff',strokeWidth:3/zoom,startCap:'none',endCap:'none'},z:0});
    b.bus.exec({op:'CONNECTOR_CREATE',payload:wire('wire',[-160,55],[160,55])});
    // This line's bounding box crosses the marquee, but its visible path does not.
    b.bus.exec({op:'CONNECTOR_CREATE',payload:wire('far-wire',[-2000,-2000],[2000,1000])});
    b.bus.exec({op:'STROKE_CREATE',payload:{id:'ink',type:'stroke',tool:'brush',color:'#b68aff',points:[{x:-120/zoom,y:115/zoom,r:4/zoom},{x:120/zoom,y:115/zoom,r:4/zoom}],z:0}});
    b.bus.exec({op:'ENTITY_LOCK',payload:{ids:['one','two','wire','ink','far-wire'],locked:true}});
    b.bus.exec({op:'SELECTION_SET',payload:[]});
  },zoom);
}
async function point(page,x,y){return page.evaluate(({x,y})=>{const b=window.__board,r=b.app.canvas.getBoundingClientRect(),p=b.camera.worldToScreen({x:x/b.camera.scale,y:y/b.camera.scale});return {x:p.x+r.left,y:p.y+r.top};},{x,y});}
async function drag(page,button='right',a=[-300,-220],b=[230,160]){const start=await point(page,...a),end=await point(page,...b);await page.mouse.move(start.x,start.y);expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)===window.__board.app.canvas,start)).toBe(true);await page.mouse.down({button});await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up({button});}
async function selection(page){return page.evaluate(()=>[...window.__board.state.selection].sort());}
async function locks(page){return page.evaluate(()=>{const s=window.__board.state;return ['one','two','wire','ink','far-wire'].map(id=>(s.widgets.get(id)??s.connectors.get(id)??s.strokes.get(id)).locked);});}

for(const zoom of [.02,1,20])test(`right marquee includes locked widgets, strokes and exact connector paths, then unlocks once at ${zoom*100}%`,async({page})=>{
  await fixture(page,zoom);await drag(page,'left');expect(await selection(page)).toEqual(['free']);
  const history=await page.evaluate(()=>window.__board.bus.undoStack.length);
  await drag(page);expect(await selection(page)).toEqual(['free','ink','one','two','wire']);
  const unlock=page.locator('#editor-context [data-hold-unlock]');await expect(unlock).toBeVisible();await expect(unlock).toContainText('Desbloquear 4 objetos');await expect(page.locator('#editor-context button')).toHaveCount(1);await expect(page.locator('#selection-properties')).toBeHidden();
  // A click does not bypass the shared hold-to-unlock interaction.
  await unlock.click();expect(await locks(page)).toEqual([true,true,true,true,true]);
  await unlock.hover();await page.mouse.down();await page.waitForTimeout(760);await page.mouse.up();
  expect(await locks(page)).toEqual([false,false,false,false,true]);expect(await page.evaluate(before=>window.__board.bus.undoStack.length-before,history)).toBe(1);await expect(page.locator('#editor-context')).toBeHidden();
  await page.evaluate(()=>window.__board.bus.undo());expect(await locks(page)).toEqual([true,true,true,true,true]);
  await page.evaluate(()=>window.__board.bus.redo());expect(await locks(page)).toEqual([false,false,false,false,true]);
});

test('Shift right marquee extends selection and Escape or pointer cancellation preserves the previous selection',async({page})=>{
  await fixture(page);await page.evaluate(()=>window.__board.bus.exec({op:'SELECTION_SET',payload:['free']}));
  await page.keyboard.down('Shift');await drag(page,'right',[-300,-220],[-80,0]);await page.keyboard.up('Shift');expect(await selection(page)).toEqual(['free','one']);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__board.bus.exec({op:'SELECTION_SET',payload:['two']}));const before=await locks(page),history=await page.evaluate(()=>window.__board.bus.undoStack.length);
  const a=await point(page,-300,-220),b=await point(page,230,160);await page.mouse.move(a.x,a.y);expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)===window.__board.app.canvas,a)).toBe(true);await page.mouse.down({button:'right'});await page.mouse.move(b.x,b.y,{steps:8});
  await page.keyboard.press('Escape');await page.mouse.up({button:'right'});expect(await selection(page)).toEqual(['two']);expect(await locks(page)).toEqual(before);await expect(page.locator('#editor-context')).toBeHidden();expect(await page.evaluate(()=>window.__board.gesture().kind)).toBe('none');
  await page.mouse.move(a.x,a.y);await page.mouse.down({button:'right'});await page.mouse.move(b.x,b.y,{steps:8});
  await page.locator('#app canvas').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});await page.mouse.up({button:'right'});
  expect(await selection(page)).toEqual(['two']);expect(await locks(page)).toEqual(before);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(history);await expect(page.locator('#editor-context')).toBeHidden();expect(await page.evaluate(()=>window.__board.gesture().kind)).toBe('none');
});

test('right marquee respects inherited layer locks and does not expose editing operations',async({page})=>{
  await fixture(page);await page.evaluate(()=>{const b=window.__board;b.bus.exec({op:'LAYERS_LOCK',payload:{ids:[b.state.layers.activeId],locked:true}});});await drag(page);
  expect(await selection(page)).toEqual(['free','ink','one','two','wire']);await expect(page.getByRole('menuitem',{name:'Camada bloqueada',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'Camada bloqueada',exact:true})).toBeDisabled();await expect(page.locator('#editor-context [data-hold-unlock]')).toHaveCount(0);await expect(page.locator('#editor-context [data-action]')).toHaveCount(0);
  const before=await page.evaluate(()=>JSON.stringify([...window.__board.state.widgets]));await page.keyboard.press('Delete');await page.keyboard.press('ArrowRight');expect(await page.evaluate(()=>JSON.stringify([...window.__board.state.widgets]))).toBe(before);
});
