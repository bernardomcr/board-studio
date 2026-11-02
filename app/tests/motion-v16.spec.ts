// @ts-nocheck
import {test,expect} from '@playwright/test';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function fixture(page,zoom,target=false){return page.evaluate(async({zoom,target})=>{
 const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.x=20000;b.camera.y=-30000;b.camera.scale=zoom;
 const at=(x,y)=>b.camera.screenToWorld({x,y}),start=at(540,460);
 b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{...start,width:120/zoom,height:80/zoom,content:''}),id:'moving'}});
 if(target)b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{...at(700,650),width:120/zoom,height:80/zoom,content:''}),id:'target'}});
 return {start,undo:b.bus.undoStack.length,zoom};
},{zoom,target});}
async function position(page,initial){return page.evaluate(initial=>{const b=window.__board,w=b.state.widgets.get('moving');return {x:(w.x-initial.start.x)*initial.zoom,y:(w.y-initial.start.y)*initial.zoom};},initial);}

for(const zoom of[.02,1,20])test(`object dragging preserves each screen pixel without adaptive grid jumps at ${zoom*100}%`,async({page})=>{
 await blank(page);const initial=await fixture(page,zoom);await settle(page);await page.mouse.move(600,500);await page.mouse.down();
 for(let step=1;step<=12;step++){await page.mouse.move(600+step,500+step);await settle(page);const p=await position(page,initial);expect(p.x).toBeCloseTo(step,6);expect(p.y).toBeCloseTo(step,6);}
 await page.mouse.up();expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(initial.undo+1);
 await page.keyboard.press('Control+z');expect(await position(page,initial)).toEqual({x:0,y:0});await page.keyboard.press('Control+Shift+z');expect((await position(page,initial)).x).toBeCloseTo(12,6);
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect((await position(page,initial)).x).toBeCloseTo(12,6);
});

test('alignment remains magnetic within six screen pixels while Alt exposes the exact pointer position',async({page})=>{
 for(const zoom of[.02,1,20]){
  await blank(page);const initial=await fixture(page,zoom,true);await settle(page);await page.mouse.move(600,500);await page.mouse.down();
  await page.mouse.move(633,500);await settle(page);expect((await position(page,initial)).x).toBeCloseTo(33,6);
  await page.mouse.move(634,500);await settle(page);expect((await position(page,initial)).x).toBeCloseTo(40,6);
  await page.keyboard.down('Alt');await page.mouse.move(635,500);await settle(page);expect((await position(page,initial)).x).toBeCloseTo(35,6);await page.mouse.up();await page.keyboard.up('Alt');
 }
});

test('a burst of superseded pointer events publishes the final drag once and flushes before release',async({page})=>{
 await blank(page);const initial=await fixture(page,.02);await settle(page);await page.mouse.move(600,500);await page.mouse.down();
 await page.evaluate(()=>{const b=window.__board,canvas=b.app.canvas,exec=b.bus.exec.bind(b.bus);window.__motionBatches=0;b.bus.exec=command=>{if(command.op==='BATCH'&&command.payload.label==='Mover')window.__motionBatches++;exec(command);};for(let i=1;i<=1000;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',buttons:1,clientX:600+i*.1,clientY:500+i*.04}));});
 await page.mouse.up();const p=await position(page,initial);expect(p.x).toBeCloseTo(100,6);expect(p.y).toBeCloseTo(40,6);expect(await page.evaluate(()=>window.__motionBatches)).toBe(1);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(initial.undo+1);
 await page.keyboard.press('Control+z');expect(await position(page,initial)).toEqual({x:0,y:0});
});

test('moving and rotating a widget reuses its local paint while content, style and zoom still invalidate it',async({page})=>{
 await blank(page);const result=await page.evaluate(async()=>{
  const Container=window.__board.app.stage.constructor,{BoardScene}=await import('/src/render/scene.ts'),{createWidget}=await import('/src/core/model.ts'),{CommandBus}=await import('/src/core/commands.ts');
  const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new CommandBus(state,()=>{}),stage=new Container(),scene=new BoardScene(stage);
  bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:0,y:0,width:300,height:200,content:'Texto estável'}),id:'box'}});scene.sync(state,undefined,1);
  const node=scene.nodeAt('box'),children=[...node.children[1].children],graphics=node.children[0].context.instructions,original=scene.layoutText.bind(scene);let layouts=0;scene.layoutText=(...args)=>{layouts++;original(...args);};
  for(let i=1;i<=100;i++){bus.exec({op:'ENTITY_LOCK',payload:{ids:['box'],locked:false}});bus.exec({op:'WIDGET_UPDATE',payload:{id:'box',patch:{x:i*2,y:i*3,rotation:i*.001,name:'Nome '+i}}});bus.exec({op:'ENTITY_LOCK',payload:{ids:['box'],locked:!!(i%2)}});scene.sync(state,undefined,1);}
  const transformLayouts=layouts,sameChildren=children.every((child,i)=>child===node.children[1].children[i]),sameGraphics=graphics===node.children[0].context.instructions,transform={x:node.x,y:node.y,rotation:node.rotation};
  bus.exec({op:'WIDGET_UPDATE',payload:{id:'box',patch:{content:'Conteúdo novo',style:{fontSize:40}}}});scene.sync(state,undefined,1);const afterContent=layouts;
  scene.sync(state,undefined,2);const afterZoom=layouts;return {transformLayouts,sameChildren,sameGraphics,transform,afterContent,afterZoom};
 });
 expect(result).toMatchObject({transformLayouts:0,sameChildren:true,sameGraphics:true,afterContent:1,afterZoom:2});expect(result.transform).toEqual({x:350,y:400,rotation:.1});
});

test('a moving mind subtree cannot snap to its own descendant geometry',async({page})=>{
 await blank(page);const initial=await fixture(page,.02);
 await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),w=b.state.widgets.get('moving');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{mind:{rootId:w.id,parentId:null,side:'right',order:0}}}});b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:w.x+w.width+500,y:w.y,width:2000,height:4000,content:''}),id:'child',mind:{rootId:w.id,parentId:w.id,side:'right',order:0}}});});
 await settle(page);await page.mouse.move(600,500);await page.mouse.down();await page.mouse.move(601,501);await settle(page);expect((await position(page,initial)).x).toBeCloseTo(1,6);expect((await position(page,initial)).y).toBeCloseTo(1,6);await page.mouse.up();
});
