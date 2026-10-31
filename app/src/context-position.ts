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
  const left=innerWidth>600?(innerHeight<=460?98:78):12;
  return {left,right:Math.max(left+220,layerLeft)};
}

function positionPopover(menu:HTMLDetailsElement){
  const body=menu.querySelector<HTMLElement>('.property-popover');if(!body)return;
  const limits=workspaceLimits(),anchor=menu.getBoundingClientRect();
  body.style.position='fixed';body.style.right='auto';body.style.bottom='auto';
  body.style.maxWidth=`${limits.right-limits.left}px`;body.style.maxHeight=`${Math.max(120,innerHeight-100)}px`;
  const width=body.offsetWidth,height=body.offsetHeight;
  const parentMenu=menu.parentElement?.closest<HTMLDetailsElement>('details');
  if(parentMenu){
    const parent=parentMenu.querySelector<HTMLElement>(':scope > .property-popover')?.getBoundingClientRect();
    const left=parent&&parent.right+width+8<=limits.right?parent.right+8:parent?parent.left-width-8:anchor.left;
    body.style.left=`${Math.max(limits.left,Math.min(limits.right-width,left))}px`;
    body.style.top=`${Math.max(68,Math.min(innerHeight-height-12,anchor.top))}px`;return;
  }
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
      for(const other of panel.querySelectorAll<HTMLDetailsElement>('details'))if(other!==menu&&!other.contains(menu)&&!menu.contains(other))other.open=false;
      if(open)panel.dataset.openMenu=menu.dataset.menu;else{for(const child of menu.querySelectorAll<HTMLDetailsElement>('details'))child.open=false;const parent=menu.parentElement?.closest<HTMLDetailsElement>('details[open]');if(parent)panel.dataset.openMenu=parent.dataset.menu;else delete panel.dataset.openMenu;}
      menu.open=open;if(open)positionPopover(menu);
    });
    panel.addEventListener('toggle',event=>{
      const menu=event.target as HTMLDetailsElement;
      if(!menu.isConnected||menu.tagName!=='DETAILS')return;
      if(menu.open){
        if(!menu.querySelector('details[open]'))panel.dataset.openMenu=menu.dataset.menu;
        for(const other of panel.querySelectorAll<HTMLDetailsElement>('details'))if(other!==menu&&!other.contains(menu)&&!menu.contains(other))other.open=false;
        positionPopover(menu);
      }else if(panel.dataset.openMenu===menu.dataset.menu)delete panel.dataset.openMenu;
    },true);
  }
  const selected=[...panel.querySelectorAll<HTMLDetailsElement>('details')].find(menu=>menu.dataset.menu===panel.dataset.openMenu);
  if(selected){selected.open=true;let parent=selected.parentElement?.closest<HTMLDetailsElement>('details');while(parent&&panel.contains(parent)){parent.open=true;parent=parent.parentElement?.closest<HTMLDetailsElement>('details');}}
  for(const menu of panel.querySelectorAll<HTMLDetailsElement>('details')){
    if(menu.open)positionPopover(menu);
  }
}

export function installContextStyles(){
  if(document.getElementById('context-toolbar-styles'))return;
  const css=document.createElement('style');css.id='context-toolbar-styles';css.textContent=`
#selection-properties,#mindmap-properties{font:13px Inter,'Noto Sans','Segoe UI',sans-serif;color:#292d34;display:flex;align-items:center;align-content:center;justify-content:flex-start;gap:0;padding:3px;position:fixed;flex-wrap:wrap;width:max-content;max-width:calc(100vw - 96px);min-height:46px;border:1px solid #e5e7ec;border-radius:13px;background:#fff;box-shadow:0 5px 22px #18203920;isolation:isolate;box-sizing:border-box}
#selection-properties .toolbar-button,#selection-properties summary,#mindmap-properties>button,#mindmap-properties summary{display:flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;padding:9px;border:0;border-radius:8px;background:transparent;color:inherit;box-sizing:border-box;cursor:pointer;position:relative;list-style:none;transition:background .1s,color .1s}
#selection-properties .toolbar-button>svg,#selection-properties summary>svg:not(.menu-chevron),#mindmap-properties>button>svg,#mindmap-properties summary>svg{display:block;flex:none;width:21px;height:21px;stroke-width:1.8}
#selection-properties .toolbar-button:hover,#selection-properties summary:hover,#selection-properties details[open]>summary,#mindmap-properties>button:hover,#mindmap-properties summary:hover,#mindmap-properties details[open]>summary{background:#f2f3f7;color:#4262ff}
#selection-properties button[aria-pressed=true],#mindmap-properties button[aria-pressed=true]{background:#eef1ff;color:#3859ff}
#selection-properties .toolbar-separator,#mindmap-properties .mind-separator{height:28px;width:1px;background:#eceef2;margin:0 4px;flex:none}
#selection-properties .selection-count{padding:0 10px;font-size:12px;color:#717784;white-space:nowrap}
#selection-properties summary::-webkit-details-marker,#mindmap-properties summary::-webkit-details-marker{display:none}
#selection-properties .menu-chevron{display:none!important}
#selection-properties details,#mindmap-properties details{position:relative;flex:none}
#selection-properties .toolbar-fontsize{height:38px;width:66px;flex:none;border:0;border-radius:6px;background:transparent;color:inherit;padding:4px 3px 4px 7px;font:12px Inter,'Segoe UI',sans-serif;text-align:center;box-sizing:border-box;font-variant-numeric:tabular-nums}
#selection-properties .toolbar-fontsize::-webkit-inner-spin-button{opacity:1}
#selection-properties .toolbar-fontsize:hover{background:#f4f5f8}
#selection-properties .toolbar-color{display:block;width:22px;height:22px;border:1px solid #0002;border-radius:50%;box-sizing:border-box}
#selection-properties .toolbar-border-color{display:block;width:23px;height:23px;border:4px solid var(--border-color);border-radius:50%;background:#fff;opacity:var(--border-alpha);box-sizing:border-box}
#selection-properties .toolbar-border-color.transparent{border:1px solid #a3aab5;background:linear-gradient(135deg,transparent 46%,#969da8 47%,#969da8 51%,transparent 52%),#fff}
#selection-properties .toolbar-color.transparent,.color-swatch.transparent{background:linear-gradient(135deg,transparent 46%,#969da8 47%,#969da8 51%,transparent 52%),#fff!important}
#selection-properties .menu-count{position:absolute;right:2px;top:1px;border:1px solid #e7e9ed;background:white;color:#737b89;border-radius:5px;font:9px Inter,sans-serif;line-height:12px;min-width:12px;text-align:center}
#selection-properties .property-popover,#mindmap-properties .property-popover{position:fixed;left:0;top:calc(100% + 8px);width:250px;min-width:0;max-height:min(470px,70vh);overflow:auto;overscroll-behavior:contain;padding:12px;display:flex;flex-direction:column;gap:12px;border:1px solid #e4e7ed;border-radius:14px;background:#fff;color:#323842;box-shadow:0 8px 32px #17223b24;box-sizing:border-box;z-index:44;font:12px Inter,'Segoe UI',sans-serif}
#selection-properties .property-popover.wide{width:320px}
#selection-properties .popover-title{font-size:12px;font-weight:500;line-height:18px;color:#717784;margin:0}
#selection-properties .property-popover label{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px;width:100%;font-size:12px;color:#626a78;line-height:1.4;box-sizing:border-box}
#selection-properties .property-popover input,#selection-properties .property-popover select{height:32px;min-width:0;box-sizing:border-box;border:1px solid #dce1e9;border-radius:6px;padding:5px 7px;background:#fff;font:inherit;color:#343b46}
#selection-properties .property-popover input[type=number]{width:90px;font-variant-numeric:tabular-nums}
#selection-properties .property-popover input[type=color]{padding:2px;width:38px;cursor:pointer}
#selection-properties .property-popover input[type=url],#selection-properties .property-popover input[type=text]{width:148px}
#selection-properties .property-popover select{width:135px;max-width:135px}
#selection-properties .property-popover input:focus,#selection-properties .property-popover select:focus{border-color:#7e93f9}
#selection-properties .property-popover hr,#mindmap-properties .property-popover hr{border:0;border-top:1px solid #eceef2;margin:0;width:100%}
#selection-properties .property-popover .menu-action{display:flex;align-items:center;gap:10px;width:100%;min-height:36px;text-align:left;padding:8px;border-radius:7px;font-size:12px;color:#343b46;line-height:18px;white-space:normal}
#selection-properties .property-popover .menu-action>svg{width:19px;height:19px;flex:none;color:#626c7b}
#selection-properties .property-popover .menu-action kbd{margin-left:auto;color:#8b94a2;font:10px Inter,sans-serif;white-space:nowrap}
:is(#selection-properties,#mindmap-properties) .color-grid{display:grid;grid-template-columns:repeat(4,32px);gap:12px;justify-content:space-between;padding:2px;box-sizing:border-box}
:is(#selection-properties,#mindmap-properties) .color-grid .color-swatch{display:flex;align-items:center;justify-content:center;border:1px solid #0003;width:32px;height:32px;border-radius:50%;padding:0;min-height:0;background:transparent;cursor:pointer;color:#252a32;box-sizing:border-box}
:is(#selection-properties,#mindmap-properties) .color-grid .color-swatch[aria-pressed=true]{outline:2px solid #4262ff;outline-offset:2px}
:is(#selection-properties,#mindmap-properties) .color-grid .color-swatch svg{width:16px;height:16px;filter:drop-shadow(0 0 2px white)}
:is(#selection-properties,#mindmap-properties) .color-grid .color-swatch:hover{box-shadow:0 0 0 3px #4262ff22}
:is(#selection-properties,#mindmap-properties) .color-grid .custom-color{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;width:32px;height:32px;min-height:0;margin:0;border:0;border-radius:50%;cursor:pointer;color:#4e5868}
:is(#selection-properties,#mindmap-properties) .color-grid .custom-color:hover{background:#f1f3f8}
:is(#selection-properties,#mindmap-properties) .color-grid .custom-color input{position:absolute;inset:0;width:100%;height:100%;opacity:0;padding:0;cursor:pointer}
#selection-properties .icon-choices{display:flex;align-items:center;justify-content:center;gap:3px;flex-wrap:wrap}
#selection-properties .icon-choices>button{display:flex;align-items:center;justify-content:center;width:40px;height:40px;min-height:0;padding:8px;border:0;border-radius:8px;box-sizing:border-box;background:transparent;cursor:pointer;color:#303842;flex:none}
#selection-properties .icon-choices>button:hover{background:#f2f3f7;color:#4262ff}
#selection-properties .icon-choices>button[aria-pressed=true]{background:#eef1ff;color:#4262ff}
#selection-properties .icon-choices>button>svg{display:block;width:21px;height:21px;flex:none}
#selection-properties .icon-choices>button>svg[width="38"]{width:30px}
#selection-properties .icon-choices>select[hidden]{display:none!important}
#selection-properties :is([data-menu="text-style"],[data-menu="text"],[data-menu="text-list"],[data-menu="start-cap"],[data-menu="end-cap"],[data-menu="route"])>.property-popover{width:max-content;gap:7px;padding:6px}
#selection-properties :is([data-menu="text-style"],[data-menu="text"],[data-menu="text-list"],[data-menu="start-cap"],[data-menu="end-cap"],[data-menu="route"]) .popover-title{display:none}
#selection-properties :is([data-menu="start-cap"],[data-menu="end-cap"]) .icon-choices{display:grid;grid-template-columns:repeat(3,40px)}
#selection-properties .arrange-choices{display:grid;grid-template-columns:repeat(4,40px)}
#selection-properties .compact-types,#selection-properties .image-choices{display:grid;grid-template-columns:repeat(4,40px)}
#selection-properties .compact-types>button>svg{width:28px;height:25px}
#selection-properties .compact-shapes{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}
#selection-properties .compact-shapes button{width:40px;height:40px;padding:6px;border-radius:7px}
#selection-properties .compact-shapes svg{width:28px;height:26px}
#selection-properties .range-control{display:flex;flex-direction:column;gap:8px}
#selection-properties .range-control>label{min-height:18px;color:#677181;font-size:11px;gap:6px}
#selection-properties .range-control output{margin-left:auto;color:#8a93a3;font-size:10px;font-variant-numeric:tabular-nums}
#selection-properties .range-control input[type=range]{width:100%;height:22px;min-height:22px;border:0;margin:0;padding:0;accent-color:#4262ff;cursor:ew-resize;background:transparent}
#selection-properties .opacity-control{flex-direction:column-reverse;gap:2px}
#selection-properties .opacity-control>label{font-size:11px}
#selection-properties .opacity-control>label>svg{display:none}
#selection-properties .size-range-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}
#selection-properties .size-range-actions>button{display:flex;align-items:center;justify-content:center;border:1px solid #e5e8ee;width:30px;height:28px;min-height:0;padding:5px;border-radius:6px}
#selection-properties .border-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
#selection-properties .border-presets button{height:32px;min-height:0;display:flex;align-items:center;justify-content:center;border:1px solid #e5e8ee;padding:5px;color:#5b6575;border-radius:6px}
#selection-properties .border-presets button[aria-pressed=true]{background:#eef1ff;border-color:#aebcfe;color:#4262ff}
#selection-properties .border-sample{display:block;width:22px;height:8px;position:relative}
#selection-properties .border-sample:before{content:'';position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:var(--border-preview);background:currentColor;border-radius:5px}
#selection-properties .border-presets button:first-child .border-sample:before{height:1px;transform:rotate(-25deg);background:#a6adba}
#selection-properties .transform-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#selection-properties .transform-grid>label{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0}
#selection-properties .transform-grid input{width:100%!important}
#selection-properties .aspect-control>span{display:flex;align-items:center;gap:7px}
#selection-properties .aspect-control input{width:16px;height:16px;accent-color:#4262ff}
#selection-properties .caption-row{display:flex;gap:6px;align-items:center}
#selection-properties .caption-row input[type=text]{width:145px}
#selection-properties .caption-row input[type=number]{width:64px}
#selection-properties .caption-row button{padding:5px;width:25px}
#selection-properties .control-note,#selection-properties .empty-message{margin:0;color:#8b94a2;font-size:11px;line-height:1.5}
#selection-properties .compact-type-controls{display:none}
#selection-properties :is([data-menu="size"],[data-menu="arrange"])>summary{width:100%;justify-content:flex-start;gap:10px;height:36px;min-width:210px;padding:8px}
#selection-properties :is([data-menu="size"],[data-menu="arrange"]){width:100%}
#selection-properties .submenu-label{flex:1;text-align:left;font-size:12px}
#selection-properties summary>svg.submenu-arrow{width:14px;height:14px}
#selection-properties[data-compact=true]>.font-picker,#selection-properties[data-compact=true]>.toolbar-fontsize{display:none}
#selection-properties[data-compact=true] .compact-type-controls{display:flex;flex-direction:column;gap:9px;padding:6px;width:215px}
#selection-properties :disabled,#mindmap-properties :disabled{opacity:.42;cursor:default}
#mindmap-properties .property-popover.mind-choice-grid{display:grid;grid-template-columns:repeat(3,40px);gap:4px;width:max-content;padding:6px}
#mindmap-properties .mind-choice-grid .mind-layout-choice{width:40px;height:40px;min-height:0;padding:8px;display:flex;align-items:center;justify-content:center;border:0;border-radius:8px}
#mindmap-properties .mind-choice-grid .mind-layout-choice>svg{display:block;width:23px;height:23px;flex:none}
#mindmap-properties .mind-format-form{display:grid;grid-template-columns:minmax(0,1fr)68px;gap:8px;width:100%;align-items:center}
#mindmap-properties .mind-format-form>.mind-fontsize{height:36px;width:68px;padding:5px;border:1px solid #e1e5ed;font-variant-numeric:tabular-nums}
#mindmap-properties .mind-format-form>hr,#mindmap-properties .mind-format-form>.mind-style-choices,#mindmap-properties .mind-format-form>.mind-border-range{grid-column:1 / -1}
#mindmap-properties .mind-style-choices{display:flex;align-items:center;justify-content:center;gap:4px}
#mindmap-properties .mind-style-choices>button{position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;padding:8px;min-height:0;border:0;border-radius:8px;background:transparent;cursor:pointer;color:#303842}
#mindmap-properties .mind-style-choices>button:hover{background:#f1f3f8;color:#4262ff}
#mindmap-properties .mind-style-choices>button[aria-pressed=true]{background:#eef1ff;color:#4262ff}
#mindmap-properties .mind-style-choices>button>i{position:absolute;bottom:4px;left:12px;right:12px;height:3px;border:1px solid #0001;border-radius:2px}
#mindmap-properties .mind-border-range{display:flex;align-items:center;gap:12px}
#mindmap-properties .mind-border-range>input[type=range],#mindmap-properties .mind-opacity>input[type=range]{padding:0;height:22px;min-width:0;flex:1;border:0;accent-color:#4262ff}
#mindmap-properties .mind-palette-back{display:flex;align-items:center;justify-content:center;width:32px;height:32px;padding:6px;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer}
#mindmap-properties .mind-palette-back:hover{background:#eef1ff;color:#4262ff}
#mindmap-properties .mind-opacity{display:flex;flex-direction:column-reverse;gap:3px;font-size:11px;color:#7c8492}
#mindmap-properties .mind-opacity>input[type=range]{width:100%;flex:none}
#mindmap-properties .mind-colors{grid-template-columns:repeat(4,32px);gap:12px;padding:2px;justify-content:space-between}
#mindmap-properties .mind-colors button{width:32px;height:32px}
#selection-properties button:focus-visible,#selection-properties summary:focus-visible,#selection-properties input:focus-visible,#mindmap-properties button:focus-visible,#mindmap-properties summary:focus-visible{outline:2px solid #4262ff;outline-offset:2px}
#alignbar{display:none!important}
@media(max-width:900px){#selection-properties,#mindmap-properties{max-width:calc(100vw - 90px)}}
@media(prefers-reduced-motion:reduce){#selection-properties *,#mindmap-properties *{transition:none!important}}
`;
  document.head.append(css);
  document.addEventListener('pointerdown',event=>{
    const panel=document.getElementById('selection-properties');
    if((event.target as Element).closest('.font-picker-popover,.brand-dialog'))return;
    if(panel&&!panel.contains(event.target as Node)){delete panel.dataset.openMenu;for(const menu of panel.querySelectorAll<HTMLDetailsElement>('details'))menu.open=false;}
  });
}
