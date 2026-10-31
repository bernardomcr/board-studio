// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});
 await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill('Imagens simplificadas');
 await dialog.getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();await expect(page.locator('#board-transition')).toBeHidden();
 const src=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=480;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#40b8d0';ctx.fillRect(0,0,480,240);ctx.fillStyle='#d07e30';ctx.fillRect(0,0,160,240);return c.toDataURL('image/png');});
 const file=page.waitForEvent('filechooser');await page.locator('#toolbar [data-tool="image"]').click();await(await file).setFiles({name:'original-completo.png',mimeType:'image/png',buffer:Buffer.from(src.split(',')[1],'base64')});
 await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
 return await page.evaluate(()=>[...window.__board.state.widgets.values()][0]);
}
async function current(page){return page.evaluate(()=>[...window.__board.state.widgets.values()][0]);}
async function menu(page,id){const details=page.locator(`#selection-properties details[data-menu="${id}"]`);if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();return details;}

test('image toolbar exposes only image essentials and downloading keeps the original source bytes',async({page})=>{
 const original=await blank(page),toolbar=page.locator('#selection-properties');
 expect(await toolbar.locator(':scope > button[data-action]').evaluateAll(nodes=>nodes.map(node=>node.dataset.action))).toEqual(['download-image','crop','lock']);
 expect(await toolbar.locator(':scope > details').evaluateAll(nodes=>nodes.map(node=>node.dataset.menu))).toEqual(['image-opacity','border','more']);
 await expect(toolbar.locator('[data-menu="image"]')).toHaveCount(0);
 await expect(toolbar.locator('[data-action="replace-image"],[data-action="flip-x"],[data-action="flip-y"],[data-action="image-actual-size"],[data-action="circle-crop"],[data-action="add-link"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Recortar',exact:true}).click();const crop=page.getByRole('region',{name:'Recortar imagem no quadro',exact:true});await crop.getByRole('combobox',{name:'Formato do recorte',exact:true}).selectOption('circle');await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
 await page.getByRole('button',{name:'Bloquear',exact:true}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar original',exact:true}).click();const download=await pending;
 expect(download.suggestedFilename()).toBe('imagem-original.png');expect(await readFile(await download.path())).toEqual(Buffer.from(original.src.split(',')[1],'base64'));
 const after=await current(page);expect(after.src).toBe(original.src);expect(after.crop.width).toBeLessThan(1);expect(after.maskShape).toBe('ellipse');expect(after.locked).toBe(true);
});

test('image masks, independent opacity, rounded corners and proportional borders retain undo and reload',async({page})=>{
 const original=await blank(page);await page.getByRole('button',{name:'Recortar',exact:true}).click();await page.getByRole('combobox',{name:'Formato do recorte',exact:true}).selectOption('rounded');await page.keyboard.press('Enter');
 await menu(page,'border');const radius=page.getByRole('spinbutton',{name:'Cantos arredondados',exact:true});await radius.fill('42');await radius.press('Tab');await page.getByRole('button',{name:'Borda média',exact:true}).click();await page.getByRole('button',{name:'Cor da borda: vermelho escuro',exact:true}).click();
 await menu(page,'image-opacity');const opacity=page.getByRole('slider',{name:'Opacidade da imagem',exact:true});await opacity.evaluate(node=>{node.value='45';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.keyboard.press('Escape');expect((await current(page)).opacity).toBe(.45);await page.keyboard.press('Control+z');expect((await current(page)).opacity??1).toBe(1);await page.keyboard.press('Control+Shift+z');
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
 const saved=await current(page);expect(saved.src).toBe(original.src);expect(saved.maskShape).toBe('round_rectangle');expect(saved.opacity).toBe(.45);expect(saved.style).toMatchObject({cornerRadius:42,borderScale:.02,borderColor:'#c62828'});
 const svg=await page.evaluate(async()=>(await import('/src/core/exportSvg.ts')).boardToSvg(window.__board.state));expect(svg).toContain('rx="42"');expect(svg).toContain('opacity="0.45"');expect(svg).toContain('stroke="#c62828"');
});

for(const [preset,ratio]of [['3:4',.75],['4:3',4/3],['16:9',16/9]])test(`image crop ${preset} changes only the retained area and has one reversible action`,async({page})=>{
 const original=await blank(page);await page.getByRole('button',{name:'Recortar',exact:true}).click();const crop=page.getByRole('region',{name:'Recortar imagem no quadro',exact:true});
 await crop.getByRole('combobox',{name:'Formato do recorte',exact:true}).selectOption(preset==='3:4'?'portrait':preset==='4:3'?'landscape':'wide');const region=await crop.locator('[data-image-crop-frame]').boundingBox();expect(region.width/region.height).toBeCloseTo(ratio,2);
 await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();const cut=await current(page);expect(cut.width/cut.height).toBeCloseTo(ratio,8);expect(cut.src).toBe(original.src);expect(cut.naturalWidth).toBe(480);expect(cut.naturalHeight).toBe(240);
 await page.keyboard.press('Control+z');expect(await current(page)).toEqual(original);await page.keyboard.press('Control+Shift+z');expect(await current(page)).toEqual(cut);
});

test('original crop restores all source pixels and free crop handles have no ratio lock',async({page})=>{
 const original=await blank(page);await page.getByRole('button',{name:'Recortar',exact:true}).click();let crop=page.getByRole('region',{name:'Recortar imagem no quadro',exact:true});await crop.getByRole('combobox',{name:'Formato do recorte',exact:true}).selectOption('portrait');await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
 await page.getByRole('button',{name:'Recortar',exact:true}).click();crop=page.getByRole('region',{name:'Recortar imagem no quadro',exact:true});await crop.getByRole('combobox',{name:'Formato do recorte',exact:true}).selectOption('original');await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
 const full=await current(page);expect(full.src).toBe(original.src);expect(full.crop).toEqual({x:0,y:0,width:1,height:1});for(const key of ['x','y','width','height'])expect(full[key]).toBeCloseTo(original[key],8);
 await page.getByRole('button',{name:'Recortar',exact:true}).click();crop=page.getByRole('region',{name:'Recortar imagem no quadro',exact:true});await crop.getByRole('combobox',{name:'Formato do recorte',exact:true}).selectOption('free');const preview=await crop.locator('[data-image-crop-frame]').boundingBox();
 await page.mouse.move(preview.x,preview.y);await page.mouse.down();await page.mouse.move(preview.x+preview.width*.1,preview.y+preview.height*.1,{steps:8});await page.mouse.up();const se=await crop.locator('[data-crop-handle="se"]').boundingBox();
 await page.mouse.move(se.x+se.width/2,se.y+se.height/2);await page.mouse.down();await page.mouse.move(preview.x+preview.width*.8,preview.y+preview.height*.5,{steps:8});await page.mouse.up();await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
 const free=await current(page);expect(free.src).toBe(original.src);expect(free.width/free.height).toBeCloseTo(3.5,1);expect(free.crop.width).toBeCloseTo(.7,2);expect(free.crop.height).toBeCloseTo(.4,2);
});
