// @ts-nocheck
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function blank(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board'}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function brush(page,size=40,opacity=40){
  await page.locator('[data-tool="brush"]').click();
  await page.getByRole('button',{name:`Tamanho: ${size}`,exact:true}).click();
  const range=page.getByRole('slider',{name:'Opacidade do pincel',exact:true});
  await range.press('Home');for(let value=0;value<opacity;value+=10)await range.press('PageUp');
  await expect(range).toHaveValue(String(opacity));
  await page.getByRole('checkbox',{name:'Precisão do pincel',exact:true}).check();
}
async function settled(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('brush precision and Alt-left size/opacity gestures use the visible tip and preserve panned/zoomed coordinates',async({page})=>{
  await blank(page);await expect(page.locator('[data-tool="pen"]')).toHaveCount(0);
  await page.evaluate(()=>{const c=window.__board.camera;c.x=1350;c.y=-900;c.scale=2;});
  await brush(page,12,100);await expect(page.getByRole('checkbox',{name:/pressão/i})).toHaveCount(0);
  await page.mouse.move(650,500);await expect(page.locator('#brush-tip')).toBeVisible();
  await expect(page.locator('#app canvas')).toHaveCSS('cursor','none');await expect(page.locator('#brush-tip')).toHaveCSS('width','24px');
  await page.keyboard.down('Alt');await page.mouse.down();await page.mouse.move(750,580,{steps:12});
  await expect(page.locator('#brush-adjustment')).toBeVisible();await expect(page.locator('#brush-adjustment')).toHaveText('Tamanho 32  ·  Opacidade 60%');
  expect(await page.evaluate(()=>({kind:window.__board.gesture().kind,strokes:window.__board.state.strokes.size}))).toEqual({kind:'brush-adjust',strokes:0});
  await page.mouse.up();await page.keyboard.up('Alt');await expect(page.locator('#brush-adjustment')).toBeHidden();
  await expect(page.getByRole('slider',{name:'Tamanho do pincel',exact:true})).toHaveValue('32');
  await expect(page.getByRole('slider',{name:'Opacidade do pincel',exact:true})).toHaveValue('60');await expect(page.locator('#brush-tip')).toHaveCSS('width','64px');
  await page.mouse.move(650,650);await page.mouse.down();await page.mouse.move(850,680,{steps:20});await page.mouse.up();
  const stroke=await page.evaluate(()=>[...window.__board.state.strokes.values()][0]);
  expect(stroke).toMatchObject({tool:'brush',precision:true,opacity:.6});expect(stroke.points[0]).toMatchObject({x:1275,y:-825,r:16});expect(stroke.points.at(-1)).toMatchObject({x:1375,y:-810,r:16});
  expect(new Set(stroke.points.map(p=>p.r)).size).toBe(1);
  await page.keyboard.down('Space');await expect(page.locator('#brush-tip')).toBeHidden();await expect(page.locator('#app canvas')).toHaveCSS('cursor','grab');await page.keyboard.up('Space');await expect(page.locator('#brush-tip')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('board-app:drawing-settings')).brush)).toMatchObject({width:32,opacity:.6,precision:true});
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);await page.locator('[data-tool="brush"]').click();
  await expect(page.getByRole('slider',{name:'Tamanho do pincel',exact:true})).toHaveValue('32');await expect(page.getByRole('slider',{name:'Opacidade do pincel',exact:true})).toHaveValue('60');await expect(page.getByRole('checkbox',{name:'Precisão do pincel',exact:true})).toBeChecked();
});

test('a long real brush gesture has identical opacity at crossings and frozen-preview chunk joins before and after release',async({page})=>{
  await blank(page);await brush(page);
  await page.mouse.move(800,500);await page.mouse.down();
  for(let i=1;i<=420;i++){const t=i/420*Math.PI*2;await page.mouse.move(800+200*Math.sin(t),500+140*Math.sin(2*t));}
  await settled(page);
  const live=await page.evaluate(()=>{
    const b=window.__board,g=b.gesture(),layer=b.app.stage.children.find(n=>n.label==='brush-preview');
    const points=[g.points[0],g.points[128],g.points[256],g.points[384]],samples=points.map(p=>b.camera.worldToScreen(p));
    const canvas=b.app.renderer.extract.canvas({target:layer,frame:new b.app.screen.constructor(0,0,1600,1000),resolution:1}),ctx=canvas.getContext('2d');
    const alpha=p=>ctx.getImageData(Math.round(p.x),Math.round(p.y),1,1).data[3];
    return {chunks:layer.children.length,count:g.points.length,samples,alphas:samples.map(alpha),holes:[alpha({x:650,y:500}),alpha({x:950,y:500})]};
  });
  expect(live.count).toBeGreaterThan(400);expect(live.chunks).toBeGreaterThanOrEqual(4);expect(live.holes).toEqual([0,0]);
  for(const alpha of live.alphas){expect(alpha).toBeGreaterThanOrEqual(100);expect(alpha).toBeLessThanOrEqual(104);}
  await page.screenshot({path:'../work/v9-brush-preview.png'});await page.mouse.up();await settled(page);
  const final=await page.evaluate(samples=>{
    const b=window.__board,s=[...b.state.strokes.values()][0],node=b.app.stage.children[1].children[3].children.find(n=>n.label===s.id),bounds=node.getLocalBounds();
    const canvas=b.app.renderer.extract.canvas({target:node,frame:new b.app.screen.constructor(bounds.minX,bounds.minY,bounds.width,bounds.height),resolution:1}),ctx=canvas.getContext('2d');
    const alpha=p=>{const w=b.camera.screenToWorld(p);return ctx.getImageData(Math.round(w.x-bounds.minX),Math.round(w.y-bounds.minY),1,1).data[3];};
    return {tool:s.tool,opacity:s.opacity,precision:s.precision,alphas:samples.map(alpha),holes:[alpha({x:650,y:500}),alpha({x:950,y:500})],previewEmpty:b.app.stage.children.find(n=>n.label==='brush-preview').children.every(n=>!n.context?.instructions?.length)};
  },live.samples);
  expect(final).toMatchObject({tool:'brush',opacity:.4,precision:true,holes:[0,0],previewEmpty:true});
  for(let i=0;i<final.alphas.length;i++)expect(Math.abs(final.alphas[i]-live.alphas[i])).toBeLessThanOrEqual(2);
});

test('editable project files round-trip brush opacity/precision and continue opening legacy pen strokes',async({page})=>{
  await blank(page);await brush(page,12,40);await page.mouse.move(600,500);await page.mouse.down();await page.mouse.move(800,600,{steps:24});await page.mouse.up();await page.keyboard.press('Escape');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Salvar arquivo',exact:true}).click();
  const data=JSON.parse((await readFile(await(await download).path())).toString());expect(data.strokes[0]).toMatchObject({tool:'brush',opacity:.4,precision:true});
  data.strokes[0].opacity=.23;data.strokes[0].name='Pincel importado';
  const legacy={...data.strokes[0],id:'legacy-pen',tool:'pen',name:'Caneta antiga',z:data.strokes[0].z+1,points:data.strokes[0].points.map(p=>({...p,x:p.x+250}))};delete legacy.opacity;delete legacy.precision;
  data.strokes.push(legacy);data.strokeOrder.push(legacy.id);
  const open=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Abrir arquivo',exact:true}).click();await(await open).setFiles({name:'pincel.board.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect.poll(()=>page.evaluate(()=>window.__board.state.strokes.size)).toBe(2);
  const imported=await page.evaluate(async()=>{const b=window.__board,strokes=[...b.state.strokes.values()],{strokeSvgContent}=await import('/src/render/stroke-paint.ts');return {strokes,svg:strokeSvgContent(strokes[0])};});
  expect(imported.strokes[0]).toMatchObject({tool:'brush',opacity:.23,precision:true,name:'Pincel importado'});expect(imported.strokes[1]).toMatchObject({tool:'pen',name:'Caneta antiga'});expect(imported.strokes[1].opacity).toBeUndefined();expect(imported.strokes[1].precision).toBeUndefined();
  expect(imported.svg).toContain('opacity="0.23"');expect(imported.svg).toContain('C');expect(imported.svg).toContain('fill="none"');
  const invalid=await page.evaluate(async data=>{const {validateBoardFile}=await import('/src/project-files.ts');return [1.1,-.1].map(opacity=>{try{validateBoardFile({...data,strokes:data.strokes.map((s,i)=>i===0?{...s,opacity}:s)});return false;}catch{return true;}});},data);expect(invalid).toEqual([true,true]);
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);
  expect(await page.evaluate(()=>[...window.__board.state.strokes.values()].map(s=>({tool:s.tool,opacity:s.opacity,precision:s.precision})))).toEqual([{tool:'brush',opacity:.23,precision:true},{tool:'pen',opacity:undefined,precision:undefined}]);
});

test('idle hover skips long stroke samples outside cached bounds while an actual stroke remains selectable',async({page})=>{
  await blank(page);
  const inside=await page.evaluate(async()=>{
    const b=window.__board,{strokeGeometry,strokeBounds}=await import('/src/core/strokes.ts');
    b.bus.exec({op:'STROKE_CREATE',payload:{id:'long-hover',type:'stroke',tool:'brush',color:'#299d70',precision:false,opacity:1,z:0,points:Array.from({length:10001},(_,i)=>({x:i*.06-300,y:20*Math.sin(i/200),r:3}))}});
    const stroke=b.state.strokes.get('long-hover'),geometry=strokeGeometry(stroke);strokeBounds(stroke);
    window.__strokeGeometryReads=0;
    geometry.points=new Proxy(geometry.points,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))window.__strokeGeometryReads++;return Reflect.get(target,key,receiver);}});
    return b.camera.worldToScreen(stroke.points[5000]);
  });
  await page.mouse.move(1350,800);await page.mouse.move(1450,750);
  expect(await page.evaluate(()=>window.__strokeGeometryReads)).toBe(0);
  await page.mouse.move(inside.x,inside.y);
  expect(await page.evaluate(()=>window.__strokeGeometryReads)).toBeGreaterThan(1000);
  await page.mouse.click(inside.x,inside.y);
  expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['long-hover']);
});
