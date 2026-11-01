// @ts-nocheck
import {test,expect} from '@playwright/test';
import {nativeFling} from './helpers/native-fling';

// Visual trace readbacks stall software-GPU inertia; retain API/source evidence
// and the independent failure screenshot without perturbing the native clock.
test.use({trace:{mode:'retain-on-failure',screenshots:false,snapshots:false,sources:true}});

async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function wav(){const count=16000,buffer=Buffer.alloc(44+count*2);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);return 'data:audio/wav;base64,'+buffer.toString('base64');}
async function fixture(page){await page.evaluate(async src=>{
 const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{createAudioWidget}=await import('/src/core/audio.ts'),audio={src,mime:'audio/wav',duration:2,name:'Mensagem',waveform:Array(64).fill(.4)};
 const visible={...createAudioWidget(audio,{x:200,y:-200}),id:'visible-audio'},small={...createAudioWidget(audio,{x:-300,y:-200}),id:'small-audio',width:30,height:12},outside={...createAudioWidget(audio,{x:10000,y:10000}),id:'outside-audio'},hero={...createWidget('shape',{x:-500,y:-40,width:140,height:100,content:''}),id:'hero'};
 b.bus.exec({op:'BATCH',payload:{commands:[visible,small,outside,hero].map(w=>({op:'WIDGET_CREATE',payload:w})).concat({op:'SELECTION_SET',payload:['hero']})}});
 },wav());await settle(page);}

test('dragging unrelated objects does not rewrite retained audio overlays and keeps one exact Undo',async({page})=>{
 await blank(page);await fixture(page);
 const before=await page.evaluate(()=>{const b=window.__board;window.__audioWrites=0;const observer=new MutationObserver(entries=>window.__audioWrites+=entries.length);observer.observe(document.getElementById('audio-overlays'),{subtree:true,attributes:true,attributeFilter:['style','hidden','data-selected']});return {x:b.state.widgets.get('hero').x,y:b.state.widgets.get('hero').y,undo:b.bus.undoStack.length};});
 await page.mouse.move(365,505);await page.mouse.down();for(let i=1;i<=20;i++){await page.mouse.move(365+i,505+i);await settle(page);}await page.mouse.up();
 expect(await page.evaluate(()=>window.__audioWrites)).toBe(0);expect(await page.evaluate(()=>window.__board.bus.undoStack.length)).toBe(before.undo+1);
 expect(await page.evaluate(()=>({x:window.__board.state.widgets.get('hero').x,y:window.__board.state.widgets.get('hero').y}))).toEqual({x:before.x+20,y:before.y+20});await page.keyboard.press('Control+z');expect(await page.evaluate(()=>({x:window.__board.state.widgets.get('hero').x,y:window.__board.state.widgets.get('hero').y}))).toEqual({x:before.x,y:before.y});
 await expect(page.locator('[data-audio-id="small-audio"]')).toBeHidden();await expect(page.locator('[data-audio-id="outside-audio"]')).toBeHidden();
});

test('audio poses invalidate for camera, geometry, colors, visibility and frame ownership while playback stays live',async({page})=>{
 await blank(page);await fixture(page);const player=page.locator('[data-audio-id="visible-audio"]'),initial=await player.evaluate(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top)}));
 await page.evaluate(()=>{const b=window.__board,w=b.state.widgets.get('visible-audio');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{x:w.x+17,width:w.width*1.5,height:w.height*1.5,style:{...w.style,color:'#d53d72'}}}});});await settle(page);
 expect(await player.evaluate(el=>parseFloat(el.style.left))).toBeCloseTo(initial.left+107,6);expect(await player.evaluate(el=>el.style.getPropertyValue('--audio-ink'))).toBe('#d53d72');
 const moved=await player.evaluate(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top)}));await page.evaluate(()=>window.__board.camera.panByScreen(25,11));await settle(page);expect(await player.evaluate(el=>parseFloat(el.style.left))).toBeCloseTo(moved.left+25,6);expect(await player.evaluate(el=>parseFloat(el.style.top))).toBeCloseTo(moved.top+11,6);
 await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),w=b.state.widgets.get('visible-audio');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('frame',{x:w.x+w.width/2-120,y:w.y+w.height/2-90,width:240,height:180}),id:'audio-frame'}});});await settle(page);expect(await player.evaluate(el=>el.style.clipPath)).toContain('polygon(');
 await page.evaluate(()=>window.__board.bus.exec({op:'WIDGET_REMOVE',payload:'audio-frame'}));await settle(page);expect(await player.evaluate(el=>el.style.clipPath)).toBe('');
 await page.evaluate(()=>window.__board.bus.exec({op:'WIDGET_UPDATE',payload:{id:'visible-audio',patch:{hidden:true}}}));await expect(player).toBeHidden();await page.evaluate(()=>window.__board.bus.exec({op:'WIDGET_UPDATE',payload:{id:'visible-audio',patch:{hidden:false}}}));await expect(player).toBeVisible();
 await player.getByRole('button',{name:'Reproduzir áudio',exact:true}).click();await expect(player.getByRole('button',{name:'Pausar áudio',exact:true})).toBeVisible();await expect.poll(async()=>Number(await player.locator('input[type=range]').inputValue())).toBeGreaterThan(10);await player.getByRole('button',{name:'Pausar áudio',exact:true}).click();
});

test('table action controls retain focus through cell updates and still move and add rows correctly',async({page})=>{
 await blank(page);const id=await page.evaluate(async()=>{const b=window.__board,{createTableWidget}=await import('/src/core/structured-text.ts'),w=createTableWidget({x:0,y:-150},{title:'',headerColor:'#4262ff',cells:[['A','B'],['C','D']]});b.bus.exec({op:'WIDGET_CREATE',payload:w});b.bus.exec({op:'SELECTION_SET',payload:[w.id]});return w.id;});await settle(page);
 const button=page.getByRole('button',{name:'Adicionar linha',exact:true});await button.focus();const initial=await button.evaluate(el=>{window.__retainedTableButton=el;return {left:parseFloat(el.parentElement.style.left),top:parseFloat(el.parentElement.style.top)};});
 await page.evaluate(async id=>{const b=window.__board,{setTableCell}=await import('/src/core/structured-text.ts');setTableCell(b.state,b.bus,id,0,0,'Conteúdo atualizado');},id);expect(await button.evaluate(el=>el===window.__retainedTableButton&&document.activeElement===el)).toBe(true);
 await page.evaluate(()=>window.__board.camera.panByScreen(15,9));await settle(page);expect(await button.evaluate(el=>parseFloat(el.parentElement.style.left))).toBeCloseTo(initial.left+15,6);expect(await button.evaluate(el=>parseFloat(el.parentElement.style.top))).toBeCloseTo(initial.top+9,6);
 await page.keyboard.press('Enter');expect(await page.evaluate(id=>window.__board.state.widgets.get(id).table.cells.length,id)).toBe(3);await page.keyboard.press('Control+z');expect(await page.evaluate(id=>window.__board.state.widgets.get(id).table.cells.length,id)).toBe(2);
});

test('automatic saving waits for momentum while explicit save remains immediate and the final camera persists',async({page})=>{
 await blank(page);
 // Isolate inertia semantics from decorative grid GPU work before baselines.
 await page.evaluate(()=>window.__board.bus.exec({op:'BACKGROUND_UPDATE',payload:{grid:false}}));
 await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:0,y:0,content:'Persistente'}),id:'saved-shape'}});await b.saveNow();window.__boardWrites=[];window.__preGestureWrites=[];let started=false;b.app.canvas.addEventListener('pointerdown',event=>{if(event.isTrusted)started=true;},{once:true,capture:true});const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(value?.widgets&&value?.journal)(started?window.__boardWrites:window.__preGestureWrites).push({key,momentum:b.navigation.active(),at:performance.now(),gesture:b.gesture().kind});return put.call(this,value,key);};});
 await page.keyboard.down('Space');await nativeFling(page,{x:300,y:600,dx:100,dy:12});await page.keyboard.up('Space');expect(await page.evaluate(()=>window.__board.navigation.active())).toBe(true);
 await page.waitForTimeout(450);expect(await page.evaluate(()=>window.__board.navigation.active())).toBe(true);const writes=await page.evaluate(()=>({before:window.__preGestureWrites,during:window.__boardWrites}));console.log('FLING_SAVE_WINDOW '+JSON.stringify(writes));expect(writes.during).toEqual([]);
 await page.evaluate(()=>window.__board.saveNow());expect(await page.evaluate(()=>window.__boardWrites[0].momentum)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.__board.navigation.active())).toBe(false);await expect.poll(()=>page.evaluate(()=>window.__boardWrites.some(write=>!write.momentum))).toBe(true);
 const stored=await page.evaluate(async()=>{const key=window.__boardWrites.at(-1).key,request=indexedDB.open('board-app'),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}),transaction=db.transaction('boards','readonly'),read=transaction.objectStore('boards').get(key),saved=await new Promise((resolve,reject)=>{read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);});return {saved:saved.camera,current:{x:window.__board.camera.x,y:window.__board.camera.y,scale:window.__board.camera.scale},ids:saved.widgets.map(w=>w.id)};});expect(stored.saved).toEqual(stored.current);expect(stored.ids).toContain('saved-shape');
});
