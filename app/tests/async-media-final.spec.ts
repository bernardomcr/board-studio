// These tests use real board navigation; delayed decoding/fetching controls only
// when the browser finishes the selected media, never the destination identity.
// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function create(page,title){
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});
  await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill(title);
  await dialog.getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Nome do board',exact:true})).toHaveText(title);
  await page.waitForFunction(()=>location.hash.startsWith('#board/'));
}
async function blank(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await create(page,'Origem');
}
async function another(page){
  await page.getByRole('button',{name:'Início',exact:true}).click();
  await expect(page.locator('#board-home')).toBeVisible();
  await create(page,'Destino');
}
async function reopenOrigin(page){
  await page.getByRole('button',{name:'Início',exact:true}).click();
  await page.getByRole('button',{name:'Abrir Origem',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
  await expect(page.getByRole('textbox',{name:'Nome do board',exact:true})).toHaveText('Origem');
}
async function image(page,width=120,height=60){
  const src=await page.evaluate(({width,height})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').fillRect(0,0,width,height);return canvas.toDataURL();
  },{width,height});
  return {src,file:{name:'imagem.png',mimeType:'image/png',buffer:Buffer.from(src.split(',')[1],'base64')}};
}
async function choose(page,button,file){
  const chooser=page.waitForEvent('filechooser');await button.click();
  await(await chooser).setFiles(file);
}
async function imported(page){
  const media=await image(page);
  await choose(page,page.locator('[data-tool="image"]'),media.file);
  await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
  return await page.evaluate(()=>[...window.__board.state.widgets.values()][0]);
}
async function snapshot(page){return await page.evaluate(()=>{
  const b=window.__board,s=b.state;
  return JSON.stringify({widgets:[...s.widgets],order:s.order,connectors:[...s.connectors],connectorOrder:s.connectorOrder,strokes:[...s.strokes],strokeOrder:s.strokeOrder,groups:[...s.groups],selection:[...s.selection],background:s.background,camera:{x:b.camera.x,y:b.camera.y,scale:b.camera.scale},title:document.getElementById('board-title').textContent,undo:b.bus.undoStack.length,redo:b.bus.redoStack.length});
});}
async function delayDecode(page,src){
  await page.evaluate(src=>{
    const original=HTMLImageElement.prototype.decode;
    window.__mediaGate={started:false};
    HTMLImageElement.prototype.decode=async function(){
      if(this.src!==src)return original.call(this);
      HTMLImageElement.prototype.decode=original;
      await original.call(this);window.__mediaGate.started=true;
      await new Promise(resolve=>window.__mediaGate.release=resolve);
    };
  },src);
}
async function decoding(page){await page.waitForFunction(()=>window.__mediaGate?.started);}
async function releaseDecode(page){
  await page.evaluate(async()=>{
    window.__mediaGate.release();
    // Drain the import's promise continuation and the following render turn.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}
async function pasteFile(page,src){
  await page.evaluate(src=>{
    const bytes=Uint8Array.from(atob(src.split(',')[1]),character=>character.charCodeAt(0));
    const data=new DataTransfer();data.items.add(new File([bytes],'colada.png',{type:'image/png'}));
    document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  },src);
}

for(const returnToOrigin of [false,true])test(`HTML image paste is cancelled after pending fetch ${returnToOrigin?'returns to the original board':'opens another board'}, and a fresh paste remains undoable`,async({page})=>{
  await blank(page);const media=await image(page);let releaseFetch,hold=true;
  await page.route('https://async-images.test/photo.png',async route=>{
    if(hold)await new Promise(resolve=>releaseFetch=resolve);
    await route.fulfill({body:media.file.buffer,contentType:'image/png',headers:{'access-control-allow-origin':'*'}});
  });
  const paste=()=>page.evaluate(()=>{
    const data=new DataTransfer();data.setData('text/html','<img src="https://async-images.test/photo.png">');
    const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(await paste()).toBe(true);await expect.poll(()=>!!releaseFetch).toBe(true);
  await another(page);if(returnToOrigin)await reopenOrigin(page);
  const before=await snapshot(page);hold=false;releaseFetch();
  await expect(page.getByRole('status').filter({hasText:'O tópico ou o board mudou'})).toBeVisible();
  expect(await snapshot(page)).toBe(before);
  if(!returnToOrigin)await reopenOrigin(page);
  expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(0);
  await paste();await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(0);
  await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
});

for(const source of ['toolbar','native paste'])test(`${source} image import cannot follow a pending decode into another board`,async({page})=>{
  await blank(page);const media=await image(page);await delayDecode(page,media.src);
  if(source==='toolbar')await choose(page,page.locator('[data-tool="image"]'),media.file);
  else await pasteFile(page,media.src);
  await decoding(page);await another(page);const before=await snapshot(page);
  await releaseDecode(page);
  await expect(page.getByRole('status').filter({hasText:'O tópico ou o board mudou'})).toBeVisible();
  expect(await snapshot(page)).toBe(before);
  await reopenOrigin(page);expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(0);
});

test('background import cannot replace another board background after a pending decode',async({page})=>{
  await blank(page);const media=await image(page);await delayDecode(page,media.src);
  await page.getByRole('button',{name:'Fundo do board',exact:true}).click();
  await choose(page,page.getByRole('button',{name:'Usar imagem como fundo',exact:true}),media.file);
  await decoding(page);await another(page);const before=await snapshot(page);
  await releaseDecode(page);expect(await snapshot(page)).toBe(before);
  await page.getByRole('button',{name:'Fundo do board',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'O board mudou'})).toBeVisible();
  await reopenOrigin(page);expect(await page.evaluate(()=>window.__board.state.background.image)).toBeUndefined();
});

test('crop apply cannot change an image locked while the crop dialog was open',async({page})=>{
  await blank(page);const original=await imported(page);
  await page.getByRole('button',{name:'Recortar',exact:true}).click();
  const crop=page.getByRole('dialog',{name:'Recortar imagem',exact:true});
  await crop.getByRole('button',{name:'1:1',exact:true}).click();
  await page.evaluate(id=>window.__board.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{locked:true}}}),original.id);
  const before=await snapshot(page);await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
  await expect(crop).toHaveCount(0);expect(await snapshot(page)).toBe(before);
});

test('crop apply cannot change a same-ID image after real hash navigation to another board',async({page})=>{
  await blank(page);const original=await imported(page);await another(page);
  await page.evaluate(original=>window.__board.bus.exec({op:'WIDGET_CREATE',payload:original}),original);
  const destinationHash=new URL(page.url()).hash;await reopenOrigin(page);
  await page.evaluate(id=>window.__board.bus.exec({op:'SELECTION_SET',payload:[id]}),original.id);
  await page.getByRole('button',{name:'Recortar',exact:true}).click();
  const crop=page.getByRole('dialog',{name:'Recortar imagem',exact:true});
  await crop.getByRole('button',{name:'1:1',exact:true}).click();
  // Use the production hashchange navigation, leaving the original modal alive.
  await page.evaluate(hash=>location.hash=hash,destinationHash);
  await expect(page.getByRole('textbox',{name:'Nome do board',exact:true})).toHaveText('Destino');
  const before=await snapshot(page);await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).click();
  await expect(crop).toHaveCount(0);expect(await snapshot(page)).toBe(before);
});

test('mind image import cannot attach or leave an orphan after its parent becomes locked during decoding',async({page})=>{
  await blank(page);
  const parent=await page.evaluate(async()=>{
    const b=window.__board,{createMindMap}=await import('/src/core/mindmap.ts');
    const id=createMindMap(b.state,b.bus,{x:0,y:0},'Destino da imagem');
    b.bus.exec({op:'SELECTION_SET',payload:[id]});return id;
  });
  const media=await image(page);await delayDecode(page,media.src);
  await choose(page,page.getByRole('button',{name:'Imagem no tópico',exact:true}),media.file);
  await decoding(page);
  await page.evaluate(id=>window.__board.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{locked:true}}}),parent);
  const before=await snapshot(page);await releaseDecode(page);
  await expect(page.getByRole('status').filter({hasText:'O tópico ou o board mudou'})).toBeVisible();
  expect(await snapshot(page)).toBe(before);
});

test('project file read cannot replace a different board opened while the file was pending',async({page})=>{
  await blank(page);await imported(page);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Salvar arquivo',exact:true}).click();
  const project=await readFile(await(await download).path());
  await page.evaluate(()=>{
    const original=File.prototype.text;window.__mediaGate={started:false};
    File.prototype.text=async function(){
      if(this.name!=='delayed.board.json')return original.call(this);
      File.prototype.text=original;const content=await original.call(this);
      window.__mediaGate.started=true;
      await new Promise(resolve=>window.__mediaGate.release=resolve);return content;
    };
  });
  await choose(page,page.getByRole('button',{name:'Abrir arquivo',exact:true}),{name:'delayed.board.json',mimeType:'application/json',buffer:project});
  await decoding(page);await another(page);
  await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts');
    b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:75,y:40,width:130,height:90,content:'Preservar destino'}),id:'destination'}});
  });
  const before=await snapshot(page);await releaseDecode(page);
  await expect(page.getByRole('status').filter({hasText:'O board mudou. Abra o arquivo novamente'})).toBeVisible();
  expect(await snapshot(page)).toBe(before);
  await reopenOrigin(page);expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
});
