import './interface.css';
import {icon} from './icons';

const THEME_KEY='board-studio:interface-theme';

/** Retain the real command buttons while adapting the single desktop bar. */
function installDock(controls:HTMLElement){
 const header=document.getElementById('topbar'),tools=document.getElementById('toolbar');if(!header||!tools)return {destroy(){}};
 const dock=document.createElement('div');dock.id='studio-dock';
 const actions=document.createElement('div');actions.id='studio-dock-actions';
 const more=document.createElement('button');more.id='studio-more';more.type='button';more.innerHTML=icon('more',20);more.setAttribute('aria-label','Mais opções do board');more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls','studio-command-menu');more.title='Mais opções do board';
 const menu=document.createElement('div');menu.id='studio-command-menu';menu.hidden=true;menu.setAttribute('role','group');menu.setAttribute('aria-label','Opções do board');
 const commandGroup=document.createElement('div');commandGroup.className='studio-command-group';menu.append(commandGroup);
 dock.append(header,tools,actions,menu);actions.append(controls,more);document.body.append(dock);document.body.classList.add('studio-dock-ready');
 const markers=new Map<HTMLElement,Comment>();
 const original=(element:HTMLElement)=>{let marker=markers.get(element);if(!marker){marker=document.createComment('studio-command');element.before(marker);markers.set(element,marker);}return marker;};
 const move=(element:HTMLElement,parent:HTMLElement)=>{original(element);if(element.parentElement!==parent)parent.append(element);};
 const restore=(element:HTMLElement)=>{const marker=markers.get(element);if(marker?.parentNode&&element.previousSibling!==marker)marker.after(element);};
 function labelButton(button:HTMLElement,label:string,symbol?:string){
  button.setAttribute('aria-label',label);
  if(!button.querySelector('.studio-command-label')){
   if(symbol){button.textContent='';button.insertAdjacentHTML('beforeend',icon(symbol,17));}
   const text=document.createElement('span');text.className='studio-command-label';text.textContent=label;button.append(text);
  }
 }
 const positionMenu=()=>{if(menu.hidden)return;const box=more.getBoundingClientRect(),top=dock.getBoundingClientRect().bottom+8;menu.style.maxHeight=`${Math.max(80,innerHeight-top-12)}px`;menu.style.left=`${Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,box.right-menu.offsetWidth))}px`;menu.style.top=`${top}px`;};
 function close(restoreFocus=false){menu.hidden=true;more.setAttribute('aria-expanded','false');if(restoreFocus)more.focus({preventScroll:true});}
 function layout(){
  const compact=innerWidth<=1100,mobile=innerWidth<=740,layers=document.getElementById('layers-controls'),profile=document.getElementById('profile-open');
  if(layers&&layers.parentElement!==actions)actions.insertBefore(layers,more);
  if(profile&&profile.parentElement!==actions)actions.insertBefore(profile,more);
  const file=document.getElementById('project-file-controls');
  if(file){const buttons=file.querySelectorAll<HTMLButtonElement>('button');if(buttons[0])labelButton(buttons[0],'Salvar arquivo','download');if(buttons[1])labelButton(buttons[1],'Abrir arquivo','folder');if(compact)move(file,menu);else restore(file);}
  for(const [id,label]of [['undo','Desfazer'],['redo','Refazer'],['help','Atalhos']]){const button=document.getElementById(id!);if(!button)continue;labelButton(button,label!);if(compact)move(button,commandGroup);else restore(button);}
  for(const id of ['export','export-svg']){const button=document.getElementById(id);if(!button)continue;if(mobile){labelButton(button,id==='export'?'Exportar PNG':'Exportar SVG');move(button,commandGroup);}else restore(button);}
  more.hidden=!compact;dock.dataset.compact=String(compact);dock.dataset.mobile=String(mobile);
  if(!compact)close();else positionMenu();
 }
 const observer=new MutationObserver(layout);observer.observe(document.body,{childList:true});observer.observe(header,{childList:true});
 more.onclick=()=>{const open=menu.hidden;menu.hidden=!open;more.setAttribute('aria-expanded',String(open));if(open){positionMenu();menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});}};
 menu.addEventListener('click',event=>{if((event.target as Element).closest('button:not(:disabled)'))close();});
 const outside=(event:PointerEvent)=>{if(!menu.hidden&&!menu.contains(event.target as Node)&&!more.contains(event.target as Node))close();};
 const keyboard=(event:KeyboardEvent)=>{if(menu.hidden)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);return;}if(!menu.contains(event.target as Node))return;const keys=['ArrowDown','ArrowUp','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();event.stopPropagation();const buttons=[...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();};
 const focusOutside=(event:FocusEvent)=>{if(!menu.hidden&&!menu.contains(event.target as Node)&&!more.contains(event.target as Node))close();};
 window.addEventListener('resize',layout);window.addEventListener('keydown',keyboard,true);document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',focusOutside,true);layout();
 return {destroy(){observer.disconnect();window.removeEventListener('resize',layout);window.removeEventListener('keydown',keyboard,true);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',focusOutside,true);for(const element of markers.keys())restore(element);document.body.append(header,tools,controls);dock.remove();document.body.classList.remove('studio-dock-ready');}};
}

export function installInterface(){
 const controls=document.createElement('div');controls.id='interface-controls';
 const button=document.createElement('button');button.id='theme-toggle';button.type='button';controls.append(button);document.body.append(controls);
 let dark=window.boardStudioDesktop?.isDesktop===true;try{const stored=localStorage.getItem(THEME_KEY);if(stored==='dark'||stored==='light')dark=stored==='dark';}catch{/* A private session can still switch themes. */}
 const update=()=>{document.documentElement.dataset.theme=dark?'dark':'light';button.innerHTML=icon(dark?'theme-light':'theme-dark',20);button.setAttribute('aria-label',dark?'Ativar tema claro':'Ativar tema escuro');button.title=dark?'Tema claro da interface':'Tema escuro da interface';button.setAttribute('aria-pressed',String(dark));};
 button.onclick=()=>{dark=!dark;update();try{localStorage.setItem(THEME_KEY,dark?'dark':'light');}catch{}};update();
 window.addEventListener('storage',event=>{if(event.key===THEME_KEY){dark=event.newValue==='dark';update();}});
 const brand=()=>{const logo=document.querySelector<HTMLElement>('#board-home .bh-brand');if(!logo||logo.dataset.studioBrand)return;logo.dataset.studioBrand='true';logo.classList.add('studio-mark');logo.title='no teu cu e atiro';logo.innerHTML='<img class="studio-symbol" src="/favicon.svg" width="36" height="36" alt=""><span class="studio-name">no teu cu e atiro</span>';observer.disconnect();};
 const observer=new MutationObserver(brand);observer.observe(document.body,{childList:true,subtree:true});brand();
 const docking=installDock(controls);
 return {destroy(){observer.disconnect();docking.destroy();controls.remove();}};
}
