import {Container,Graphics} from 'pixi.js';
import type {StickyWidget} from '../core/model';
import {stickyPadPaper} from '../core/stickies';
import {paintStickySheet} from './sticky-pad-paint';

interface StickyPadMotionApi {parent:Container;nodeAt(id:string):Container|undefined;isLive(id:string):boolean;onChange():void}
/** Hover/pull paper is presentation only: no journal records or copied widgets.
 * At rest there is no animation callback and no extra rendered sheet. */
export function installStickyPadMotion(api:StickyPadMotionApi){
  let widget:StickyWidget|undefined,hover:Graphics|undefined,pull:Graphics|undefined,progress=0,target=0,frame=0,started=0,from=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const paint=()=>{
    if(!widget||!api.isLive(widget.id)||document.body.classList.contains('home-visible')){clear();return;}
    const parent=api.nodeAt(widget.id);if(!parent){clear();return;}
    if(!hover||hover.destroyed){hover=new Graphics();hover.label='sticky-pad-hover';hover.eventMode='none';}
    if(hover.parent!==parent)parent.addChild(hover);
    hover.visible=progress>.001;hover.clear();if(hover.visible)paintStickySheet(hover,stickyPadPaper(widget),widget.style.fillColor,widget.style.fillOpacity,progress);
    api.onChange();
  };
  const animate=(now:number)=>{frame=0;const t=Math.min(1,(now-started)/180);progress=from+(target-from)*(1-(1-t)**3);paint();if(t<1&&widget)frame=requestAnimationFrame(animate);else if(!target){widget=undefined;if(hover&&!hover.destroyed)hover.visible=false;}};
  function setHover(next?:StickyWidget){
    if(pull?.visible)return;
    if(!next&&target===0)return;
    if(next?.id===widget?.id&&target===1){if(next!==widget){widget=next;paint();}return;}
    if(!next&&!widget)return;
    if(next&&next.id!==widget?.id){if(hover&&!hover.destroyed)hover.visible=false;widget=next;progress=0;}
    target=next?1:0;from=progress;started=performance.now();if(frame)cancelAnimationFrame(frame);frame=0;
    if(reduced.matches){progress=target;paint();if(!target)widget=undefined;}else frame=requestAnimationFrame(animate);
  }
  function clearHover(){if(frame)cancelAnimationFrame(frame);frame=0;widget=undefined;progress=target=0;if(hover&&!hover.destroyed){const visible=hover.visible;hover.visible=false;if(visible)api.onChange();}}
  function showPull(note:StickyWidget,distance:number){
    clearHover();if(!pull||pull.destroyed){pull=new Graphics();pull.label='sticky-paper-pull';pull.eventMode='none';api.parent.addChild(pull);}
    const amount=Math.max(0,Math.min(1,distance/(note.width*.8)));pull.clear();pull.visible=true;pull.pivot.set(note.width/2,note.height/2);pull.position.set(note.x+note.width/2,note.y+note.height/2);pull.rotation=note.rotation;
    paintStickySheet(pull,{x:0,y:0,width:note.width,height:note.height},note.style.fillColor,note.style.fillOpacity,1-amount,amount);api.onChange();
  }
  function clear(){clearHover();if(pull&&!pull.destroyed){const visible=pull.visible;pull.visible=false;if(visible)api.onChange();}}
  const hidden=()=>{if(document.hidden)clear();},key=()=>clear(),leave=()=>setHover();
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',hidden);window.addEventListener('keydown',key,true);
  window.addEventListener('wheel',clear,{passive:true,capture:true});
  const observer=new MutationObserver(()=>{if(document.body.classList.contains('home-visible'))clear();});observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  return {hover:setHover,pull:showPull,clear,leave,destroy(){clear();if(hover&&!hover.destroyed)hover.destroy();if(pull&&!pull.destroyed)pull.destroy();observer.disconnect();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('keydown',key,true);window.removeEventListener('wheel',clear,true);}};
}
