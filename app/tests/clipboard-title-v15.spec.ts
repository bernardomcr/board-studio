// @ts-nocheck
import {test,expect} from '@playwright/test';

async function create(page,name){
 await page.getByRole('button',{name:'Criar board',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Criar board',exact:true});
 await dialog.getByRole('textbox',{name:'Nome do board',exact:true}).fill(name);
 await dialog.getByRole('button',{name:'Criar board',exact:true}).click();
 await expect(page.locator('#board-home')).toBeHidden();await expect(dialog).toHaveCount(0);
}
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await create(page,'Colagem A');}
async function png(page,width=1200,height=600){
 return page.evaluate(({width,height})=>{const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.fillStyle='#2689c9';g.fillRect(0,0,width,height);g.fillStyle='#ef9448';g.fillRect(width*.25,height*.25,width*.5,height*.5);return c.toDataURL('image/png');},{width,height});
}
/** ClipboardEvent dispatch does not execute the browser's default edit action.
 * Model that action only when the application leaves it unprevented, respecting
 * plaintext-only mode. No test reads or overwrites the personal OS clipboard. */
async function paste(page,{selector='#board-title',html='',text='',images=[]}={}){
 return page.evaluate(({selector,html,text,images})=>{
  const element=document.querySelector(selector),data=new DataTransfer();
  if(html)data.setData('text/html',html);if(text)data.setData('text/plain',text);
  images.forEach((src,i)=>{const bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0));data.items.add(new File([bytes],`colada-${i}.png`,{type:'image/png'}));});
  const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});element.dispatchEvent(event);
  if(!event.defaultPrevented){
   if(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement){if(text)element.setRangeText(text,element.selectionStart??0,element.selectionEnd??0,'end');}
   else if(element.isContentEditable){if(element.getAttribute('contenteditable')==='plaintext-only')document.execCommand('insertText',false,text);else if(html)document.execCommand('insertHTML',false,html);else if(text)document.execCommand('insertText',false,text);}
  }
  return {prevented:event.defaultPrevented,title:document.getElementById('board-title').textContent,titleImages:document.querySelectorAll('#board-title img').length};
 },{selector,html,text,images});
}
async function title(page){const field=page.getByRole('textbox',{name:'Nome do board',exact:true});await field.focus();return field;}
const images=page=>page.evaluate(()=>[...window.__board.state.widgets.values()].filter(w=>w.type==='image'));

test('image files pasted with the title focused become useful centered canvas objects at macro and high zoom',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:1280,height:900},deviceScaleFactor:2}),page=await context.newPage();
 try{
  await blank(page);const a=await png(page),b=await png(page,900,1200);
  for(const zoom of [.02,20]){
   const before=await page.evaluate(zoom=>{const b=window.__board;b.camera.x=23500;b.camera.y=-17900;b.camera.scale=zoom;return {center:{x:b.camera.x,y:b.camera.y},undo:b.bus.undoStack.length,viewport:{width:b.camera.width,height:b.camera.height}};},zoom);
   await title(page);const result=await paste(page,{images:[a,b],html:`<img src="${a}">`});expect(result.prevented).toBe(true);expect(result.titleImages).toBe(0);expect(result.title).toBe('Colagem A');
   await expect.poll(async()=>(await images(page)).length).toBe(2);
   const placed=await page.evaluate(()=>{const b=window.__board;return {items:[...b.state.widgets.values()].filter(w=>w.type==='image').map(w=>({id:w.id,width:w.width,height:w.height,naturalWidth:w.naturalWidth,naturalHeight:w.naturalHeight,center:{x:w.x+w.width/2,y:w.y+w.height/2},screen:b.camera.worldToScreen({x:w.x,y:w.y})})),undo:b.bus.undoStack.length,title:document.getElementById('board-title').innerHTML};});
   expect(placed.items[0].center.x).toBeCloseTo(before.center.x,6);expect(placed.items[0].center.y).toBeCloseTo(before.center.y,6);expect(placed.undo).toBe(before.undo+1);expect(placed.title).toBe('Colagem A');
   for(const image of placed.items){expect(image.width/image.height).toBeCloseTo(image.naturalWidth/image.naturalHeight,8);expect(image.width*zoom).toBeGreaterThanOrEqual(100);expect(image.width*zoom).toBeLessThan(before.viewport.width-32);expect(image.height*zoom).toBeLessThan(before.viewport.height-80);expect(image.screen.x).toBeGreaterThanOrEqual(0);expect(image.screen.y).toBeGreaterThanOrEqual(48);expect(image.screen.x+image.width*zoom).toBeLessThanOrEqual(before.viewport.width);expect(image.screen.y+image.height*zoom).toBeLessThanOrEqual(before.viewport.height);}
   await page.keyboard.press('Escape');await page.keyboard.press('Control+z');expect(await images(page)).toHaveLength(0);
   await page.keyboard.press('Control+Shift+z');expect(await images(page)).toHaveLength(2);
   const saved=(await images(page)).map(w=>({id:w.id,x:w.x,y:w.y,width:w.width,height:w.height,src:w.src}));await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect((await images(page)).map(w=>({id:w.id,x:w.x,y:w.y,width:w.width,height:w.height,src:w.src}))).toEqual(saved);expect(await page.locator('#board-title img').count()).toBe(0);
   await page.keyboard.press('Control+z');expect(await images(page)).toHaveLength(0);
  }
 }finally{await context.close();}
});

test('formatted title paste stays plain text and title copy never captures the board selection',async({page})=>{
 await blank(page);await title(page);await page.evaluate(()=>{const field=document.getElementById('board-title'),range=document.createRange();range.selectNodeContents(field);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
 await paste(page,{text:'Projeto sem formatação',html:'<div><b>Projeto</b> <i>sem formatação</i><script>window.__titleScriptExecuted=true</script></div>'});
 await expect(page.locator('#board-title')).toHaveText('Projeto sem formatação');expect(await page.locator('#board-title').evaluate(el=>el.childElementCount)).toBe(0);expect(await page.evaluate(()=>!!window.__titleScriptExecuted)).toBe(false);expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(0);
 const copy=await page.evaluate(()=>{const field=document.getElementById('board-title'),range=document.createRange();range.selectNodeContents(field);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);const data=new DataTransfer(),event=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});field.dispatchEvent(event);return {prevented:event.defaultPrevented,token:data.getData('application/x-board-studio'),selected:selection.toString()};});
 expect(copy).toEqual({prevented:false,token:'',selected:'Projeto sem formatação'});
 await page.locator('#app canvas').click({position:{x:1000,y:800}});await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);await expect(page.locator('#board-title')).toHaveText('Projeto sem formatação');
});

test('other native fields and the inline text editor keep their existing paste behavior',async({page})=>{
 await blank(page);const media=await png(page,60,30);await page.evaluate(()=>{const input=document.createElement('input');input.id='ordinary-paste-field';input.value='Campo seguro';input.style.cssText='position:fixed;left:500px;top:150px;z-index:90';document.body.append(input);input.focus();});
 const result=await paste(page,{selector:'#ordinary-paste-field',images:[media],html:`<img src="${media}">`});expect(result.prevented).toBe(false);await expect(page.locator('#ordinary-paste-field')).toHaveValue('Campo seguro');expect(await images(page)).toHaveLength(0);
 const point=await page.evaluate(async()=>{document.getElementById('ordinary-paste-field').remove();const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:-120,y:-40,content:'Texto original'}),id:'editable'}});const w=b.state.widgets.get('editable');return b.camera.worldToScreen({x:w.x+w.width/2,y:w.y+w.height/2});});
 await page.mouse.dblclick(point.x,point.y);await expect(page.locator('#inline-editor')).toBeVisible();const inline=await paste(page,{selector:'#inline-editor',text:'Texto colado',images:[media],html:`<img src="${media}">`});expect(inline.prevented).toBe(true);await expect(page.locator('#inline-editor')).toHaveText('Texto colado');expect(await images(page)).toHaveLength(0);await page.locator('#inline-editor').press('Control+Enter');expect(await page.evaluate(()=>window.__board.state.widgets.get('editable').content)).toBe('Texto colado');
});

test('HTML image paste captures placement before fetching and cannot follow a later board change',async({page})=>{
 await blank(page);const media=await png(page),body=Buffer.from(media.split(',')[1],'base64');
 let releasePan,releaseStale,panSeen,staleSeen;const panGate=new Promise(resolve=>releasePan=resolve),staleGate=new Promise(resolve=>releaseStale=resolve),panRequest=new Promise(resolve=>panSeen=resolve),staleRequest=new Promise(resolve=>staleSeen=resolve);
 await page.route('https://title-images.test/pan.png',async route=>{panSeen();await panGate;await route.fulfill({body,contentType:'image/png',headers:{'access-control-allow-origin':'*'}});});
 await page.route('https://title-images.test/stale.png',async route=>{staleSeen();await staleGate;await route.fulfill({body,contentType:'image/png',headers:{'access-control-allow-origin':'*'}});});
 const before=await page.evaluate(()=>{const b=window.__board;b.camera.x=12340;b.camera.y=-8760;b.camera.scale=.1;return {x:b.camera.x,y:b.camera.y,zoom:b.camera.scale};});
 await title(page);expect((await paste(page,{html:'<img src="https://title-images.test/pan.png">'})).prevented).toBe(true);await panRequest;await page.evaluate(()=>{const b=window.__board;b.camera.x+=50000;b.camera.y-=30000;b.camera.scale=20;});releasePan();await expect.poll(async()=>(await images(page)).length).toBe(1);
 const inserted=(await images(page))[0];expect(inserted.x+inserted.width/2).toBeCloseTo(before.x,6);expect(inserted.y+inserted.height/2).toBeCloseTo(before.y,6);expect(inserted.width*before.zoom).toBeGreaterThanOrEqual(100);expect(inserted.width*before.zoom).toBeLessThan(1000);
 await title(page);expect((await paste(page,{html:'<img src="https://title-images.test/stale.png">'})).prevented).toBe(true);await staleRequest;
 await page.getByRole('button',{name:'Início',exact:true}).click();await expect(page.locator('#board-home')).toBeVisible();await create(page,'Colagem B');const response=page.waitForResponse('https://title-images.test/stale.png');releaseStale();await(await response).finished();await page.waitForTimeout(150);
 expect(await images(page)).toHaveLength(0);expect(await page.locator('#board-title img').count()).toBe(0);await expect(page.locator('#board-title')).toHaveText('Colagem B');
 await page.getByRole('button',{name:'Início',exact:true}).click();await page.getByRole('button',{name:'Abrir Colagem A',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();expect(await images(page)).toHaveLength(1);expect(await page.locator('#board-title img').count()).toBe(0);
});

test('internal image copies retain size and nearby offset but paste at the viewport center after a distant pan',async({page})=>{
 await blank(page);const src=await png(page,240,120);
 const original=await page.evaluate(async src=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');
  b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('image',{x:-120,y:-60,width:240,height:120,src,naturalWidth:240,naturalHeight:120}),id:'copied-image'}});
  b.bus.exec({op:'SELECTION_SET',payload:['copied-image']});
  const data=new DataTransfer(),event=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(event);
  return {widget:structuredClone(b.state.widgets.get('copied-image')),copied:event.defaultPrevented,token:data.getData('application/x-board-studio')};
 },src);
 expect(original.copied).toBe(true);expect(original.token).not.toBe('');
 const nearby=await page.evaluate(token=>{
  const b=window.__board,data=new DataTransfer();data.setData('application/x-board-studio',token);const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(event);
  return {prevented:event.defaultPrevented,widget:structuredClone(b.state.widgets.get([...b.state.selection][0]))};
 },original.token);
 expect(nearby.prevented).toBe(true);expect(nearby.widget.x-original.widget.x).toBe(24);expect(nearby.widget.y-original.widget.y).toBe(24);
 const distant=await page.evaluate(token=>{
  const b=window.__board;b.camera.x=1000000;b.camera.y=-900000;b.camera.scale=.02;
  const before={x:b.camera.x,y:b.camera.y,scale:b.camera.scale,undo:b.bus.undoStack.length};
  const data=new DataTransfer();data.setData('application/x-board-studio',token);const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(event);
  return {prevented:event.defaultPrevented,before,after:{x:b.camera.x,y:b.camera.y,scale:b.camera.scale,undo:b.bus.undoStack.length},widget:structuredClone(b.state.widgets.get([...b.state.selection][0]))};
 },original.token);
 expect(distant.prevented).toBe(true);expect(distant.widget.id).not.toBe(original.widget.id);expect(distant.widget.id).not.toBe(nearby.widget.id);
 expect(distant.widget.x+distant.widget.width/2).toBeCloseTo(distant.before.x,6);expect(distant.widget.y+distant.widget.height/2).toBeCloseTo(distant.before.y,6);
 for(const key of ['src','width','height','naturalWidth','naturalHeight','rotation','style'])expect(distant.widget[key]).toEqual(original.widget[key]);
 expect(distant.after).toEqual({...distant.before,undo:distant.before.undo+1});expect(await images(page)).toHaveLength(3);
 expect(await page.evaluate(()=>window.__board.state.widgets.get('copied-image'))).toEqual(original.widget);
 await page.keyboard.press('Control+z');expect(await images(page)).toHaveLength(2);
});

for(const change of ['moved','removed'])test(`native connector-only paste uses frozen external anchors after the source shapes are ${change}`,async({page})=>{
 await blank(page);
 const snapshot=await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');
  b.bus.exec({op:'BATCH',payload:{label:'Conector original',commands:[
   {op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-300,y:-100,width:100,height:100}),id:'anchor-a'}},
   {op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:100,y:100,width:100,height:100}),id:'anchor-b'}},
   {op:'CONNECTOR_CREATE',payload:{id:'frozen-connector',type:'connector',shape:'straight',start:{kind:'anchor',widgetId:'anchor-a',x:1,y:.5},end:{kind:'anchor',widgetId:'anchor-b',x:0,y:.5},style:{strokeColor:'#d64a72',strokeWidth:9,startCap:'none',endCap:'none'},z:0}},
   {op:'SELECTION_SET',payload:['frozen-connector']}
  ]}});
  const data=new DataTransfer(),copy=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(copy);
  return {copied:copy.defaultPrevented,token:data.getData('application/x-board-studio'),connector:structuredClone(b.state.connectors.get('frozen-connector')),start:{x:-200,y:-50},end:{x:100,y:150}};
 });
 expect(snapshot.copied).toBe(true);expect(snapshot.token).not.toBe('');
 const pasted=await page.evaluate(({change,token})=>{
  const b=window.__board;
  if(change==='moved')b.bus.exec({op:'BATCH',payload:{commands:['anchor-a','anchor-b'].map(id=>{const w=b.state.widgets.get(id);return {op:'WIDGET_UPDATE',payload:{id,patch:{x:w.x+1000000,y:w.y+900000}}};})}});
  else b.bus.exec({op:'BATCH',payload:{commands:['anchor-a','anchor-b'].map(id=>({op:'WIDGET_REMOVE',payload:id}))}});
  b.camera.x=change==='moved'?0:1000000;b.camera.y=change==='moved'?0:-900000;b.camera.scale=change==='moved'?1:.02;
  const before={widgets:structuredClone([...b.state.widgets]),connectors:structuredClone([...b.state.connectors]),selection:[...b.state.selection],undo:b.bus.undoStack.length,camera:{x:b.camera.x,y:b.camera.y,scale:b.camera.scale}};
  const data=new DataTransfer();data.setData('application/x-board-studio',token);const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(event);
  const id=[...b.state.selection][0],connector=structuredClone(b.state.connectors.get(id));
  return {prevented:event.defaultPrevented,before,connector,undo:b.bus.undoStack.length,camera:{x:b.camera.x,y:b.camera.y,scale:b.camera.scale}};
 },{change,token:snapshot.token});
 expect(pasted.prevented).toBe(true);expect(pasted.connector.id).not.toBe(snapshot.connector.id);expect(pasted.connector.start.kind).toBe('point');expect(pasted.connector.end.kind).toBe('point');expect(pasted.connector.style).toEqual(snapshot.connector.style);expect(pasted.connector.shape).toBe(snapshot.connector.shape);
 const delta=change==='moved'?{x:24,y:24}:{x:pasted.before.camera.x-(snapshot.start.x+snapshot.end.x)/2,y:pasted.before.camera.y-(snapshot.start.y+snapshot.end.y)/2};
 expect(pasted.connector.start).toEqual({kind:'point',x:snapshot.start.x+delta.x,y:snapshot.start.y+delta.y});expect(pasted.connector.end).toEqual({kind:'point',x:snapshot.end.x+delta.x,y:snapshot.end.y+delta.y});
 if(change==='removed'){expect((pasted.connector.start.x+pasted.connector.end.x)/2).toBe(pasted.before.camera.x);expect((pasted.connector.start.y+pasted.connector.end.y)/2).toBe(pasted.before.camera.y);}
 expect(pasted.undo).toBe(pasted.before.undo+1);expect(pasted.camera).toEqual(pasted.before.camera);
 await page.keyboard.press('Control+z');expect(await page.evaluate(()=>({widgets:[...window.__board.state.widgets],connectors:[...window.__board.state.connectors],selection:[...window.__board.state.selection]}))).toEqual({widgets:pasted.before.widgets,connectors:pasted.before.connectors,selection:pasted.before.selection});
 await page.keyboard.press('Control+Shift+z');expect(await page.evaluate(id=>window.__board.state.connectors.get(id),pasted.connector.id)).toEqual(pasted.connector);
});
