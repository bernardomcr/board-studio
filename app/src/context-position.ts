import type { Camera } from './core/camera';
import type { BoardState } from './core/commands';
import { selectedBounds } from './core/groups';

/** Anchor the complete toolbar to the selection, independent of its open menu. */
export function positionContextPanel(panel:HTMLElement,state:BoardState,camera:Camera){
  if(panel.hidden)return;
  const bounds=selectedBounds(state);if(!bounds)return;
  const limits=workspaceLimits();
  panel.dataset.compact=String(limits.right-limits.left<760);
  panel.style.maxWidth=`${limits.right-limits.left}px`;
  const a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});
  const width=panel.offsetWidth||400,height=panel.offsetHeight||48;
  const left=Math.max(limits.left,Math.min(limits.right-width,(a.x+b.x-width)/2));
  // Leave the rotation handle and connection dots outside the toolbar hit area.
  const handles=[...state.selection].some(id=>state.widgets.has(id))||state.selection.size>1;
  let top=a.y-height-(handles?60:20);if(top<68)top=b.y+(handles?36:20);
  top=Math.max(68,Math.min(innerHeight-height-54,top));
  panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.transform='none';
  panel.dataset.below=String(top>b.y);
  for(const menu of panel.querySelectorAll<HTMLDetailsElement>('details[open]'))positionPopover(menu);
}

function workspaceLimits(){
  const layers=document.getElementById('layers-panel');
  const layerLeft=layers&&!layers.hidden&&document.body.classList.contains('layers-open')?layers.getBoundingClientRect().left-12:innerWidth-12;
  const left=innerWidth>600?78:12;
  return {left,right:Math.max(left+220,layerLeft)};
}

function positionPopover(menu:HTMLDetailsElement){
  const body=menu.querySelector<HTMLElement>('.property-popover');if(!body)return;
  const limits=workspaceLimits(),anchor=menu.getBoundingClientRect();
  body.style.position='fixed';body.style.right='auto';body.style.bottom='auto';
  body.style.maxWidth=`${limits.right-limits.left}px`;body.style.maxHeight=`${Math.max(120,innerHeight-100)}px`;
  const width=body.offsetWidth,height=body.offsetHeight;
  const left=Math.max(limits.left,Math.min(limits.right-width,anchor.left));
  const below=innerHeight-anchor.bottom-24,above=anchor.top-80;
  let top=anchor.bottom+10;
  if(height>below&&above>below){body.style.maxHeight=`${Math.max(120,above)}px`;top=anchor.top-Math.min(height,above)-10;}
  else body.style.maxHeight=`${Math.max(120,below)}px`;
  body.style.left=`${left}px`;body.style.top=`${Math.max(68,Math.min(innerHeight-body.offsetHeight-12,top))}px`;
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
#selection-properties{gap:2px;padding:6px;min-height:46px;border:1px solid #e0e2e8;border-radius:10px;box-shadow:0 5px 22px #18203920;font-family:Inter,'Noto Sans','Segoe UI',sans-serif;flex-wrap:wrap;align-content:center}
#selection-properties .toolbar-button,#selection-properties summary{width:34px;height:34px;padding:7px;border:0;transition:background 110ms ease,color 110ms ease;border-radius:6px}
#selection-properties .toolbar-button>svg,#selection-properties summary>svg:not(.menu-chevron){width:20px;height:20px;stroke-width:1.8}
#selection-properties summary{padding-right:10px;width:39px}
#selection-properties summary .menu-chevron{width:9px;height:9px;right:2px;top:13px;bottom:auto;stroke-width:2}
#selection-properties .toolbar-font{height:34px;width:124px;border-radius:6px;color:#343840;padding-left:8px}
#selection-properties .toolbar-fontsize{height:34px;width:48px;border-radius:6px;color:#343840}
#selection-properties .toolbar-separator{margin:0 5px;height:22px;background:#e3e5eb}
#selection-properties .toolbar-color{width:20px;height:20px;box-shadow:inset 0 0 0 2px #fff}
#selection-properties .menu-count{right:0;top:0;border:1px solid #e7e9ed;line-height:11px;min-width:12px}
#selection-properties .property-popover{width:300px;border-radius:10px;border-color:#e1e4eb;box-shadow:0 8px 32px #17223b24;padding:14px;gap:12px;overscroll-behavior:contain;z-index:40}
#selection-properties .property-popover.wide{width:330px}
#selection-properties .popover-title{font-size:12px;color:#303641;line-height:20px;letter-spacing:0;margin:0;font-weight:600}
#selection-properties .property-popover label{display:grid;grid-template-columns:minmax(0,1fr) minmax(78px,128px);gap:12px;min-height:34px;line-height:1.4;color:#626875;font-size:12px;align-items:center}
#selection-properties .property-popover select{width:128px;max-width:128px;font-size:12px}
#selection-properties .property-popover input[type=number]{width:100%;height:32px;font-variant-numeric:tabular-nums}
#selection-properties .property-popover input[type=color]{justify-self:end;height:30px;width:42px;border-radius:6px}
#selection-properties .property-popover input,#selection-properties .property-popover select{border-color:#dce0e8;transition:border-color 100ms ease;color:#343840}
#selection-properties .property-popover input:focus,#selection-properties .property-popover select:focus{border-color:#7e93f9}
#selection-properties .property-popover .menu-action{min-height:36px;padding:8px;border-radius:6px;gap:10px;color:#343840;font-size:12px;line-height:18px;align-items:center}
#selection-properties .property-popover .menu-action svg{width:18px;height:18px;color:#646c79}
#selection-properties .color-grid{grid-template-columns:repeat(6,28px);gap:12px;justify-content:space-between;padding:2px}
#selection-properties .color-grid .color-swatch{width:28px;height:28px;transition:transform 100ms ease,outline-color 100ms ease;box-shadow:inset 0 0 0 1px #0000000a}
#selection-properties .color-grid .color-swatch:hover{transform:scale(1.1)}
#selection-properties .range-control{display:flex;flex-direction:column;gap:12px}
#selection-properties .range-control label{display:flex;justify-content:space-between;min-height:20px;color:#444b58}
#selection-properties .range-control output{font-size:11px;font-variant-numeric:tabular-nums;color:#758096}
#selection-properties .range-control input[type=range]{width:100%;height:20px;min-height:20px;border:0;margin:0;padding:0;accent-color:#4262ff;cursor:ew-resize;background:transparent}
#selection-properties .border-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
#selection-properties .border-presets button{min-height:49px;display:flex;flex-direction:column;gap:7px;align-items:center;justify-content:center;border:1px solid #e1e5ed;padding:7px 3px;font-size:11px;color:#636b79;border-radius:6px}
#selection-properties .border-presets button[aria-pressed=true]{background:#edf1ff;border-color:#aebcfe;color:#3859ff}
#selection-properties .border-sample{display:block;width:20px;height:7px;position:relative}
#selection-properties .border-sample:before{content:'';position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:var(--border-preview);background:currentColor;border-radius:5px}
#selection-properties .border-presets button:first-child .border-sample:before{height:1px;transform:rotate(-25deg);background:#a6adba}
#selection-properties .control-note{margin:0;font-size:11px;line-height:1.5;color:#858d9b}
#selection-properties .transform-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#selection-properties .transform-grid label{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}
#selection-properties .transform-grid input{width:100%!important}
#selection-properties .aspect-control>span{display:flex;align-items:center;gap:7px}
#selection-properties .aspect-control input{justify-self:end;width:16px;height:16px;accent-color:#4262ff}
#selection-properties .compact-type-controls{display:none}
#selection-properties[data-compact=true] .toolbar-font,#selection-properties[data-compact=true] .toolbar-fontsize{display:none}
#selection-properties[data-compact=true] .compact-type-controls{display:contents}
@keyframes property-appear{from{opacity:.3}to{opacity:1}}
@media(prefers-reduced-motion:reduce){#selection-properties *{animation:none!important;transition:none!important}}
#alignbar{display:none!important}
@media(max-width:900px){#selection-properties{max-width:calc(100vw - 90px);flex-wrap:wrap}#selection-properties .toolbar-font{width:100px}}
`;
  document.head.append(css);
  document.addEventListener('pointerdown',event=>{
    const panel=document.getElementById('selection-properties');
    if(panel&&!panel.contains(event.target as Node)){delete panel.dataset.openMenu;for(const menu of panel.querySelectorAll<HTMLDetailsElement>('details'))menu.open=false;}
  });
}
