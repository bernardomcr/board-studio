// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);}
async function create(page){
 await page.getByRole('button',{name:'Criar board',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});
 await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill('Ateliê de testes');await dialog.getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();await expect(dialog).toHaveCount(0);
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('interface theme persists through library, board and reload without recoloring board content',async({page})=>{
 await ready(page);const light=await page.locator('.bh-side').evaluate(el=>getComputedStyle(el).backgroundColor);
 await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 const dark=await page.locator('.bh-side').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));expect(dark.background).not.toBe(light);expect(dark.background).not.toBe(dark.color);
 await create(page);const before=await page.evaluate(()=>structuredClone(window.__board.state.background));
 const toolbar=await page.locator('#toolbar').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));expect(toolbar.background).toBe(dark.background);expect(toolbar.color).not.toBe(toolbar.background);
 await page.getByRole('button',{name:'Ativar tema claro',exact:true}).click();expect(await page.evaluate(()=>window.__board.state.background)).toEqual(before);
 await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();await page.reload();await page.waitForFunction(()=>window.__board?.booted);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByRole('button',{name:'Início',exact:true}).click();await expect(page.getByRole('button',{name:'Ativar tema claro',exact:true})).toBeVisible();await page.getByRole('button',{name:'Criar board',exact:true}).click();
 const modal=page.locator('.bh-modal-card');expect(await modal.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark.background);
});

for(const viewport of [{width:1280,height:900},{width:800,height:460},{width:390,height:844}])test(`tools stay on one top row without overflow at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await ready(page);await create(page);
 const layout=await page.locator('#toolbar').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,overflowX:getComputedStyle(el).overflowX,buttons:[...el.querySelectorAll('button[data-tool]')].filter(button=>button.getClientRects().length).map(button=>{const b=button.getBoundingClientRect();return {name:button.dataset.tool,x:b.x,y:b.y,right:b.right,bottom:b.bottom};})};});
 expect(layout.y).toBe(0);expect(layout.x).toBe(0);expect(layout.width).toBe(viewport.width);expect(layout.width).toBeGreaterThan(layout.height*3);expect(['auto','scroll']).not.toContain(layout.overflowX);
 expect(layout.buttons.some(button=>button.name==='checklist')).toBe(false);for(const button of layout.buttons){expect(button.y).toBeCloseTo(layout.buttons[0].y,1);expect(button.x).toBeGreaterThanOrEqual(layout.x);expect(button.right).toBeLessThanOrEqual(layout.x+layout.width);expect(button.right).toBeLessThanOrEqual(viewport.width);}
 const workspace=await page.evaluate(async()=>(await import('/src/context-position.ts')).workspaceTop());
 await page.getByRole('button',{name:'Formas',exact:true}).click();const picker=page.locator('#shape-picker');await expect(picker).toBeVisible();const rect=await picker.boundingBox();expect(rect.y).toBeGreaterThanOrEqual(workspace);expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width);
 await page.keyboard.press('Escape');await page.locator('#toolbar [data-tool="brush"]').click();const brush=page.locator('#drawing-palette');await expect(brush).toBeHidden();await page.locator('#app canvas').click({button:'right',position:{x:viewport.width/2,y:Math.max(workspace+20,viewport.height*.6)}});await expect(brush).toBeVisible();const br=await brush.boundingBox();expect(br.x).toBeGreaterThanOrEqual(0);expect(br.x+br.width).toBeLessThanOrEqual(viewport.width);expect(br.y).toBeGreaterThanOrEqual(workspace-2);expect(br.y+br.height).toBeLessThanOrEqual(viewport.height);
});

test('grid opacity changes real painted coverage, stays independent of snapping and persists with Undo',async({page})=>{
 await ready(page);await create(page);await page.getByRole('button',{name:'Fundo do board',exact:true}).click();await page.getByRole('button',{name:'Malha quadriculada',exact:true}).click();
 const sample=async()=>{await settle(page);return page.evaluate(()=>{const b=window.__board,R=b.app.screen.constructor;b.app.renderer.render({container:b.app.stage});const data=b.app.renderer.extract.pixels({target:b.app.stage,frame:new R(400,200,400,200),resolution:1}).pixels;let alpha=0;for(let i=3;i<data.length;i+=4)alpha+=data[i];return {alpha,grid:b.grid().snapCell,background:structuredClone(b.state.background)};});};
 const before=await sample(),slider=page.getByRole('slider',{name:'Opacidade da malha',exact:true});
 await slider.evaluate(input=>{input.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));input.value='40';input.dispatchEvent(new Event('input',{bubbles:true}));input.value='20';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
 const after=await sample();expect(after.background.gridOpacity).toBe(.2);expect(after.grid).toBe(before.grid);expect(after.alpha/before.alpha).toBeGreaterThan(.16);expect(after.alpha/before.alpha).toBeLessThan(.24);
 await page.keyboard.press('Escape');await page.keyboard.press('Control+z');expect((await sample()).background).toEqual(before.background);await page.keyboard.press('Control+Shift+z');
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect((await sample()).background.gridOpacity).toBe(.2);
 await page.getByRole('button',{name:'Fundo do board',exact:true}).click();await page.getByRole('slider',{name:'Opacidade da malha',exact:true}).evaluate(input=>{input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});expect((await sample()).alpha).toBe(0);
});

test('header actions remain visible and individually clickable without overlapping at narrow widths',async({page})=>{
 await ready(page);await create(page);await page.locator('#board-title').fill('Um ateliê criativo com um título comprido');await page.locator('#board-title').press('Enter');
 for(const width of [320,360,560,600,740,800,1280]){await page.setViewportSize({width,height:900});await settle(page);const boxes=await page.evaluate(()=>[...document.querySelectorAll('#topbar button,#board-title,#theme-toggle,#layers-toggle')].map(el=>{const r=el.getBoundingClientRect();return {name:el.id||el.textContent.trim(),x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0));
  for(const box of boxes){expect(box.x,`${width}: ${box.name}`).toBeGreaterThanOrEqual(0);expect(box.right,`${width}: ${box.name}`).toBeLessThanOrEqual(width);for(const other of boxes){if(other===box)continue;const overlap=Math.min(box.right,other.right)-Math.max(box.x,other.x)>1&&Math.min(box.bottom,other.bottom)-Math.max(box.y,other.y)>1;expect(overlap,`${width}: ${box.name} overlaps ${other.name}`).toBe(false);}}
 }
 await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('selected-shape catalog and audio options follow viewport changes without losing their controls',async({page})=>{
 await page.setViewportSize({width:360,height:640});await ready(page);await create(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-70,y:-40,width:140,height:80,content:'Ideia'}),id:'narrow-menu'}});b.bus.exec({op:'SELECTION_SET',payload:['narrow-menu']});});
 await page.locator('#toolbar [data-tool="shape"]').click();await page.keyboard.press('Escape');await page.locator('#selection-properties details[data-menu="shape"] > summary').click();await page.locator('#selection-properties [data-action="more-shapes"]').click();const picker=page.locator('#shape-picker');await expect(picker.locator('#shape-search')).toBeFocused();
 for(const width of [360,1280,360]){await page.setViewportSize({width,height:640});await settle(page);const r=await picker.boundingBox(),toolbar=await page.locator('#toolbar').boundingBox();expect(r.x).toBeGreaterThanOrEqual(11.5);expect(r.x+r.width).toBeLessThanOrEqual(width-11.5);expect(r.y).toBeGreaterThanOrEqual(toolbar.y+toolbar.height+8);expect(r.y+r.height).toBeLessThanOrEqual(628.5);const search=picker.locator('#shape-search');expect(await search.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);}
 await picker.locator('[data-shape="triangle"]').click();expect(await page.evaluate(()=>window.__board.state.widgets.get('narrow-menu').shape)).toBe('triangle');await page.locator('#toolbar [data-tool="audio"]').click();const audio=page.locator('#audio-create-menu');await expect(audio.getByRole('menuitem',{name:'Gravar áudio',exact:true})).toBeVisible();for(const width of [1280,360]){await page.setViewportSize({width,height:640});await settle(page);const r=await audio.boundingBox();expect(r.x).toBeGreaterThanOrEqual(12);expect(r.x+r.width).toBeLessThanOrEqual(width-12);expect(r.y+r.height).toBeLessThanOrEqual(628);}
});

test('focused grid opacity tracks Undo and Redo without losing keyboard focus',async({page})=>{
 await ready(page);await create(page);await page.getByRole('button',{name:'Fundo do board',exact:true}).click();const slider=page.getByRole('slider',{name:'Opacidade da malha',exact:true});await slider.focus();await slider.press('ArrowLeft');await expect(slider).toHaveValue('99');await slider.press('Control+z');await expect(slider).toHaveValue('100');await expect(slider).toBeFocused();await expect(page.locator('.background-grid-opacity output')).toHaveText('100%');await slider.press('Control+Shift+z');await expect(slider).toHaveValue('99');await expect(page.locator('.background-grid-opacity output')).toHaveText('99%');
});

test('dark floating menus and font hover keep readable text and dark surfaces',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();await create(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'BATCH',payload:{commands:[{op:'WIDGET_CREATE',payload:{...createWidget('text',{x:-100,y:-30,content:'Menus legíveis'}),id:'dark-menu'}},{op:'SELECTION_SET',payload:['dark-menu']}]}});});
 const trigger=page.getByRole('button',{name:'Fonte do texto',exact:true});await trigger.hover();const hover=await trigger.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));expect(hover.background).toBe('rgb(52, 56, 63)');expect(hover.color).toBe('rgb(242, 240, 235)');await page.locator('#selection-properties details[data-menu="more"]>summary').click();const action=page.locator('#selection-properties details[data-menu="more"] .menu-action').first();await expect(action).toBeVisible();expect(await action.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(242, 240, 235)');
});

test('a background opacity gesture shares its large immutable image and retains one replayable update',async({page})=>{
 await ready(page);await create(page);const result=await page.evaluate(async()=>{
  const {CommandBus}=await import('/src/core/commands.ts');const fresh=()=>({widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()}),s=fresh(),bus=new CommandBus(s,()=>{});
  // A sizeable embedded source, without decoding a second image in the GPU.
  const src='data:image/png;base64,'+'AAAA'.repeat(1024*1024),descriptor={src,x:10,y:20,width:1200,height:800,opacity:.7};bus.exec({op:'BACKGROUND_UPDATE',payload:{color:'#222222',grid:true,image:descriptor}});const original=JSON.stringify(s.background),nativeClone=globalThis.structuredClone;let sourceClones=0;
  globalThis.structuredClone=(value,...args)=>{if(value?.image?.src===src||value?.payload?.image?.src===src)sourceClones++;return nativeClone(value,...args);};
  try{bus.beginTransaction('Opacidade da malha');for(let frame=1;frame<=300;frame++)bus.exec({op:'BACKGROUND_UPDATE',payload:{gridOpacity:frame/1000}});bus.endTransaction();}finally{globalThis.structuredClone=nativeClone;}
  const final=JSON.stringify(s.background),journal=bus.snapshot(),entry=journal.applied.at(-1),commands=entry.op==='BATCH'?entry.payload.commands:[entry];descriptor.x=999;bus.undo();const undo=JSON.stringify(s.background)===original;bus.redo();const redo=JSON.stringify(s.background)===final,r=fresh(),replay=new CommandBus(r,()=>{});replay.restore(journal.applied,journal.undone);
  return {sourceClones,updates:commands.length,opacity:s.background.gridOpacity,undo,redo,replay:JSON.stringify(r.background)===final,source:s.background.image.src===src,x:s.background.image.x};
 });expect(result).toEqual({sourceClones:0,updates:1,opacity:.3,undo:true,redo:true,replay:true,source:true,x:10});
});

test('artistic typefaces are real local WOFF2 assets with upstream license and matching hashes',async()=>{
 const manifest=JSON.parse(await readFile('public/fonts/manifest.json','utf8')),names=['Bungee','Bungee Shade','Monoton','Righteous','Black Ops One','Cinzel Decorative','Rubik Glitch','Rubik Doodle Shadow','Rubik Scribble','Creepster','Press Start 2P','Fredericka the Great','Pacifico','Lobster','Dancing Script','Amatic SC','Special Elite','Satisfy'];
 expect(new Set(manifest.map(font=>font.family)).size).toBe(43);
 for(const name of names){const font=manifest.find(font=>font.family===name);expect(font).toBeTruthy();const license=await readFile(`public/fonts/${font.slug}-LICENSE.txt`,'utf8');expect(license).toMatch(/SIL OPEN FONT LICENSE|Apache License/);expect(font.license).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\//);for(const filename of font.files){const bytes=await readFile('public/fonts/'+filename);expect(bytes.subarray(0,4).toString()).toBe('wOF2');expect(createHash('sha256').update(bytes).digest('hex')).toBe(font.sha256[filename]);}}
});

test('font picker filters expressive and handwriting families, previews and embeds the chosen face',async({page})=>{
 await ready(page);await create(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'BATCH',payload:{commands:[{op:'WIDGET_CREATE',payload:{...createWidget('text',{x:-100,y:-30,content:'Ação — Imaginação'}),id:'type-sample'}},{op:'SELECTION_SET',payload:['type-sample']}]}});});
 await page.getByRole('button',{name:'Fonte do texto',exact:true}).click();const filter=page.getByRole('combobox',{name:'Estilo de fonte',exact:true});await filter.selectOption('handwriting');await expect(page.getByRole('option',{name:'Pacifico',exact:true})).toBeVisible();await expect(page.getByRole('option',{name:'Inter',exact:true})).toHaveCount(0);
 await filter.selectOption('expressive');await page.getByRole('combobox',{name:'Buscar fontes',exact:true}).fill('Bungee Shade');const font=page.getByRole('option',{name:'Bungee Shade',exact:true});await expect(font).toBeVisible();expect(await font.locator('span').first().evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Bungee Shade');await font.click();
 await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.get('type-sample').style.fontFamily)).toBe('Bungee Shade');expect(await page.evaluate(()=>[...document.fonts].some(face=>face.family.replaceAll('"','')==='Bungee Shade'&&face.status==='loaded'))).toBe(true);
 const svg=await page.evaluate(async()=>{const {boardToSvg}=await import('/src/core/exportSvg.ts'),{embedSvgFonts}=await import('/src/fonts.ts');return embedSvgFonts(boardToSvg(window.__board.state),['Bungee Shade']);});expect(svg).toContain('Bungee Shade');expect(svg).toContain('data:font/woff2;base64,');
});
