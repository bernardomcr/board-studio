// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function blank(page){await page.setViewportSize({width:1000,height:700});await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

async function setup(page,{family='Caveat',italic=false,content='Tchau',zoom=1,giant=false,customFont=false}){
 await blank(page);return page.evaluate(async options=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),{loadBoardFont}=await import('/src/fonts.ts'),{CanvasTextMetrics,Text}=await import(performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>url.includes('/pixi__js.js?')));let imported;
  if(options.customFont){const response=await fetch('/fonts/caveat-947ed15831ba.woff2');if(!response.ok)throw new Error('Local custom-font fixture could not be loaded.');const bytes=await response.arrayBuffer(),{importUserFont}=await import('/src/user-fonts.ts');imported=await importUserFont(new File([bytes],'Minha escrita pessoal.woff2',{type:'font/woff2'}));options.family=imported.family;}
  await loadBoardFont(options.family);b.camera.x=b.camera.y=0;b.camera.scale=options.zoom;
  b.bus.exec({op:'BACKGROUND_UPDATE',payload:{color:'#ffffff',grid:false}});const w=createWidget('text',{x:0,y:0,content:options.content});w.id='font-clipping';w.style={...w.style,fontFamily:options.family,fontSize:(options.giant?1600:200)/options.zoom,fontStyle:options.italic?'italic':'normal',color:'#e0303f',textAlign:'left',textAlignVertical:'top'};b.bus.exec({op:'WIDGET_CREATE',payload:w});b.bus.exec({op:'SELECTION_SET',payload:[]});
  const find=(node,id)=>node.label===id?node:node.children?.map(child=>find(child,id)).find(Boolean),font=style=>`${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${Array.isArray(style.fontFamily)?style.fontFamily.map(f=>JSON.stringify(f)).join(','):JSON.stringify(style.fontFamily)}`;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  // Baseline placement is the Text contract. Expected glyph coverage itself is
  // painted independently into an ample native canvas, without Pixi's bounds,
  // padding, source texture dimensions or renderer clipping helpers.
  const describe=()=>{const node=find(b.app.stage,w.id);return node.children[1].children.filter(child=>child instanceof Text).map(text=>{ctx.font=font(text.style);const native=ctx.measureText(text.text),measured=CanvasTextMetrics.measureText(text.text,text.style),p=measured.fontProperties,baseline=p.ascent+Math.max(0,(measured.lineHeight-p.fontSize)/2);return {text,native,baseline,font:font(text.style),matrix:text.getGlobalTransform()};});};
  window.__fontInkFixture={id:w.id,describe};return {id:w.id,initial:JSON.stringify(b.state.widgets.get(w.id)),font:b.state.widgets.get(w.id).style.fontSize,imported};
 },{family,italic,content,zoom,giant,customFont});
}

async function focusInk(page,part='all'){
 await settle(page);await page.evaluate(part=>{
  const b=window.__board,fixture=window.__fontInkFixture,w=b.state.widgets.get(fixture.id),runs=fixture.describe(),node=runs[0].text.parent;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const run of runs){const {text,native,baseline}=run,sx=text.scale.x,sy=text.scale.y;left=Math.min(left,node.x+text.x-native.actualBoundingBoxLeft*sx);right=Math.max(right,node.x+text.x+native.actualBoundingBoxRight*sx);top=Math.min(top,node.y+text.y+(baseline-native.actualBoundingBoxAscent)*sy);bottom=Math.max(bottom,node.y+text.y+(baseline+native.actualBoundingBoxDescent)*sy);}
  b.camera.x=w.x+(part==='right'?right-b.camera.width*.3/b.camera.scale:part==='left'?left+b.camera.width*.3/b.camera.scale:(left+right)/2);b.camera.y=w.y+(top+bottom)/2;
 },part);await settle(page);
}

async function compareInk(page){
 await settle(page);return page.evaluate(()=>{
  const b=window.__board,fixture=window.__fontInkFixture,w=b.state.widgets.get(fixture.id),before=JSON.stringify(w),width=innerWidth,height=innerHeight,R=b.app.screen.constructor,margin=64;
  b.app.renderer.render({container:b.app.stage});const gpu=b.app.renderer.extract.pixels({target:b.app.stage,frame:new R(0,0,width,height),resolution:1,clearColor:[0,0,0,0],antialias:true}).pixels;
  const canvas=document.createElement('canvas');canvas.width=width+margin*2;canvas.height=height+margin*2;const context=canvas.getContext('2d'),runs=fixture.describe();let rightOverhang=0,leftOverhang=0;
  for(const run of runs){const m=run.matrix;context.setTransform(m.a,m.b,m.c,m.d,m.tx+margin,m.ty+margin);context.font=run.font;context.textBaseline=run.text.style.textBaseline;context.fillStyle=w.style.color;context.fillText(run.text.text,0,run.baseline);rightOverhang=Math.max(rightOverhang,(run.native.actualBoundingBoxRight-run.native.width)*Math.hypot(m.a,m.b));leftOverhang=Math.max(leftOverhang,run.native.actualBoundingBoxLeft*Math.hypot(m.a,m.b));}
  const reference=context.getImageData(margin,margin,width,height).data;let interior=0,actualInterior=0,missing=0,extra=0;
  const nearby=(pixels,x,y)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(pixels[((y+dy)*width+x+dx)*4+3]>=80)return true;return false;};
  // Ignore a 1px AA fringe while requiring all real interior ink, including
  // the final flourish and negative left bearings, to survive the GPU path.
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=(y*width+x)*4+3;if(reference[i]>=224){interior++;if(!nearby(gpu,x,y))missing++;}if(gpu[i]>=224){actualInterior++;if(!nearby(reference,x,y))extra++;}}
  const source=text=>text.renderable?b.app.renderer.canvasText._activeTextures[text.styleKey]?.texture.source:fixture.describe()[0].text.parent.parent.children.find(child=>child.label==='large-text-raster')?.children.find(child=>child.label===`large-text-run-${runs.findIndex(run=>run.text===text)}`)?.texture.source;
  return {interior,actualInterior,missing,extra,rightOverhang,leftOverhang,modelUntouched:before===JSON.stringify(b.state.widgets.get(fixture.id)),model:before,raster:runs.some(run=>!run.text.renderable),sources:runs.map(run=>source(run.text)?.uid),tiles:runs.map(run=>{const s=source(run.text);return {width:s?.pixelWidth,height:s?.pixelHeight};})};
 });
}

function completeInk(result){expect(result.interior,JSON.stringify(result)).toBeGreaterThan(500);expect(result.actualInterior,JSON.stringify(result)).toBeGreaterThan(500);expect(result.missing,JSON.stringify(result)).toBeLessThanOrEqual(8);expect(result.missing/result.interior).toBeLessThan(.001);expect(result.extra,JSON.stringify(result)).toBeLessThanOrEqual(8);expect(result.extra/result.actualInterior).toBeLessThan(.001);expect(result.modelUntouched).toBe(true);for(const tile of result.tiles){expect(tile.width).toBeLessThanOrEqual(4096);expect(tile.height).toBeLessThanOrEqual(4096);expect(tile.width*tile.height).toBeLessThanOrEqual(4*1024*1024);}}

const ordinary=[...[.02,1,20].map(zoom=>({family:'Caveat',zoom})),{family:'Caveat',italic:true,zoom:1},{family:'Lobster',italic:true,zoom:1},{family:'EB Garamond',italic:true,content:'jfy ÁÉãçgj',zoom:1,left:true}];
for(const options of ordinary)test(`${options.family}${options.italic?' italic':''} keeps actual ${options.left?'left-bearing and accented':'Tchau right-bearing'} ink at ${options.zoom*100}%`,async({page})=>{
 const fixture=await setup(page,options);await focusInk(page);const initial=await compareInk(page);completeInk(initial);expect(initial.raster).toBe(false);expect(initial.model).toBe(fixture.initial);expect(options.left?initial.leftOverhang:initial.rightOverhang,JSON.stringify(initial)).toBeGreaterThan(1);
 await page.evaluate(()=>{const b=window.__board;b.camera.x+=37/b.camera.scale;b.camera.y-=13/b.camera.scale;});const panned=await compareInk(page);completeInk(panned);expect(panned.model).toBe(initial.model);expect(panned.sources).toEqual(initial.sources);
 await page.evaluate(async()=>{const b=window.__board,w=b.state.widgets.get('font-clipping'),{resizeFreeText}=await import('/src/core/text-layout.ts');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:resizeFreeText(w,'se',{x:w.x+w.width*1.25,y:w.y+w.height*1.25})}});});await focusInk(page);completeInk(await compareInk(page));await page.keyboard.press('Control+z');await focusInk(page);const undone=await compareInk(page);completeInk(undone);expect(undone.model).toBe(fixture.initial);
});

for(const zoom of [.02,1,20])test(`viewport raster preserves the complete Caveat flourish and native origin after pan and resize at ${zoom*100}%`,async({page})=>{
 const fixture=await setup(page,{family:'Caveat',italic:true,zoom,giant:true});await focusInk(page,'right');const first=await compareInk(page);completeInk(first);expect(first.raster).toBe(true);expect(first.rightOverhang).toBeGreaterThan(20);expect(first.model).toBe(fixture.initial);
 await page.evaluate(()=>{const b=window.__board;b.camera.x+=37/b.camera.scale;b.camera.y-=13/b.camera.scale;});const panned=await compareInk(page);completeInk(panned);expect(panned.sources).toEqual(first.sources);expect(panned.model).toBe(first.model);
 await focusInk(page,'left');completeInk(await compareInk(page));await page.evaluate(async()=>{const b=window.__board,w=b.state.widgets.get('font-clipping'),{resizeFreeText}=await import('/src/core/text-layout.ts');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:resizeFreeText(w,'se',{x:w.x+w.width*1.25,y:w.y+w.height*1.25})}});});await focusInk(page,'right');completeInk(await compareInk(page));await page.keyboard.press('Control+z');await focusInk(page,'right');const undone=await compareInk(page);completeInk(undone);expect(undone.model).toBe(fixture.initial);
});

test('an uploaded font outside the built-in catalog keeps complete italic ink and its original bytes through pan, resize and Undo',async({page})=>{
 const bytes=await readFile(new URL('../public/fonts/caveat-947ed15831ba.woff2',import.meta.url)),fixture=await setup(page,{italic:true,customFont:true});expect(fixture.imported.family).toMatch(/^BoardCustom-[a-f0-9]{24}$/);expect(fixture.imported).toMatchObject({label:'Minha escrita pessoal',format:'woff2',src:'data:font/woff2;base64,'+bytes.toString('base64')});
 const importedState=()=>page.evaluate(async family=>{const {userFont}=await import('/src/user-fonts.ts'),{FONT_OPTIONS}=await import('/src/fonts.ts'),w=window.__board.state.widgets.get('font-clipping');return {font:userFont(family),family:w.style.fontFamily,listed:FONT_OPTIONS.some(option=>option.family===family),loaded:[...document.fonts].some(face=>face.family===family&&face.status==='loaded')};},fixture.imported.family);
 expect(await importedState()).toEqual({font:fixture.imported,family:fixture.imported.family,listed:false,loaded:true});await focusInk(page);const first=await compareInk(page);completeInk(first);expect(first.rightOverhang).toBeGreaterThan(1);expect(first.model).toBe(fixture.initial);
 await page.evaluate(()=>{const b=window.__board;b.camera.x+=37/b.camera.scale;b.camera.y-=13/b.camera.scale;});const panned=await compareInk(page);completeInk(panned);expect(panned.sources).toEqual(first.sources);expect(panned.model).toBe(first.model);
 await page.evaluate(async()=>{const b=window.__board,w=b.state.widgets.get('font-clipping'),{resizeFreeText}=await import('/src/core/text-layout.ts');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:resizeFreeText(w,'se',{x:w.x+w.width*1.25,y:w.y+w.height*1.25})}});});await focusInk(page);completeInk(await compareInk(page));await page.keyboard.press('Control+z');await focusInk(page);const undone=await compareInk(page);completeInk(undone);expect(undone.model).toBe(fixture.initial);expect(await importedState()).toEqual({font:fixture.imported,family:fixture.imported.family,listed:false,loaded:true});
});
