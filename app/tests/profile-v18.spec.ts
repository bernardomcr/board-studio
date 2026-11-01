// @ts-nocheck
import {test,expect} from '@playwright/test';

// Opt-in A/B instrumentation only; the ordinary profile tests stay untouched.
test.beforeEach(async({page})=>{
 const probe=process.env.BOARD_TEST_GPU_PROBE==='true',pauseRenderer=process.env.BOARD_TEST_PAUSE_RENDERER==='true';if(!probe&&!pauseRenderer)return;
 page.on('console',message=>{if(message.text().startsWith('CI_RENDERER_PROBE '))console.log(message.text());});
 page.on('pageerror',error=>console.log('CI_RENDERER_PAGEERROR '+JSON.stringify({message:error.message,stack:error.stack})));
 await page.addInitScript(({probe,pauseRenderer})=>{
  const previous=Object.getOwnPropertyDescriptor(window,'__board');let current=previous?.get?previous.get.call(window):previous?.value;
  const inspect=board=>{
   const app=board?.app,renderer=app?.renderer;if(!renderer)return;const gl=renderer.gl??renderer.context?.gl,info={probe,pauseRenderer,dpr:window.devicePixelRatio,rendererType:renderer.type??null,rendererClass:renderer.constructor?.name??null,vendor:null,renderer:null,unmaskedVendor:null,unmaskedRenderer:null,renderCallbackRemoved:false};
   try{if(gl){const debug=gl.getExtension('WEBGL_debug_renderer_info');info.vendor=gl.getParameter(gl.VENDOR);info.renderer=gl.getParameter(gl.RENDERER);if(debug){info.unmaskedVendor=gl.getParameter(debug.UNMASKED_VENDOR_WEBGL);info.unmaskedRenderer=gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);}}}catch(error){info.probeError=String(error);}
   if(pauseRenderer)try{app.ticker.remove(app.render,app);info.renderCallbackRemoved=true;}catch(error){info.pauseError=String(error);}
   console.log('CI_RENDERER_PROBE '+JSON.stringify(info));
  };
  Object.defineProperty(window,'__board',{configurable:true,enumerable:true,get(){return previous?.get?previous.get.call(window):current;},set(board){current=board;previous?.set?.call(window,board);inspect(board);}});if(current)inspect(current);
 },{probe,pauseRenderer});
});

test('a local profile names the workspace without changing boards and persists across reload',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await expect(page.getByRole('dialog',{name:'Perfil local',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Editar perfil local',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Perfil local',exact:true});await dialog.getByRole('textbox',{name:'Seu nome',exact:true}).fill('  Ana Criativa  ');await dialog.getByRole('button',{name:'Salvar perfil',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.bh-workspace strong')).toHaveText('Ana Criativa');
 await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();const before=await page.evaluate(()=>({widgets:[...window.__board.state.widgets],journal:window.__board.bus.snapshot(),camera:{x:window.__board.camera.x,y:window.__board.camera.y,scale:window.__board.camera.scale}}));await page.getByRole('button',{name:'Perfil local',exact:true}).click();await dialog.getByRole('textbox',{name:'Seu nome',exact:true}).fill('Ana Design');await dialog.getByRole('button',{name:'Salvar perfil',exact:true}).click();expect(await page.evaluate(()=>({widgets:[...window.__board.state.widgets],journal:window.__board.bus.snapshot(),camera:{x:window.__board.camera.x,y:window.__board.camera.y,scale:window.__board.camera.scale}}))).toEqual(before);await page.reload();await page.waitForFunction(()=>window.__board?.booted);await expect(page.locator('#profile-open .profile-name')).toHaveText('Ana Design');await page.getByRole('button',{name:'Início',exact:true}).click();await expect(page.locator('.bh-workspace strong')).toHaveText('Ana Design');
});
test('canceling profile editing does not create an online account or replace the stored name',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Editar perfil local',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Perfil local',exact:true});await dialog.getByRole('textbox',{name:'Seu nome',exact:true}).fill('Rascunho');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('board-studio:local-profile:v1'))).toBeNull();await expect(page.locator('.bh-workspace strong')).toHaveText('Meu espaço');
});
