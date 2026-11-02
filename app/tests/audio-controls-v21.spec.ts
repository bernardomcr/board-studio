// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function wav(){
 const rate=8000,count=2000,buffer=Buffer.alloc(44+count*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)buffer.writeInt16LE(Math.round(Math.sin(i*Math.PI*440/rate)*9000),44+i*2);
 return buffer;
}
async function fixture(page,options={}){
 const src='data:audio/wav;base64,'+wav().toString('base64');
 const id=await page.evaluate(async({src,options})=>{
  const b=window.__board,{createAudioWidget}=await import('/src/core/audio.ts'),w=createAudioWidget({src,mime:'audio/wav',name:'Mensagem de teste.wav',duration:.25,waveform:Array(64).fill(.8)},{x:0,y:0});
  const factor=options.factor??1;w.width*=factor;w.height*=factor;w.x=-w.width/2;w.y=-w.height/2;w.rotation=options.rotation??0;w.style={...w.style,fillColor:'#ffffff',color:'#23569a'};
  b.bus.exec({op:'WIDGET_CREATE',payload:w});b.bus.exec({op:'SELECTION_SET',payload:options.selected===false?[]:[w.id]});
  b.camera.scale=options.zoom??1;b.camera.x=0;b.camera.y=0;return w.id;
 },{src,options});
 await settle(page);return id;
}
async function current(page,id){return page.evaluate(id=>structuredClone(window.__board.state.widgets.get(id)),id);}
async function menu(page,id){const item=page.locator(`#selection-properties details[data-menu="${id}"]`);if(!await item.evaluate(el=>el.open))await item.locator(':scope > summary').click();return item;}
async function importAudio(page,count){
 await page.getByRole('button',{name:'Áudio',exact:true}).click();const chooser=page.waitForEvent('filechooser');
 await page.getByRole('menuitem',{name:'Importar áudio',exact:true}).click();await(await chooser).setFiles({name:'Nova mensagem.wav',mimeType:'audio/wav',buffer:wav()});
 await expect.poll(()=>page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.audio).length)).toBe(count);
 return page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.audio).at(-1).id);
}
async function colors(page,id){
 return page.evaluate(async id=>{
  const b=window.__board,w=b.state.widgets.get(id),{audioCardLayout}=await import('/src/render/audio-paint.ts'),l=audioCardLayout(w),R=b.app.screen.constructor;
  b.app.renderer.render({container:b.app.stage});
  const sample=(x,y)=>{const p=b.camera.worldToScreen({x:w.x+x,y:w.y+y});return [...b.app.renderer.extract.pixels({target:b.app.stage,frame:new R(Math.floor(p.x),Math.floor(p.y),1,1),resolution:1}).pixels];};
  const find=node=>node.label===id?node:node.children?.map(find).find(Boolean),node=find(b.app.stage),overlay=document.querySelector(`[data-audio-id="${id}"]`);
  return {wave:sample(l.waveX+l.waveWidth/64*32+l.waveWidth/64*.24,l.waveY),play:sample(l.playX,l.playY),labels:node.children[1].children.map(text=>String(text.style.fill)),button:getComputedStyle(overlay.querySelector('[data-audio-play]')).color,playhead:getComputedStyle(overlay.querySelector('.audio-playhead')).backgroundColor,seek:getComputedStyle(overlay.querySelector('input')).accentColor,camera:{x:b.camera.x,y:b.camera.y,scale:b.camera.scale}};
 },id);
}

test('foreground recolors the actual wave, play, text and playback controls on the next frame, including undo and redo',async({page})=>{
 await blank(page);const id=await fixture(page),before=await colors(page,id);
 expect(before.wave[2]).toBeGreaterThan(before.wave[0]);expect(before.play[2]).toBeGreaterThan(before.play[0]);
 await menu(page,'audio-ink');await page.getByRole('button',{name:'Cor do player: vermelho',exact:true}).click();await page.keyboard.press('Escape');await settle(page);
 const red=await colors(page,id);expect(red.camera).toEqual(before.camera);expect(red.wave[0]).toBeGreaterThan(red.wave[2]+35);expect(red.play[0]).toBeGreaterThan(red.play[2]+70);
 expect(red.labels).toEqual(['#f66060','#f66060']);expect(red.button).toBe('rgb(246, 96, 96)');expect(red.playhead).toBe(red.button);expect(red.seek).toBe(red.button);
 await page.keyboard.press('Control+z');await settle(page);const undone=await colors(page,id);expect(undone.wave).toEqual(before.wave);expect(undone.play).toEqual(before.play);expect(undone.button).toBe(before.button);
 await page.keyboard.press('Control+Shift+z');await settle(page);const redone=await colors(page,id);expect(redone.wave).toEqual(red.wave);expect(redone.play).toEqual(red.play);expect(redone.labels).toEqual(red.labels);expect(redone.camera).toEqual(before.camera);
});

test('one remembered foreground and background style applies to future audio imports after reopening the board',async({page})=>{
 await blank(page);const id=await fixture(page);
 await menu(page,'fill');await page.getByRole('button',{name:'Cor de preenchimento: azul claro',exact:true}).click();
 await menu(page,'audio-ink');await page.getByRole('button',{name:'Cor do player: vermelho escuro',exact:true}).click();await page.keyboard.press('Escape');
 const styled=await current(page,id),next=await importAudio(page,2),second=await current(page,next);
 expect(second.style.fillColor).toBe(styled.style.fillColor);expect(second.style.color).toBe(styled.style.color);expect(second.width/second.height).toBeCloseTo(360/124,10);
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
 const last=await importAudio(page,3),reopened=await current(page,last);expect(reopened.style.fillColor).toBe(styled.style.fillColor);expect(reopened.style.color).toBe(styled.style.color);
 await settle(page);const actual=await colors(page,last);expect(actual.button).toBe('rgb(198, 40, 40)');expect(actual.playhead).toBe(actual.button);
});

test('all eight rotated audio resize handles preserve the player proportion and opposite anchor in one undo step',async({page})=>{
 await blank(page);const id=await fixture(page,{rotation:.31}),original=await current(page,id),opposite={n:'s',ne:'sw',e:'w',se:'nw',s:'n',sw:'ne',w:'e',nw:'se'};
 for(const handle of ['n','ne','e','se','s','sw','w','nw']){
  const gesture=await page.evaluate(({id,handle,opposite})=>{const b=window.__board,w=b.state.widgets.get(id),a=b.geom.handleWorld(w,opposite),p=b.geom.handleWorld(w,handle),target={x:a.x+(p.x-a.x)*1.45,y:a.y+(p.y-a.y)*1.45};return {from:b.camera.worldToScreen(p),to:b.camera.worldToScreen(target),anchor:a,undo:b.bus.undoStack.length};},{id,handle,opposite:opposite[handle]});
  await page.mouse.move(gesture.from.x,gesture.from.y);await page.mouse.down();await page.mouse.move(gesture.to.x,gesture.to.y,{steps:5});await page.mouse.up();await settle(page);
  const resized=await current(page,id);expect(resized.width,handle).toBeGreaterThan(original.width*1.3);expect(resized.width/resized.height,handle).toBeCloseTo(360/124,9);expect(resized.rotation).toBe(original.rotation);expect(resized.audio).toEqual(original.audio);
  const anchor=await page.evaluate(({id,handle})=>window.__board.geom.handleWorld(window.__board.state.widgets.get(id),handle),{id,handle:opposite[handle]});expect(anchor.x,handle).toBeCloseTo(gesture.anchor.x,7);expect(anchor.y,handle).toBeCloseTo(gesture.anchor.y,7);
  expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(gesture.undo+1);await page.keyboard.press('Control+z');await settle(page);expect(await current(page,id)).toEqual(original);
 }
});

test('anisotropic group resizing keeps audio proportional, scales its typography and exports the same geometry',async({page})=>{
 await blank(page);const id=await fixture(page),initial=await current(page,id);
 const data=await page.evaluate(async id=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{groupSelection,selectedBounds}=await import('/src/core/groups.ts'),shape=createWidget('shape',{x:220,y:-62,width:100,height:124});b.bus.exec({op:'WIDGET_CREATE',payload:shape});b.bus.exec({op:'SELECTION_SET',payload:[id,shape.id]});groupSelection(b.state,b.bus);return {shape:shape.id,bounds:selectedBounds(b.state),undo:b.bus.undoStack.length};},id);await settle(page);
 const points=await page.evaluate(bounds=>{const c=window.__board.camera;return {from:c.worldToScreen({x:bounds.maxX,y:bounds.maxY}),to:c.worldToScreen({x:bounds.minX+(bounds.maxX-bounds.minX)*1.35,y:bounds.minY+(bounds.maxY-bounds.minY)*2.15})};},data.bounds);
 await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await page.mouse.move(points.to.x,points.to.y,{steps:7});await page.mouse.up();await settle(page);
 const resized=await current(page,id),shape=await current(page,data.shape);expect(resized.width/resized.height).toBeCloseTo(360/124,9);expect(resized.width).toBeGreaterThan(initial.width);expect(shape.width/shape.height).not.toBeCloseTo(100/124,2);expect(resized.audio).toEqual(initial.audio);expect(resized.style.fontSize/initial.style.fontSize).toBeCloseTo(resized.width/initial.width,8);
 const svg=await page.evaluate(async id=>{const w=window.__board.state.widgets.get(id),{audioCardSvg,audioFontSize}=await import('/src/render/audio-paint.ts'),doc=new DOMParser().parseFromString('<svg>'+audioCardSvg(w)+'</svg>','image/svg+xml'),rect=doc.querySelector('rect');return {width:Number(rect.getAttribute('width')),height:Number(rect.getAttribute('height')),font:audioFontSize(w),sizes:[...doc.querySelectorAll('text')].map(t=>Number(t.getAttribute('font-size')))};},id);
 expect(svg.width/svg.height).toBeCloseTo(360/124,5);expect(svg.sizes[0]).toBeCloseTo(svg.font,4);expect(svg.sizes[1]).toBeCloseTo(svg.font*.75,4);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(data.undo+1);
 await page.keyboard.press('Control+z');expect(await current(page,id)).toEqual(initial);
});

async function putPlayBehind(page,id,target,zoom){
 const rect=await target.boundingBox(),point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
 await page.evaluate(async({id,point,zoom})=>{const b=window.__board,w=b.state.widgets.get(id),{audioCardLayout}=await import('/src/render/audio-paint.ts'),l=audioCardLayout(w);b.camera.scale=zoom;b.camera.x=w.x+l.playX-(point.x-b.camera.width/2)/zoom;b.camera.y=w.y+l.playY-(point.y-b.camera.height/2)/zoom;},{id,point,zoom});await settle(page);
 return {point,hit:await target.evaluate((el,point)=>{const hit=document.elementFromPoint(point.x,point.y);return {target:hit===el||el.contains(hit),audio:!!hit?.closest('[data-audio-id]')};},point)};
}
for(const zoom of [1,.02])test(`audio playback stays below floating chrome, background controls and menus while panning at ${zoom*100}%`,async({page})=>{
 await blank(page);const id=await fixture(page,{factor:1/zoom,zoom,selected:false}),original=await current(page,id);
 for(const control of [page.getByRole('button',{name:'Fundo do board',exact:true}),page.getByRole('button',{name:'Diminuir zoom',exact:true}),page.getByRole('button',{name:'Mais opções do board',exact:true}),page.getByRole('button',{name:'Camadas',exact:true})]){
  const {hit}=await putPlayBehind(page,id,control,zoom);expect(hit).toEqual({target:true,audio:false});
 }
 await page.getByRole('button',{name:'Mais opções do board',exact:true}).click();const save=page.getByRole('group',{name:'Opções do board',exact:true}).getByRole('button',{name:'Salvar arquivo',exact:true});expect((await putPlayBehind(page,id,save,zoom)).hit).toEqual({target:true,audio:false});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Camadas',exact:true}).click();const close=page.getByRole('button',{name:'Fechar camadas',exact:true});expect((await putPlayBehind(page,id,close,zoom)).hit).toEqual({target:true,audio:false});await close.click();
 expect(await current(page,id)).toEqual(original);
});

test('audio controls share frame clipping and disappear outside the viewport without altering the player',async({page})=>{
 await blank(page);const id=await fixture(page,{selected:false}),original=await current(page,id);
 const frameId=await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),frame=createWidget('frame',{x:-90,y:-80,width:250,height:160,title:'Recorte de áudio'});b.bus.exec({op:'WIDGET_CREATE',payload:frame});return frame.id;});await settle(page);
 const play=page.locator(`[data-audio-id="${id}"] [data-audio-play]`),rect=await play.boundingBox();
 const hit=await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('[data-audio-play]'),{x:rect.x+rect.width/2,y:rect.y+rect.height/2});expect(hit).toBe(false);
 expect(await page.locator(`[data-audio-id="${id}"]`).evaluate(el=>el.style.clipPath)).toContain('polygon');
 await page.evaluate(frameId=>window.__board.bus.exec({op:'WIDGET_REMOVE',payload:frameId}),frameId);await settle(page);await expect(play).toBeVisible();expect(await page.locator(`[data-audio-id="${id}"]`).evaluate(el=>el.style.clipPath)).toBe('');
 await page.evaluate(()=>{window.__board.camera.x=1e6;window.__board.camera.y=-1e6;});await settle(page);await expect(page.locator(`[data-audio-id="${id}"]`)).toBeHidden();
 await page.evaluate(()=>{window.__board.camera.x=0;window.__board.camera.y=0;});await settle(page);await expect(play).toBeVisible();expect(await current(page,id)).toEqual(original);
});
