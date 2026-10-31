// @ts-nocheck
import {test,expect} from '@playwright/test';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();await expect(page.locator('#board-transition')).toBeHidden();}
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}

for(const dpr of [1,1.25,2,3])test.describe(`native DPR ${dpr}`,()=>{
 test.use({viewport:{width:1200,height:900},deviceScaleFactor:dpr});
 test('camera, centered text creation, edge culling and Space navigation use CSS coordinates',async({page})=>{
  await blank(page);const initial=await page.evaluate(()=>{const b=window.__board,r=b.app.canvas.getBoundingClientRect();return {camera:[b.camera.width,b.camera.height],screen:[b.app.screen.width,b.app.screen.height],backing:[b.app.canvas.width,b.app.canvas.height],css:[r.width,r.height],resolution:b.app.renderer.resolution};});
  expect(initial.camera).toEqual([1200,900]);expect(initial.screen).toEqual([1200,900]);expect(initial.css).toEqual([1200,900]);expect(initial.backing).toEqual([1200*dpr,900*dpr]);expect(initial.resolution).toBe(dpr);
  await page.locator('#toolbar [data-tool="text"]').click();await page.mouse.click(800,600);const editor=page.locator('#inline-editor');await expect(editor).toBeVisible();await editor.fill('Texto Retina');await editor.press('Control+Enter');
  const created=await page.evaluate(()=>{const b=window.__board,w=[...b.state.widgets.values()].find(w=>w.type==='text');return {origin:b.camera.worldToScreen({x:w.x,y:w.y}),font:w.style.fontSize};});expect(created.origin.x).toBeCloseTo(600,5);expect(created.origin.y).toBeCloseTo(450,5);expect(created.font).toBe(24);
  await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts'),p=b.camera.screenToWorld({x:1080,y:760});b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{...p,width:100,height:80,content:''}),id:'edge-object'}});b.bus.exec({op:'SELECTION_SET',payload:[]});});await settle(page);
  expect(await page.evaluate(()=>window.__board.app.stage.children[1].children[3].children.find(n=>n.label==='edge-object').visible)).toBe(true);
  const before=await page.evaluate(()=>({x:window.__board.camera.x,y:window.__board.camera.y}));await page.keyboard.down('Space');await page.mouse.move(900,300);await page.mouse.down();await page.mouse.move(1000,350,{steps:6});await settle(page);const during=await page.evaluate(()=>({x:window.__board.camera.x,y:window.__board.camera.y}));await page.mouse.up();await page.keyboard.up('Space');await page.evaluate(()=>window.__board.navigation.stop());expect(during.x-before.x).toBeCloseTo(-100,4);expect(during.y-before.y).toBeCloseTo(-50,4);
 });
});

test('a DPR change rerasterizes unchanged text and preserves camera size and creation center',async({page})=>{
 await page.setViewportSize({width:1200,height:900});await blank(page);await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:0,y:0,content:'Retina'}),id:'dpi-text',style:{...createWidget('text',{x:0,y:0}).style,fontFamily:'Inter',fontSize:64}}});b.bus.exec({op:'SELECTION_SET',payload:[]});});await settle(page);
 const read=()=>page.evaluate(()=>{const b=window.__board,node=b.app.stage.children[1].children[3].children.find(n=>n.label==='dpi-text'),text=node.children[1].children.find(n=>n.style);return {resolution:text.resolution,renderer:b.app.renderer.resolution,camera:[b.camera.width,b.camera.height],font:b.state.widgets.get('dpi-text').style.fontSize,origin:b.camera.worldToScreen({x:0,y:0})};});const before=await read();
 await page.evaluate(()=>Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>2}));await expect.poll(async()=>(await read()).renderer).toBe(2);await settle(page);const after=await read();expect(after.resolution).toBeGreaterThan(before.resolution);expect(after.camera).toEqual([1200,900]);expect(after.origin).toEqual({x:600,y:450});expect(after.font).toBe(64);
 await page.evaluate(()=>Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>1}));await expect.poll(async()=>(await read()).renderer).toBe(1);await settle(page);expect((await read()).resolution).toBe(before.resolution);expect((await read()).camera).toEqual([1200,900]);
});

test('thin vector lines retain continuous proportional coverage at macro zoom without changing model or SVG width',async({page})=>{
 await blank(page);const results=await page.evaluate(async()=>{
  const b=window.__board,Graphics=b.app.stage.children[0].constructor,Container=b.app.stage.constructor,Rectangle=b.app.screen.constructor,{paintConnector,connectorSvgContent}=await import('/src/render/connector-paint.ts'),results=[];
  for(const zoom of [.02,.1,.25,1])for(const width of [.08,.4]){
   const target=new Container(),g=new Graphics(),legacy=new Graphics();target.addChild(g);g.scale.set(zoom);const points=[{x:25.25/zoom,y:35.35/zoom},{x:250.75/zoom,y:135.65/zoom}],line={id:'hairline',type:'connector',shape:'straight',start:{kind:'point',...points[0]},end:{kind:'point',...points[1]},style:{strokeColor:'#000000',strokeWidth:width/zoom,startCap:'none',endCap:'none'},z:0};paintConnector(g,line,{points},true,zoom);legacy.moveTo(25.25,35.35).lineTo(250.75,135.65).stroke({width,color:'#000000',cap:'round'});
   const resolution=Math.min(3,devicePixelRatio),frame=new Rectangle(0,0,280,180),extract=node=>b.app.renderer.extract.pixels({target:node,frame,resolution,antialias:true}).pixels,actual=extract(target),old=extract(legacy),canvas=document.createElement('canvas');canvas.width=280*resolution;canvas.height=180*resolution;const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(25.25,35.35);ctx.lineTo(250.75,135.65);ctx.stroke();const ref=ctx.getImageData(0,0,canvas.width,canvas.height).data;let nextError=0,oldError=0,ink=0,referenceInk=0;for(let i=3;i<ref.length;i+=4){nextError+=Math.abs(actual[i]-ref[i]);oldError+=Math.abs(old[i]-ref[i]);ink+=actual[i];referenceInk+=ref[i];}
   results.push({zoom,width,nextError,oldError,ink,referenceInk,modelWidth:line.style.strokeWidth,svg:connectorSvgContent(line,{points})});target.destroy({children:true});legacy.destroy();
  }return results;
 });for(const result of results){expect(result.nextError,JSON.stringify(result)).toBeLessThan(result.oldError*.8);expect(result.ink/result.referenceInk).toBeGreaterThan(.85);expect(result.ink/result.referenceInk).toBeLessThan(1.15);expect(result.modelWidth).toBe(result.width/result.zoom);expect(result.svg).toContain(`stroke-width="${Math.round(result.modelWidth*10000)/10000}"`);}
});

test('translucent brush and precision holes inherit antialiasing and physical pixel density',async({page})=>{
 await blank(page);const result=await page.evaluate(async()=>{
  const b=window.__board,Graphics=b.app.stage.children[0].constructor,Container=b.app.stage.constructor,Rectangle=b.app.screen.constructor,{paintStroke}=await import('/src/render/stroke-paint.ts'),samples=[];
  for(const resolution of [1,2])for(const zoom of [.02,.1,1]){
   const parent=new Container(),g=new Graphics();parent.addChild(g);g.scale.set(zoom);const points=[{x:25.25/zoom,y:35.35/zoom,r:3.25/zoom},{x:250.75/zoom,y:135.65/zoom,r:3.25/zoom}];paintStroke(g,{id:'filtered',type:'stroke',tool:'brush',color:'#000000',opacity:.4,points,erasures:[{radius:8.25/zoom,points:[{x:135.25/zoom,y:84.5/zoom}]}],z:0},{zoom});const filter=g.filters[0],settings={resolution:filter.resolution,antialias:filter.antialias};
   const frame=new Rectangle(0,0,280,180),extract=()=>b.app.renderer.extract.pixels({target:parent,frame,resolution,antialias:true}).pixels,actual=extract(),canvas=document.createElement('canvas');canvas.width=280*resolution;canvas.height=180*resolution;const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);ctx.globalAlpha=.4;ctx.lineWidth=6.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(25.25,35.35);ctx.lineTo(250.75,135.65);ctx.stroke();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(135.25,84.5,8.25,0,Math.PI*2);ctx.fill();const ref=ctx.getImageData(0,0,canvas.width,canvas.height).data;filter.resolution=1;filter.antialias='off';const legacy=extract();let error=0,oldError=0;for(let i=3;i<ref.length;i+=4){error+=Math.abs(actual[i]-ref[i]);oldError+=Math.abs(legacy[i]-ref[i]);}samples.push({resolution,zoom,settings,error,oldError});parent.destroy({children:true});
  }return samples;
 });for(const sample of result){expect(sample.settings).toEqual({resolution:'inherit',antialias:'inherit'});expect(sample.error,JSON.stringify(sample)).toBeLessThan(sample.oldError*.6);}
});

test('shape, photo, audio, table and text decoration hairlines update inside one zoom bucket while SVG stays unchanged',async({page})=>{
 await blank(page);await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.scale=.02;b.bus.exec({op:'BACKGROUND_UPDATE',payload:{grid:false}});const png=document.createElement('canvas');png.width=png.height=64;png.getContext('2d').fillRect(0,0,64,64);
  for(const [i,kind]of ['shape','image','audio','table','underline'].entries()){
   const w={...createWidget(kind==='underline'?'text':'shape',{x:-20000+i*8000,y:-2000,width:5000,height:4000,content:kind==='underline'?'__Retina__':''}),id:kind};w.style={...w.style,borderWidth:2,borderColor:'#20252a',fontSize:14};
   if(kind==='image')Object.assign(w,{type:'image',src:png.toDataURL(),naturalWidth:64,naturalHeight:64,maskShape:'ellipse'});
   if(kind==='audio')w.audio={src:'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=',mime:'audio/wav',name:'Audio',duration:0,waveform:[0,.5,1]};
   if(kind==='table')w.table={title:'',headerColor:'#4262ff',cells:[['A','B'],['C','D']]};
   b.bus.exec({op:'WIDGET_CREATE',payload:w});
  }b.bus.exec({op:'SELECTION_SET',payload:[]});
 });await settle(page);
 const inspect=()=>page.evaluate(async()=>{const b=window.__board,{boardToSvg}=await import('/src/core/exportSvg.ts'),values={};for(const id of ['shape','image','audio','table','underline']){const node=b.app.stage.children[1].children[3].children.find(n=>n.label===id),strokes=[];const visit=n=>{for(const instruction of n.context?.instructions??[])if(instruction.action==='stroke')strokes.push({physical:instruction.data.style.width*b.camera.scale*Math.min(3,devicePixelRatio),alpha:instruction.data.style.alpha});for(const child of n.children??[])visit(child);};visit(node);values[id]=strokes;}return {values,svg:boardToSvg(b.state)};});
 const first=await inspect();await page.evaluate(()=>window.__board.camera.scale=.021);await settle(page);const second=await inspect();expect(second.svg).toBe(first.svg);
 for(const sample of [first,second])for(const [kind,strokes]of Object.entries(sample.values)){expect(strokes.length,kind).toBeGreaterThan(0);for(const stroke of strokes){expect(stroke.physical,kind).toBeCloseTo(1,5);expect(stroke.alpha,kind).toBeGreaterThan(0);expect(stroke.alpha,kind).toBeLessThan(1);}}
});
