// Cold-review regressions: frame masks must govern canvas and HTML input alike.
// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
const selection=page=>page.evaluate(()=>[...window.__board.state.selection]);

for(const rotation of [0,Math.PI/4])test(`2% picking follows the rendered ${rotation?'rotated':'straight'} frame mask`,async({page})=>{
 await blank(page);
 const points=await page.evaluate(async rotation=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.scale=.02;
  const add=(id,type,geometry,fill)=>{const widget=createWidget(type,geometry);b.bus.exec({op:'WIDGET_CREATE',payload:{...widget,id,rotation:geometry.rotation??0,style:{...widget.style,fillColor:fill,fillOpacity:1,borderWidth:0},...(type==='frame'?{title:''}:{})}});};
  // Its center lies outside the frame, so the lower object remains unmasked.
  add('behind','shape',{x:-30000,y:-20000,width:36000,height:40000},'#2457ab');
  add('frame','frame',{x:-5000,y:-4000,width:10000,height:8000,rotation},'#ffffff');
  add('clipped','shape',{x:-7500,y:-3000,width:15000,height:6000,rotation:Math.PI/10},'#e93747');
  const local={x:-6000*Math.cos(Math.PI/10),y:-6000*Math.sin(Math.PI/10)};
  return {outside:b.camera.worldToScreen(local),inside:b.camera.worldToScreen({x:0,y:0})};
 },rotation);
 await settle(page);
 // Also inspect the renderer so a future ownership change cannot make the picker
 // and the displayed fragment disagree while the input assertion still passes.
 const pixels=await page.evaluate(points=>{const b=window.__board,Rectangle=b.app.screen.constructor;b.app.renderer.render({container:b.app.stage});return Object.fromEntries(Object.entries(points).map(([key,p])=>[key,[...b.app.renderer.extract.pixels({target:b.app.stage,frame:new Rectangle(p.x,p.y,1,1),resolution:1}).pixels.slice(0,3)]]));},points);
 expect(pixels.outside).toEqual([36,87,171]);expect(pixels.inside).toEqual([233,55,71]);
 await page.mouse.click(points.outside.x,points.outside.y,{button:'right'});expect(await selection(page)).toEqual(['behind']);
 await page.keyboard.press('Escape');await page.mouse.click(points.inside.x,points.inside.y,{button:'right'});expect(await selection(page)).toEqual(['clipped']);
});

test('a fully clipped checkbox at 2% has no invisible HTML click target',async({page})=>{
 await blank(page);
 const hidden=await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{checklistLayout}=await import('/src/core/structured-text.ts');b.camera.scale=.02;
  b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('frame',{x:-5000,y:-4000,width:10000,height:8000}),id:'frame'}});
  const w={...createWidget('shape',{x:-7500,y:-3000,width:15000,height:6000}),id:'checklist',checklist:{items:[{id:'hidden-task',text:'Clipped task',checked:false}]}};b.bus.exec({op:'WIDGET_CREATE',payload:w});
  const box=checklistLayout(w)[0].box;return b.camera.worldToScreen({x:w.x+box.x+box.width/2,y:w.y+box.y+box.height/2});
 });
 await settle(page);await expect(page.locator('[data-checklist-item="hidden-task"]')).toHaveCount(0);
 await page.mouse.click(hidden.x,hidden.y);
 expect(await page.evaluate(()=>window.__board.state.widgets.get('checklist').checklist.items[0].checked)).toBe(false);
});

for(const scale of [.02,1,20])test(`smallest-frame ownership updates when a nested frame is hidden at ${scale*100}%`,async({page})=>{
 await blank(page);
 const point=await page.evaluate(async scale=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.scale=scale;
  for(const [id,type,x,y,width,height]of [['behind','shape',-300,-100,350,200],['outer','frame',-80,-80,160,160],['inner','frame',-30,-30,60,60],['child','shape',-60,-40,120,80]])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget(type,{x:x/scale,y:y/scale,width:width/scale,height:height/scale}),id}});
  return b.camera.worldToScreen({x:45/scale,y:0});
 },scale);
 await page.mouse.click(point.x,point.y,{button:'right'});expect(await selection(page)).toEqual(['behind']);await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__board.bus.exec({op:'WIDGET_UPDATE',payload:{id:'inner',patch:{hidden:true}}}));
 await page.mouse.click(point.x,point.y,{button:'right'});expect(await selection(page)).toEqual(['child']);await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__board.bus.exec({op:'WIDGET_UPDATE',payload:{id:'inner',patch:{hidden:false}}}));
 await page.mouse.click(point.x,point.y,{button:'right'});expect(await selection(page)).toEqual(['behind']);
});

async function partialFixture(page,kind){
 return page.evaluate(async kind=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{checklistLayout}=await import('/src/core/structured-text.ts');
  const widget={...createWidget('shape',{x:-170,y:-50,width:340,height:100}),id:kind,...(kind==='checklist'?{checklist:{items:[{id:'partial-task',text:'Partial task',checked:false}]}}:{table:{title:'',headerColor:'#4262ff',cells:[['Editable']]}})};
  // Cut the actual marker diagonally, independently of the marker's styling.
  const box=kind==='checklist'?checklistLayout(widget)[0].box:null;
  const edge=box?widget.x+box.x+box.width/2+widget.y+box.y+box.height/2+2:-138;
  const center={x:edge+Math.SQRT1_2*500,y:Math.SQRT1_2*500};
  b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-800,y:-300,width:1000,height:600}),id:'behind'}});
  b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('frame',{x:center.x-500,y:center.y-500,width:1000,height:1000}),id:'frame',rotation:Math.PI/4}});
  b.bus.exec({op:'WIDGET_CREATE',payload:widget});
  return {hidden:b.camera.worldToScreen(box?{x:widget.x+box.x+1,y:widget.y+box.y+1}:{x:-152,y:-9}),visible:b.camera.worldToScreen(box?{x:widget.x+box.x+box.width-1,y:widget.y+box.y+box.height-1}:{x:-134,y:9}),cell:b.camera.worldToScreen({x:0,y:0})};
 },kind);
}

test('a rotated frame keeps the visible checkbox fragment clickable and excludes its invisible corner',async({page})=>{
 await blank(page);const points=await partialFixture(page,'checklist');await settle(page);
 const checkbox=page.locator('[data-checklist-item="partial-task"]');await expect(checkbox).toHaveCount(1);
 const hits=await page.evaluate(points=>Object.fromEntries(Object.entries(points).map(([key,p])=>[key,document.elementFromPoint(p.x,p.y)?.getAttribute('data-checklist-item')])),points);
 expect(hits.hidden).not.toBe('partial-task');expect(hits.visible).toBe('partial-task');
 await page.mouse.click(points.hidden.x,points.hidden.y);expect(await checkbox.getAttribute('aria-checked')).toBe('false');expect(await selection(page)).toEqual(['behind']);
 const history=await page.evaluate(()=>window.__board.bus.undoStack.length);await page.mouse.click(points.visible.x,points.visible.y);await expect(checkbox).toHaveAttribute('aria-checked','true');
 expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(history+1);await page.keyboard.press('Control+z');await expect(checkbox).toHaveAttribute('aria-checked','false');expect(await selection(page)).toEqual(['behind']);
});

test('the table cell editor exposes only the fragment inside its rotated frame',async({page})=>{
 await blank(page);const points=await partialFixture(page,'table');await settle(page);await page.mouse.dblclick(points.cell.x,points.cell.y);
 const editor=page.locator('#table-cell-editor');await expect(editor).toBeVisible();
 const hits=await page.evaluate(points=>({hidden:document.elementFromPoint(points.hidden.x,points.hidden.y)?.id,visible:document.elementFromPoint(points.cell.x,points.cell.y)?.id}),points);
 expect(hits.hidden).not.toBe('table-cell-editor');expect(hits.visible).toBe('table-cell-editor');
 await editor.fill('Changed');await editor.press('Escape');expect(await page.evaluate(()=>window.__board.state.widgets.get('table').table.cells[0][0])).toBe('Editable');
});
