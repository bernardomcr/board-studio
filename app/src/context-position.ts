import type { Camera } from './core/camera';
import type { BoardState } from './core/commands';
import { selectedBounds } from './core/groups';

/** Anchor the complete toolbar to the selection, independent of its open menu. */
export function positionContextPanel(panel:HTMLElement,state:BoardState,camera:Camera){
  if(panel.hidden)return;
  const bounds=selectedBounds(state);if(!bounds)return;
  const a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});
  const width=panel.offsetWidth||400,height=panel.offsetHeight||48;
  const margin=12,minLeft=innerWidth>600?78:margin;
  const left=Math.max(margin,Math.min(Math.max(minLeft,innerWidth-width-margin),Math.max(minLeft,(a.x+b.x-width)/2)));
  let top=a.y-height-24;if(top<68)top=b.y+20;
  top=Math.max(68,Math.min(innerHeight-height-54,top));
  panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.transform='none';
  panel.dataset.below=String(top>b.y);
  for(const menu of panel.querySelectorAll<HTMLDetailsElement>('details[open]'))positionPopover(menu);
}

function positionPopover(menu:HTMLDetailsElement){
  const body=menu.querySelector<HTMLElement>('.property-popover');if(!body)return;
  body.style.left='0';body.style.right='auto';body.style.top='calc(100% + 10px)';body.style.bottom='auto';
  body.style.maxHeight=`${Math.max(160,innerHeight-100)}px`;
  const rect=body.getBoundingClientRect();
  if(rect.right>innerWidth-12)body.style.left=`${innerWidth-12-rect.right}px`;
  if(rect.left<12)body.style.left=`${12-rect.left}px`;
  if(rect.bottom>innerHeight-18){
    const availableAbove=menu.getBoundingClientRect().top-80;
    if(availableAbove>160){body.style.top='auto';body.style.bottom='calc(100% + 10px)';body.style.maxHeight=`${availableAbove}px`;}
    else body.style.maxHeight=`${Math.max(160,innerHeight-menu.getBoundingClientRect().bottom-30)}px`;
  }
}

/** Attach behaviour to menus that are authored in their final DOM structure. */
export function compactContextPanel(panel:HTMLElement){
  if(!panel.dataset.tracksMenus){
    panel.dataset.tracksMenus='true';
    panel.addEventListener('click',event=>{
      const summary=(event.target as Element).closest<HTMLElement>('summary');
      const menu=summary?.parentElement as HTMLDetailsElement|undefined;
      if(!menu||menu.tagName!=='DETAILS'||!panel.contains(menu))return;
      event.preventDefault();
      const open=!menu.open;
      for(const other of panel.querySelectorAll<HTMLDetailsElement>('details'))if(other!==menu)other.open=false;
      if(open)panel.dataset.openMenu=menu.dataset.menu;else delete panel.dataset.openMenu;
      menu.open=open;if(open)positionPopover(menu);
    });
    panel.addEventListener('toggle',event=>{
      const menu=event.target as HTMLDetailsElement;
      if(!menu.isConnected||menu.tagName!=='DETAILS')return;
      if(menu.open){
        panel.dataset.openMenu=menu.dataset.menu;
        for(const other of panel.querySelectorAll<HTMLDetailsElement>('details'))if(other!==menu)other.open=false;
        positionPopover(menu);
      }else if(panel.dataset.openMenu===menu.dataset.menu)delete panel.dataset.openMenu;
    },true);
  }
  for(const menu of panel.querySelectorAll<HTMLDetailsElement>('details')){
    if(menu.dataset.menu===panel.dataset.openMenu)menu.open=true;
    if(menu.open)positionPopover(menu);
  }
}

export function installContextStyles(){
  if(document.getElementById('context-toolbar-styles'))return;
  const css=document.createElement('style');css.id='context-toolbar-styles';css.textContent=`
#selection-properties{display:flex;align-items:center;gap:2px;padding:5px;position:fixed;flex-wrap:nowrap;justify-content:flex-start;width:max-content;max-width:calc(100vw - 96px);min-height:46px;border-radius:8px;box-shadow:0 4px 18px #19181226;isolation:isolate}
#selection-properties .toolbar-button,#selection-properties summary{width:36px;height:36px;display:flex;align-items:center;justify-content:center;padding:7px;border-radius:5px;cursor:pointer;box-sizing:border-box;position:relative;flex:none}
#selection-properties .toolbar-button[aria-pressed=true]{background:#edf1ff;color:#3859ff}
#selection-properties .toolbar-button:hover,#selection-properties summary:hover,#selection-properties details[open]>summary{background:#f1f3fb;color:#3859ff}
#selection-properties .toolbar-button svg,#selection-properties summary svg{display:block;flex:none}
#selection-properties summary>svg:not(.menu-chevron){width:22px;height:22px}
#selection-properties .toolbar-separator{height:24px;width:1px;background:#e9e9e6;margin:0 4px;flex:none}
#selection-properties .selection-count{padding:0 9px;font-size:12px;color:#73726c;white-space:nowrap}
#selection-properties .toolbar-font{width:125px;max-width:125px;height:34px;border:0;border-radius:4px;background:white;padding:4px 20px 4px 7px;font-size:12px}
#selection-properties .toolbar-fontsize{width:49px;height:32px;border:0;border-radius:4px;padding:4px;font-size:13px;text-align:center}
#selection-properties .toolbar-font:hover,#selection-properties .toolbar-fontsize:hover{background:#f4f5f8}
#selection-properties details{position:relative;flex:none}
#selection-properties summary{list-style:none;user-select:none}
#selection-properties summary::-webkit-details-marker{display:none}
#selection-properties summary .menu-chevron{position:absolute;right:1px;bottom:3px;width:8px;height:8px}
#selection-properties .toolbar-color{display:block;width:19px;height:19px;border:1px solid #0003;border-radius:50%;box-sizing:border-box}
#selection-properties .toolbar-color.transparent,.color-swatch.transparent{background:linear-gradient(135deg,transparent 44%,#e65050 45%,#e65050 52%,transparent 53%),#fff!important}
#selection-properties .menu-count{position:absolute;right:0;top:0;font-size:9px;background:white;color:#73726c;border-radius:5px;line-height:12px;min-width:10px;text-align:center}
#selection-properties .property-popover{position:absolute;left:0;top:calc(100% + 10px);width:256px;max-height:min(470px,70vh);overflow:auto;padding:14px;background:white;border:1px solid #e4e4e1;border-radius:9px;box-shadow:0 6px 28px #19181224;display:flex;flex-direction:column;gap:10px;z-index:40;font-size:12px;color:#292823;box-sizing:border-box}
#selection-properties .property-popover.wide{width:310px}
#selection-properties .popover-title{font-size:12px;font-weight:600;margin:0 0 1px;color:#73726c}
#selection-properties .property-popover label{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;font-size:12px;color:#45443f;min-height:29px}
#selection-properties .property-popover input,#selection-properties .property-popover select{height:31px;min-width:0;box-sizing:border-box;border:1px solid #deded9;border-radius:5px;padding:5px 7px;background:white;font:inherit}
#selection-properties .property-popover input[type=number]{width:76px}
#selection-properties .property-popover input[type=color]{padding:2px;width:40px;cursor:pointer}
#selection-properties .property-popover input[type=url],#selection-properties .property-popover input[type=text]{width:150px}
#selection-properties .property-popover select{width:145px;max-width:145px}
#selection-properties .property-popover hr{margin:1px 0;border:0;border-top:1px solid #ededeb;width:100%}
#selection-properties .property-popover .menu-action{display:flex;align-items:center;gap:9px;width:100%;min-height:34px;text-align:left;padding:7px;border-radius:5px;white-space:normal}
#selection-properties .property-popover .menu-action svg{flex:none}
#selection-properties .property-popover .menu-action kbd{margin-left:auto;color:#8c8c87;font:10px Inter,'Segoe UI',sans-serif;white-space:nowrap}
#selection-properties .color-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
#selection-properties .color-grid .color-swatch{display:flex;align-items:center;justify-content:center;border:1px solid #0002;width:29px;height:29px;border-radius:50%;padding:0;min-height:0;cursor:pointer;color:#282823}
#selection-properties .color-grid .color-swatch[aria-pressed=true]{outline:2px solid #3859ff;outline-offset:2px}
#selection-properties .color-grid .color-swatch svg{width:15px;height:15px;filter:drop-shadow(0 0 2px white)}
#selection-properties .compact-shapes{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
#selection-properties .compact-shapes button{width:40px;height:40px;padding:5px;border-radius:5px}
#selection-properties .compact-shapes svg{width:29px;height:27px}
#selection-properties .toggle-row{display:flex;gap:4px}
#selection-properties .toggle-row button{flex:1;height:34px;border:1px solid #e7e7e4;border-radius:5px;padding:5px}
#selection-properties .toggle-row button[aria-pressed=true]{background:#edf1ff;color:#3859ff;border-color:#bbc7ff}
#selection-properties .caption-row{display:flex;gap:6px;align-items:center}
#selection-properties .caption-row input[type=text]{width:145px}
#selection-properties .caption-row input[type=number]{width:58px}
#selection-properties .caption-row button{padding:5px;width:25px}
#selection-properties .empty-message{margin:0;color:#85857f;font-size:12px;line-height:1.5}
#selection-properties :disabled{opacity:.45;cursor:default}
#alignbar{display:none!important}
@media(max-width:900px){#selection-properties{max-width:calc(100vw - 90px);flex-wrap:wrap}#selection-properties .toolbar-font{width:100px}}
`;
  document.head.append(css);
  document.addEventListener('pointerdown',event=>{
    const panel=document.getElementById('selection-properties');
    if(panel&&!panel.contains(event.target as Node)){delete panel.dataset.openMenu;for(const menu of panel.querySelectorAll<HTMLDetailsElement>('details'))menu.open=false;}
  });
}
