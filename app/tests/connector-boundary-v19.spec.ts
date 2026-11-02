import {test,expect} from '@playwright/test';
import {connectorGeometry,connectorCapSegment,connectorDecorationSegment,connectorIntersectsRect,nearestAnchor,anchorWorld,facingAnchor,type Connector,type ConnectorGeometry,type CapStyle} from '../src/core/connectors';
import {capGeometry} from '../src/core/line-decoration';
import {connectorShaftGeometry} from '../src/render/connector-shaft';
import {connectorSvgContent} from '../src/render/connector-paint';
import {worldToLocal,rotate,type Vec} from '../src/core/geometry';
import {createWidget,type Widget} from '../src/core/model';

const capStyles:CapStyle[]=['none','arrow','triangle','circle','diamond','bar'];
const dot=(a:Vec,b:Vec)=>a.x*b.x+a.y*b.y;
const offset=(a:Vec,b:Vec)=>({x:a.x-b.x,y:a.y-b.y});
function image(zoom:number,rotation:number,maskShape:'rectangle'|'ellipse'|'round_rectangle'):Widget{
  const shape=createWidget('shape',{x:500/zoom,y:100/zoom,shape:'rectangle',width:240/zoom,height:180/zoom});
  return {...shape,type:'image',rotation,src:'data:image/png;base64,',naturalWidth:1200,naturalHeight:900,maskShape,crop:{x:.1,y:.2,width:.6,height:.6},style:{...shape.style,borderWidth:12/zoom,borderScale:12/180,cornerRadius:38/zoom}} as Widget;
}
function outsideDecoration(connector:Connector,geometry:ConnectorGeometry,which:'start'|'end'){
  const boundary=geometry.boundaries![which]!,tangent=connectorDecorationSegment(connector,geometry,which),cap=capGeometry(connector.style[which==='start'?'startCap':'endCap'],tangent.from,tangent.to,connector.style.strokeWidth),radius=connector.style.strokeWidth/2;
  const signed=(p:Vec)=>dot(offset(p,boundary.point),boundary.normal),support:number[]=[];
  for(const polygon of cap.polygons)for(let i=0;i<polygon.length;i+=2)support.push(signed({x:polygon[i]!,y:polygon[i+1]!}));
  for(const line of cap.lines)for(const point of line)support.push(signed(point)-radius);
  for(const circle of cap.circles)support.push(signed(circle)-circle.radius);
  return support.length?Math.min(...support):0;
}

test('@cpu every attached marker and rounded shaft stop at the visible border at 2%, 100%, 2000%',()=>{
  let count=0;
  for(const zoom of [.02,1,20])for(const rotation of [0,.43,Math.PI/2])for(const mask of ['rectangle','ellipse','round_rectangle'] as const)for(const cap of capStyles)for(const shape of ['straight','curved','elbowed'] as const){
    const w=image(zoom,rotation,mask),widgets=new Map([[w.id,w]]),anchor={kind:'anchor' as const,widgetId:w.id,x:0,y:.5},edge=anchorWorld(w,0,.5),normal=rotate({x:-1,y:0},rotation),free={kind:'point' as const,x:edge.x+normal.x*500/zoom,y:edge.y+normal.y*500/zoom};
    for(const which of ['start','end'] as const){
      const line:Connector={id:'line',type:'connector',start:which==='start'?anchor:free,end:which==='end'?anchor:free,shape,style:{strokeColor:'#ae82f5',strokeWidth:24/zoom,startCap:cap,endCap:cap},z:2},snapshot=JSON.stringify({w,line}),geometry=connectorGeometry(line,widgets)!;
      const boundary=geometry.boundaries![which]!,point=which==='start'?geometry.points[0]!:geometry.points.at(-1)!;
      expect(Math.hypot(point.x-boundary.point.x,point.y-boundary.point.y)*zoom).toBeLessThan(1e-6);
      expect(outsideDecoration(line,geometry,which)*zoom,JSON.stringify({zoom,rotation,mask,cap,shape,which})).toBeGreaterThan(-1e-6);
      const shaft=connectorShaftGeometry(line,geometry),tip=which==='start'?shaft.points[0]!:shaft.points.at(-1)!;
      expect(dot(offset(tip,boundary.point),boundary.normal)*zoom+1e-5).toBeGreaterThanOrEqual(line.style.strokeWidth*zoom/2);
      expect(JSON.stringify({w,line})).toBe(snapshot);
      expect(connectorSvgContent(line,geometry,false)).not.toMatch(/NaN|Infinity/);
      count++;
    }
  }
  expect(count).toBe(972);
});

test('@cpu an oblique open arrow respects the edge rather than extending its round join into the object',()=>{
  for(const cap of capStyles){
    const w=image(1,.31,'rectangle'),widgets=new Map([[w.id,w]]),edge=anchorWorld(w,0,.5),normal=rotate({x:-1,y:0},w.rotation),along=rotate({x:0,y:1},w.rotation),line:Connector={id:'oblique',type:'connector',start:{kind:'point',x:edge.x+normal.x*500+along.x*250,y:edge.y+normal.y*500+along.y*250},end:{kind:'anchor',widgetId:w.id,x:0,y:.5},shape:'straight',style:{strokeColor:'#000000',strokeWidth:35,endCap:cap},z:2},geometry=connectorGeometry(line,widgets)!;
    expect(outsideDecoration(line,geometry,'end')).toBeGreaterThan(-1e-7);
    const shaft=connectorShaftGeometry(line,geometry),point=shaft.points.at(-1)!,boundary=geometry.boundaries!.end!;
    expect(dot(offset(point,boundary.point),boundary.normal)+1e-7).toBeGreaterThanOrEqual(17.5);
  }
});

test('@cpu ellipse and rounded image anchors use exact mask contours, including legacy corner anchors',()=>{
  for(const zoom of [.02,1,20])for(const rotation of [0,.63]){
    const ellipse=image(zoom,rotation,'ellipse'),rounded=image(zoom,rotation,'round_rectangle');
    for(const w of [ellipse,rounded])for(const p of [anchorWorld(w,0,0),anchorWorld(w,.2,.1),anchorWorld(w,1,1),anchorWorld(w,0,.5)]){
      const a=nearestAnchor(w,p),local=worldToLocal(w,anchorWorld(w,a.x,a.y));
      if(w===ellipse){const equation=((local.x-w.width/2)/(w.width/2))**2+((local.y-w.height/2)/(w.height/2))**2;expect(Math.abs(equation-1)).toBeLessThan(1e-10);}
      else{const r=38/zoom,cx=Math.max(r,Math.min(w.width-r,local.x)),cy=Math.max(r,Math.min(w.height-r,local.y));expect(Math.abs(Math.hypot(local.x-cx,local.y-cy)-r)*zoom).toBeLessThan(1e-8);}
      const f=facingAnchor(w,p),onRay=worldToLocal(w,anchorWorld(w,f.x,f.y));
      if(w===rounded){const r=38/zoom,cx=Math.max(r,Math.min(w.width-r,onRay.x)),cy=Math.max(r,Math.min(w.height-r,onRay.y));expect(Math.abs(Math.hypot(onRay.x-cx,onRay.y-cy)-r)*zoom).toBeLessThan(1e-8);}
    }
  }
});

test('@cpu resizing a bordered target updates the attachment without changing its stored anchor',()=>{
  const w=image(1,0,'rectangle'),widgets=new Map([[w.id,w]]),line:Connector={id:'resize',type:'connector',start:{kind:'point',x:0,y:190},end:{kind:'anchor',widgetId:w.id,x:0,y:.5},shape:'curved',style:{strokeColor:'#000000',strokeWidth:20,endCap:'arrow'},z:2},snapshot=JSON.stringify(line),before=connectorGeometry(line,widgets)!;
  const resized={...w,x:600,width:480,height:360,style:{...w.style,borderWidth:24}};widgets.set(w.id,resized);
  const after=connectorGeometry(line,widgets)!;
  expect(before).not.toBe(after);
  expect(after.points.at(-1)!.x).toBeCloseTo(588,8);
  expect(after.points.at(-1)!.y).toBeCloseTo(280,8);
  expect(outsideDecoration(line,after,'end')).toBeGreaterThan(-1e-8);
  expect(JSON.stringify(line)).toBe(snapshot);
});

test('@cpu marquee selects actual curved ink and marker area, never empty parts of their bounding box',()=>{
  const line:Connector={id:'area',type:'connector',start:{kind:'point',x:0,y:0},end:{kind:'point',x:1000,y:1000},shape:'straight',style:{strokeColor:'#000000',strokeWidth:4,endCap:'triangle'},z:1},geometry={points:[{x:0,y:0},{x:1000,y:1000}]};
  expect(connectorIntersectsRect(line,geometry,{minX:0,minY:800,maxX:200,maxY:1000})).toBe(false);
  expect(connectorIntersectsRect(line,geometry,{minX:450,minY:450,maxX:460,maxY:460})).toBe(true);
  expect(connectorIntersectsRect(line,geometry,{minX:987,minY:995,maxX:991,maxY:999})).toBe(true);
  const curved:Connector={...line,shape:'curved',start:{kind:'anchor',widgetId:'unused',x:0,y:0},end:{kind:'anchor',widgetId:'unused',x:0,y:0}},cubic={p0:{x:0,y:0},p1:{x:800,y:0},p2:{x:800,y:800},p3:{x:0,y:800}},points=Array.from({length:161},(_,i)=>{const t=i/160,u=1-t;return {x:u**3*cubic.p0.x+3*u*u*t*cubic.p1.x+3*u*t*t*cubic.p2.x+t**3*cubic.p3.x,y:u**3*cubic.p0.y+3*u*u*t*cubic.p1.y+3*u*t*t*cubic.p2.y+t**3*cubic.p3.y};}),curve={points,cubic};
  expect(connectorIntersectsRect(curved,curve,{minX:40,minY:350,maxX:100,maxY:450})).toBe(false);
  expect(connectorIntersectsRect(curved,curve,{minX:595,minY:395,maxX:605,maxY:405})).toBe(true);
  expect(connectorIntersectsRect(line,{points:[{x:0,y:0},{x:0,y:1000}]},{minX:0,minY:400,maxX:0,maxY:500})).toBe(true);
});

test('@cpu free connector endpoints retain the original cap and short-shaft geometry',()=>{
  for(const cap of capStyles){const line:Connector={id:'free',type:'connector',start:{kind:'point',x:0,y:0},end:{kind:'point',x:120,y:30},shape:'curved',style:{strokeColor:'#000000',strokeWidth:6,startCap:cap,endCap:cap},z:0},g=connectorGeometry(line,new Map())!;expect(g.boundaries).toBeUndefined();expect(connectorDecorationSegment(line,g,'end')).toEqual(connectorCapSegment(g,'end'));}
});

test('GPU and SVG marker ink touches rotated image edges without covering their interiors at macro and detail zoom',async({page})=>{
  test.setTimeout(60000);
  await page.goto('/');await page.waitForFunction(()=>Boolean((window as any).__board?.booted));
  const results=await page.evaluate(async()=>{
    const b=(window as any).__board,{connectorGeometry,anchorWorld}=await import('/src/core/connectors.ts'),{createWidget}=await import('/src/core/model.ts'),{paintConnector,connectorSvgContent}=await import('/src/render/connector-paint.ts'),{rotate}=await import('/src/core/geometry.ts'),Graphics=b.app.stage.children[0].constructor,Container=b.app.stage.constructor,Rectangle=b.app.screen.constructor;
    const results:any[]=[],width=900,height=550;
    function measure(data:Uint8Array|Uint8ClampedArray,point:{x:number;y:number},normal:{x:number;y:number}){
      let interior=0,nearEdge=Infinity,total=0;
      for(let y=Math.max(0,Math.floor(point.y-170));y<Math.min(height,point.y+170);y++)for(let x=Math.max(0,Math.floor(point.x-170));x<Math.min(width,point.x+170);x++){
        const alpha=data[(y*width+x)*4+3]!;if(alpha<8)continue;
        const dx=x+.5-point.x,dy=y+.5-point.y,outward=dx*normal.x+dy*normal.y,across=-dx*normal.y+dy*normal.x;
        if(Math.abs(across)>150)continue;total+=alpha;
        if(outward<-2)interior+=alpha;
        nearEdge=Math.min(nearEdge,outward);
      }
      return {interior,nearEdge,total};
    }
    for(const zoom of [.02,1,20])for(const rotation of [0,.43])for(const maskShape of ['rectangle','ellipse','round_rectangle'])for(const endCap of ['none','arrow','triangle','circle','diamond','bar']){
      const base=createWidget('image',{x:490/zoom,y:150/zoom,width:240/zoom,height:180/zoom}),w={...base,rotation,maskShape,crop:{x:.1,y:.15,width:.7,height:.65},style:{...base.style,borderColor:'#000000',borderWidth:12/zoom,borderScale:12/180,cornerRadius:38/zoom}},edge=anchorWorld(w,0,.5),normal=rotate({x:-1,y:0},rotation),side=rotate({x:0,y:1},rotation),line={id:'edge',type:'connector',start:{kind:'point',x:edge.x+normal.x*420/zoom+side.x*90/zoom,y:edge.y+normal.y*420/zoom+side.y*90/zoom},end:{kind:'anchor',widgetId:w.id,x:0,y:.5},shape:'curved',style:{strokeColor:'#b052ed',strokeWidth:24/zoom,endCap},z:0},geometry=connectorGeometry(line,new Map([[w.id,w]]))!,boundary=geometry.boundaries!.end!,point={x:boundary.point.x*zoom,y:boundary.point.y*zoom},parent=new Container(),g=new Graphics();
      parent.addChild(g);g.scale.set(zoom);paintConnector(g,line,geometry,true,zoom);
      const actual=b.app.renderer.extract.pixels({target:parent,frame:new Rectangle(0,0,width,height),resolution:1,antialias:true}).pixels,gpu=measure(actual,point,boundary.normal);
      const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width/zoom} ${height/zoom}">${connectorSvgContent(line,geometry,false)}</svg>`,image=new Image();image.src='data:image/svg+xml;base64,'+btoa(source);await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const svg=measure(context.getImageData(0,0,width,height).data,point,boundary.normal);
      results.push({zoom,rotation,maskShape,endCap,gpu,svg});parent.destroy({children:true});
    }
    const bad=new Graphics();bad.moveTo(70,240).lineTo(484,240).stroke({color:'#000000',width:24,cap:'round'});const control=b.app.renderer.extract.pixels({target:bad,frame:new Rectangle(0,0,width,height),resolution:1,antialias:true}).pixels,positiveControl=measure(control,{x:484,y:240},{x:-1,y:0});bad.destroy();return {results,positiveControl};
  });
  expect(results.positiveControl.interior).toBeGreaterThan(15000);
  expect(results.results).toHaveLength(108);
  for(const result of results.results){
    expect(result.gpu.interior,JSON.stringify(result)).toBe(0);
    expect(result.svg.interior,JSON.stringify(result)).toBe(0);
    expect(result.gpu.nearEdge,JSON.stringify(result)).toBeLessThan(1.8);
    expect(result.svg.nearEdge,JSON.stringify(result)).toBeLessThan(1.8);
    expect(result.gpu.total,JSON.stringify(result)).toBeGreaterThan(5000);
    expect(result.svg.total,JSON.stringify(result)).toBeGreaterThan(5000);
  }
});
