// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();
 await page.evaluate(async()=>{const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'BACKGROUND_UPDATE',payload:{grid:false}});b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('text',{x:0,y:0,content:'Nitidez'}),id:'quality'}});b.bus.exec({op:'WIDGET_UPDATE',payload:{id:'quality',patch:{style:{...b.state.widgets.get('quality').style,fontFamily:'Inter',fontSize:144}}}});b.bus.exec({op:'SELECTION_SET',payload:[]});});
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function inspect(page){return page.evaluate(()=>{
 const b=window.__board,node=b.app.stage.children[1].children[3].children.find(n=>n.label==='quality').children[1],text=node.children.find(n=>n.style);
 b.app.renderer.render({container:b.app.stage});
 const source=b.app.renderer.canvasText._activeTextures[text.styleKey].texture.source;
 const Rectangle=b.app.screen.constructor,pixels=b.app.renderer.extract.pixels({target:b.app.stage,frame:new Rectangle(600,420,600,200),resolution:1}).pixels;
 let hash=2166136261,ink=0,antialiased=0;for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619);if(i%4===3&&pixels[i]>0){ink++;if(pixels[i]<255)antialiased++;}}
 return {hash:hash>>>0,ink,antialiased,font:text.style.fontSize,resolution:text.resolution,mipmaps:source.autoGenerateMipmaps,mipLevels:source.mipLevelCount,width:source.pixelWidth,height:source.pixelHeight,linear:source.style.scaleMode};
 });}

test('font textures use filtered mip levels and repaint identically after size and zoom cycles',async({page})=>{
 await blank(page);await page.evaluate(()=>{window.__board.camera.scale=.25;});await settle(page);const initial=await inspect(page);
 expect(initial.mipmaps).toBe(true);expect(initial.mipLevels).toBeGreaterThan(1);expect(initial.linear).toBe('linear');expect(initial.ink).toBeGreaterThan(100);
 for(const [font,zoom]of [[18,8],[512,.05],[72,2],[144,.25]]){
  await page.evaluate(({font,zoom})=>{const b=window.__board,w=b.state.widgets.get('quality');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:'quality',patch:{style:{...w.style,fontSize:font}}}});b.camera.scale=zoom;},{font,zoom});await settle(page);
 }
 const restored=await inspect(page);expect(restored.hash).toBe(initial.hash);expect(restored.ink).toBe(initial.ink);expect(restored.font).toBe(144);expect(restored.mipmaps).toBe(true);
 await page.screenshot({path:'../work/text-quality-zoomed-out.png'});
});

test('large glyphs receive a bounded texture and unchanged shape geometry survives pan and selection',async({page})=>{
 await blank(page);await page.evaluate(async()=>{const b=window.__board,w=b.state.widgets.get('quality'),{createWidget}=await import('/src/core/model.ts');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{content:'Performance',style:{...w.style,fontSize:1600}}}});b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-100,y:-80,width:200,height:160,content:''}),id:'cached-shape'}});b.camera.scale=8;});await settle(page);
 const large=await inspect(page);expect(large.width).toBeLessThanOrEqual(4096);expect(large.height).toBeLessThanOrEqual(4096);expect(large.width*large.height).toBeLessThanOrEqual(4*1024*1024);expect(large.mipmaps).toBe(true);
 const cached=await page.evaluate(async()=>{const b=window.__board,node=b.app.stage.children[1].children[3].children.find(n=>n.label==='cached-shape'),first=node.children[0].context.instructions[0];b.camera.x=15;b.bus.exec({op:'SELECTION_SET',payload:['cached-shape']});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return first===node.children[0].context.instructions[0];});
 expect(cached).toBe(true);
});

test('small glyphs retain enough source pixels at the maximum 2000 percent zoom',async({page})=>{
 await blank(page);await page.evaluate(()=>{const b=window.__board,w=b.state.widgets.get('quality');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{content:'Hi',style:{...w.style,fontSize:12}}}});b.camera.scale=20;});await settle(page);
 const large=await inspect(page),dpr=await page.evaluate(()=>Math.min(devicePixelRatio,3));
 expect(large.resolution).toBeGreaterThanOrEqual(20*dpr);expect(large.width).toBeLessThanOrEqual(4096);expect(large.height).toBeLessThanOrEqual(4096);expect(large.width*large.height).toBeLessThanOrEqual(4*1024*1024);expect(large.mipLevels).toBeGreaterThan(1);
});

test('image masks and borders survive pan without rebuilding and invalidate when resized',async({page})=>{
 await blank(page);const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=300;const t=c.getContext('2d');t.fillStyle='#a6c8ff';t.fillRect(0,0,200,300);return c.toDataURL().split(',')[1];});
 const chooser=page.waitForEvent('filechooser');await page.locator('[data-tool="image"]').click();await(await chooser).setFiles({name:'cached.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>{const visit=n=>n.texture?.source?.pixelWidth===200||n.children?.some(visit);return visit(window.__board.app.stage);});
 await page.waitForFunction(()=>[...window.__board.state.widgets.values()].some(w=>w.type==='image'));await page.evaluate(()=>{const b=window.__board,w=[...b.state.widgets.values()].find(w=>w.type==='image');b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{maskShape:'ellipse',style:{...w.style,borderWidth:6,borderStyle:'dashed'}}}});});
 await settle(page);
 const result=await page.evaluate(async()=>{
  const b=window.__board,w=[...b.state.widgets.values()].find(w=>w.type==='image'),node=b.app.stage.children[1].children[3].children.find(n=>n.label===w.id),picture=node.children.find(n=>n.children?.some(c=>c.texture));
  const mask=picture.children[1],border=picture.children[2],a=mask.context.instructions[0],c=border.context.instructions[0];
  b.camera.x=25;b.bus.exec({op:'SELECTION_SET',payload:['quality']});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const kept=a===mask.context.instructions[0]&&c===border.context.instructions[0];
  b.bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{width:w.width*2,height:w.height*2}}});
  b.app.renderer.render({container:b.app.stage});const source=picture.children[0].texture.source;
  return {kept,invalidated:a!==mask.context.instructions[0]&&c!==border.context.instructions[0],width:picture.children[0].width,expected:w.width*2,mipmaps:source.autoGenerateMipmaps,mipLevels:source.mipLevelCount};
 });
 expect(result.kept).toBe(true);expect(result.invalidated).toBe(true);expect(result.width).toBeCloseTo(result.expected,5);expect(result.mipmaps).toBe(true);expect(result.mipLevels).toBeGreaterThan(1);
});
