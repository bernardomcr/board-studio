import {UPDATE_PRIORITY,type Application} from 'pixi.js';

/** Keep simulation/camera ticks running; submit a GPU frame only after a visual
 * change. In particular, an idle grid must not starve DOM input on software GPU. */
export function installRenderDemand(app:Application){
  let dirty=true,contextLost=false;
  const request=()=>{dirty=true;};
  const draw=()=>{if(!dirty||contextLost)return;dirty=false;app.render();};
  app.ticker.remove(app.render,app);
  app.ticker.add(draw,undefined,UPDATE_PRIORITY.LOW);
  const visible=()=>{if(!document.hidden)request();};
  const lost=()=>{contextLost=true;};
  const restored=()=>{contextLost=false;request();};
  window.addEventListener('focus',request);
  window.addEventListener('pageshow',request);
  document.addEventListener('visibilitychange',visible);
  app.renderer.on('resize',request);
  app.canvas.addEventListener('webglcontextlost',lost);
  app.canvas.addEventListener('webglcontextrestored',restored);
  return {request,destroy(){app.ticker.remove(draw);window.removeEventListener('focus',request);window.removeEventListener('pageshow',request);document.removeEventListener('visibilitychange',visible);app.renderer.off('resize',request);app.canvas.removeEventListener('webglcontextlost',lost);app.canvas.removeEventListener('webglcontextrestored',restored);}};
}
