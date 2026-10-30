import type { Camera } from './core/camera';
import type { BoardState } from './core/commands';
import { selectedBounds } from './core/groups';

/** Places contextual controls near the selection while keeping their popovers on screen. */
export function positionContextPanel(panel:HTMLElement,state:BoardState,camera:Camera){
  if(panel.hidden)return;const bounds=selectedBounds(state);if(!bounds)return;
  const a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});
  const width=panel.offsetWidth||600,height=panel.offsetHeight||44;
  const left=Math.max(78,Math.min(innerWidth-width-12,(a.x+b.x-width)/2));
  let top=a.y-height-42;if(top<66)top=b.y+18;
  top=Math.max(66,Math.min(innerHeight-height-56,top));
  panel.style.left=left+'px';panel.style.top=top+'px';panel.style.transform='none';
  panel.dataset.below=String(top>b.y);
}

export function compactContextPanel(panel:HTMLElement){
  if(!panel.dataset.tracksMenus){panel.dataset.tracksMenus='true';panel.addEventListener('toggle',event=>{const details=event.target as HTMLDetailsElement;if(!details.isConnected||details.tagName!=='DETAILS')return;const label=details.querySelector('summary')?.textContent??'';if(details.open)panel.dataset.openMenu=label;else if(panel.dataset.openMenu===label)delete panel.dataset.openMenu;},true);}
  if(panel.dataset.compacted==='true')return;panel.dataset.compacted='true';
  const menu=(label:string,selectors:string[])=>{
    const items=selectors.flatMap(selector=>[...panel.querySelectorAll<HTMLElement>(selector)]).filter((el,i,arr)=>arr.indexOf(el)===i);
    if(!items.length)return;const details=document.createElement('details');details.className='property-menu';
    const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
    const body=document.createElement('div');body.className='property-popover';details.append(body);
    for(const item of items){const wrapper=item.closest<HTMLElement>('label')??item;if(wrapper.parentElement?.closest('details')?.classList.contains('property-menu'))continue;body.append(wrapper);}
    panel.append(details);
  };
  const connector=!!panel.querySelector('[data-connector]');
  if(connector){menu('Traço',['[data-connector="strokeWidth"]','[data-connector="strokeStyle"]','[data-connector="strokeColor"]']);menu('Caminho',['[data-action="add-waypoint"]','[data-action="remove-waypoint"]','[data-action="reset-route"]']);}
  else{
    menu('Borda',['[data-field="borderColor"]','[data-field="borderWidth"]','[data-field="borderOpacity"]','[data-field="borderStyle"]','[data-field="cornerRadius"]']);
    menu('Texto',['[data-field="textAlign"]','[data-field="textAlignVertical"]','[data-field="color"]','[data-field="highlightColor"]','[data-action="clear-highlight"]','[data-field="fontWeight"]','[data-field="fontStyle"]','[data-field="textDecoration"]']);
    menu('Tamanho',['[data-field="width"]','[data-field="height"]','[data-field="rotation"]']);
    menu('Preenchimento',['.swatches','[data-field="fillOpacity"]']);
    menu('Imagem',['[data-image="maskShape"]','[data-image="opacity"]','[data-action="replace-image"]','[data-action="flip-x"]','[data-action="flip-y"]','[data-action="download-image"]','[data-action="reset-crop"]']);
    menu('Organizar',['[data-action="front"]','[data-action="back"]','[data-action="frame"]','[data-action="clear"]','[data-action="copy-style"]','[data-action="paste-style"]','[data-action="copy-image"]','[data-field="link"]']);
  }
  // Remove empty separators/containers left by reparenting controls.
  for(const details of panel.querySelectorAll('details:not(.property-menu)'))if(!details.querySelector('input,select,button'))details.remove();
  for(const details of panel.querySelectorAll<HTMLDetailsElement>('details:not(.property-menu)')){
    details.classList.add('property-menu');const body=document.createElement('div');body.className='property-popover';
    for(const child of [...details.children])if(child.tagName!=='SUMMARY')body.append(child);details.append(body);
  }
  for(const sep of panel.querySelectorAll('.divider'))sep.remove();
  for(const details of panel.querySelectorAll<HTMLDetailsElement>('details')){
    details.addEventListener('toggle',()=>{
      if(!details.isConnected||!details.open)return;
      for(const other of panel.querySelectorAll<HTMLDetailsElement>('details'))if(other!==details)other.open=false;
      const body=details.querySelector<HTMLElement>('.property-popover');if(!body)return;
      body.style.left='0';body.style.right='auto';body.style.top='calc(100% + 8px)';body.style.bottom='auto';
      const rect=body.getBoundingClientRect();if(rect.right>innerWidth-12){body.style.left='auto';body.style.right='0';}
      if(rect.bottom>innerHeight-16){body.style.top='auto';body.style.bottom='calc(100% + 8px)';}
    });
    if(details.querySelector('summary')?.textContent===panel.dataset.openMenu)details.open=true;
  }
}

export function installContextStyles(){const css=document.createElement('style');css.textContent=`
#selection-properties{flex-wrap:nowrap!important;justify-content:flex-start!important;width:max-content;max-width:calc(100vw - 96px)!important;gap:2px!important;border-radius:8px!important;min-height:44px;box-shadow:0 4px 18px #19181226!important}
#selection-properties button{white-space:nowrap;min-height:32px;font-size:12px}
#selection-properties label{white-space:nowrap}
#selection-properties>select{max-width:112px}
#selection-properties details{position:relative;font-size:12px;flex-shrink:0}
#selection-properties summary{padding:9px 8px;cursor:pointer;white-space:nowrap;border-radius:5px;list-style:none}
#selection-properties summary::after{content:'⌄';font-size:12px;margin-left:5px;color:#73726c}
#selection-properties summary:hover,#selection-properties details[open]>summary{background:#f2f4fc}
#selection-properties .property-popover{position:absolute;left:0;top:calc(100% + 8px);background:white;border:1px solid #e7e7e5;border-radius:9px;box-shadow:0 5px 25px #19181224;padding:12px;width:250px;max-height:min(430px,70vh);overflow:auto;display:flex;flex-wrap:wrap;gap:8px;z-index:40}
#selection-properties .property-popover label{width:100%;justify-content:space-between;min-height:30px;font-size:12px}
#selection-properties .property-popover input[type=number]{width:74px}
#selection-properties .property-popover select{width:100%;max-width:none}
#selection-properties .property-popover button{flex:1;white-space:normal;min-width:95px;text-align:left}
#selection-properties .property-popover .swatches{display:flex!important;flex-wrap:wrap;gap:7px}
#selection-properties .property-popover .swatch{flex:none;min-width:21px;width:21px;min-height:21px}
#alignbar{z-index:23}
@media(max-width:1050px){#selection-properties{flex-wrap:wrap!important;max-width:calc(100vw - 95px)!important}}`;
document.head.append(css);document.addEventListener('pointerdown',e=>{const panel=document.getElementById('selection-properties');if(panel&&!panel.contains(e.target as Node))for(const d of panel.querySelectorAll<HTMLDetailsElement>('details'))d.open=false;});}
