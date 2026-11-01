// @ts-nocheck
import {test,expect} from '@playwright/test';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}

for(const cap of ['triangle','diamond','circle'])test(`${cap} owns both tips without a rounded shaft nub on GPU or SVG at 2%, 100% and 2000%`,async({page})=>{
 test.setTimeout(60000);await blank(page);
 const results=await page.evaluate(async cap=>{
  const b=window.__board,Graphics=b.app.stage.children[0].constructor,Container=b.app.stage.constructor,Rectangle=b.app.screen.constructor,{paintConnector,connectorSvgContent}=await import('/src/render/connector-paint.ts'),{capGeometry}=await import('/src/core/line-decoration.ts'),{connectorCapSegment}=await import('/src/core/connectors.ts'),results=[];
  const sample=(c,t)=>{const u=1-t;return {x:u*u*u*c.p0.x+3*u*u*t*c.p1.x+3*u*t*t*c.p2.x+t*t*t*c.p3.x,y:u*u*u*c.p0.y+3*u*u*t*c.p1.y+3*u*t*t*c.p2.y+t*t*t*c.p3.y};};
  const bank=(pixels,left,right,top,bottom)=>{let ink=0;for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)ink+=pixels[(y*720+x)*4+3];return ink;};
  for(const zoom of [.02,1,20])for(const curved of [false,true])for(const pattern of ['normal','dashed','dotted']){
   const p=(x,y)=>({x:x/zoom,y:y/zoom}),cubics=[{p0:p(100,150),p1:p(240,150),p2:p(220,60),p3:p(350,60)},{p0:p(350,60),p1:p(480,60),p2:p(460,150),p3:p(600,150)}],geometry=curved?{points:cubics.flatMap((c,i)=>Array.from({length:49},(_,j)=>sample(c,j/48)).slice(i?1:0)),cubics}:{points:[p(100,150),p(600,150)]};
   const line={id:'caps',type:'connector',shape:curved?'curved':'straight',start:{kind:'point',...p(100,150)},end:{kind:'point',...p(600,150)},style:{strokeColor:'#000000',strokeWidth:40/zoom,startCap:cap,endCap:cap,strokeStyle:pattern},z:0},snapshot=JSON.stringify({line,geometry}),parent=new Container(),reference=new Container(),g=new Graphics(),heads=new Graphics();parent.addChild(g);reference.addChild(heads);g.scale.set(zoom);heads.scale.set(zoom);paintConnector(g,line,geometry,true,zoom);
   for(const which of ['start','end']){const tangent=connectorCapSegment(geometry,which),head=capGeometry(cap,tangent.from,tangent.to,line.style.strokeWidth);for(const polygon of head.polygons)heads.poly(polygon).fill('#000000');for(const circle of head.circles)heads.circle(circle.x,circle.y,circle.radius).fill('#000000');}
   const extract=target=>b.app.renderer.extract.pixels({target,frame:new Rectangle(0,0,720,300),resolution:1,antialias:true}).pixels,actual=extract(parent),ref=extract(reference);let frontError=0,frontCount=0;for(const [left,right]of [[98,113],[587,602]])for(let y=130;y<170;y++)for(let x=left;x<right;x++){frontError+=Math.abs(actual[(y*720+x)*4+3]-ref[(y*720+x)*4+3]);frontCount++;}
   const source=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="300" viewBox="0 0 ${720/zoom} ${300/zoom}">${connectorSvgContent(line,geometry,false)}</svg>`,image=new Image();image.src='data:image/svg+xml;base64,'+btoa(source);await image.decode();const canvas=document.createElement('canvas');canvas.width=720;canvas.height=300;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const svg=ctx.getImageData(0,0,720,300).data;
   results.push({zoom,curved,pattern,frontError:frontError/frontCount,gpuLeak:bank(actual,604,616,140,160)+bank(actual,84,96,140,160),svgLeak:bank(svg,604,616,140,160)+bank(svg,84,96,140,160),tipInk:bank(actual,588,600,146,154)+bank(actual,100,112,146,154),unchanged:JSON.stringify({line,geometry})===snapshot});
   parent.destroy({children:true});reference.destroy({children:true});
  }
  const control=new Graphics();control.moveTo(100,150).lineTo(600,150).stroke({color:'#000000',width:40,cap:'round'});const controlPixels=b.app.renderer.extract.pixels({target:control,frame:new Rectangle(0,0,720,300),resolution:1,antialias:true}).pixels;const positiveControl=bank(controlPixels,604,616,140,160)+bank(controlPixels,84,96,140,160);control.destroy();return {results,positiveControl};
 },cap);
 expect(results.positiveControl).toBeGreaterThan(50000);
 for(const result of results.results){expect(result.gpuLeak,JSON.stringify(result)).toBe(0);expect(result.svgLeak,JSON.stringify(result)).toBe(0);expect(result.frontError,JSON.stringify(result)).toBeLessThan(3);expect(result.tipInk,JSON.stringify(result)).toBeGreaterThan(1000);expect(result.unchanged).toBe(true);}
});

test('overlapping filled caps keep their original endpoints and produce finite short-line output',async({page})=>{
 await blank(page);const result=await page.evaluate(async()=>{const {connectorShaftGeometry}=await import('/src/render/connector-shaft.ts'),{connectorSvgContent}=await import('/src/render/connector-paint.ts'),points=[{x:10,y:20},{x:12,y:20}],line={id:'short',type:'connector',start:{kind:'point',...points[0]},end:{kind:'point',...points[1]},shape:'straight',style:{strokeWidth:40,strokeColor:'#000000',startCap:'triangle',endCap:'circle'},z:0},geometry={points},snapshot=JSON.stringify({line,geometry});return {shaft:connectorShaftGeometry(line,geometry).points,svg:connectorSvgContent(line,geometry,false),unchanged:JSON.stringify({line,geometry})===snapshot};});expect(result.shaft).toEqual([]);expect(result.svg).not.toMatch(/NaN|Infinity/);expect(result.svg).toContain('<polygon');expect(result.svg).toContain('<circle');expect(result.unchanged).toBe(true);
});
