// @ts-nocheck
import {test,expect} from '@playwright/test';
import {boardAction} from './helpers/board-actions';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

async function create(page,title='Composição'){
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});
  await expect(dialog.getByText('Começar com',{exact:true})).toHaveCount(0);
  await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill(title);
  await dialog.getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await create(page);}
async function source(page){await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-80,y:-50,width:160,height:100,content:'Composição'}),id:'source'}});b.bus.exec({op:'SELECTION_SET',payload:['source']});});}

test('selection toggles navigation without a separate hand button and returns to moving objects',async({page})=>{
  await blank(page);await source(page);
  const select=page.getByRole('button',{name:'Selecionar',exact:true});
  const surface=await page.locator('#board-title').evaluate(el=>getComputedStyle(el).backgroundColor);await expect(page.getByRole('button',{name:'Início',exact:true})).toHaveCSS('background-color',surface);
  await expect(page.locator('[data-tool="hand"]')).toHaveCount(0);await expect(select).toHaveAttribute('aria-pressed','true');
  await select.click();await expect(select).toHaveAttribute('aria-pressed','false');await expect(page.locator('#app canvas')).toHaveCSS('cursor','grab');
  await expect(page.getByRole('toolbar',{name:'Propriedades da seleção'})).toBeHidden();
  await page.mouse.move(800,500);await page.mouse.down();await page.mouse.move(920,580,{steps:10});await page.waitForTimeout(150);await page.mouse.up();
  expect(await page.evaluate(()=>({x:window.__board.camera.x,y:window.__board.camera.y,widget:window.__board.state.widgets.get('source').x}))).toEqual({x:-120,y:-80,widget:-80});
  await page.mouse.dblclick(920,580);expect(await page.locator('#inline-editor').count()).toBe(0);
  await select.click();await expect(select).toHaveAttribute('aria-pressed','true');
  await page.keyboard.down('Alt');await page.mouse.move(920,580);await page.mouse.down();await page.mouse.move(980,620,{steps:10});await page.mouse.up();await page.keyboard.up('Alt');
  expect(await page.evaluate(()=>({x:window.__board.state.widgets.get('source').x,y:window.__board.state.widgets.get('source').y}))).toEqual({x:-20,y:-10});
});

test('formatting after typing a size applies the first click and retains both edits',async({page})=>{
  await blank(page);await source(page);
  await page.getByRole('spinbutton',{name:'Texto',exact:true}).fill('24');
  await page.getByRole('button',{name:'Estilo do texto',exact:true}).click();
  await page.getByRole('button',{name:'Negrito',exact:true}).click();
  expect(await page.evaluate(()=>{const s=window.__board.state.widgets.get('source').style;return {size:s.fontSize,weight:s.fontWeight};})).toEqual({size:24,weight:'bold'});
});

test('background colors, grid and independent boards survive reload and history',async({page})=>{
  await blank(page);await source(page);const before=await page.evaluate(()=>({x:window.__board.camera.x,w:window.__board.state.widgets.get('source').x}));
  const toggle=page.getByRole('button',{name:'Fundo do board',exact:true});await toggle.click();
  const panel=page.getByRole('dialog',{name:'Fundo do board',exact:true});await panel.getByRole('button',{name:'Fundo escuro',exact:true}).click();
  expect(await page.evaluate(()=>window.__board.state.background.color)).toBe('#16181d');
  await panel.getByRole('button',{name:'Sem malha',exact:true}).click();
  await panel.locator('input[type="color"]').fill('#284b63');await panel.locator('input[type="color"]').press('Tab');
  expect(await page.evaluate(()=>window.__board.state.background)).toEqual({color:'#284b63',grid:false});
  await page.keyboard.press('Escape');await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.background.color)).toBe('#16181d');
  await page.keyboard.press('Control+Shift+z');await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  expect(await page.evaluate(()=>window.__board.state.background)).toEqual({color:'#284b63',grid:false});
  expect(await page.evaluate(()=>({x:window.__board.camera.x,w:window.__board.state.widgets.get('source').x}))).toEqual(before);
  await page.getByRole('button',{name:'Início',exact:true}).click();await expect(page.locator('[data-template]')).toHaveCount(0);await create(page,'Outro board');
  expect(await page.evaluate(()=>window.__board.state.background)).toEqual({color:'#fbfaf7',grid:true});
  await page.getByRole('button',{name:'Início',exact:true}).click();await page.getByRole('button',{name:'Abrir Composição',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  expect(await page.evaluate(()=>window.__board.state.background)).toEqual({color:'#284b63',grid:false});
  await toggle.click();await page.screenshot({path:'../work/workspace-dark-background.png'});
});

test('large background image is scenery, scales proportionally and round-trips through project and SVG',async({page})=>{
  // This functional round-trip transfers the real 18MP PNG through two file
  // choosers, SVG/export, storage and reload. CI VMs need a separate I/O budget;
  // native runs retain the normal 30s limit and every content/render assertion.
  if(process.env.CI)test.setTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await blank(page);await source(page);
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=6000;c.height=3000;const ctx=c.getContext('2d');const gradient=ctx.createLinearGradient(0,0,6000,3000);gradient.addColorStop(0,'#16324f');gradient.addColorStop(1,'#5b8e7d');ctx.fillStyle=gradient;ctx.fillRect(0,0,6000,3000);window.__workspaceOriginalBackground=c.toDataURL();return window.__workspaceOriginalBackground.split(',')[1];});
  const originalSrc='data:image/png;base64,'+image,originalSha256=createHash('sha256').update(originalSrc).digest('hex');
  await page.getByRole('button',{name:'Fundo do board',exact:true}).click();const panel=page.getByRole('dialog',{name:'Fundo do board',exact:true});
  const chooser=page.waitForEvent('filechooser');await panel.getByRole('button',{name:'Usar imagem como fundo',exact:true}).click();await(await chooser).setFiles({name:'grande.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await expect.poll(()=>page.evaluate(()=>window.__board.state.background.image?.width)).toBe(6000);
  await expect.poll(()=>page.evaluate(()=>window.__board.app.stage.children[1].children.find(c=>c.label==='board-background')?.children[0]?.visible)).toBe(true);
  expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
  const width=panel.getByRole('spinbutton',{name:'Largura da imagem de fundo',exact:true});await width.fill('12000');await width.press('Tab');
  expect(await page.evaluate(()=>({w:window.__board.state.background.image.width,h:window.__board.state.background.image.height,x:window.__board.camera.x,wx:window.__board.state.widgets.get('source').x}))).toEqual({w:12000,h:6000,x:0,wx:-80});
  // Keep this real 18MP PNG and the exact-content checks without serializing
  // its 18MB data URL/SVG repeatedly through Playwright and the trace recorder.
  const result=await page.evaluate(async()=>{const b=window.__board,{boardToSvg}=await import('/src/core/exportSvg.ts'),svg=boardToSvg(b.state),transparent=boardToSvg(b.state,{background:'none'}),white=boardToSvg(b.state,{background:'#ffffff'}),svgImage=new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('image');return {srcMatchesOriginal:b.state.background.image.src===window.__workspaceOriginalBackground,normalImage:svg.includes('<image'),normalWidth:svg.includes('width="12000"'),svgSrcMatchesOriginal:(svgImage?.getAttribute('href')??svgImage?.getAttribute('xlink:href'))===window.__workspaceOriginalBackground,transparentImage:transparent.includes('<image'),whiteImage:white.includes('<image')};});
  expect(result).toEqual({srcMatchesOriginal:true,normalImage:true,normalWidth:true,svgSrcMatchesOriginal:true,transparentImage:false,whiteImage:false});
  await page.keyboard.press('Escape');const download=page.waitForEvent('download');await boardAction(page,'Salvar arquivo');const path=await(await download).path(),data=await readFile(path);
  const exported=JSON.parse(data.toString());expect(exported.background.image.width).toBe(12000);expect(exported.background.image.src===originalSrc,'Exported PNG data is byte-for-byte identical to the original').toBe(true);
  await page.getByRole('button',{name:'Fundo do board',exact:true}).click();await panel.getByRole('button',{name:'Remover imagem de fundo',exact:true}).click();expect(await page.evaluate(()=>window.__board.state.background.image)).toBeUndefined();
  await page.keyboard.press('Escape');const open=page.waitForEvent('filechooser');await boardAction(page,'Abrir arquivo');await(await open).setFiles({name:'composicao.board.json',mimeType:'application/json',buffer:data});
  await expect.poll(()=>page.evaluate(()=>window.__board.state.background.image?.width)).toBe(12000);await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  expect(await page.evaluate(async()=>{const image=window.__board.state.background.image,digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(image.src));return {w:image.width,srcSha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''),widgets:window.__board.state.widgets.size};})).toEqual({w:12000,srcSha256:originalSha256,widgets:1});
  await expect.poll(()=>page.evaluate(()=>window.__board.app.stage.children[1].children.find(c=>c.label==='board-background')?.children[0]?.visible)).toBe(true);
  await page.getByRole('button',{name:'Fundo do board',exact:true}).click();await page.screenshot({path:'../work/workspace-image-background.png'});expect(errors).toEqual([]);
});
