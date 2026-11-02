// @ts-nocheck
import {test,expect} from '@playwright/test';
import {expectFloatingRail} from './helpers/floating-rail';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();
}

for(const viewport of [{width:1600,height:1000},{width:360,height:640},{width:800,height:420}]){
 test(`side rail and drawing menus remain usable at ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await blank(page);
  const {rail}=await expectFloatingRail(page);
  const controls=await page.locator('#toolbar button').evaluateAll(buttons=>buttons.map(button=>{
   const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {name:button.getAttribute('aria-label'),x:r.x,y:r.y,right:r.right,bottom:r.bottom,hit:button===hit||button.contains(hit)};
  }));
  for(const control of controls){expect(control.x,control.name).toBeGreaterThanOrEqual(rail.x);expect(control.y,control.name).toBeGreaterThanOrEqual(rail.y);expect(control.right,control.name).toBeLessThanOrEqual(rail.right);expect(control.bottom,control.name).toBeLessThanOrEqual(rail.bottom);expect(control.hit,control.name).toBe(true);}
  for(const tool of ['brush','eraser']){
   await page.locator(`#toolbar [data-tool="${tool}"]`).click();
   const point={x:viewport.width*.65,y:viewport.height-90};
   expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,point)).toBe('CANVAS');
   await page.mouse.click(point.x,point.y,{button:'right'});
   const panel=page.locator('#drawing-palette');await expect(panel).toBeVisible();
   const bounds=await panel.boundingBox();
   expect(bounds.x).toBeGreaterThanOrEqual(rail.right+10);expect(bounds.y).toBeGreaterThanOrEqual(58);
   expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width-10);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height-10);
   await panel.getByRole('button',{name:tool==='brush'?'Fechar opções do pincel':'Fechar opções da borracha',exact:true}).click();
   await expect(panel).toBeHidden();await expect(page.locator(`#toolbar [data-tool="${tool}"]`)).toHaveClass(/active/);
  }
 });
}

test('clean Home keeps profile and theme available on a narrow screen',async({page})=>{
 await page.setViewportSize({width:360,height:640});await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await expect(page.locator('#board-home')).toBeVisible();await expect(page.locator('.bh-identity')).toHaveCount(0);
 const profile=page.getByRole('button',{name:'Perfil local',exact:true});await expect(profile).toBeVisible();
 await profile.click();const dialog=page.getByRole('dialog',{name:'Perfil local',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('textbox',{name:'Seu nome',exact:true}).fill('Ateliê');await dialog.getByRole('button',{name:'Salvar perfil',exact:true}).click();
 await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'Ativar tema escuro',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
