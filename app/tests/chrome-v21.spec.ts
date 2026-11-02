// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {boardAction} from './helpers/board-actions';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});
 await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill('Cápsula do board');
 await dialog.getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
}
async function object(page){await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:-120,y:-40,content:'Meu texto preservado'}),id:'chrome-text'}});});}

for(const width of [390,800,1600])test(`floating capsule leaves the top canvas open and every command usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});await blank(page);
 await expect(page.getByRole('button',{name:'Início',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Mais opções do board',exact:true})).toBeVisible();
 for(const name of ['Perfil local','Desfazer','Refazer','Salvar arquivo','Abrir arquivo','Exportar PNG','Exportar SVG','Atalhos'])await expect(page.getByRole('button',{name,exact:true})).toBeHidden();
 const layout=await page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},header=rect('topbar'),layers=rect('layers-toggle'),theme=rect('theme-toggle'),background=rect('board-background-toggle'),at=document.elementFromPoint((header.right+layers.x)/2,header.y+header.height/2);return {header,layers,theme,background,space:at?.tagName,dock:getComputedStyle(document.getElementById('studio-dock')).display};});
 expect(layout.dock).toBe('contents');expect(layout.header.x).toBeGreaterThanOrEqual(8);expect(layout.header.y).toBeGreaterThanOrEqual(8);expect(layout.header.right).toBeLessThan(layout.layers.x);expect(layout.layers.right).toBeLessThanOrEqual(width-8);expect(layout.layers.y).toBeGreaterThanOrEqual(8);expect(layout.space).toBe('CANVAS');
 expect(layout.theme.x).toBeGreaterThanOrEqual(layout.background.right+6);expect(Math.abs(layout.theme.bottom-layout.background.bottom)).toBeLessThanOrEqual(3);expect(layout.theme.right).toBeLessThanOrEqual(width-8);
 await page.getByRole('button',{name:'Mais opções do board',exact:true}).click();const menu=page.getByRole('group',{name:'Opções do board',exact:true});await expect(menu).toBeVisible();
 for(const name of ['Exportar PNG','Atalhos','Exportar SVG','Salvar arquivo','Abrir arquivo'])await expect(menu.getByRole('button',{name,exact:true})).toBeVisible();
 const box=await menu.boundingBox();expect(box.x).toBeGreaterThanOrEqual(10);expect(box.x+box.width).toBeLessThanOrEqual(width-10);expect(box.y+box.height).toBeLessThanOrEqual(790);
 const rows=await menu.locator('button').evaluateAll(buttons=>buttons.map(button=>{const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},buttonBox=rect(button),svg=button.querySelector('svg'),label=button.querySelector('.studio-command-label'),at=document.elementFromPoint(buttonBox.x+buttonBox.width/2,buttonBox.y+buttonBox.height/2);return {name:button.getAttribute('aria-label'),button:buttonBox,icon:svg&&rect(svg),label:label&&rect(label),text:label&&(()=>{const range=document.createRange();range.selectNodeContents(label);return rect(range);})(),labelHit:label&&(()=>{const r=rect(label),at=document.elementFromPoint((r.x+r.right)/2,(r.y+r.bottom)/2);return button===at||button.contains(at);})(),hit:button===at||button.contains(at)};}));
 expect(rows).toHaveLength(5);for(const row of rows){expect(row.button.height,row.name).toBe(36);expect(row.button.x,row.name).toBeCloseTo(rows[0].button.x,1);expect(row.button.width,row.name).toBeCloseTo(rows[0].button.width,1);expect(row.icon,row.name).toBeTruthy();expect(row.icon.width,row.name).toBe(18);expect(row.icon.height,row.name).toBe(18);expect(row.icon.x,row.name).toBeCloseTo(rows[0].icon.x,1);expect(row.label.x,row.name).toBeCloseTo(rows[0].label.x,1);expect(row.label.right,row.name).toBeLessThanOrEqual(row.button.right);expect(row.icon.x,row.name).toBeGreaterThanOrEqual(row.button.x);expect(row.text.x,row.name).toBeGreaterThanOrEqual(row.button.x);expect(row.text.right,row.name).toBeLessThanOrEqual(row.button.right);expect(row.text.y,row.name).toBeGreaterThanOrEqual(row.button.y);expect(row.text.bottom,row.name).toBeLessThanOrEqual(row.button.bottom);expect(row.labelHit,row.name).toBe(true);expect(row.hit,row.name).toBe(true);}
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(page.getByRole('button',{name:'Mais opções do board',exact:true})).toBeFocused();
});

test('More supports keyboard navigation, Escape, outside click and focus leaving the menu',async({page})=>{
 await blank(page);const more=page.getByRole('button',{name:'Mais opções do board',exact:true}),menu=page.getByRole('group',{name:'Opções do board',exact:true});
 await more.click();await expect(menu.getByRole('button',{name:'Exportar PNG',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(menu.getByRole('button',{name:'Abrir arquivo',exact:true})).toBeFocused();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await expect(menu.getByRole('button',{name:'Atalhos',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(more).toBeFocused();await more.click();await page.mouse.click(700,600);await expect(menu).toBeHidden();
 await more.click();await page.getByRole('button',{name:'Camadas',exact:true}).focus();await expect(menu).toBeHidden();await expect(page.getByRole('button',{name:'Camadas',exact:true})).toBeFocused();
});

test('More retains original editable-project and SVG command handlers',async({page})=>{
 await blank(page);await object(page);
 const saved=page.waitForEvent('download');await boardAction(page,'Salvar arquivo');const data=JSON.parse(await readFile(await(await saved).path(),'utf8'));expect(data.widgets.find(w=>w.id==='chrome-text').content).toBe('Meu texto preservado');await expect(page.locator('#studio-command-menu')).toBeHidden();
 await expect(page.getByRole('status').filter({hasText:'Arquivo gerado'})).toBeVisible();await expect(page.locator('#studio-command-menu [role=status]')).toHaveCount(0);await page.getByRole('button',{name:'Fechar mensagem de arquivo',exact:true}).click();await expect(page.locator('#project-file-status')).toBeHidden();
 const exported=page.waitForEvent('download');await boardAction(page,'Exportar SVG');const svg=await readFile(await(await exported).path(),'utf8');expect(svg).toContain('Meu texto preservado');
 await boardAction(page,'Atalhos');await expect(page.locator('#help-panel')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#help-panel')).toBeHidden();
});

test('Undo and Redo remain keyboard actions while their physical buttons stay absent',async({page})=>{
 await blank(page);await object(page);await page.mouse.click(900,600);await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.has('chrome-text'))).toBe(false);await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(()=>window.__board.state.widgets.get('chrome-text')?.content)).toBe('Meu texto preservado');
 await expect(page.getByRole('button',{name:'Desfazer',exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'Refazer',exact:true})).toBeHidden();
});

test('bottom theme control persists without pushing object menus toward the viewport bottom',async({page})=>{
 await blank(page);await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 const top=await page.evaluate(async()=>(await import('/src/context-position.ts')).workspaceTop());expect(top).toBeLessThan(90);
 await page.reload();await page.waitForFunction(()=>window.__board?.booted);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.getByRole('button',{name:'Ativar tema claro',exact:true})).toBeVisible();
});

test('profile editing stays on Home and is absent from the editor capsule',async({page})=>{
 await blank(page);await expect(page.getByRole('button',{name:'Perfil local',exact:true})).toBeHidden();await page.getByRole('button',{name:'Início',exact:true}).click();await page.getByRole('button',{name:'Editar perfil local',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Perfil local',exact:true});await dialog.getByRole('textbox',{name:'Seu nome',exact:true}).fill('Meu ateliê');await dialog.getByRole('button',{name:'Salvar perfil',exact:true}).click();await expect(page.locator('.bh-workspace strong')).toHaveText('Meu ateliê');
 await page.getByRole('button',{name:'Abrir Cápsula do board',exact:true}).click();await expect(page.getByRole('button',{name:'Perfil local',exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'Mais opções do board',exact:true})).toBeVisible();
});
