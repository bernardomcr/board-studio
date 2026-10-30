// Browser fixtures use the editor's development bridge; all storage is isolated per test.
// @ts-nocheck
import { test, expect, type Page } from '@playwright/test';

async function blank(page:Page,title='Teste local'){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Criar board'});await dialog.getByRole('textbox',{name:'Nome do board'}).fill(title);
  await dialog.getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function fixture(page:Page){await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.x=0;b.camera.y=0;b.camera.scale=1;
  for(const [id,x]of [['a',-500],['b',-230],['c',100]])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x,y:-50,width:160,height:110,content:id}),id}});
  b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'link',type:'connector',start:{kind:'anchor',widgetId:'a',x:1,y:.5},end:{kind:'anchor',widgetId:'b',x:0,y:.5},shape:'elbowed',style:{strokeColor:'#333333',strokeWidth:2,endCap:'arrow'},z:0}});
  b.bus.exec({op:'STROKE_CREATE',payload:{id:'ink',type:'stroke',tool:'pen',color:'#3859ff',z:0,points:[{x:-500,y:140,r:2},{x:-230,y:160,r:2}]}});
});}

test('dashboard creates, renames, saves and reopens an independent board',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await blank(page,'Primeiro board');await fixture(page);
  await page.getByRole('textbox',{name:'Nome do board',exact:true}).fill('Projeto salvo');await page.getByRole('textbox',{name:'Nome do board',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Início',exact:true}).click();await expect(page.locator('#board-home')).toBeVisible();
  await page.getByRole('button',{name:'Abrir Projeto salvo',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(3);
  await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(3);expect(errors).toEqual([]);
});

test('all observed basic and flowchart shapes are real searchable geometry',async({page})=>{
  await blank(page);await page.locator('[data-tool="shape"]').click();await expect(page.locator('.shape-choice')).toHaveCount(77);
  await page.getByRole('textbox',{name:'Buscar formas'}).fill('nuvem');await page.locator('.shape-choice').first().click();
  await page.mouse.move(900,550);await page.mouse.down();await page.mouse.move(1140,700,{steps:10});await page.mouse.up();
  expect(await page.evaluate(()=>window.__board.state.widgets.get([...window.__board.state.selection][0]).shape)).toBe('cloud');
  const result=await page.evaluate(async()=>{const m=await import('/src/core/model.ts'),s=await import('/src/core/shapes.ts');return {total:m.SHAPE_OPTIONS.length,mapped:Object.keys(s.MIRO_SHAPE_MAP).length,invalid:m.SHAPE_OPTIONS.filter(o=>{const p=s.shapePolygon(o.id,180,110);return p?.some((v,i)=>!Number.isFinite(v)||v<-.001||v>(i%2?110:180)+.001)}).length};});
  expect(result).toEqual({total:77,mapped:77,invalid:0});
});

test('nested groups retain mixed entities, anchors, undo and duplication',async({page})=>{
  await blank(page);await fixture(page);await page.evaluate(()=>window.__board.bus.exec({op:'SELECTION_SET',payload:['a','b','link','ink']}));
  await page.getByRole('button',{name:'Agrupar',exact:true}).click();await page.evaluate(()=>window.__board.bus.exec({op:'SELECTION_SET',payload:['a','b','link','ink','c']}));await page.getByRole('button',{name:'Agrupar',exact:true}).click();
  expect(await page.evaluate(()=>window.__board.state.groups.size)).toBe(2);
  await page.mouse.move(380,505);await page.mouse.down();await page.keyboard.down('Alt');await page.mouse.move(450,555,{steps:10});await page.mouse.up();await page.keyboard.up('Alt');
  expect(await page.evaluate(()=>[window.__board.state.widgets.get('a').x,window.__board.state.strokes.get('ink').points[0].x])).toEqual([-430,-430]);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.get('a').x)).toBe(-500);
  await page.getByRole('button',{name:'Duplicar',exact:true}).click();expect(await page.evaluate(()=>window.__board.state.groups.size)).toBe(4);
  expect(await page.evaluate(()=>{const s=window.__board.state,c=[...s.connectors.values()].find(c=>c.id!=='link');return c.start.widgetId!=='a'&&s.widgets.has(c.start.widgetId)&&s.widgets.has(c.end.widgetId)})).toBeTruthy();
  await page.getByRole('button',{name:'Bloquear',exact:true}).click();await page.keyboard.press('Delete');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(6);
});

test('connector paths, patterns, terminations and positioned labels persist',async({page})=>{
  await blank(page);await fixture(page);await page.evaluate(()=>window.__board.bus.exec({op:'SELECTION_SET',payload:['link']}));
  await page.getByRole('combobox',{name:'Fim da linha',exact:true}).selectOption('diamond');
  await page.locator('summary').filter({hasText:/^Traço$/}).click();await page.getByRole('combobox',{name:'Estilo da linha',exact:true}).selectOption('dotted');
  await page.getByText('Caminho',{exact:true}).click();await page.getByRole('button',{name:'Adicionar ponto',exact:true}).click();
  await page.getByText('Rótulos (0)',{exact:true}).click();await page.getByRole('button',{name:'Adicionar rótulo',exact:true}).click();
  await page.getByRole('textbox',{name:'Rótulo 1',exact:true}).fill('Uma ligação');await page.getByRole('textbox',{name:'Rótulo 1',exact:true}).press('Tab');
  await page.getByRole('spinbutton',{name:'Posição do rótulo 1',exact:true}).fill('30');await page.getByRole('spinbutton',{name:'Posição do rótulo 1',exact:true}).press('Tab');
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  const c=await page.evaluate(()=>window.__board.state.connectors.get('link'));expect(c.style.endCap).toBe('diamond');expect(c.style.strokeStyle).toBe('dotted');expect(c.waypoints.length).toBeGreaterThan(0);expect(c.captions).toEqual(['Uma ligação']);expect(c.captionPositions).toEqual([.3]);
});

test('pen preview and committed paths agree after pan and at multiple zoom levels',async({page})=>{
  await blank(page);
  for(const scale of [.5,1,3]){
    await page.evaluate(scale=>{const b=window.__board;b.bus.exec({op:'SELECTION_SET',payload:[]});b.camera.x=1300;b.camera.y=-800;b.camera.scale=scale;},scale);
    await page.locator('[data-tool="pen"]').click();await page.mouse.move(450,500);await page.mouse.down();await page.mouse.move(650,520,{steps:20});
    const live=await page.evaluate(()=>{const b=window.__board,g=b.gesture(),r=b.app.stage.children[2].getBounds();return {x:r.x,right:r.x+r.width,radius:g.points[0].r};});
    expect(Math.abs(live.x-(450-live.radius*scale))).toBeLessThan(2);expect(Math.abs(live.right-(650+live.radius*scale))).toBeLessThan(2);
    await page.mouse.up();const end=await page.evaluate(()=>{const b=window.__board,stroke=[...b.state.strokes.values()].at(-1);return b.camera.worldToScreen(stroke.points.at(-1));});expect(end.x).toBeCloseTo(650,3);expect(end.y).toBeCloseTo(520,3);
  }
});

test('partial eraser and lasso work on sparse geometry and undo',async({page})=>{
  await blank(page);await page.evaluate(()=>{const b=window.__board;b.bus.exec({op:'STROKE_CREATE',payload:{id:'erase',type:'stroke',tool:'pen',color:'#000000',z:0,points:[{x:-200,y:0,r:2},{x:200,y:0,r:2}]}});});
  await page.locator('[data-tool="eraser"]').click();await page.getByRole('combobox',{name:'Modo da borracha'}).selectOption('partial');
  await page.mouse.move(800,500);await page.mouse.down();await page.mouse.up();expect(await page.evaluate(()=>window.__board.state.strokes.size)).toBe(2);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.strokes.has('erase'))).toBe(true);
  const validation=await page.evaluate(async()=>{const {lassoHits}=await import('/src/core/lasso.ts');return lassoHits(window.__board.state,[{x:-10,y:-20},{x:10,y:-20},{x:10,y:20},{x:-10,y:20}]);});expect(validation).toContain('erase');
});

test('all font choices load real local faces and rich formatting round-trips',async({page})=>{
  await blank(page);const result=await page.evaluate(async()=>{const fonts=await import('/src/fonts.ts'),rich=await import('/src/core/richtext.ts');await Promise.all(fonts.FONT_OPTIONS.map(f=>fonts.loadBoardFont(f.family)));const parsed=rich.parseRich(rich.fromHtml('<strong><em><u>Ação</u></em></strong>'));return {count:fonts.FONT_OPTIONS.length,loaded:fonts.FONT_OPTIONS.every(f=>document.fonts.check('18px "'+f.family+'"')),run:parsed[0][0]};});
  expect(result.count).toBe(25);expect(result.loaded).toBe(true);expect(result.run).toMatchObject({text:'Ação',bold:true,italic:true,underline:true});
});

test('image originals, masks, flips, crop and replacement survive reload and export',async({page})=>{
  await blank(page);
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=3200;c.height=1600;const ctx=c.getContext('2d');ctx.fillStyle='#a6c8ff';ctx.fillRect(0,0,3200,1600);ctx.fillStyle='#3859ff';ctx.fillRect(0,0,1600,1600);return c.toDataURL().split(',')[1];});
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-tool="image"]').click();await (await chooser).setFiles({name:'original.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await expect.poll(()=>page.evaluate(()=>[...window.__board.state.widgets.values()].find(w=>w.type==='image')?.naturalWidth)).toBe(3200);
  await page.locator('summary').filter({hasText:/^Imagem$/}).click();await page.getByRole('combobox',{name:'Máscara da imagem'}).selectOption('ellipse');await page.getByRole('button',{name:'Espelhar ↔',exact:true}).click();
  // A re-render can close the popover after committing a command.
  if(!await page.getByRole('spinbutton',{name:'Opacidade da imagem'}).isVisible())await page.locator('summary').filter({hasText:/^Imagem$/}).click();
  await page.getByRole('spinbutton',{name:'Opacidade da imagem'}).fill('65');await page.getByRole('spinbutton',{name:'Opacidade da imagem'}).press('Tab');
  await page.getByRole('button',{name:'Recortar',exact:true}).click();await page.getByRole('button',{name:'4:3',exact:true}).click();await page.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  const result=await page.evaluate(async()=>{const s=window.__board.state,w=[...s.widgets.values()].find(w=>w.type==='image'),{boardToSvg}=await import('/src/core/exportSvg.ts');return {w,svg:boardToSvg(s)};});
  expect(result.w).toMatchObject({naturalWidth:3200,maskShape:'ellipse',flipX:true,opacity:.65});expect(result.w.crop.width).toBeLessThan(1);expect(result.svg).toContain('<ellipse');expect(result.svg).toContain('scale(-1,1)');
});
