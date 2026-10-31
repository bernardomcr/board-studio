import {Camera,MAX_SCALE,MIN_SCALE} from './core/camera';
import {icon} from './icons';

interface ZoomUIOptions {camera:Camera;onChange:()=>void;fit:()=>void}

/** Screen zoom never changes object coordinates, dimensions, or brush radii. */
export function installZoomUI({camera,onChange,fit}:ZoomUIOptions){
  const button=document.getElementById('zoom-value') as HTMLButtonElement;
  const style=document.createElement('style');
  style.textContent=`
    #zoom-presets{position:fixed;z-index:45;width:208px;max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:6px;background:#fff;color:var(--cloud-700,#30323b);border:1px solid var(--cloud-200,#dedfe3);border-radius:10px;box-shadow:0 5px 24px #11182726;font:400 13px var(--font,Arial,sans-serif)}
    #zoom-presets[hidden]{display:none}
    #zoom-presets form{display:flex;align-items:center;gap:10px;padding:6px 8px 10px;border-bottom:1px solid var(--cloud-200,#dedfe3);margin-bottom:4px}
    #zoom-presets form label{flex:1}
    #zoom-custom{width:76px;height:30px;box-sizing:border-box;border:1px solid #c9ccd3;border-radius:5px;background:#fff;color:inherit;padding:0 7px;text-align:right;font:inherit}
    #zoom-custom:focus{outline:2px solid #4262ff;outline-offset:1px}
    #zoom-custom[aria-invalid=true]{outline:2px solid #d73a49}
    #zoom-presets button{display:flex;align-items:center;gap:10px;width:100%;height:34px;box-sizing:border-box;border:0;border-radius:5px;padding:0 8px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}
    #zoom-presets button:hover,#zoom-presets button:focus-visible{background:var(--cloud-100,#f2f3f5)}
    #zoom-presets button:focus-visible{outline:2px solid #4262ff;outline-offset:-2px}
    #zoom-presets .zoom-check{display:flex;width:16px;flex:none;visibility:hidden}
    #zoom-presets button[aria-pressed=true] .zoom-check{visibility:visible}
    #zoom-presets kbd{margin-left:auto;font:11px var(--font,Arial,sans-serif);color:#777c87}
    #zoom-presets .zoom-separator{height:1px;background:var(--cloud-200,#dedfe3);margin:4px 0}
    #zoom-value[aria-expanded=true]{background:var(--cloud-100,#f2f3f5)}
  `;
  document.head.append(style);
  const menu=document.createElement('div');menu.id='zoom-presets';menu.hidden=true;
  menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Zoom do board');
  menu.innerHTML=`<form><label for="zoom-custom">Zoom</label><input id="zoom-custom" aria-label="Zoom personalizado (%)" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"></form><button type="button" data-fit>${icon('fit',16)}<span>Ajustar à tela</span><kbd>Shift+1</kbd></button><div class="zoom-separator"></div>${[50,70,100,400,1200,2000].map(percent=>`<button type="button" data-percent="${percent}" aria-pressed="false"><span class="zoom-check">${icon('check',16)}</span><span>${percent}%</span></button>`).join('')}`;
  document.body.append(menu);
  button.setAttribute('aria-label','Alterar zoom');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',menu.id);button.setAttribute('aria-expanded','false');
  const input=menu.querySelector<HTMLInputElement>('input')!;
  const format=()=>`${Math.round(camera.scale*10000)/100}%`;
  function refresh(){
    button.textContent=`${Math.round(camera.scale*100)}%`;
    if(document.activeElement!==input)input.value=format();
    for(const option of menu.querySelectorAll<HTMLButtonElement>('[data-percent]'))option.setAttribute('aria-pressed',String(Math.abs(camera.scale*100-Number(option.dataset.percent))<.001));
  }
  function position(){
    const anchor=button.getBoundingClientRect(),rect=menu.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(window.innerWidth-rect.width-8,anchor.right-rect.width))}px`;
    menu.style.top=`${Math.max(8,anchor.top-rect.height-8)}px`;
  }
  function close(restoreFocus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(restoreFocus)button.focus();}
  function change(percent:number){
    const scale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,percent/100));
    camera.zoomAt({x:camera.width/2,y:camera.height/2},scale/camera.scale);
    onChange();refresh();
  }
  function custom(){
    const raw=input.value.trim().replace(/%$/,'').replace(',','.');
    const percent=raw===''?NaN:Number(raw);
    input.setAttribute('aria-invalid',String(!Number.isFinite(percent)));
    if(!Number.isFinite(percent))return false;
    change(percent);input.value=format();return true;
  }
  function toggle(event:MouseEvent){
    event.preventDefault();event.stopPropagation();
    if(!menu.hidden){close();return;}
    refresh();input.setAttribute('aria-invalid','false');menu.hidden=false;button.setAttribute('aria-expanded','true');position();
  }
  function outside(event:PointerEvent){if(!menu.hidden&&!menu.contains(event.target as Node)&&!button.contains(event.target as Node))close();}
  function keyboard(event:KeyboardEvent){
    if(menu.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if((event.key==='ArrowDown'||event.key==='ArrowUp')&&event.target!==input){
      const choices=[...menu.querySelectorAll<HTMLButtonElement>('button')],index=choices.indexOf(document.activeElement as HTMLButtonElement),step=event.key==='ArrowDown'?1:-1;
      choices[(index+step+choices.length)%choices.length]!.focus();event.preventDefault();event.stopPropagation();
    }
  }
  button.addEventListener('click',toggle);
  menu.addEventListener('keydown',event=>event.stopPropagation());
  menu.addEventListener('click',event=>{
    const option=(event.target as Element).closest<HTMLButtonElement>('button');if(!option)return;
    if(option.hasAttribute('data-fit')){fit();onChange();refresh();}else change(Number(option.dataset.percent));close(true);
  });
  menu.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();if(custom())close(true);});
  input.addEventListener('change',custom);
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard,true);
  window.addEventListener('resize',position);
  refresh();
  return {refresh,close,destroy(){button.removeEventListener('click',toggle);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard,true);window.removeEventListener('resize',position);menu.remove();style.remove();}};
}
