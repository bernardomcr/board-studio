// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function text(page){await page.evaluate(async()=>{const {createWidget}=await import('/src/core/model.ts'),b=window.__board;b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:-300,y:-160,content:'Texto livre'}),id:'type'}});b.bus.exec({op:'WIDGET_UPDATE',payload:{id:'type',patch:{style:{...b.state.widgets.get('type').style,fontSize:32}}}});b.bus.exec({op:'SELECTION_SET',payload:['type']});});}
async function handle(page,id,which){return page.evaluate(({id,which})=>{const b=window.__board;return b.camera.worldToScreen(b.geom.handleWorld(b.state.widgets.get(id),which));},{id,which});}
async function menu(page,id){const d=page.locator(`#selection-properties details[data-menu="${id}"]`);if(!await d.evaluate(e=>e.open))await d.locator('summary').click();return d;}

test('free text grows through corner and side handles with sharp glyphs and no reflow',async({page})=>{
  await blank(page);await text(page);const original=await page.evaluate(()=>window.__board.state.widgets.get('type'));
  expect(await page.evaluate(()=>{const b=window.__board,w=b.state.widgets.get('type'),p=b.camera.worldToScreen({x:w.x+w.width/2,y:w.y});return document.elementFromPoint(p.x,p.y-20)?.tagName;})).toBe('CANVAS');
  expect(original.width).toBeLessThan(220);expect(original.height).toBeCloseTo(43.2,5);
  const se=await handle(page,'type','se');await page.mouse.move(se.x,se.y);await page.mouse.down();await page.mouse.move(se.x+original.width,se.y+original.height,{steps:12});await page.mouse.up();
  let w=await page.evaluate(()=>window.__board.state.widgets.get('type'));expect(w.style.fontSize).toBeCloseTo(64,3);expect(w.width/original.width).toBeCloseTo(2,5);expect(w.height/original.height).toBeCloseTo(2,5);expect(w.x).toBeCloseTo(original.x,5);expect(w.y).toBeCloseTo(original.y,5);
  const ink=await page.evaluate(()=>{const b=window.__board,n=b.app.stage.children[1].children[3].children.find(n=>n.label==='type').children[1];return n.children.filter(n=>n.style).map(n=>({font:n.style.fontSize,y:n.y,resolution:n.resolution}));});expect(ink.length).toBeGreaterThan(0);expect(ink.every(n=>Math.abs(n.font-64)<.001&&n.y===0&&n.resolution>=2)).toBe(true);
  const east=await handle(page,'type','e');await page.mouse.move(east.x,east.y);await page.mouse.down();await page.mouse.move(east.x+w.width/2,east.y,{steps:10});await page.mouse.up();
  w=await page.evaluate(()=>window.__board.state.widgets.get('type'));expect(w.style.fontSize).toBeCloseTo(96,3);expect(w.height/original.height).toBeCloseTo(3,5);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.get('type').style.fontSize)).toBeCloseTo(64,3);await page.keyboard.press('Control+Shift+z');
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(()=>window.__board.state.widgets.get('type').style.fontSize)).toBeCloseTo(96,3);
});

test('typing free text expands its natural area and preserves explicit line breaks',async({page})=>{
  await blank(page);await text(page);await page.evaluate(()=>{window.__board.camera.scale=.1;});await page.keyboard.press('Enter');const edit=page.locator('#inline-editor');await expect(edit).toBeFocused();await expect(edit).toHaveCSS('font-size','3.2px');await expect(edit).toHaveCSS('outline-style','none');await expect(edit).toHaveCSS('white-space','pre');await page.evaluate(()=>{window.__board.camera.scale=.02;});await expect(edit).toHaveCSS('font-size','0.64px');await page.evaluate(()=>{window.__board.camera.scale=1;});
  await edit.fill('Uma frase longa que cresce sem criar outra linha automaticamente');await edit.press('Control+Enter');
  const one=await page.evaluate(()=>window.__board.state.widgets.get('type'));expect(one.width).toBeGreaterThan(700);expect(one.height).toBeCloseTo(43.2,4);
  await page.keyboard.press('Enter');await edit.fill('Linha um\nLinha dois');await edit.press('Control+Enter');const two=await page.evaluate(()=>window.__board.state.widgets.get('type'));expect(two.height).toBeCloseTo(one.height*2,4);expect(two.width).toBeLessThan(one.width);
});

test('creating a frame preserves its content and rotated clipping matches the canvas and SVG',async({page})=>{
  await blank(page);await page.evaluate(async()=>{const {createWidget}=await import('/src/core/model.ts'),b=window.__board;const shape={...createWidget('shape',{x:-120,y:-120,width:240,height:240}),id:'red'};shape.style={...shape.style,fillColor:'#ff0000',borderWidth:0};b.bus.exec({op:'WIDGET_CREATE',payload:shape});b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('frame',{x:-100,y:-100,width:200,height:200}),id:'frame',rotation:Math.PI/4}});b.bus.exec({op:'SELECTION_SET',payload:[]});});
  expect(await page.evaluate(()=>window.__board.state.widgets.get('frame').z<window.__board.state.widgets.get('red').z)).toBe(true);
  const colors=await page.evaluate(()=>{const b=window.__board,c=b.app.renderer.extract.canvas({target:b.app.stage,clearColor:b.state.background.color}),ctx=c.getContext('2d');return {center:[...ctx.getImageData(805,505,1,1).data],corner:[...ctx.getImageData(895,595,1,1).data]};});
  expect(colors.center.slice(0,3)).toEqual([255,0,0]);expect(colors.corner.slice(0,3)).toEqual([251,250,247]);
  const result=await page.evaluate(async()=>{const b=window.__board,{boardToSvg}=await import('/src/core/exportSvg.ts'),{validateBoardFile}=await import('/src/project-files.ts');const widgets=[...b.state.widgets.values()].map(w=>w.id==='frame'?{...w,z:999}:w),file={format:'local-board',version:1,title:'Antigo',widgets,order:b.state.order,connectors:[],connectorOrder:[],strokes:[],strokeOrder:[],groups:[],camera:{x:0,y:0,scale:1}};return {svg:boardToSvg(b.state),migrated:validateBoardFile(file).widgets.find(w=>w.id==='frame').z};});
  expect(result.svg).toMatch(/clipPath[^>]*><polygon points=/);expect(result.migrated).toBeLessThan(0);
});

test('a medium image border follows drag and numeric scaling beyond thirty pixels and exports proportionally',async({page})=>{
  await blank(page);const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=1000;const t=c.getContext('2d');t.fillStyle='#a6c8ff';t.fillRect(0,0,1000,1000);return c.toDataURL().split(',')[1];});
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-tool="image"]').click();await(await chooser).setFiles({name:'borda.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(()=>[...window.__board.state.widgets.values()].some(w=>w.type==='image'));
  const id=await page.evaluate(()=>{const b=window.__board,w=[...b.state.widgets.values()][0];b.camera.scale=.2;b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{x:-500,y:-500,width:1000,height:1000}}});return w.id;});
  await menu(page,'border');await page.getByRole('button',{name:'Borda média',exact:true}).click();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).style.borderWidth,id)).toBe(20);await page.keyboard.press('Escape');
  const se=await handle(page,id,'se');await page.mouse.move(se.x,se.y);await page.mouse.down();await page.mouse.move(se.x+200,se.y+200,{steps:12});await page.mouse.up();
  expect(await page.evaluate(id=>{const w=window.__board.state.widgets.get(id);return {width:w.width,height:w.height,ratio:w.style.borderScale,border:w.style.borderWidth};},id)).toEqual({width:2000,height:2000,ratio:.02,border:40});
  await page.keyboard.press('Control+z');expect(await page.evaluate(id=>window.__board.state.widgets.get(id).style.borderWidth,id)).toBe(20);await page.keyboard.press('Control+Shift+z');
  await menu(page,'size');const width=page.getByRole('spinbutton',{name:'Largura',exact:true});await width.fill('3000');await width.press('Tab');
  const result=await page.evaluate(async id=>{const b=window.__board,w=b.state.widgets.get(id);return {width:w.width,height:w.height,border:w.style.borderWidth,ratio:w.style.borderScale,svg:(await import('/src/core/exportSvg.ts')).boardToSvg(b.state)};},id);
  expect(result).toMatchObject({width:3000,height:3000,border:60,ratio:.02});expect(result.svg).toContain('stroke-width="60"');
  await page.keyboard.press('Escape');await menu(page,'border');await expect(page.getByRole('slider',{name:'Espessura proporcional da borda',exact:true})).toHaveValue('2');await expect(page.getByRole('spinbutton',{name:'Espessura da borda',exact:true})).toHaveCount(0);await page.screenshot({path:'../work/composition-proportional-border.png'});
});
