// @ts-nocheck
import {test,expect} from '@playwright/test';
import {openDrawingPalette} from './helpers/drawing-palette';
import {readFile} from 'node:fs/promises';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
}
async function menu(page,id){const item=page.locator(`#selection-properties details[data-menu="${id}"]`);if(['size','arrange'].includes(id)){const more=page.locator('#selection-properties details[data-menu="more"]');if(!await more.evaluate(e=>e.open))await more.locator(':scope > summary').click();}await expect(item).toBeVisible();if(!await item.evaluate(el=>el.open))await item.locator(':scope > summary').click();await expect(item).toHaveAttribute('open','');return item;}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('connector thickness uses a growing slider and buttons beyond the former thirty-unit cap',async({page})=>{
 await blank(page);await page.evaluate(()=>{const b=window.__board;b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'thick',type:'connector',shape:'curved',start:{kind:'point',x:-220,y:-80},end:{kind:'point',x:220,y:80},style:{strokeColor:'#3859ff',strokeWidth:2,endCap:'none'},z:0}});b.bus.exec({op:'SELECTION_SET',payload:['thick']});});
 await menu(page,'stroke');await expect(page.getByRole('spinbutton',{name:'Espessura da linha',exact:true})).toHaveCount(0);
 let slider=page.getByRole('slider',{name:'Espessura da linha',exact:true});await slider.press('End');expect(await page.evaluate(()=>window.__board.state.connectors.get('thick').style.strokeWidth)).toBe(256);
 await page.getByRole('button',{name:'Aumentar espessura da linha',exact:true}).click();await page.getByRole('button',{name:'Aumentar espessura da linha',exact:true}).click();
 expect(await page.evaluate(()=>window.__board.state.connectors.get('thick').style.strokeWidth)).toBe(1024);slider=page.getByRole('slider',{name:'Espessura da linha',exact:true});await expect(slider).toHaveValue('1024');expect(Number(await slider.getAttribute('max'))).toBeGreaterThan(1024);
 await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.connectors.get('thick').style.strokeWidth)).toBe(512);await page.keyboard.press('Control+Shift+z');
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(()=>window.__board.state.connectors.get('thick').style.strokeWidth)).toBe(1024);
});

test('text grows beyond ten thousand through the font field and drag handles and borders exceed fifty percent',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.scale=.02;b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:0,y:0,content:'I'}),id:'large-text'}});b.bus.exec({op:'SELECTION_SET',payload:['large-text']});});
 const font=page.getByRole('spinbutton',{name:'Texto',exact:true});await expect(font).not.toHaveAttribute('max');await font.fill('12000');await font.press('Tab');await settle(page);
 const handles=await page.evaluate(()=>{const b=window.__board,w=b.state.widgets.get('large-text');return {font:w.style.fontSize,from:b.camera.worldToScreen(b.geom.handleWorld(w,'e')),to:b.camera.worldToScreen({x:w.x+w.width*2,y:w.y+w.height/2})};});expect(handles.font).toBe(12000);
 await page.mouse.move(handles.from.x,handles.from.y);await page.mouse.down();await page.mouse.move(handles.to.x,handles.to.y,{steps:10});await page.mouse.up();const resized=await page.evaluate(()=>({font:window.__board.state.widgets.get('large-text').style.fontSize,zoom:window.__board.camera.scale}));expect(resized.font).toBeGreaterThan(20000);expect(Math.abs(resized.font-handles.font*2)*resized.zoom).toBeLessThan(.001);
 await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.scale=1;b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-100,y:-80,width:200,height:160,content:''}),id:'large-border'}});b.bus.exec({op:'SELECTION_SET',payload:['large-border']});});
 await menu(page,'border');await page.getByRole('button',{name:'Borda grossa',exact:true}).click();for(let i=0;i<4;i++)await page.getByRole('button',{name:'Aumentar espessura da borda',exact:true}).click();
 expect(await page.evaluate(()=>{const w=window.__board.state.widgets.get('large-border');return {ratio:w.style.borderScale,width:w.style.borderWidth};})).toEqual({ratio:.8,width:128});await expect(page.getByRole('slider',{name:'Espessura proporcional da borda',exact:true})).toHaveValue('80');
 await page.keyboard.press('Escape');await menu(page,'size');await expect(page.getByRole('spinbutton',{name:'Largura',exact:true})).not.toHaveAttribute('max');
});

test('brush and eraser slider ranges keep growing and restore sizes above their old caps',async({page})=>{
 await blank(page);await page.locator('[data-tool="brush"]').click();await openDrawingPalette(page);const brush=page.getByRole('slider',{name:'Tamanho do pincel',exact:true});await brush.press('End');await expect(brush).toHaveValue('4096');await brush.press('End');await expect(brush).toHaveValue('8192');expect(Number(await brush.getAttribute('max'))).toBeGreaterThan(8192);
 await page.locator('[data-tool="eraser"]').click();await openDrawingPalette(page);const eraser=page.getByRole('slider',{name:'Raio da borracha em pixels',exact:true});await eraser.press('End');await expect(eraser).toHaveValue('512');await eraser.press('End');await expect(eraser).toHaveValue('1024');
 await page.reload();await page.waitForFunction(()=>window.__board?.booted);await page.locator('[data-tool="brush"]').click();await openDrawingPalette(page);await expect(page.getByRole('slider',{name:'Tamanho do pincel',exact:true})).toHaveValue('8192');await page.locator('[data-tool="eraser"]').click();await openDrawingPalette(page);await expect(page.getByRole('slider',{name:'Raio da borracha em pixels',exact:true})).toHaveValue('1024');
});

test('project files accept large finite geometry and reject non-finite dimensions without relaxing opacity or file budgets',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:0,y:0,content:'I'}),id:'large'}});});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Salvar arquivo',exact:true}).click();const data=JSON.parse((await readFile(await(await download).path())).toString());
 const result=await page.evaluate(async data=>{
  const {validateBoardFile}=await import('/src/project-files.ts'),{validateBoardBackground}=await import('/src/core/background.ts');
  const w=data.widgets[0];w.x=2e9;w.y=-2e9;w.width=3e8;w.height=2e8;w.style.fontSize=3e5;w.style.borderWidth=1e8;w.style.borderScale=20;w.style.cornerRadius=2e5;
  data.connectors=[{id:'big-line',type:'connector',shape:'straight',start:{kind:'point',x:0,y:0},end:{kind:'point',x:100,y:100},style:{strokeWidth:50000,strokeColor:'#333333'},z:1}];data.connectorOrder=['big-line'];
  data.strokes=[{id:'big-brush',type:'stroke',tool:'brush',color:'#333333',points:[{x:0,y:0,r:50000}],z:2}];data.strokeOrder=['big-brush'];
  const accepted=validateBoardFile(data),png=document.createElement('canvas').toDataURL(),background=validateBoardBackground({color:'#ffffff',grid:false,image:{src:png,x:2e9,y:-2e9,width:2e9,height:1e9,opacity:1}});
  const invalid=[Infinity,NaN,-Infinity].map(width=>{try{validateBoardFile({...data,widgets:[{...w,width}]});return false;}catch{return true;}});
  let badOpacity=false;try{validateBoardFile({...data,widgets:[{...w,style:{...w.style,fillOpacity:2}}]});}catch{badOpacity=true;}
  return {width:accepted.widgets[0].width,font:accepted.widgets[0].style.fontSize,border:accepted.widgets[0].style.borderWidth,line:accepted.connectors[0].style.strokeWidth,radius:accepted.strokes[0].points[0].r,background:background?.image?.width,invalid,badOpacity};
 },data);
 expect(result).toEqual({width:3e8,font:3e5,border:1e8,line:50000,radius:50000,background:2e9,invalid:[true,true,true],badOpacity:true});
});
