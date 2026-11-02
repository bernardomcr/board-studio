// @ts-nocheck
import {test,expect} from '@playwright/test';
async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);}

test('chunked inverse erasures preserve the complete overlapping union at 2%, 100% and 2000%',async({page})=>{
 await ready(page);const results=await page.evaluate(async()=>{
  const {paintStroke,strokeSvgContent}=await import('/src/render/stroke-paint.ts'),{Graphics,Rectangle}=await import(performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>url.includes('/pixi__js.js?'))),renderer=window.__board.app.renderer,results=[];
  for(const zoom of [.02,1,20]){
   const point=(x,y)=>({x:x/zoom,y:y/zoom}),erasures=[{radius:12/zoom,points:Array.from({length:257},(_,i)=>point(320+200*Math.cos(i/256*Math.PI*4),160+50*Math.sin(i/256*Math.PI*8)))}];
   // More than 256 identical mask children must still be a union, never wrap
   // the stencil counter and reveal paint at an overlapping erased point.
   for(let i=0;i<260;i++)erasures.push({radius:18/zoom,points:[point(320,160)]});
   const stroke={id:'chunk-union',type:'stroke',tool:'brush',color:'#299d70',opacity:.4,precision:false,points:[{...point(60,160),r:80/zoom},{...point(580,160),r:80/zoom}],erasures,z:0},before=JSON.stringify(stroke),svg=strokeSvgContent(stroke),g=new Graphics();paintStroke(g,stroke,{zoom});
   const pixels=renderer.extract.pixels({target:g,frame:new Rectangle(0,0,640/zoom,320/zoom),resolution:zoom}).pixels,canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;const ctx=canvas.getContext('2d');ctx.setTransform(zoom,0,0,zoom,0,0);ctx.globalAlpha=.4;ctx.lineWidth=160/zoom;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(60/zoom,160/zoom);ctx.lineTo(580/zoom,160/zoom);ctx.stroke();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';
   for(const area of erasures){ctx.beginPath();if(area.points.length===1){ctx.arc(area.points[0].x,area.points[0].y,area.radius,0,Math.PI*2);ctx.fill();}else{ctx.lineWidth=area.radius*2;ctx.moveTo(area.points[0].x,area.points[0].y);for(const p of area.points.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();}}
   const reference=ctx.getImageData(0,0,640,320).data;let erased=0,retained=0,unexpectedPaint=0,missingPaint=0;
   // Compare interior coverage independently of edge antialiasing. Restrict to
   // the painted band so background pixels cannot make a broken mask pass.
   for(let y=88;y<232;y++)for(let x=68;x<572;x++){const i=(y*640+x)*4+3,near=[i,i-12,i+12,i-640*12,i+640*12];if(near.every(n=>reference[n]===0)){erased++;if(pixels[i]>2)unexpectedPaint++;}if(near.every(n=>reference[n]>=100)){retained++;if(Math.abs(pixels[i]-102)>2)missingPaint++;}}
   const mask=g.children.find(child=>child.label==='brush-erasure-mask'),contexts=mask.children.map(child=>child.context),chunks=contexts.length;g.destroy();results.push({zoom,erased,retained,unexpectedPaint,missingPaint,chunks,unchanged:before===JSON.stringify(stroke)&&svg===strokeSvgContent(stroke),released:contexts.every(context=>context.destroyed&&Object.keys(context._gpuData).length===0)});
  }return results;
 });for(const result of results){expect(result.erased,JSON.stringify(result)).toBeGreaterThan(10000);expect(result.retained).toBeGreaterThan(20000);expect(result.chunks).toBeGreaterThan(260);expect(result.unexpectedPaint,JSON.stringify(result)).toBe(0);expect(result.missingPaint,JSON.stringify(result)).toBe(0);expect(result.unchanged).toBe(true);expect(result.released).toBe(true);}
});

test('cloned erasure appends retain prefix GPU tessellation and invalidate edited, transformed or undone chunks',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const {paintStroke,clearStrokePaint}=await import('/src/render/stroke-paint.ts'),{Graphics,Rectangle}=await import(performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>url.includes('/pixi__js.js?'))),renderer=window.__board.app.renderer,system=renderer.graphicsContext,originalUpdate=system.updateGpuContext,builds=new Map(),vertices=new Map();
  // Instrument the actual Pixi rebuild gate, not a renderer-cache proxy.
  system.updateGpuContext=function(context){const rebuild=context.dirty||!context._gpuData[renderer.uid],gpu=originalUpdate.call(this,context);if(rebuild){builds.set(context,(builds.get(context)||0)+1);vertices.set(context,(vertices.get(context)||0)+gpu.geometryData.vertices.length);}return gpu;};
  const g=new Graphics(),frame=new Rectangle(0,0,360,200),allPoints=Array.from({length:145},(_,i)=>({x:30+i*2,y:100+12*Math.sin(i*.12)})),base={id:'chunk-reuse',type:'stroke',tool:'brush',color:'#299d70',opacity:.4,precision:false,points:[{x:20,y:100,r:45},{x:335,y:100,r:45}],z:0},make=length=>({...base,erasures:structuredClone([{radius:5,points:allPoints.slice(0,length)}])}),render=()=>renderer.extract.pixels({target:g,frame,resolution:1}).pixels;
  try{
   paintStroke(g,make(97));render();const mask=g.children.find(child=>child.label==='brush-erasure-mask'),prefix=mask.children.slice(0,2).map(child=>({context:child.context,instruction:child.context.instructions[0],builds:builds.get(child.context)})),baseContext=g.context,baseInstruction=baseContext.instructions[0],baseBuilds=builds.get(baseContext),initialVertices=[...vertices.values()].reduce((a,b)=>a+b,0);let maxRebuiltChunks=0;
   for(let length=98;length<=145;length++){
    const before=new Map(builds);paintStroke(g,make(length));render();let rebuilt=0;for(const child of mask.children)if((builds.get(child.context)||0)>(before.get(child.context)||0))rebuilt++;maxRebuiltChunks=Math.max(maxRebuiltChunks,rebuilt);
   }
   const final=Array.from(render()),completed=mask.children.map(child=>({context:child.context,instruction:child.context.instructions[0]})),prefixReused=prefix.every(item=>item.instruction===item.context.instructions[0]&&item.builds===builds.get(item.context)),baseReused=baseInstruction===baseContext.instructions[0]&&baseBuilds===builds.get(baseContext),appendVertices=[...vertices.values()].reduce((a,b)=>a+b,0)-initialVertices;
   const buildsBeforeClone=[...builds.values()].reduce((a,b)=>a+b,0);paintStroke(g,make(145));render();const cloneBuilds=[...builds.values()].reduce((a,b)=>a+b,0)-buildsBeforeClone;
   const edited=make(145);edited.erasures[0].points[5].y+=25;paintStroke(g,edited);render();const earlierEditInvalidates=completed[0].instruction!==completed[0].context.instructions[0],laterChunksUnchanged=completed.slice(1).every(item=>item.instruction===item.context.instructions[0]);
   paintStroke(g,make(49));render();const dropped=completed.slice(2).map(item=>item.context),undoReleased=dropped.every(context=>context.destroyed&&Object.keys(context._gpuData).length===0);paintStroke(g,make(145));const redo=render(),redoMatches=final.every((value,index)=>Math.abs(value-redo[index])<=1);
   // A mutable transform can change while both the closure and point count stay
   // identical. Radius, zoom quality and coordinates must all invalidate.
   const one={...base,erasures:[{radius:7,points:[{x:160,y:100}]}]};let offset=0;const transform=p=>({x:p.x+offset,y:p.y});paintStroke(g,one,{transform,zoom:1});render();const firstTransformInstruction=mask.children[0].context.instructions[0];offset=20;paintStroke(g,one,{transform,zoom:1});const moved=render(),transformed=firstTransformInstruction!==mask.children[0].context.instructions[0]&&moved[(100*360+180)*4+3]===0&&moved[(100*360+160)*4+3]>=100;
   const beforeScale=mask.children[0].context.instructions[0];paintStroke(g,one,{transform,scale:2,zoom:1});render();const scaleInvalidates=beforeScale!==mask.children[0].context.instructions[0],beforeZoom=mask.children[0].context.instructions[0];paintStroke(g,one,{transform,scale:2,zoom:2});render();const zoomInvalidates=beforeZoom!==mask.children[0].context.instructions[0];
   const contexts=mask.children.map(child=>child.context);clearStrokePaint(g);const clearReleased=mask.destroyed&&contexts.every(context=>context.destroyed&&Object.keys(context._gpuData).length===0)&&g.children.length===0;paintStroke(g,make(145));render();const finalMask=g.children.find(child=>child.label==='brush-erasure-mask'),finalContexts=finalMask.children.map(child=>child.context);g.destroy();const destroyReleased=finalMask.destroyed&&finalContexts.every(context=>context.destroyed&&Object.keys(context._gpuData).length===0);
   return {prefixReused,baseReused,maxRebuiltChunks,initialVertices,appendVertices,cloneBuilds,earlierEditInvalidates,laterChunksUnchanged,undoReleased,redoMatches,transformed,scaleInvalidates,zoomInvalidates,clearReleased,destroyReleased};
  }finally{system.updateGpuContext=originalUpdate;if(!g.destroyed)g.destroy();}
 });expect(result.prefixReused,JSON.stringify(result)).toBe(true);expect(result.baseReused).toBe(true);expect(result.maxRebuiltChunks).toBeLessThanOrEqual(1);expect(result.initialVertices).toBeGreaterThan(0);expect(result.appendVertices).toBeGreaterThan(0);expect(result.cloneBuilds).toBe(0);for(const key of ['earlierEditInvalidates','laterChunksUnchanged','undoReleased','redoMatches','transformed','scaleInvalidates','zoomInvalidates','clearReleased','destroyReleased'])expect(result[key],JSON.stringify(result)).toBe(true);
});
