// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page,name='Recorte no quadro'){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});
 await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill(name);await dialog.getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();await expect(dialog).toHaveCount(0);
}
async function image(page,zoom=1){
 await page.evaluate(zoom=>{const b=window.__board;b.camera.x=23000;b.camera.y=-17900;b.camera.scale=zoom;},zoom);
 const src=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=480;c.height=240;const g=c.getContext('2d');g.fillStyle='#d34456';g.fillRect(0,0,160,240);g.fillStyle='#e4c76b';g.fillRect(160,0,160,240);g.fillStyle='#2e93bb';g.fillRect(320,0,160,240);return c.toDataURL('image/png');});
 const chooser=page.waitForEvent('filechooser');await page.locator('#toolbar [data-tool="image"]').click();await(await chooser).setFiles({name:'faixas.png',mimeType:'image/png',buffer:Buffer.from(src.split(',')[1],'base64')});
 await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);return page.evaluate(()=>structuredClone([...window.__board.state.widgets.values()][0]));
}
const current=page=>page.evaluate(()=>structuredClone([...window.__board.state.widgets.values()][0]));
async function open(page,preset='free'){
 await page.getByRole('button',{name:'Recortar',exact:true}).click();const editor=page.getByRole('region',{name:'Recortar imagem no quadro',exact:true});await expect(editor).toBeVisible();
 await expect(page.getByRole('dialog',{name:'Recortar imagem',exact:true})).toHaveCount(0);await editor.getByRole('combobox',{name:'Formato do recorte',exact:true}).selectOption(preset);return editor;
}
const draft=editor=>editor.locator('[data-image-crop-frame]').evaluate(element=>({frame:JSON.parse(element.dataset.frame),crop:JSON.parse(element.dataset.crop),mask:element.dataset.mask}));
async function drag(page,from,to){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();}

for(const zoom of [.02,1,20])test(`inline crop at ${zoom*100}% moves pixels inside a fixed frame and has one persistent undo action`,async({page})=>{
 await blank(page);const original=await image(page,zoom),before=await page.evaluate(()=>({undo:window.__board.bus.undoStack.length,camera:{x:window.__board.camera.x,y:window.__board.camera.y,scale:window.__board.camera.scale}}));
 const editor=await open(page,'square'),initial=await draft(editor),box=await editor.locator('[data-image-crop-frame]').boundingBox();
 expect(initial.frame.width/initial.frame.height).toBeCloseTo(1,10);expect(initial.crop).toEqual({x:.25,y:0,width:.5,height:1});
 await drag(page,{x:box.x+box.width/2,y:box.y+box.height/2},{x:box.x+box.width/2+40,y:box.y+box.height/2});
 const moved=await draft(editor);expect(moved.frame).toEqual(initial.frame);expect(moved.crop.x).toBeCloseTo(.25-40/480,8);expect(await current(page)).toEqual(original);
 if(zoom===1)await page.screenshot({path:'../work/v16-inline-crop.png'});
 await page.keyboard.press('Enter');await expect(editor).toHaveCount(0);const applied=await current(page);
 expect(applied.src).toBe(original.src);expect(applied.crop).toEqual(moved.crop);for(const key of ['x','y','width','height','rotation'])expect(applied[key]).toBe(moved.frame[key]);
 expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(before.undo+1);expect(await page.evaluate(()=>({x:window.__board.camera.x,y:window.__board.camera.y,scale:window.__board.camera.scale}))).toEqual(before.camera);
 await page.keyboard.press('Control+z');expect(await current(page)).toEqual(original);await page.keyboard.press('Control+Shift+z');expect(await current(page)).toEqual(applied);
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await current(page)).toEqual(applied);await expect(page.locator('#image-crop-editor')).toHaveCount(0);
});

test('circle crop and rotated flipped handles preserve the source position while resizing on the board',async({page})=>{
 await blank(page);await image(page);await page.evaluate(()=>{const b=window.__board,id=[...b.state.selection][0];b.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{height:300,rotation:Math.PI/5,flipX:true,flipY:true}}});});
 const original=await current(page),editor=await open(page,'circle'),before=await draft(editor);
 expect(before.mask).toBe('ellipse');expect(before.frame.width).toBeCloseTo(before.frame.height,8);
 const handle=editor.locator('[data-crop-handle="e"]');await expect(handle).toHaveCSS('cursor','se-resize');const grip=await handle.boundingBox(),delta={x:-40*Math.cos(original.rotation),y:-40*Math.sin(original.rotation)};
 await drag(page,{x:grip.x+grip.width/2,y:grip.y+grip.height/2},{x:grip.x+grip.width/2+delta.x,y:grip.y+grip.height/2+delta.y});
 const after=await draft(editor);expect(after.frame.width).toBeLessThan(before.frame.width);expect(after.frame.width).toBeCloseTo(after.frame.height,7);
 await editor.getByRole('button',{name:'Aplicar recorte',exact:true}).click();const applied=await current(page);expect(applied.maskShape).toBe('ellipse');expect(applied.flipX).toBe(true);expect(applied.flipY).toBe(true);expect(applied.src).toBe(original.src);
 const sourcePoint={x:applied.crop.x+applied.crop.width/2,y:applied.crop.y+applied.crop.height/2};
 const position=(w,p)=>{const c=w.crop??{x:0,y:0,width:1,height:1};let x=(p.x-c.x)*w.width/c.width,y=(p.y-c.y)*w.height/c.height;if(w.flipX)x=w.width-x;if(w.flipY)y=w.height-y;x-=w.width/2;y-=w.height/2;return {x:w.x+w.width/2+x*Math.cos(w.rotation)-y*Math.sin(w.rotation),y:w.y+w.height/2+x*Math.sin(w.rotation)+y*Math.cos(w.rotation)};};
 const oldPoint=position(original,sourcePoint),newPoint=position(applied,sourcePoint);expect(newPoint.x).toBeCloseTo(oldPoint.x,7);expect(newPoint.y).toBeCloseTo(oldPoint.y,7);
 await page.keyboard.press('Control+z');expect(await current(page)).toEqual(original);
});

test('free crop handles and Original can recover source pixels without a modal',async({page})=>{
 await blank(page);const original=await image(page);let editor=await open(page),grip=await editor.locator('[data-crop-handle="se"]').boundingBox();
 await drag(page,{x:grip.x+grip.width/2,y:grip.y+grip.height/2},{x:grip.x+grip.width/2-120,y:grip.y+grip.height/2-100});
 const changed=await draft(editor);expect(changed.crop.width).toBeCloseTo(.75,8);expect(changed.crop.height).toBeCloseTo(140/240,8);await page.keyboard.press('Enter');expect((await current(page)).crop).toEqual(changed.crop);
 editor=await open(page,'original');await page.keyboard.press('Enter');const restored=await current(page);expect(restored.crop).toEqual({x:0,y:0,width:1,height:1});for(const key of ['x','y','width','height'])expect(restored[key]).toBeCloseTo(original[key],8);expect(restored.src).toBe(original.src);
});

test('Escape, outside actions and a changed image discard the draft and leave history intact',async({page})=>{
 await blank(page);const original=await image(page),history=await page.evaluate(()=>window.__board.bus.undoStack.length);
 await open(page);await page.keyboard.press('Enter');expect(await current(page)).toEqual(original);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(history);
 let editor=await open(page,'portrait');await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);expect(await current(page)).toEqual(original);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(history);
 editor=await open(page,'circle');const title=page.getByRole('textbox',{name:'Nome do board',exact:true});await title.click();await expect(editor).toHaveCount(0);await expect(title).toBeFocused();expect(await current(page)).toEqual(original);
 editor=await open(page,'circle');await page.getByRole('button',{name:'Início',exact:true}).click();await expect(editor).toHaveCount(0);await expect(page.locator('#board-home')).toBeVisible();await page.getByRole('button',{name:'Abrir Recorte no quadro',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();expect(await current(page)).toEqual(original);
 editor=await open(page,'landscape');await page.evaluate(()=>{const b=window.__board,id=[...b.state.selection][0],w=b.state.widgets.get(id);b.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{x:w.x+5}}});});await expect(editor).toHaveCount(0);const changed=await current(page);expect(changed.x).toBe(original.x+5);expect(changed.crop).toBe(original.crop);expect(await page.locator('body').evaluate(element=>element.classList.contains('image-cropping'))).toBe(false);
});

test('crop projection follows wheel zoom and masks can be selected through the single crop control',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:1280,height:900},deviceScaleFactor:2}),page=await context.newPage();try{
  await blank(page);const original=await image(page),editor=await open(page,'rounded');await expect(page.locator('#selection-properties [data-menu="image"]')).toHaveCount(0);
  const box=await editor.locator('[data-image-crop-frame]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-150);
  await expect.poll(()=>page.evaluate(()=>window.__board.camera.scale)).not.toBe(1);await expect.poll(async()=>{const b=await editor.locator('[data-image-crop-frame]').boundingBox(),s=await page.evaluate(()=>window.__board.camera.scale);return Math.abs(b.width-original.width*s);}).toBeLessThan(.1);
  await page.keyboard.press('Enter');expect((await current(page)).maskShape).toBe('round_rectangle');expect((await current(page)).src).toBe(original.src);
 }finally{await context.close();}
});

test('internal object paste and native image paste cannot mutate an active crop draft',async({page})=>{
 await blank(page);const original=await image(page),token=await page.evaluate(()=>{const data=new DataTransfer(),event=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(event);return data.getData('application/x-board-studio');});expect(token).not.toBe('');
 const editor=await open(page,'circle');await editor.getByRole('button',{name:'Aplicar recorte',exact:true}).focus();
 const before=await page.evaluate(()=>({widgets:structuredClone([...window.__board.state.widgets]),selection:[...window.__board.state.selection],undo:window.__board.bus.undoStack.length}));
 const result=await page.evaluate(({token,src})=>{
  const button=document.querySelector('[data-crop-apply]'),data=new DataTransfer();data.setData('application/x-board-studio',token);button.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  const copied=new DataTransfer(),copy=new ClipboardEvent('copy',{clipboardData:copied,bubbles:true,cancelable:true});button.dispatchEvent(copy);
  const native=new DataTransfer(),bytes=Uint8Array.from(atob(src.split(',')[1]),char=>char.charCodeAt(0));native.items.add(new File([bytes],'recorte.png',{type:'image/png'}));const paste=new ClipboardEvent('paste',{clipboardData:native,bubbles:true,cancelable:true});button.dispatchEvent(paste);
  return {copiedToken:copied.getData('application/x-board-studio'),nativePrevented:paste.defaultPrevented};
 },{token,src:original.src});expect(result.copiedToken).toBe('');expect(result.nativePrevented).toBe(true);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(editor).toBeVisible();expect(await page.evaluate(()=>({widgets:[...window.__board.state.widgets],selection:[...window.__board.state.selection],undo:window.__board.bus.undoStack.length}))).toEqual(before);
 await page.keyboard.press('Escape');await page.evaluate(token=>{const data=new DataTransfer();data.setData('application/x-board-studio',token);document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},token);
 expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(2);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(before.undo+1);
});

for(const sourceWidth of [4096,16384])test(`one-pixel crop from a ${sourceWidth}px source agrees in draft, canvas and SVG`,async({page})=>{
 await blank(page);const src=await page.evaluate(width=>{const c=document.createElement('canvas');c.width=width;c.height=32;const g=c.getContext('2d');g.fillStyle='#1234df';g.fillRect(0,0,width,32);g.fillStyle='#00ff00';g.fillRect(width/2,16,1,1);return c.toDataURL('image/png');},sourceWidth);
 const chooser=page.waitForEvent('filechooser');await page.locator('#toolbar [data-tool="image"]').click();await(await chooser).setFiles({name:'pixel-verde.png',mimeType:'image/png',buffer:Buffer.from(src.split(',')[1],'base64')});await expect.poll(()=>page.evaluate(()=>window.__board.state.widgets.size)).toBe(1);
 await page.evaluate(()=>{const b=window.__board,id=[...b.state.selection][0];b.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{x:b.camera.x-260,y:b.camera.y-260,width:520,height:520}}});});
 const editor=await open(page),frame=await editor.locator('[data-image-crop-frame]').boundingBox(),nw=await editor.locator('[data-crop-handle="nw"]').boundingBox();
 await drag(page,{x:nw.x+nw.width/2,y:nw.y+nw.height/2},{x:frame.x+260,y:frame.y+260});const se=await editor.locator('[data-crop-handle="se"]').boundingBox();await drag(page,{x:se.x+se.width/2,y:se.y+se.height/2},{x:frame.x+220,y:frame.y+220});
 const tiny=await draft(editor);expect(tiny.crop.x).toBe(.5);expect(tiny.crop.y).toBe(.5);expect(tiny.crop.width).toBeCloseTo(1/sourceWidth,12);expect(tiny.crop.height).toBeCloseTo(1/32,12);expect(parseFloat(await editor.locator('.image-crop-picture').evaluate(img=>img.style.width))).toBeCloseTo(520,8);
 await page.keyboard.press('Enter');expect((await current(page)).crop).toEqual(tiny.crop);
 // Magnify the retained pixel so the visible center distinguishes it from its
 // blue neighbors. A denominator floor samples several source pixels instead.
 await page.evaluate(()=>{const b=window.__board,id=[...b.state.selection][0];b.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{x:b.camera.x-40,y:b.camera.y-40,width:80,height:80}}});b.bus.exec({op:'SELECTION_SET',payload:[]});});
 await page.waitForFunction(width=>{const walk=node=>node.texture?.width===width||(node.children??[]).some(walk);return walk(window.__board.app.stage);},sourceWidth);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const actual=await page.evaluate(async()=>{
  const b=window.__board,w=[...b.state.widgets.values()][0];let widget;const visit=node=>{if(node.label===w.id)widget=node;for(const child of node.children??[])visit(child);};visit(b.app.stage);const sprite=widget.children.flatMap(node=>node.children??[]).find(node=>node.texture);
  const Rectangle=b.app.screen.constructor,read=b.app.renderer.extract.pixels({target:b.app.stage,frame:new Rectangle(b.camera.width/2-40,b.camera.height/2-40,80,80),resolution:1,antialias:true}),stride=read.width??80,offset=(40*stride+40)*4,canvasPixel=Array.from(read.pixels.slice(offset,offset+4));
  const {boardToSvg}=await import('/src/core/exportSvg.ts'),svg=boardToSvg(b.state,{padding:0,background:'none'}),doc=new DOMParser().parseFromString(svg,'image/svg+xml'),svgSource=doc.querySelector('image'),asset=new Image();asset.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await asset.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=80;canvas.getContext('2d').drawImage(asset,0,0,80,80);const svgPixel=Array.from(canvas.getContext('2d').getImageData(40,40,1,1).data);
  return {spriteWidth:sprite.width,spriteHeight:sprite.height,svgWidth:Number(svgSource.getAttribute('width')),svgHeight:Number(svgSource.getAttribute('height')),canvasPixel,svgPixel,src:w.src};
 });
 expect(actual.spriteWidth).toBeCloseTo(80*sourceWidth,5);expect(actual.svgWidth).toBeCloseTo(actual.spriteWidth,5);expect(actual.spriteHeight).toBe(2560);expect(actual.svgHeight).toBe(2560);expect(actual.src).toBe(src);
 for(const pixel of [actual.canvasPixel,actual.svgPixel]){expect(pixel[1]).toBeGreaterThan(200);expect(pixel[0]).toBeLessThan(60);expect(pixel[2]).toBeLessThan(60);expect(pixel[3]).toBe(255);}
});
