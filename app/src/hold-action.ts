/** Pointer and keyboard hold action shared by explicit unlock controls. */
export function installHoldAction(container:HTMLElement,complete:(button:HTMLButtonElement)=>void,duration=650):void {
  if(!document.getElementById('hold-action-style')){const style=document.createElement('style');style.id='hold-action-style';style.textContent=`button[data-hold-unlock]{position:relative;overflow:hidden;isolation:isolate}button[data-hold-unlock]::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:-1;background:currentColor;opacity:.16;transform:scaleX(var(--unlock-progress,0));transform-origin:left}button[data-hold-unlock]:focus-visible{outline:2px solid var(--accent,#b68aff);outline-offset:2px}`;document.head.append(style);}
  let active:HTMLButtonElement|null=null,frame=0,started=0;
  const buttonAt=(target:EventTarget|null)=>(target instanceof Element?target.closest<HTMLButtonElement>('button[data-hold-unlock]'):null);
  const cancel=()=>{if(frame)cancelAnimationFrame(frame);frame=0;active?.style.removeProperty('--unlock-progress');active=null;};
  const start=(button:HTMLButtonElement)=>{cancel();if(button.disabled)return;active=button;started=performance.now();const tick=()=>{if(!active||!active.isConnected||!active.getClientRects().length){cancel();return;}const progress=Math.min(1,(performance.now()-started)/duration);active.style.setProperty('--unlock-progress',String(progress));if(progress>=1){const chosen=active;cancel();complete(chosen);}else frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);};
  container.addEventListener('pointerdown',event=>{const button=buttonAt(event.target);if(!button||event.button!==0)return;event.preventDefault();event.stopPropagation();start(button);},true);
  container.addEventListener('pointerout',event=>{if(active&&(!(event.relatedTarget instanceof Node)||!active.contains(event.relatedTarget)))cancel();});
  container.addEventListener('click',event=>{if(buttonAt(event.target)){event.preventDefault();event.stopImmediatePropagation();}},true);
  container.addEventListener('keydown',event=>{const button=buttonAt(event.target);if(!button||![' ','Enter'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(!event.repeat)start(button);},true);
  container.addEventListener('keyup',event=>{if(buttonAt(event.target)&&[' ','Enter'].includes(event.key)){event.preventDefault();event.stopPropagation();cancel();}},true);
  window.addEventListener('pointerup',cancel,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);
}
