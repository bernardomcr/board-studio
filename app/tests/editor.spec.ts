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
async function select(page:Page,ids:string[]){await page.evaluate(ids=>window.__board.bus.exec({op:'SELECTION_SET',payload:ids}),ids);}
async function menu(page:Page,id:string){
  const details=page.locator(`#selection-properties details[data-menu="${id}"]`);
  await expect(details).toBeVisible();if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');return details;
}
async function number(page:Page,label:string,value:string){const input=page.getByRole('spinbutton',{name:label,exact:true});await input.fill(value);await input.press('Tab');}
async function importImage(page:Page,width=3200,height=1600){
  const image=await page.evaluate(({width,height})=>{const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle='#a6c8ff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#3859ff';ctx.fillRect(0,0,width/2,height);ctx.fillStyle='#ffdd66';ctx.beginPath();ctx.arc(width*.53,height*.48,height*.3,0,Math.PI*2);ctx.fill();return c.toDataURL().split(',')[1];},{width,height});
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-tool="image"]').click();await(await chooser).setFiles({name:'original.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await expect.poll(()=>page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.type==='image').length)).toBe(1);
  return await page.evaluate(()=>[...window.__board.state.widgets.values()].find(w=>w.type==='image'));
}

test('dashboard creates, renames, saves and reopens an independent board',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await blank(page,'Primeiro board');await fixture(page);
  await page.getByRole('textbox',{name:'Nome do board',exact:true}).fill('Projeto salvo');await page.getByRole('textbox',{name:'Nome do board',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Início',exact:true}).click();await expect(page.locator('#board-home')).toBeVisible();
  await page.getByRole('button',{name:'Abrir Projeto salvo',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(3);
  await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(3);expect(errors).toEqual([]);
});

test('all observed basic and flowchart shapes are real searchable geometry',async({page})=>{
  await blank(page);await page.locator('[data-tool="shape"]').click();
  await expect(page.locator('#shape-picker [data-shape]')).toHaveCount(5);await expect(page.getByRole('textbox',{name:'Buscar formas'})).toHaveCount(0);
  await page.getByRole('button',{name:'Mais formas',exact:true}).click();await expect(page.locator('#shape-picker [data-shape]')).toHaveCount(77);
  await page.getByRole('textbox',{name:'Buscar formas'}).fill('nuvem');await page.locator('.shape-choice').first().click();
  await page.mouse.move(900,550);await page.mouse.down();await page.mouse.move(1140,700,{steps:10});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.get([...window.__board.state.selection][0])?.shape)).toBe('cloud');
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
  await menu(page,'more');await page.getByRole('button',{name:'Duplicar',exact:true}).click();expect(await page.evaluate(()=>window.__board.state.groups.size)).toBe(4);
  expect(await page.evaluate(()=>{const s=window.__board.state,c=[...s.connectors.values()].find(c=>c.id!=='link');return c.start.widgetId!=='a'&&s.widgets.has(c.start.widgetId)&&s.widgets.has(c.end.widgetId)})).toBeTruthy();
  await page.getByRole('button',{name:'Bloquear',exact:true}).click();await page.keyboard.press('Delete');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(6);
});

test('connector paths, patterns, terminations and positioned labels persist',async({page})=>{
  await blank(page);await fixture(page);await page.evaluate(()=>window.__board.bus.exec({op:'SELECTION_SET',payload:['link']}));
  await menu(page,'end-cap');await page.getByRole('combobox',{name:'Fim da linha',exact:true}).selectOption('diamond');
  await menu(page,'stroke');await page.getByRole('combobox',{name:'Estilo da linha',exact:true}).selectOption('dotted');
  await menu(page,'route');await page.getByRole('button',{name:'Adicionar ponto',exact:true}).click();
  await menu(page,'captions');await page.getByRole('button',{name:'Adicionar rótulo',exact:true}).click();
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
  await blank(page);const original=await importImage(page);
  await page.getByRole('button',{name:'Recortar',exact:true}).click();await page.getByRole('button',{name:'4:3',exact:true}).click();await page.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
  await menu(page,'image');await page.getByRole('combobox',{name:'Máscara da imagem'}).selectOption('ellipse');await page.getByRole('button',{name:'Espelhar ↔',exact:true}).click();
  await menu(page,'image');await number(page,'Opacidade da imagem','65');
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  const result=await page.evaluate(async()=>{const s=window.__board.state,w=[...s.widgets.values()].find(w=>w.type==='image'),{boardToSvg}=await import('/src/core/exportSvg.ts');return {w,svg:boardToSvg(s)};});
  expect(result.w).toMatchObject({naturalWidth:3200,maskShape:'ellipse',flipX:true,opacity:.65});expect(result.w.src).toBe(original.src);expect(result.w.crop.width).toBeLessThan(1);expect(result.svg).toContain('<ellipse');expect(result.svg).toContain('scale(-1,1)');
  await select(page,[original.id]);await menu(page,'image');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Substituir imagem',exact:true}).click();await(await chooser).setFiles({name:'replacement.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#68c79b"/></svg>')});
  await expect.poll(()=>page.evaluate(id=>window.__board.state.widgets.get(id).naturalWidth,original.id)).toBe(600);
  expect(await page.evaluate(id=>window.__board.state.widgets.get(id).crop,original.id)).toEqual({x:0,y:0,width:1,height:1});
});

test('circular image crop and custom borders use the actual menus, undo and SVG',async({page})=>{
  await blank(page);const original=await importImage(page,1600,900);
  await menu(page,'image');await page.getByRole('button',{name:'Recortar em círculo',exact:true}).click();
  const crop=page.getByRole('dialog',{name:'Recortar imagem'});await expect(crop.getByRole('button',{name:'Círculo',exact:true})).toHaveAttribute('aria-pressed','true');await expect(crop.getByRole('button',{name:'4:3',exact:true})).toBeDisabled();
  const region=crop.locator('[data-region]'),box=await region.boundingBox();expect(box.width).toBeCloseTo(box.height,1);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2,{steps:8});await page.mouse.up();
  const handle=await crop.locator('[data-crop-handle="se"]').boundingBox();await page.mouse.move(handle.x+5,handle.y+5);await page.mouse.down();await page.mouse.move(handle.x-35,handle.y-35,{steps:8});await page.mouse.up();
  const resized=await region.boundingBox();expect(resized.width).toBeCloseTo(resized.height,1);await page.screenshot({path:'../work/v5-ui-circle-crop.png'});
  await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
  const applied=await page.evaluate(id=>window.__board.state.widgets.get(id),original.id);expect(applied.maskShape).toBe('ellipse');expect(applied.width).toBeCloseTo(applied.height,6);expect(applied.crop.width*1600).toBeCloseTo(applied.crop.height*900,6);expect(applied.src).toBe(original.src);
  await page.keyboard.press('Control+z');expect(await page.evaluate(id=>window.__board.state.widgets.get(id),original.id)).toMatchObject({width:original.width,height:original.height});expect(await page.evaluate(id=>window.__board.state.widgets.get(id).maskShape,original.id)).toBeUndefined();await page.keyboard.press('Control+Shift+z');
  await menu(page,'border');await page.getByRole('button',{name:'Cor da borda: rosa',exact:true}).click();
  await page.locator('input[type="color"][aria-label="Cor da borda"]').evaluate(input=>{input.value='#d0296b';input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.getByRole('button',{name:'Borda média',exact:true}).click();await page.getByRole('combobox',{name:'Estilo da borda',exact:true}).selectOption('dashed');await number(page,'Opacidade da borda','0.8');
  await menu(page,'image');await number(page,'Opacidade da imagem','45');await page.getByRole('button',{name:'Espelhar ↔',exact:true}).click();
  await menu(page,'border');await page.screenshot({path:'../work/v5-ui-image-border.png'});
  const result=await page.evaluate(async()=>({w:[...window.__board.state.widgets.values()].find(w=>w.type==='image'),svg:(await import('/src/core/exportSvg.ts')).boardToSvg(window.__board.state)}));
  expect(result.w.style).toMatchObject({borderScale:.02,borderColor:'#d0296b',borderStyle:'dashed',borderOpacity:.8});expect(result.w.style.borderWidth).toBeCloseTo(Math.min(result.w.width,result.w.height)*.02,6);expect(result.w.opacity).toBe(.45);expect(result.svg).toContain('stroke-dasharray=');expect(result.svg).toContain('stroke-opacity="0.8"');expect(result.svg).toContain('opacity="0.45"');
  await page.getByRole('combobox',{name:'Estilo da borda',exact:true}).selectOption('dotted');await page.getByRole('combobox',{name:'Estilo da borda',exact:true}).press('Tab');
  expect(await page.evaluate(async()=>(await import('/src/core/exportSvg.ts')).boardToSvg(window.__board.state))).toMatch(/stroke-dasharray="0 [\d.]+"/);
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(id=>window.__board.state.widgets.get(id).style,original.id)).toMatchObject({borderScale:.02,borderColor:'#d0296b',borderStyle:'dotted',borderOpacity:.8});
});

test('transparent colors are palette choices and disappear from actual canvas rendering',async({page})=>{
  await blank(page);await fixture(page);
  const graphicsVisible=async(kind:string,id:string)=>page.evaluate(({kind,id})=>{
    const b=window.__board,world=b.app.stage.children[1],w=b.state.widgets.get(id);
    const node=world.children[3].children.find(c=>c.label===id);
    const target=kind==='stroke'||kind==='connector'?node:node.children[kind==='text'?1:0];
    const pixels=b.app.renderer.extract.pixels({target,resolution:1}).pixels;return pixels.some((value,index)=>index%4===3&&value>0);
  },{kind,id});
  await select(page,['a']);expect(await graphicsVisible('shape','a')).toBe(true);await menu(page,'fill');await page.getByRole('button',{name:'Cor de preenchimento: transparente',exact:true}).click();await menu(page,'border');await page.getByRole('button',{name:'Cor da borda: transparente',exact:true}).click();expect(await graphicsVisible('shape','a')).toBe(false);
  await select(page,['link']);expect(await graphicsVisible('connector','link')).toBe(true);await menu(page,'line-color');await page.getByRole('button',{name:'Cor do conector: transparente',exact:true}).click();expect(await graphicsVisible('connector','link')).toBe(false);
  await select(page,['ink']);expect(await graphicsVisible('stroke','ink')).toBe(true);await menu(page,'stroke');await page.getByRole('button',{name:'Cor do traço: transparente',exact:true}).click();expect(await graphicsVisible('stroke','ink')).toBe(false);
  await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:0,y:120,width:240,height:80,content:'Texto transparente'}),id:'transparent-text'}});});
  await select(page,['transparent-text']);expect(await graphicsVisible('text','transparent-text')).toBe(true);await menu(page,'text-color');await page.getByRole('button',{name:'Cor do texto: transparente',exact:true}).click();expect(await graphicsVisible('text','transparent-text')).toBe(false);
  const image=await importImage(page);await menu(page,'border');await page.getByRole('button',{name:'Borda média',exact:true}).click();await page.getByRole('button',{name:'Cor da borda: transparente',exact:true}).click();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).style.borderColor,image.id)).toBe('transparent');
});

test('mixed groups expose applicable menus and support editing a member then ungrouping',async({page})=>{
  await blank(page);await fixture(page);const image=await importImage(page);
  await select(page,['a',image.id]);const toolbar=page.getByRole('toolbar',{name:'Propriedades da seleção'});
  await expect(toolbar.locator('details[data-menu="fill"],details[data-menu="text"],details[data-menu="border"],details[data-menu="image"]')).toHaveCount(0);await expect(toolbar.getByRole('button',{name:'Agrupar',exact:true})).toBeVisible();
  await toolbar.getByRole('button',{name:'Agrupar',exact:true}).click();expect(await page.evaluate(()=>window.__board.state.groups.size)).toBe(1);
  await page.mouse.dblclick(380,505);await expect(toolbar.getByRole('button',{name:'Sair do grupo',exact:true})).toBeVisible();
  await page.mouse.click(800,500);await expect(toolbar.locator('details[data-menu="image"]')).toBeVisible();await expect(toolbar.locator('details[data-menu="text"],details[data-menu="fill"]')).toHaveCount(0);
  await toolbar.getByRole('button',{name:'Sair do grupo',exact:true}).click();await toolbar.getByRole('button',{name:'Desagrupar',exact:true}).click();expect(await page.evaluate(()=>window.__board.state.groups.size)).toBe(0);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.groups.size)).toBe(1);
});

test('icon toolbars and popovers stay inside the viewport near both edges',async({page})=>{
  await page.setViewportSize({width:900,height:700});await blank(page);await fixture(page);await select(page,['a']);
  const toolbar=page.getByRole('toolbar',{name:'Propriedades da seleção'});
  for(const position of [{x:-440,y:-310},{x:320,y:210}]){
    await page.evaluate(position=>{const b=window.__board;b.bus.exec({op:'WIDGET_UPDATE',payload:{id:'a',patch:{...position,width:100,height:80}}});},position);
    await expect.poll(async()=>{const r=await toolbar.boundingBox();return r.x>=11&&r.y>=67&&r.x+r.width<=889&&r.y+r.height<=688;}).toBe(true);
    const border=await menu(page,'border'),popover=border.locator('.property-popover');await expect.poll(async()=>{const r=await popover.boundingBox();return r.x>=11&&r.y>=8&&r.x+r.width<=889&&r.y+r.height<=690;}).toBe(true);
    await expect(toolbar.locator('details[open]')).toHaveCount(1);await menu(page,'text');await expect(toolbar.locator('details[open]')).toHaveCount(1);
    await toolbar.locator('summary[aria-label="Texto"]').click();
  }
  expect(await toolbar.locator('summary').evaluateAll(items=>items.every(el=>el.textContent.trim()===''))).toBe(true);await menu(page,'border');await page.screenshot({path:'../work/v5-ui-menu-viewport.png'});
  await page.keyboard.press('Escape');await expect(toolbar.locator('details[open]')).toHaveCount(0);
});

test('connector drag and click handles offer destinations, preserve free ends and focus labels',async({page})=>{
  await blank(page);await page.evaluate(async()=>{const {createWidget}=await import('/src/core/model.ts'),b=window.__board;b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-250,y:0,width:180,height:110,content:'Origem'}),id:'source'}});b.bus.exec({op:'SELECTION_SET',payload:['source']});});
  await page.mouse.move(750,555);await page.mouse.down();await page.mouse.move(1130,650,{steps:15});
  expect(await page.evaluate(()=>window.__board.gesture().kind)).toBe('connect');await page.mouse.up();
  const completion=page.locator('#connector-completion');await expect(completion).toBeVisible();expect(await page.evaluate(()=>window.__board.state.connectors.size)).toBe(1);
  await completion.getByRole('button',{name:'Conectar a Elipse / círculo',exact:true}).click();
  let result=await page.evaluate(()=>({widgets:[...window.__board.state.widgets.values()],c:[...window.__board.state.connectors.values()][0]}));expect(result.widgets).toHaveLength(2);expect(result.c.end.kind).toBe('anchor');expect(result.c.start.widgetId).toBe('source');expect(result.widgets.find(w=>w.id===result.c.end.widgetId).shape).toBe('circle');
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);expect(await page.evaluate(()=>[...window.__board.state.connectors.values()][0].end.kind)).toBe('point');
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.connectors.size)).toBe(0);
  await select(page,['source']);await page.mouse.click(750,555);await expect(completion).toBeVisible();expect(await page.evaluate(()=>window.__board.state.connectors.size)).toBe(1);
  await page.mouse.click(1300,800);await expect(completion).toBeHidden();expect(await page.evaluate(()=>[...window.__board.state.connectors.values()][0].end.kind)).toBe('point');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
  const point=await page.evaluate(async()=>{const b=window.__board,c=[...b.state.connectors.values()][0],m=await import('/src/core/connectors.ts');return b.camera.worldToScreen(m.connectorPointAt(m.connectorGeometry(c,b.state.widgets),.4));});
  await page.mouse.dblclick(point.x,point.y);const label=page.getByRole('textbox',{name:'Rótulo 1',exact:true});await expect(label).toBeFocused();await label.fill('Relação');await label.press('Tab');
  result=await page.evaluate(()=>({widgets:[...window.__board.state.widgets.values()],c:[...window.__board.state.connectors.values()][0]}));expect(result.c.captions).toEqual(['Relação']);expect(result.c.captionPositions[0]).toBeCloseTo(.4,1);await page.screenshot({path:'../work/v5-ui-connector-label.png'});
});

test('arranging a mixed group moves it as one unit and undoes every member together',async({page})=>{
  await blank(page);await fixture(page);await page.evaluate(()=>window.__board.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'free',type:'connector',start:{kind:'point',x:-450,y:110},end:{kind:'point',x:-350,y:180},shape:'straight',style:{strokeColor:'#333333',strokeWidth:2,endCap:'arrow'},z:0}}));
  await select(page,['a','ink','free']);await page.getByRole('button',{name:'Agrupar',exact:true}).click();await select(page,['a','ink','free','b']);
  const dx=await page.evaluate(async()=>{const s=window.__board.state,{selectedBounds}=await import('/src/core/groups.ts');return s.widgets.get('b').x+s.widgets.get('b').width-selectedBounds(s,['a','ink','free']).maxX;});
  await menu(page,'arrange');await expect(page.getByRole('button',{name:'Distribuir horizontalmente',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Alinhar à direita',exact:true}).click();
  expect(await page.evaluate(()=>{const s=window.__board.state;return {a:s.widgets.get('a').x,b:s.widgets.get('b').x,ink:s.strokes.get('ink').points[0].x,start:s.connectors.get('free').start.x,end:s.connectors.get('free').end.x};})).toEqual({a:-500+dx,b:-230,ink:-500+dx,start:-450+dx,end:-350+dx});
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>{const s=window.__board.state;return {a:s.widgets.get('a').x,ink:s.strokes.get('ink').points[0].x,start:s.connectors.get('free').start.x};})).toEqual({a:-500,ink:-500,start:-450});
});
