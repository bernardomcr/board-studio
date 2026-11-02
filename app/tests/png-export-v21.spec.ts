// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {boardAction} from './helpers/board-actions';
const {PNG}=createRequire(import.meta.url)('../node_modules/playwright-core/lib/utilsBundle.js');
const red=(data,i)=>data[i]>145&&data[i+1]<115&&data[i+2]<145&&data[i+3]>0;
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function blank(page){await page.setViewportSize({width:1000,height:700});await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();await page.evaluate(()=>window.__board.bus.exec({op:'BACKGROUND_UPDATE',payload:{color:'#ffffff',grid:false}}));}
async function text(page,size,italic=false,zoom=450/size){await page.evaluate(async({size,italic,zoom})=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');await(await import('/src/fonts.ts')).loadBoardFont('Caveat');const w=createWidget('text',{x:0,y:0,content:'Tchau'});w.id='png-ink';w.style={...w.style,fontFamily:'Caveat',fontSize:size,fontStyle:italic?'italic':'normal',color:'#e0303f',fillColor:'transparent',borderWidth:0,textAlign:'left',textAlignVertical:'top'};b.camera.x=b.camera.y=0;b.camera.scale=zoom;b.bus.exec({op:'WIDGET_CREATE',payload:w});b.bus.exec({op:'SELECTION_SET',payload:[]});},{size,italic,zoom});await settle(page);}
async function prepareReference(page){return page.evaluate(async()=>{
 const b=window.__board,{Rectangle}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>url.includes('/pixi__js.js?')));b.app.renderer.render({container:b.app.stage});
 const bounds=b.app.stage.getLocalBounds(),left=Math.floor(bounds.minX)-160,top=Math.floor(bounds.minY)-160,right=Math.ceil(bounds.maxX)+160,bottom=Math.ceil(bounds.maxY)+160,frame={x:left,y:top,width:right-left,height:bottom-top},extract=b.app.renderer.extract,original=extract.canvas.bind(extract),reference=original({target:b.app.stage,frame:new Rectangle(frame.x,frame.y,frame.width,frame.height),clearColor:'#ffffff'});
 window.__pngActualFrame=null;extract.canvas=options=>{if(options.target===b.app.stage){const r=options.frame??b.app.stage.getLocalBounds().rectangle;window.__pngActualFrame={x:r.x,y:r.y,width:r.width,height:r.height};}return original(options);};
 return {frame,png:reference.toDataURL('image/png').split(',')[1],model:JSON.stringify([...b.state.widgets])};
});}
async function download(page){const pending=page.waitForEvent('download');await boardAction(page,'Exportar PNG');const file=await pending;expect(file.suggestedFilename()).toBe('board.png');return PNG.sync.read(await readFile(await file.path()));}
async function complete(page,reference){
 const actual=await download(page),meta=await page.evaluate(()=>({frame:window.__pngActualFrame,model:JSON.stringify([...window.__board.state.widgets])})),expected=PNG.sync.read(Buffer.from(reference.png,'base64'));expect(meta.model).toBe(reference.model);let ink=0,outside=0,missing=0;
 for(let y=0;y<expected.height;y++)for(let x=0;x<expected.width;x++){const i=(y*expected.width+x)*4;if(!red(expected.data,i))continue;ink++;const ax=Math.round(x+reference.frame.x-meta.frame.x),ay=Math.round(y+reference.frame.y-meta.frame.y);if(ax<0||ay<0||ax>=actual.width||ay>=actual.height){outside++;continue;}if(!red(actual.data,(ay*actual.width+ax)*4))missing++;}
 expect(ink).toBeGreaterThan(1000);expect(outside,'reference glyph ink must fit inside the downloaded PNG').toBe(0);expect(missing,'download must retain expanded-reference glyph coverage').toBeLessThanOrEqual(Math.max(2,Math.floor(ink*.001)));
}

for(const size of [2000,20000])for(const italic of [false,true])test(`downloaded PNG retains complete Caveat ink at ${size} units, italic=${italic}`,async({page})=>{
 await blank(page);await text(page,size,italic);await complete(page,await prepareReference(page));
});

test('PNG ink frames transform anchored Text through nested scales and rotations',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{Container,Text}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>url.includes('/pixi__js.js?')));await(await import('/src/fonts.ts')).loadBoardFont('Caveat');const {fitTextResolution}=await import('/src/render/text-quality.ts'),parent=new Container(),nested=new Container(),label=new Text({text:'Tchau',style:{fontFamily:'Caveat',fontSize:260,fontStyle:'italic',fill:'#e0303f'}});label.anchor.set(.35,.6);label.rotation=.42;label.scale.set(1.1,.8);label.resolution=fitTextResolution(label,1);nested.position.set(32,15);nested.rotation=-.23;nested.scale.set(.9,1.2);parent.position.set(500,350);parent.rotation=.17;parent.addChild(nested);nested.addChild(label);b.app.stage.addChild(parent);});await settle(page);await complete(page,await prepareReference(page));
});

test('PNG padded text remains clipped by a rotated frame exactly like the expanded renderer reference',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');await(await import('/src/fonts.ts')).loadBoardFont('Caveat');const frame=createWidget('frame',{x:-260,y:-180,width:520,height:360}),label=createWidget('text',{x:-450,y:-210,content:'Tchau'});Object.assign(frame,{id:'png-frame',title:'',rotation:.24});frame.style={...frame.style,borderWidth:0};Object.assign(label,{id:'png-ink',rotation:.24});label.style={...label.style,fontFamily:'Caveat',fontSize:420,fontStyle:'italic',color:'#e0303f',fillColor:'transparent',borderWidth:0};b.bus.exec({op:'WIDGET_CREATE',payload:frame});b.bus.exec({op:'WIDGET_CREATE',payload:label});b.bus.exec({op:'SELECTION_SET',payload:[]});});await settle(page);await complete(page,await prepareReference(page));
});

test('a viewport-rasterized giant run does not inflate the PNG frame to its unrendered logical Text',async({page})=>{
 await blank(page);await text(page,20000,true,20);const value=await page.evaluate(async()=>{const b=window.__board,{Text}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(url=>url.includes('/pixi__js.js?'))),{pngExportFrame}=await import('/src/render/export-frame.ts'),texts=[],tiles=[];const visit=node=>{if(node instanceof Text)texts.push(node);if(node.label?.startsWith('large-text-run-'))tiles.push(node);for(const child of node.children??[])visit(child);};visit(b.app.stage);const frame=pngExportFrame(b.app.stage),source=texts.find(t=>t.text==='Tchau'),model=JSON.stringify([...b.state.widgets]);return {frame,sourceRenderable:source.renderable,logicalWidth:source.getBounds().width,tiles:tiles.map(tile=>({width:tile.texture.source.width,height:tile.texture.source.height})),model};});
 expect(value.sourceRenderable).toBe(false);expect(value.logicalWidth).toBeGreaterThan(100000);expect(value.tiles.length).toBeGreaterThan(0);for(const tile of value.tiles){expect(tile.width).toBeLessThanOrEqual(4096);expect(tile.height).toBeLessThanOrEqual(4096);expect(tile.width*tile.height).toBeLessThanOrEqual(4*1024*1024);}expect(value.frame.width).toBeLessThanOrEqual(1010);expect(value.frame.height).toBeLessThanOrEqual(710);
 const actual=await download(page);expect(actual.width).toBeLessThanOrEqual(1010);expect(actual.height).toBeLessThanOrEqual(710);expect(await page.evaluate(()=>JSON.stringify([...window.__board.state.widgets]))).toBe(value.model);
});

test('ordinary graphics retain the original automatic extraction frame when there is no extra text ink',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),w=createWidget('shape',{x:-110,y:-70,width:220,height:140,content:''});w.style={...w.style,fillColor:'#e0303f',borderWidth:0};b.bus.exec({op:'WIDGET_CREATE',payload:w});b.bus.exec({op:'SELECTION_SET',payload:[]});});await settle(page);const value=await page.evaluate(async()=>{const b=window.__board,{pngExportFrame}=await import('/src/render/export-frame.ts'),frame=pngExportFrame(b.app.stage),canvas=b.app.renderer.extract.canvas({target:b.app.stage,clearColor:'#ffffff'});return {automatic:frame===undefined,width:canvas.width,height:canvas.height};});expect(value.automatic).toBe(true);const actual=await download(page);expect(actual.width).toBe(value.width);expect(actual.height).toBe(value.height);
});
