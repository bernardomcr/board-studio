// Multi-selection toolbar actions use their actual UI at 2% zoom.
// @ts-nocheck
import {test,expect} from '@playwright/test';

let browserErrors:string[]=[];
test.beforeEach(async({page})=>{browserErrors=[];page.on('pageerror',error=>browserErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});});
test.afterEach(()=>expect(browserErrors).toEqual([]));

async function fixture(page,count,locked=false){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  return await page.evaluate(({count,locked})=>{
    const b=window.__board,ids=[];b.camera.x=0;b.camera.y=0;b.camera.scale=.02;
    const commands=[];
    for(let i=0;i<count;i++){
      const id=`atomic-${i}`,y=(i-(count-1)/2)*6000;ids.push(id);
      commands.push({op:'CONNECTOR_CREATE',payload:{id,type:'connector',name:`Connection ${i+1}`,shape:i%2?'elbowed':'curved',start:{kind:'point',x:-6500,y},end:{kind:'point',x:6500,y},controlPoint:{x:700+i*100,y:y-2200},waypoints:[{x:-600,y:y-1300},{x:900,y:y+1000}],captions:i===0?['Origem']:i===1?['Primeiro','Segundo']:[],captionPositions:i===0?[.2]:i===1?[.31,.76]:[],style:{strokeColor:i%2?'#4262ff':'#333333',strokeWidth:50+i*10,strokeStyle:i%2?'dashed':'normal',startCap:'circle',endCap:'diamond'},locked:locked&&i===count-1,z:1}});
    }
    commands.push({op:'SELECTION_SET',payload:ids});b.bus.exec({op:'BATCH',payload:{label:'Connector fixture',commands}});return ids;
  },{count,locked});
}
async function state(page,ids){return await page.evaluate(ids=>{const b=window.__board;return {connectors:ids.map(id=>structuredClone(b.state.connectors.get(id))),history:b.bus.undoStack.length,selection:[...b.state.selection],zoom:b.camera.scale};},ids);}
async function open(page,name){const details=page.locator(`#selection-properties [data-menu="${name}"]`);await expect(details).toBeVisible();if(!await details.evaluate(el=>el.open))await details.locator('summary').click();await expect(details).toHaveAttribute('open','');return details;}

for(const count of [2,3])test(`adding a label to ${count} selected connectors at two percent is one complete undo and redo`,async({page})=>{
  const ids=await fixture(page,count),before=await state(page,ids),menu=await open(page,'captions');
  await menu.getByRole('button',{name:'Adicionar rótulo',exact:true}).click();
  const after=await state(page,ids);expect(after.zoom).toBe(.02);expect(after.history-before.history).toBe(1);expect(after.selection).toEqual(ids);
  for(let i=0;i<count;i++){
    const old=before.connectors[i],next=after.connectors[i];expect(next.captions).toEqual([...old.captions,'Rótulo']);expect(next.captionPositions.slice(0,old.captionPositions.length)).toEqual(old.captionPositions);expect(next.captionPositions.at(-1)).toBeGreaterThan(0);expect(next.captionPositions.at(-1)).toBeLessThan(1);
    const {captions,captionPositions,captionStyles,...remaining}=next,{captions:oldCaptions,captionPositions:oldPositions,captionStyles:oldStyles,...oldRemaining}=old;expect(remaining).toEqual(oldRemaining);expect(captionStyles.at(-1)).toMatchObject({fontSize:14,color:old.style.strokeColor,followPath:false,side:'center'});
  }
  await expect(menu).toHaveAttribute('open','');await expect(menu.getByRole('textbox',{name:'Rótulo 2',exact:true})).toHaveValue('Rótulo');await expect(menu.getByRole('spinbutton',{name:'Posição do rótulo 1',exact:true})).toHaveValue('20');
  await page.keyboard.press('Control+z');const undone=await state(page,ids);expect(undone.connectors).toEqual(before.connectors);expect(undone.selection).toEqual(ids);expect(undone.history).toBe(before.history);
  await page.keyboard.press('Control+Shift+z');const redone=await state(page,ids);expect(redone.connectors).toEqual(after.connectors);expect(redone.history).toBe(after.history);expect(redone.selection).toEqual(ids);
});

for(const count of [2,3])test(`restoring paths of ${count} selected connectors at two percent is one complete undo and redo`,async({page})=>{
  const ids=await fixture(page,count),before=await state(page,ids),menu=await open(page,'route');await expect(menu.getByRole('button',{name:'Remover ponto',exact:true})).toBeEnabled();
  await menu.getByRole('button',{name:'Restaurar caminho',exact:true}).click();const after=await state(page,ids);expect(after.zoom).toBe(.02);expect(after.history-before.history).toBe(1);expect(after.selection).toEqual(ids);
  for(let i=0;i<count;i++){const next=after.connectors[i];expect(next.controlPoint).toBeNull();expect(next.waypoints).toBeNull();const {controlPoint,waypoints,...remaining}=next,{controlPoint:oldControl,waypoints:oldWaypoints,...oldRemaining}=before.connectors[i];expect(remaining).toEqual(oldRemaining);}
  await expect(menu).toHaveAttribute('open','');await expect(menu.getByRole('button',{name:'Remover ponto',exact:true})).toBeDisabled();
  await page.keyboard.press('Control+z');const undone=await state(page,ids);expect(undone.connectors).toEqual(before.connectors);expect(undone.history).toBe(before.history);expect(undone.selection).toEqual(ids);await expect(menu.getByRole('button',{name:'Remover ponto',exact:true})).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');const redone=await state(page,ids);expect(redone.connectors).toEqual(after.connectors);expect(redone.history).toBe(after.history);expect(redone.selection).toEqual(ids);await expect(menu.getByRole('button',{name:'Remover ponto',exact:true})).toBeDisabled();
});

for(const action of ['captions','route'])test(`${action} stays absent from a mixed locked selection, with hold-to-unlock only in its context menu`,async({page})=>{
  const ids=await fixture(page,3,true),before=await state(page,ids),toolbar=page.locator('#selection-properties');
  await expect(toolbar).toBeHidden();await expect(toolbar.locator('[data-hold-unlock]')).toHaveCount(0);
  await expect(toolbar.locator(`[data-menu="${action}"]`)).toHaveCount(0);await expect(toolbar.locator('input,select,details')).toHaveCount(0);
  await expect(toolbar.getByRole('button',{name:action==='captions'?'Adicionar rótulo':'Restaurar caminho',exact:true})).toHaveCount(0);
  const point=await page.evaluate(()=>{const b=window.__board,r=b.app.canvas.getBoundingClientRect(),p=b.camera.worldToScreen({x:6500,y:6000});return {x:p.x+r.left,y:p.y+r.top};});
  await page.mouse.click(point.x,point.y,{button:'right'});
  const context=page.locator('#editor-context'),unlock=context.locator('[data-hold-unlock]');await expect(context).toBeVisible();await expect(unlock).toBeVisible();await expect(context.locator('button')).toHaveCount(1);await expect(page.locator('[data-hold-unlock]:visible')).toHaveCount(1);await expect(context.locator('input,select,details,[data-action]')).toHaveCount(0);await expect(toolbar).toBeHidden();expect(await state(page,ids)).toEqual(before);
  // A simple click must neither unlock nor format the editable peers in a
  // mixed selection; only the deliberate hold may change the locked member.
  await unlock.click();expect(await state(page,ids)).toEqual(before);
});
