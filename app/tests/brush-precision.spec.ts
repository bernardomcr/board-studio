// @ts-nocheck
import {test,expect} from '@playwright/test';
async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);}
async function blank(page){await ready(page);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}

test('precision removes visible hand jitter equally at two, one hundred and two thousand percent zoom',async({page})=>{
 await ready(page);const results=await page.evaluate(async()=>{
  const {strokeGeometry,strokeGeometryRange,PRECISION_LOOKAHEAD}=await import('/src/core/strokes.ts'),results=[];
  for(const zoom of [.02,1,20]){
   const points=Array.from({length:1500},(_,i)=>({x:i*.5/zoom,y:(40*Math.sin(i*.5/120)+2*Math.sin(i*1.4))/zoom,r:3/zoom})),stroke={id:'precision',type:'stroke',tool:'brush',points,precision:true,precisionSmoothing:14/zoom,color:'#333333',z:0},geometry=strokeGeometry(stroke);
   let raw=0,smooth=0,count=0;for(let i=100;i<1400;i++){const reference=40*Math.sin(i*.5/120);raw+=(points[i].y*zoom-reference)**2;smooth+=(geometry.knots[i].y*zoom-reference)**2;count++;}
   const before=JSON.stringify(geometry.curves.slice(0,points.length-PRECISION_LOOKAHEAD-2));for(let i=1500;i<1530;i++)points.push({x:i*.5/zoom,y:(40*Math.sin(i*.5/120)+2*Math.sin(i*1.4))/zoom,r:3/zoom});const stable=before===JSON.stringify(strokeGeometry(stroke).curves.slice(0,1500-PRECISION_LOOKAHEAD-2));
   let reads=0;const proxy=new Proxy(points,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver);}});strokeGeometryRange({...stroke,points:proxy},500,628);
   results.push({zoom,raw:Math.sqrt(raw/count),smooth:Math.sqrt(smooth/count),stable,reads,first:geometry.knots[0],last:geometry.knots.at(-1),expectedLast:points[1499]});
  }return results;
 });
 for(const result of results){expect(result.raw).toBeGreaterThan(1.3);expect(result.smooth).toBeLessThan(.1);expect(result.smooth).toBeLessThan(result.raw*.1);expect(result.stable).toBe(true);expect(result.reads).toBeLessThan(1500);expect(result.first.x).toBe(0);expect(result.first.y).toBe(0);expect(result.last).toEqual(result.expectedLast);}
 expect(results[0].smooth).toBeCloseTo(results[1].smooth,8);expect(results[2].smooth).toBeCloseTo(results[1].smooth,8);
});

test('display LOD removes subpixel work while retaining raw samples, SVG and bounded screen error',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const {strokeGeometry}=await import('/src/core/strokes.ts'),{strokeRenderPoints}=await import('/src/render/stroke-lod.ts'),{strokeSvgContent}=await import('/src/render/stroke-paint.ts');
  const points=Array.from({length:10000},(_,i)=>({x:i*.1,y:80*Math.sin(i/900)+Math.sin(i*1.2),r:3})),stroke={id:'lod',type:'stroke',tool:'brush',points,precision:false,color:'#333333',z:0},geometry=strokeGeometry(stroke),original=JSON.stringify(points),svg=strokeSvgContent(stroke),low=strokeRenderPoints(geometry,.02,1),same=strokeRenderPoints(geometry,.021,1)===low,high=strokeRenderPoints(geometry,1,1);
  let error=0;for(let i=0;i<points.length;i+=3){const p=points[i];let best=Infinity;for(let j=1;j<low.length;j++){const a=low[j-1],b=low[j],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));}error=Math.max(error,best*.02);}
  return {raw:geometry.knots.length,low:low.length,high:high.length,same,error,unchanged:original===JSON.stringify(points)&&svg===strokeSvgContent(stroke),first:low[0],last:low.at(-1),expectedFirst:points[0],expectedLast:points.at(-1)};
 });
 expect(result.raw).toBe(10000);expect(result.low).toBeLessThan(100);expect(result.high).toBeGreaterThan(result.low);expect(result.same).toBe(true);expect(result.error).toBeLessThan(.2);expect(result.unchanged).toBe(true);expect(result.first).toEqual(result.expectedFirst);expect(result.last).toEqual(result.expectedLast);
});

test('subpixel strokes remain continuous at two percent without increasing their stored width or crossing opacity',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const {paintStroke}=await import('/src/render/stroke-paint.ts'),b=window.__board,Container=b.app.stage.constructor,Graphics=b.app.stage.children[0].constructor,Rectangle=b.app.screen.constructor,container=new Container(),g=new Graphics();container.addChild(g);g.position.set(300,100.5);g.scale.set(.02);
  const stroke={id:'thin',type:'stroke',tool:'brush',color:'#299d70',precision:false,points:[{x:-10000,y:-5000,r:3},{x:10000,y:5000,r:3}],z:0};paintStroke(g,stroke,{zoom:.02});
  const canvas=b.app.renderer.extract.canvas({target:container,frame:new Rectangle(0,0,600,220),resolution:1}),ctx=canvas.getContext('2d'),alpha=[];for(let x=120;x<480;x+=3)alpha.push(ctx.getImageData(x,Math.floor(100.5+(x-300)*.5),1,1).data[3]);
  const output={minimum:Math.min(...alpha),maximum:Math.max(...alpha),unchanged:stroke.points.every(p=>p.r===3),count:alpha.length};container.destroy({children:true});return output;
 });
 expect(result.count).toBeGreaterThan(100);expect(result.minimum).toBeGreaterThan(0);expect(result.maximum).toBeLessThanOrEqual(40);expect(result.unchanged).toBe(true);
});

test('native precision at two percent records the visible smoothing window and survives reload',async({page})=>{
 await blank(page);await page.evaluate(()=>{const c=window.__board.camera;c.x=0;c.y=0;c.scale=.02;});
 await page.locator('[data-tool="brush"]').click();await page.getByRole('checkbox',{name:'Precisão do pincel',exact:true}).check();await page.getByRole('slider',{name:'Suavização da precisão',exact:true}).press('End');
 await page.mouse.move(500,550);await page.mouse.down();for(let i=1;i<=320;i++){const x=500+i*1.8,y=550+40*Math.sin((x-500)/120)+2*Math.sin(i*1.4);await page.mouse.move(x,y);}await page.mouse.up();
 const result=await page.evaluate(async()=>{const b=window.__board,s=[...b.state.strokes.values()][0],{strokeGeometry}=await import('/src/core/strokes.ts'),g=strokeGeometry(s);let raw=0,smooth=0,n=0;for(let i=40;i<s.points.length-40;i++){const a=s.points[i-1],p=s.points[i],c=s.points[i+1],u=g.knots[i-1],v=g.knots[i],w=g.knots[i+1];raw+=((a.y-2*p.y+c.y)*b.camera.scale)**2;smooth+=((u.y-2*v.y+w.y)*b.camera.scale)**2;n++;}return {smoothing:s.precisionSmoothing,raw:Math.sqrt(raw/n),smooth:Math.sqrt(smooth/n),count:s.points.length,first:g.knots[0],last:g.knots.at(-1),expectedFirst:s.points[0],expectedLast:s.points.at(-1)};});
 expect(result.smoothing).toBeCloseTo(8100,8);expect(result.count).toBeGreaterThan(300);expect(result.smooth).toBeLessThan(result.raw*.1);expect(result.first).toEqual(result.expectedFirst);expect(result.last).toEqual(result.expectedLast);await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);expect(await page.evaluate(()=>[...window.__board.state.strokes.values()][0].precisionSmoothing)).toBeCloseTo(8100,8);
});
