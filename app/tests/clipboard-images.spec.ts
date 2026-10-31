// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function fixture(page){await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');
  b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-150,y:-50,width:150,height:100,content:'Objeto copiado'}),id:'original'}});
  b.bus.exec({op:'SELECTION_SET',payload:['original']});
});}

test('native image paste wins over an older in-app copy and accepts image items without a file list',async({page})=>{
  await blank(page);await fixture(page);
  const result=await page.evaluate(async()=>{
    const copied=new DataTransfer(),copy=new ClipboardEvent('copy',{clipboardData:copied,bubbles:true,cancelable:true});document.dispatchEvent(copy);
    const key=new KeyboardEvent('keydown',{key:'v',code:'KeyV',ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(key);
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=120;canvas.getContext('2d').fillRect(0,0,240,120);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),data=new DataTransfer();data.items.add(new File([blob],'externa.png',{type:'image/png'}));
    Object.defineProperty(data,'files',{value:[]});
    const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(event);
    return {copyConsumed:copy.defaultPrevented,copyToken:copied.getData('application/x-board-studio').length>0,keyConsumed:key.defaultPrevented,pasteConsumed:event.defaultPrevented};
  });
  expect(result).toEqual({copyConsumed:true,copyToken:true,keyConsumed:false,pasteConsumed:true});
  await expect.poll(()=>page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.type==='image').length)).toBe(1);
  const pasted=await page.evaluate(()=>{const b=window.__board,w=[...b.state.widgets.values()].find(w=>w.type==='image');return {count:b.state.widgets.size,naturalWidth:w.naturalWidth,naturalHeight:w.naturalHeight,center:{x:w.x+w.width/2,y:w.y+w.height/2},camera:{x:b.camera.x,y:b.camera.y},selected:[...b.state.selection]};});
  expect(pasted.count).toBe(2);expect(pasted.naturalWidth).toBe(240);expect(pasted.naturalHeight).toBe(120);expect(pasted.center).toEqual(pasted.camera);expect(pasted.selected).toHaveLength(1);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
  await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(2);
});

test('app copy/paste still duplicates objects while unrelated external text leaves the stale snapshot alone',async({page})=>{
  await blank(page);await fixture(page);
  const result=await page.evaluate(()=>{
    const data=new DataTransfer();document.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));
    const paste=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(paste);
    const b=window.__board,copy=[...b.state.widgets.values()].find(w=>w.id!=='original'),external=new DataTransfer();external.setData('text/plain','Texto copiado em outro aplicativo');
    const textPaste=new ClipboardEvent('paste',{clipboardData:external,bubbles:true,cancelable:true});document.dispatchEvent(textPaste);
    return {pasted:paste.defaultPrevented,textConsumed:textPaste.defaultPrevented,count:b.state.widgets.size,dx:copy.x-b.state.widgets.get('original').x,dy:copy.y-b.state.widgets.get('original').y,content:copy.content};
  });
  expect(result).toEqual({pasted:true,textConsumed:false,count:2,dx:24,dy:24,content:'Objeto copiado'});
});

test('HTML embedded images paste once and a blocked external image gives an actionable message',async({page})=>{
  await blank(page);
  const dataUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=140;c.height=80;c.getContext('2d').fillRect(0,0,140,80);return c.toDataURL();});
  await page.evaluate(dataUrl=>{const data=new DataTransfer();data.setData('text/html',`<html><body><img src="${dataUrl}"><img src="${dataUrl}"></body></html>`);document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},dataUrl);
  await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
  await page.route('https://blocked-image.test/photo.png',route=>route.abort('accessdenied'));
  await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/html','<img src="https://blocked-image.test/photo.png">');document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await expect(page.getByRole('status').filter({hasText:'Não foi possível colar a imagem'})).toBeVisible();
  expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
});

test('paste stays native in fields and uses the inline text editor without creating board images',async({page})=>{
  await blank(page);await fixture(page);
  const input=page.getByRole('textbox',{name:'Nome do board',exact:true});await input.focus();
  const field=await input.evaluate(element=>{const data=new DataTransfer();data.setData('text/html','<img src="data:image/png;base64,invalid">');const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});element.dispatchEvent(event);return event.defaultPrevented;});
  expect(field).toBe(false);
  await page.locator('#app canvas').dblclick({position:{x:725,y:500}});await expect(page.locator('#inline-editor')).toBeVisible();
  await page.locator('#inline-editor').evaluate(element=>{const data=new DataTransfer();data.setData('text/plain','Texto colado');data.setData('text/html','<img src="data:image/png;base64,invalid">');element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await expect(page.locator('#inline-editor')).toHaveText('Texto colado');
  expect(await page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.type==='image').length)).toBe(0);
});
