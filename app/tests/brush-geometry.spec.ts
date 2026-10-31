// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}

test('wide rings and self-crossing brush paths have no filled centers or triangular cuts',async({page})=>{
  await blank(page);
  const result=await page.evaluate(async()=>{
    const b=window.__board,{paintStroke,strokeSvgContent}=await import('/src/render/stroke-paint.ts'),Graphics=b.app.stage.children[0].constructor;
    const paths=[
      Array.from({length:401},(_,i)=>{const a=i/400*Math.PI*2;return {x:340+220*Math.cos(a),y:240+130*Math.sin(a),r:45};}),
      Array.from({length:501},(_,i)=>{const a=i/500*Math.PI*2;return {x:340+230*Math.sin(a),y:240+145*Math.sin(2*a),r:45};}),
      [{x:50,y:240,r:45},{x:580,y:240,r:45},{x:200,y:240,r:45},{x:580,y:245,r:45},{x:200,y:250,r:45}],
      Array.from({length:401},(_,i)=>{const a=i/400*Math.PI*2;return {x:340+230*Math.sin(a),y:240+145*Math.sin(2*a),r:30+20*(1+Math.sin(a*3))/2};}),
    ];
    const checks=[];
    for(const precision of [false,true])for(let index=0;index<paths.length;index++){
      const points=paths[index],stroke={id:'qa',type:'stroke',tool:'brush',color:'#299d70',points,precision,opacity:1,z:1},g=new Graphics();paintStroke(g,stroke);
      const bounds={minX:0,minY:0},frame=new b.app.renderer.screen.constructor(0,0,700,500),canvas=b.app.renderer.extract.canvas({target:g,frame,resolution:1}),ctx=canvas.getContext('2d');let cuts=0,fills=0,inside=0,outside=0;
      const distance=(x,y)=>{let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],p=points[i],dx=p.x-a.x,dy=p.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l)):0;best=Math.min(best,Math.hypot(x-a.x-t*dx,y-a.y-t*dy)-(a.r+(p.r-a.r)*t));}return best;};
      for(let y=100;y<390;y+=9)for(let x=100;x<600;x+=9){const d=distance(x,y),px=Math.floor(x-bounds.minX),py=Math.floor(y-bounds.minY);if(px<0||py<0||px>=canvas.width||py>=canvas.height)continue;const alpha=ctx.getImageData(px,py,1,1).data[3];if(d< -8){inside++;if(alpha<245)cuts++;}if(d>9){outside++;if(alpha>8)fills++;}}
      const svg=strokeSvgContent(stroke);checks.push({precision,index,cuts,fills,inside,outside,closedPolygon:svg.startsWith('<polygon'),hasRound:svg.includes('stroke-linecap="round"')||svg.includes('<circle')});g.destroy();
    }
    // An opacity is applied once to the whole gesture, including its crossing.
    const crossing=new Graphics();paintStroke(crossing,{id:'alpha',type:'stroke',tool:'brush',color:'#299d70',opacity:.4,points:paths[1],z:1});const bounds=crossing.getLocalBounds(),canvas=b.app.renderer.extract.canvas({target:crossing,resolution:1}),alpha=canvas.getContext('2d').getImageData(Math.floor(340-bounds.minX),Math.floor(240-bounds.minY),1,1).data[3];crossing.destroy();
    return {checks,alpha};
  });
  for(const check of result.checks){expect(check.inside).toBeGreaterThan(100);expect(check.cuts,JSON.stringify(check)).toBe(0);expect(check.fills,JSON.stringify(check)).toBe(0);expect(check.closedPolygon).toBe(false);expect(check.hasRound).toBe(true);}
  expect(result.alpha).toBeGreaterThanOrEqual(100);expect(result.alpha).toBeLessThanOrEqual(104);
});

test('SVG brush export keeps hollow loops, smooth cubic paths and one crossing opacity',async({page})=>{
  await blank(page);
  const result=await page.evaluate(async()=>{
    const {strokeSvgContent}=await import('/src/render/stroke-paint.ts');
    const points=Array.from({length:401},(_,i)=>{const a=i/400*Math.PI*2;return {x:340+230*Math.sin(a),y:240+145*Math.sin(2*a),r:45};}),stroke={id:'svg',type:'stroke',tool:'brush',points,precision:true,opacity:.4,color:'#299d70',z:1};
    const children=strokeSvgContent(stroke),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500">${children}</svg>`,url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=700;canvas.height=500;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);URL.revokeObjectURL(url);
    return {cubic:children.includes('C'),closed:children.includes('<polygon'),crossing:ctx.getImageData(340,240,1,1).data[3],hole:ctx.getImageData(500,240,1,1).data[3]};
  });
  expect(result).toMatchObject({cubic:true,closed:false,hole:0});expect(result.crossing).toBeGreaterThanOrEqual(100);expect(result.crossing).toBeLessThanOrEqual(104);
});

test('precision chunks match full curves while bounded local work stays independent of path length',async({page})=>{
  await blank(page);
  const result=await page.evaluate(async()=>{
    const {strokeGeometry,strokeGeometryRange}=await import('/src/core/strokes.ts'),{paintStroke}=await import('/src/render/stroke-paint.ts'),b=window.__board,Graphics=b.app.stage.children[0].constructor;
    const points=Array.from({length:1000},(_,i)=>({x:i*.8,y:100+70*Math.sin(i/20)+3*Math.sin(i*2),r:4})),stroke={id:'precision',type:'stroke',tool:'brush',precision:true,color:'#333333',points,z:1};
    const full=strokeGeometry(stroke),retained=strokeGeometry(stroke),chunk=strokeGeometryRange(stroke,256,384),equal=JSON.stringify(chunk.curves)===JSON.stringify(full.curves.slice(256,384));
    const before=JSON.stringify(full.curves.slice(0,900));for(let i=1000;i<1010;i++)points.push({x:i*.8,y:100+70*Math.sin(i/20)+3*Math.sin(i*2),r:4});const stable=before===JSON.stringify(strokeGeometry(stroke).curves.slice(0,900));
    const large=Array.from({length:100000},(_,i)=>({x:i*.8,y:100+70*Math.sin(i/20),r:4}));let reads=0;const proxy=new Proxy(large,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver);}});
    const g=new Graphics();paintStroke(g,{...stroke,points:proxy},{startSegment:50000,endSegment:50128});const commands=g.context.instructions.length;g.destroy();
    return {same:retained===full,equal,stable,reads,commands};
  });
  expect(result.same).toBe(true);expect(result.equal).toBe(true);expect(result.stable).toBe(true);expect(result.reads).toBeLessThan(1500);expect(result.commands).toBeGreaterThan(0);
});

test('selection and adding another stroke reuse previously painted brush geometry',async({page})=>{
  await blank(page);
  const result=await page.evaluate(()=>{
    const b=window.__board,points=Array.from({length:2500},(_,i)=>({x:i*.2-250,y:50*Math.sin(i/20),r:3}));b.bus.exec({op:'STROKE_CREATE',payload:{id:'old',type:'stroke',tool:'brush',color:'#299d70',precision:true,opacity:1,points,z:0}});
    const node=b.app.stage.children[1].children[3].children.find(n=>n.label==='old'),instruction=node.context.instructions[0];
    for(let i=0;i<20;i++)b.bus.exec({op:'SELECTION_SET',payload:i%2?[]:['old']});b.bus.exec({op:'STROKE_CREATE',payload:{id:'new',type:'stroke',tool:'brush',color:'#333333',points:[{x:0,y:100,r:5},{x:100,y:100,r:5}],z:0}});
    return {same:node.context.instructions[0]===instruction,visible:node.visible,count:b.state.strokes.size};
  });
  expect(result).toEqual({same:true,visible:true,count:2});
});

test('a complete two-hundred-thousand-sample regular path avoids argument limits and remains cached',async({page})=>{
  await blank(page);
  const result=await page.evaluate(async()=>{
    const {strokeGeometry,strokeBounds}=await import('/src/core/strokes.ts'),points=Array.from({length:200000},(_,i)=>({x:i*.01,y:Math.sin(i*.003)*10,r:2})),stroke={id:'large',type:'stroke',tool:'brush',precision:false,color:'#299d70',points,z:0};
    const geometry=strokeGeometry(stroke),bounds=strokeBounds(stroke);
    return {knots:geometry.knots.length,points:geometry.points.length,curves:geometry.curves.length,last:geometry.points.at(-1),retained:strokeGeometry(stroke)===geometry,finite:Object.values(bounds).every(Number.isFinite)};
  });
  expect(result).toMatchObject({knots:200000,points:200000,curves:0,retained:true,finite:true});expect(result.last.x).toBeCloseTo(1999.99,6);expect(result.last.r).toBe(2);
});

test('large drawings and erased history reopen from IndexedDB without replacing the small legacy JSON cache',async({page})=>{
  await blank(page);
  const keys=['qa-brush-large-current','qa-brush-large-erased','qa-image-large-current','qa-image-large-erased'];
  const written=await page.evaluate(async keys=>{
    const {writeStoredBoard,readStoredBoard}=await import('/src/core/board-storage.ts');
    const legacy=JSON.stringify({savedAt:1,marker:'old-cache'}),base={title:'Cache regression',widgets:[],order:[],connectors:[],connectorOrder:[],strokes:[],strokeOrder:[],groups:[],camera:{x:0,y:0,scale:1}},points=Array.from({length:12001},(_,i)=>({x:i*.1,y:Math.sin(i),r:2}));
    const stroke={id:'long-stroke',type:'stroke',tool:'brush',color:'#299d70',precision:false,opacity:1,points,z:1};
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(600,600);let seed=123456789;
    for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);const src=canvas.toDataURL('image/png');
    if(src.length<=1000000)throw new Error('The image fixture must exceed the optional JSON image budget.');
    const image={id:'large-image',type:'image',src,width:600,height:600,naturalWidth:600,naturalHeight:600,x:0,y:0,rotation:0,z:1,content:'',style:{}};
    const data=[
      {...base,strokes:[stroke],strokeOrder:[stroke.id]},
      {...base,journal:{applied:[{op:'STROKE_CREATE',payload:stroke},{op:'STROKE_REMOVE',payload:stroke.id}],undone:[]}},
      {...base,widgets:[image],order:[image.id]},
      {...base,journal:{applied:[{op:'WIDGET_CREATE',payload:image},{op:'WIDGET_REMOVE',payload:image.id}],undone:[]}},
    ];
    const result=[];
    for(let i=0;i<keys.length;i++){const key=keys[i];localStorage.setItem(key,legacy);await writeStoredBoard(key,{...data[i],savedAt:10+i,marker:`durable-${i}`});result.push({cacheUnchanged:localStorage.getItem(key)===legacy,marker:(await readStoredBoard(key)).marker});}
    localStorage.setItem('qa-small-legacy',legacy);const old=await readStoredBoard('qa-small-legacy');await writeStoredBoard('qa-small-legacy',{...base,savedAt:20,marker:'small-cached'});
    return {result,smallLegacy:old.marker,smallCached:JSON.parse(localStorage.getItem('qa-small-legacy')).marker};
  },keys);
  expect(written.smallLegacy).toBe('old-cache');expect(written.smallCached).toBe('small-cached');
  for(let i=0;i<keys.length;i++)expect(written.result[i]).toEqual({cacheUnchanged:true,marker:`durable-${i}`});
  await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  const reopened=await page.evaluate(async keys=>{const {readStoredBoard}=await import('/src/core/board-storage.ts');const result=[];for(const key of keys){const data=await readStoredBoard(key);result.push({marker:data.marker,savedAt:data.savedAt,currentStroke:data.strokes[0]?.points.length??0,historicStroke:data.journal?.applied.find(c=>c.op==='STROKE_CREATE')?.payload.points.length??0,currentImage:data.widgets[0]?.src.length??0,historicImage:data.journal?.applied.find(c=>c.op==='WIDGET_CREATE')?.payload.src.length??0,cache:JSON.parse(localStorage.getItem(key)).marker});}return result;},keys);
  for(let i=0;i<keys.length;i++)expect(reopened[i]).toMatchObject({marker:`durable-${i}`,savedAt:10+i,cache:'old-cache'});
  expect(reopened[0].currentStroke).toBe(12001);expect(reopened[1]).toMatchObject({currentStroke:0,historicStroke:12001});expect(reopened[2].currentImage).toBeGreaterThan(1000000);expect(reopened[3].currentImage).toBe(0);expect(reopened[3].historicImage).toBeGreaterThan(1000000);
});
