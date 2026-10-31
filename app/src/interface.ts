import './interface.css';
import {icon} from './icons';

const THEME_KEY='board-studio:interface-theme';
export function installInterface(){
 const controls=document.createElement('div');controls.id='interface-controls';
 const button=document.createElement('button');button.id='theme-toggle';button.type='button';controls.append(button);document.body.append(controls);
 let dark=false;try{dark=localStorage.getItem(THEME_KEY)==='dark';}catch{/* A private session can still switch themes. */}
 const update=()=>{document.documentElement.dataset.theme=dark?'dark':'light';button.innerHTML=icon(dark?'theme-light':'theme-dark',20);button.setAttribute('aria-label',dark?'Ativar tema claro':'Ativar tema escuro');button.title=dark?'Tema claro da interface':'Tema escuro da interface';button.setAttribute('aria-pressed',String(dark));};
 button.onclick=()=>{dark=!dark;update();try{localStorage.setItem(THEME_KEY,dark?'dark':'light');}catch{}};update();
 window.addEventListener('storage',event=>{if(event.key===THEME_KEY){dark=event.newValue==='dark';update();}});
 const brand=()=>{const logo=document.querySelector<HTMLElement>('#board-home .bh-brand');if(!logo||logo.dataset.studioBrand)return;logo.dataset.studioBrand='true';logo.classList.add('studio-mark');logo.innerHTML='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="2" y="2" width="21" height="21" rx="7" fill="currentColor" opacity=".12"/><rect x="9" y="9" width="21" height="21" rx="7" fill="#c35932"/><path d="M15 16h9M15 21h6" stroke="#fff8ef" stroke-width="2" stroke-linecap="round"/></svg><span>Board <em>Studio</em></span>';observer.disconnect();};
 const observer=new MutationObserver(brand);observer.observe(document.body,{childList:true,subtree:true});brand();
 return {destroy(){observer.disconnect();controls.remove();}};
}
