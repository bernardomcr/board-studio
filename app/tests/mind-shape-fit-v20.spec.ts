// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page,zoom){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();await page.evaluate(zoom=>{const b=window.__board;b.camera.x=b.camera.y=0;b.camera.scale=zoom;},zoom);}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function ink(page,id){
 await settle(page);return page.evaluate(id=>{
  const b=window.__board,w=b.state.widgets.get(id),zoom=b.camera.scale,at=b.camera.worldToScreen({x:w.x,y:w.y}),R=b.app.screen.constructor,pad=8,width=w.width*zoom,height=w.height*zoom;
  b.app.renderer.render({container:b.app.stage});
  const data=b.app.renderer.extract.pixels({target:b.app.stage,frame:new R(at.x-pad,at.y-pad,Math.round(width)+pad*2,Math.round(height)+pad*2),resolution:1,clearColor:'#ffffff',antialias:true}),rx=width/2,ry=height/2;
  let inside=0,outside=0;const leaks=[];
  for(let i=0;i<data.pixels.length;i+=4){const pixels=data.pixels,alpha=pixels[i+3];if(alpha<=16||pixels[i]*255/alpha>=190||pixels[i+1]*255/alpha>=190||pixels[i+2]*255/alpha>=190)continue;
   const x=(i/4)%data.width+.5-pad,y=Math.floor(i/4/data.width)+.5-pad,dx=Math.abs(x-rx),dy=Math.abs(y-ry);
   // Independent analytic ellipse/diamond contours. Allow one screen pixel
   // at the antialiased edge; never use the application's own hit-test path.
   const within=w.shape==='circle'?(dx/(rx+1))**2+(dy/(ry+1))**2<=1:dx/rx+dy/ry<=1+Math.hypot(1/rx,1/ry);
   if(within)inside++;else{outside++;if(leaks.length<8)leaks.push({x,y});}
  }
  return {inside,outside,leaks,widget:JSON.stringify(w),screen:{width,height},zoom};
 },id);
}

for(const shape of ['circle','rhombus'])for(const zoom of [.02,1,20])test(`mind ${shape} contains actual fitted glyph ink at ${zoom*100}% and preserves the preferred font, scale and replayable geometry`,async({page})=>{
 await blank(page,zoom);const setup=await page.evaluate(async({shape,zoom})=>{
  const b=window.__board,{createMindMap}=await import('/src/core/mindmap.ts'),{fitBoxText}=await import('/src/core/text-layout.ts'),content='Planejar com clareza e organizar ideias em cada etapa. '.repeat(10),id=createMindMap(b.state,b.bus,{x:0,y:0},content,1/zoom),w=b.state.widgets.get(id);
  b.bus.exec({op:'BACKGROUND_UPDATE',payload:{color:'#ffffff',grid:false}});
  b.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{x:-120/zoom,y:-90/zoom,width:240/zoom,height:180/zoom,style:{...w.style,fontFamily:'Inter',fontSize:96/zoom,fontWeight:'normal',color:'#000000',fillColor:'transparent',fillOpacity:0,borderColor:'transparent',borderWidth:0,borderScale:0,textAlign:'left',textAlignVertical:'top'}}}});
  b.bus.exec({op:'SELECTION_SET',payload:[]});
  // Prime the rectangular topic before changing only its shape. The GPU
  // renderer must invalidate that fitted layout as the safe region changes.
  return {id,before:JSON.stringify(b.state.widgets.get(id)),preferred:96/zoom,scale:1/zoom,rectangleFont:fitBoxText(b.state.widgets.get(id)).fontSize,shape};
 },{shape,zoom});
 await settle(page);await page.evaluate(({id,shape})=>window.__board.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{shape}}}),setup);
 const expected=await page.evaluate(id=>JSON.stringify(window.__board.state.widgets.get(id)),setup.id),first=await ink(page,setup.id);
 expect(first.inside,JSON.stringify(first)).toBeGreaterThan(300);expect(first.outside,JSON.stringify(first)).toBe(0);expect(first.widget).toBe(expected);expect(first.screen.width).toBeCloseTo(240,5);expect(first.screen.height).toBeCloseTo(180,5);
 const fit=await page.evaluate(async id=>{const w=window.__board.state.widgets.get(id),{fitBoxText}=await import('/src/core/text-layout.ts');return {font:fitBoxText(w).fontSize,preferred:w.style.fontSize,scale:w.mind.layoutScale};},setup.id);expect(fit.preferred).toBe(setup.preferred);expect(fit.scale).toBe(setup.scale);expect(fit.font).toBeLessThan(setup.rectangleFont);
 await page.keyboard.press('Control+z');expect(await page.evaluate(id=>JSON.stringify(window.__board.state.widgets.get(id)),setup.id)).toBe(setup.before);await page.keyboard.press('Control+Shift+z');const replay=await ink(page,setup.id);expect(replay.widget).toBe(expected);expect(replay.inside).toBeGreaterThan(300);expect(replay.outside,JSON.stringify(replay)).toBe(0);
 await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);const restored=await ink(page,setup.id);expect(restored.widget).toBe(expected);expect(restored.zoom).toBe(zoom);expect(restored.inside).toBeGreaterThan(300);expect(restored.outside,JSON.stringify(restored)).toBe(0);await page.keyboard.press('Control+z');expect(await page.evaluate(id=>JSON.stringify(window.__board.state.widgets.get(id)),setup.id)).toBe(setup.before);
});
