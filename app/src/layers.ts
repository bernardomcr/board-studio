import type { BoardState, CommandBus } from './core/commands';
import type { Camera } from './core/camera';
import { captureSelection, duplicateSnapshot, groupLeaves, itemLocked,selectedBounds } from './core/groups';
import { layerEntity, layerLabel, layerTree, layerUpdateCommand, orderEntities, reorderLayerCommands, type LayerNode, type LayerDestination } from './core/layers';
import { icon } from './icons';

interface LayersAPI {
  state: BoardState; bus: CommandBus; camera: Camera;
  onChange?(): void;
  /** Called after the selection command, for tool/group-scope synchronization. */
  onSelect?(ids: string[]): void;
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));

/** A small object-layer panel: no raster filters, merging or destructive pixel operations. */
export function installLayers(api: LayersAPI) {
  const { state, bus } = api;
  const css = document.createElement('style');
  css.textContent = `
#layers-controls{position:fixed;right:14px;top:14px;z-index:32;font:12px Inter,'Segoe UI',sans-serif;color:#292b32}
body.home-visible #layers-controls{display:none!important}
#layers-controls button,#layers-controls input{font:inherit;color:inherit;box-sizing:border-box}
#layers-toggle{height:40px;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e3e4e8;border-radius:8px;padding:0 12px;box-shadow:0 2px 8px #19181213;cursor:pointer}
#layers-toggle[aria-expanded=true]{border-color:#b8c4ff;color:#3859ff;background:#f5f7ff}
#layers-toggle .layers-total{color:#7c818b;font-size:11px;min-width:15px;text-align:center}
#layers-panel{position:fixed;top:70px;right:14px;bottom:70px;width:292px;max-width:calc(100vw - 28px);display:flex;flex-direction:column;background:#fff;border:1px solid #e3e4e8;border-radius:10px;box-shadow:0 5px 24px #19181220;overflow:hidden}
#layers-panel[hidden]{display:none}
#layers-panel header{height:46px;min-height:46px;padding:0 13px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eceef2;font-size:13px;font-weight:600}
#layers-panel button{display:flex;align-items:center;justify-content:center;border:0;background:none;border-radius:5px;padding:5px;cursor:pointer;flex:none}
#layers-panel button:hover{background:#edf1fb;color:#3859ff}
#layers-panel button:focus-visible,#layers-toggle:focus-visible,#layers-panel input:focus-visible{outline:2px solid #3859ff;outline-offset:-2px}
#layers-panel button:disabled{opacity:.35;cursor:default;background:none;color:inherit}
#layers-list{overflow:auto;flex:1;padding:5px 0;min-height:100px}
#layers-list:empty:after{content:'Seu board ainda está vazio. Adicione uma foto, forma ou texto.';display:block;padding:25px 20px;color:#818792;line-height:1.7;text-align:center}
.layer-row{display:flex;align-items:center;min-height:46px;padding:3px 7px 3px calc(6px + var(--layer-depth)*14px);gap:3px;border-top:2px solid transparent;border-bottom:2px solid transparent;user-select:none}
.layer-row:hover{background:#f7f8fb}.layer-row.selected{background:#edf2ff}.layer-row.partly-selected{background:#f5f7fd}.layer-row.layer-hidden .layer-title{opacity:.52}
.layer-row[data-drop=before]{border-top-color:#3859ff}.layer-row[data-drop=after]{border-bottom-color:#3859ff}.layer-row.dragging{opacity:.35}
.layer-expander,.layer-spacer{width:18px;height:25px;flex:none}.layer-spacer{display:block}
#layers-list .layer-select{flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left;padding:3px 2px;background:none!important;color:inherit}
.layer-thumb{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:1px solid #e1e4ea;border-radius:5px;background:#fff;color:#6a7280;overflow:hidden}.layer-thumb img{width:100%;height:100%;object-fit:cover;pointer-events:none}.layer-thumb svg{width:17px;height:17px}
.layer-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:12px;line-height:1.3}.layer-kind{display:block;color:#979da7;font-size:10px;margin-top:3px}
.layer-name-wrap{min-width:0;flex:1}.layer-name-input{width:100%;min-width:0;height:29px;border:1px solid #a7b9ff;border-radius:4px;padding:4px 6px;font:12px Inter,'Segoe UI',sans-serif}
#layers-list .layer-visibility,#layers-list .layer-lock{width:25px;height:28px;opacity:.7}#layers-list .layer-visibility:hover,#layers-list .layer-lock:hover{opacity:1}
#layers-footer{display:flex;align-items:center;gap:3px;height:44px;padding:5px 8px;border-top:1px solid #eceef2;background:#fafbfc}#layers-footer button{width:31px;height:31px}#layers-footer .layers-footer-spacer{flex:1}
#layers-status{min-height:27px;padding:0 12px 8px;color:#8a909a;font-size:10px;line-height:1.5}
@media(max-width:680px){#layers-toggle{width:40px;padding:9px;gap:0}#layers-toggle .layers-label,#layers-toggle .layers-total{display:none}#layers-panel{top:64px;bottom:64px;width:280px}}
`;
  document.head.append(css);
  const controls = document.createElement('div'); controls.id='layers-controls';
  controls.innerHTML=`<button id="layers-toggle" aria-label="Camadas" aria-controls="layers-panel" aria-expanded="false">${icon('layers',18)}<span class="layers-label">Camadas</span><span class="layers-total">0</span></button><section id="layers-panel" role="region" aria-label="Camadas" hidden><header><span>Camadas</span><button data-layers-close aria-label="Fechar camadas">${icon('close',17)}</button></header><div id="layers-list" role="list" aria-label="Objetos do board"></div><div id="layers-footer"><button data-layer-action="up" aria-label="Mover camada acima" title="Mover acima">${icon('arrow-up',18)}</button><button data-layer-action="down" aria-label="Mover camada abaixo" title="Mover abaixo">${icon('arrow-down',18)}</button><button data-layer-action="rename" aria-label="Renomear camada" title="Renomear · F2">${icon('rename',18)}</button><span class="layers-footer-spacer"></span><button data-layer-action="duplicate" aria-label="Duplicar camada" title="Duplicar">${icon('duplicate',18)}</button><button data-layer-action="delete" aria-label="Excluir camada" title="Excluir">${icon('trash',18)}</button></div><div id="layers-status">Shift seleciona um intervalo · arraste para ordenar</div></section>`;
  document.body.append(controls);
  const toggleButton=controls.querySelector<HTMLButtonElement>('#layers-toggle')!,panel=controls.querySelector<HTMLElement>('#layers-panel')!,list=controls.querySelector<HTMLElement>('#layers-list')!;
  const collapsed = new Set<string>();
  const imageVersions = new Map<string,{src:string;version:number}>();
  let renderKey='',anchorId:string|null=null,editingId:string|null=null,draggedId:string|null=null;
  let visibleIds:string[]=[];
  let pointerInteraction=false,pendingRefresh=false,pointerRelease:ReturnType<typeof setTimeout>|undefined;
  const releasePointer=()=>{pointerInteraction=false;if(pendingRefresh){pendingRefresh=false;refresh();}};
  controls.addEventListener('pointerdown',()=>{if(pointerRelease)clearTimeout(pointerRelease);pointerInteraction=true;},true);
  document.addEventListener('click',event=>{if(event.detail>0&&(event.target as Element).closest('#layers-list [data-layer-select]')){if(pointerRelease)clearTimeout(pointerRelease);pointerRelease=setTimeout(releasePointer,420);}else releasePointer();});
  window.addEventListener('pointerup',()=>{if(pointerInteraction)pointerRelease=setTimeout(releasePointer,120);},true);
  window.addEventListener('pointercancel',releasePointer,true);

  function open(){panel.hidden=false;toggleButton.setAttribute('aria-expanded','true');document.body.classList.add('layers-open');renderKey='';refresh();api.onChange?.();}
  function close(){commitRename();panel.hidden=true;toggleButton.setAttribute('aria-expanded','false');document.body.classList.remove('layers-open');api.onChange?.();}
  function toggle(){if(panel.hidden)open();else close();}
  toggleButton.onclick=toggle;
  const changed=()=>{api.onChange?.();renderKey='';refresh();};

  function leaves(id:string){return groupLeaves(state,id);}
  function select(id:string,event:MouseEvent){
    let ids=leaves(id);
    if(event.shiftKey&&anchorId&&visibleIds.includes(anchorId)){
      const start=visibleIds.indexOf(anchorId),end=visibleIds.indexOf(id);
      ids=[...new Set(visibleIds.slice(Math.min(start,end),Math.max(start,end)+1).flatMap(leaves))];
    }else if(event.ctrlKey||event.metaKey){const next=new Set(state.selection);for(const item of ids)if(next.has(item))next.delete(item);else next.add(item);ids=[...next];}
    else anchorId=id;
    bus.exec({op:'SELECTION_SET',payload:ids});api.onSelect?.(ids);for(const row of list.querySelectorAll<HTMLElement>('[data-layer-id]')){const members=leaves(row.dataset.layerId!),count=members.filter(item=>state.selection.has(item)).length;row.classList.toggle('selected',count>0&&count===members.length);row.classList.toggle('partly-selected',count>0&&count<members.length);}changed();
  }
  function focusLayer(id:string){const ids=leaves(id),bounds=selectedBounds(state,ids);if(!bounds)return;bus.exec({op:'SELECTION_SET',payload:ids});api.onSelect?.(ids);api.camera.fit(bounds,64,{left:78,top:68,width:Math.max(100,panel.getBoundingClientRect().left-90),height:Math.max(100,api.camera.height-132)});changed();}
  function applyTo(id:string,patch:Record<string,unknown>,label:string){
    const commands=leaves(id).map(leaf=>layerUpdateCommand(state,leaf,patch));
    if(commands.length)bus.exec({op:'BATCH',payload:{label,commands}});changed();
  }
  function reorder(destination:LayerDestination,ids=[...state.selection]){
    const commands=reorderLayerCommands(state,ids,destination);
    if(commands.length)bus.exec({op:'BATCH',payload:{label:'Ordenar camadas',commands}});
    changed();
  }
  function startRename(id:string){
    if(state.groups.has(id)||itemLocked(state,id))return;
    editingId=id;renderKey='';refresh();
    queueMicrotask(()=>{const input=list.querySelector<HTMLInputElement>('[data-layer-name]');input?.focus();input?.select();});
  }
  function commitRename(){
    if(!editingId)return;
    const id=editingId,input=list.querySelector<HTMLInputElement>('[data-layer-name]'),name=input?.value.trim().slice(0,140);
    editingId=null;
    if(name&&layerEntity(state,id)?.name!==name)bus.exec(layerUpdateCommand(state,id,{name}));
    renderKey='';refresh();
  }
  function removeSelection(){
    const ids=[...state.selection].filter(id=>!itemLocked(state,id));
    if(!ids.length)return;
    bus.exec({op:'BATCH',payload:{label:'Excluir camadas',commands:[...ids.map(id=>({op:state.widgets.has(id)?'WIDGET_REMOVE' as const:state.connectors.has(id)?'CONNECTOR_REMOVE' as const:'STROKE_REMOVE' as const,payload:id})),{op:'SELECTION_SET',payload:[]}]}});changed();
  }

  controls.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLButtonElement>('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-layers-close'))close();
    const expand=target.dataset.layerExpand;
    if(expand){if(collapsed.has(expand))collapsed.delete(expand);else collapsed.add(expand);renderKey='';refresh();}
    const id=target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId;
    if(id&&target.hasAttribute('data-layer-select')){select(id,event);if(event.detail===2)focusLayer(id);}
    if(id&&target.hasAttribute('data-layer-visibility'))applyTo(id,{hidden:!leaves(id).every(leaf=>layerEntity(state,leaf)?.hidden)},'Visibilidade da camada');
    if(id&&target.hasAttribute('data-layer-lock'))applyTo(id,{locked:!leaves(id).every(leaf=>itemLocked(state,leaf))},'Bloqueio da camada');
    const action=target.dataset.layerAction;
    if(action==='up')reorder('forward');if(action==='down')reorder('backward');
    if(action==='rename'&&state.selection.size===1)startRename([...state.selection][0]!);
    if(action==='duplicate'){duplicateSnapshot(state,bus,captureSelection(state));changed();}
    if(action==='delete')removeSelection();
  });
  list.addEventListener('dblclick',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-layer-select]');const id=button?.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId;if(id){event.preventDefault();focusLayer(id);}});
  list.addEventListener('focusout',event=>{if((event.target as HTMLElement).hasAttribute('data-layer-name'))commitRename();});
  panel.addEventListener('keydown',event=>{
    if((event.target as HTMLElement).hasAttribute('data-layer-name')){
      if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commitRename();}
      else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();editingId=null;renderKey='';refresh();}
      return;
    }
    if(event.key==='F2'&&state.selection.size===1){event.preventDefault();event.stopPropagation();startRename([...state.selection][0]!);}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();removeSelection();}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();toggleButton.focus();}
    if((event.altKey||event.ctrlKey||event.metaKey)&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();event.stopPropagation();reorder(event.key==='ArrowUp'?'forward':'backward');}
  });
  list.addEventListener('dragstart',event=>{
    const row=(event.target as Element).closest<HTMLElement>('[data-layer-id]');if(!row)return;
    const id=row.dataset.layerId!;if(leaves(id).some(leaf=>itemLocked(state,leaf))){event.preventDefault();return;}
    draggedId=id;row.classList.add('dragging');event.dataTransfer?.setData('application/x-board-layer',id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
  });
  list.addEventListener('dragover',event=>{
    if(!draggedId)return;
    const row=(event.target as Element).closest<HTMLElement>('[data-layer-id]');if(!row||row.dataset.layerId===draggedId||leaves(draggedId).includes(row.dataset.layerId!))return;
    event.preventDefault();for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;
    row.dataset.drop=event.clientY<row.getBoundingClientRect().top+row.offsetHeight/2?'before':'after';if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  });
  list.addEventListener('drop',event=>{
    const row=(event.target as Element).closest<HTMLElement>('[data-layer-id]');if(!row||!draggedId||!row.dataset.drop)return;
    event.preventDefault();const id=draggedId;draggedId=null;
    // The list is top to bottom; canvas z is bottom to top.
    reorder({targetId:row.dataset.layerId!,position:row.dataset.drop==='before'?'after':'before'},[id]);
    for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;
  });
  list.addEventListener('dragend',()=>{draggedId=null;for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;for(const item of list.querySelectorAll('.dragging'))item.classList.remove('dragging');});

  function thumbnail(id:string){
    const item=layerEntity(state,id);
    if(!item)return icon('group',17);
    if(item.type==='image')return `<img src="${escape(item.src)}" alt="" draggable="false">`;
    const name=item.type==='sticky_note'?'sticky':item.type==='stroke'?'brush':item.type==='frame'?'frame':item.type==='connector'?'connector':item.type==='text'?'text':'shape';
    return icon(name,17);
  }
  function kind(id:string){const item=layerEntity(state,id);return state.groups.has(id)?`${leaves(id).length} objetos`:item?.type==='image'?'Imagem':item?.type==='text'?'Texto':item?.type==='connector'?'Conector':item?.type==='stroke'?'Desenho':item?.type==='frame'?'Quadro':item?.type==='sticky_note'?'Nota':'Forma';}
  function row(node:LayerNode,depth:number):string{
    const members=leaves(node.id),selected=members.every(id=>state.selection.has(id)),partial=!selected&&members.some(id=>state.selection.has(id));
    const hidden=members.every(id=>layerEntity(state,id)?.hidden),locked=members.every(id=>itemLocked(state,id)),label=layerLabel(state,node.id),expanded=!collapsed.has(node.id),isGroup=!!node.children;
    visibleIds.push(node.id);
    const title=editingId===node.id?`<input class="layer-name-input" data-layer-name="${escape(node.id)}" aria-label="Nome da camada" value="${escape(layerEntity(state,node.id)?.name??label)}" maxlength="140">`:`<span class="layer-name-wrap"><span class="layer-title" title="${escape(label)}">${escape(label)}</span><span class="layer-kind">${kind(node.id)}</span></span>`;
    return `<div role="listitem" class="layer-row${selected?' selected':partial?' partly-selected':''}${hidden?' layer-hidden':''}" data-layer-id="${escape(node.id)}" style="--layer-depth:${depth}" draggable="${!members.some(id=>itemLocked(state,id))}">${isGroup?`<button class="layer-expander" data-layer-expand="${escape(node.id)}" aria-label="${expanded?'Recolher':'Expandir'} grupo" aria-expanded="${expanded}">${icon(expanded?'chevron-down':'chevron-right',15)}</button>`:'<span class="layer-spacer"></span>'}${editingId===node.id?`<span class="layer-thumb">${thumbnail(node.id)}</span>${title}`:`<button class="layer-select" data-layer-select aria-label="Selecionar camada ${escape(label)}" aria-pressed="${selected}"><span class="layer-thumb">${thumbnail(node.id)}</span>${title}</button>`}<button class="layer-visibility" data-layer-visibility aria-label="${hidden?'Mostrar':'Ocultar'} ${escape(label)}" title="${hidden?'Mostrar':'Ocultar'}">${icon(hidden?'eye-off':'eye',16)}</button><button class="layer-lock" data-layer-lock aria-label="${locked?'Desbloquear':'Bloquear'} ${escape(label)}" title="${locked?'Desbloquear':'Bloquear'}">${icon(locked?'lock':'unlock',15)}</button></div>${isGroup&&expanded?node.children!.map(child=>row(child,depth+1)).join(''):''}`;
  }
  function refresh(){
    const ids=orderEntities(state);controls.querySelector('.layers-total')!.textContent=String(ids.length);
    if(panel.hidden)return;
    if(pointerInteraction){pendingRefresh=true;return;}
    if(editingId&&list.contains(document.activeElement)&&document.activeElement?.matches('input'))return;
    const signature=ids.map(id=>{const item=layerEntity(state,id)!;let version=0;if(item.type==='image'){const previous=imageVersions.get(id);version=previous?.src===item.src?previous.version:(previous?.version??0)+1;imageVersions.set(id,{src:item.src,version});}return [id,item.type,item.z,item.name,item.hidden,item.locked,layerLabel(state,id),version];});
    const nextKey=JSON.stringify([signature,[...state.groups],[...state.selection],[...collapsed],editingId]);if(nextKey===renderKey)return;renderKey=nextKey;
    const scroll=list.scrollTop;visibleIds=[];list.innerHTML=layerTree(state).map(node=>row(node,0)).join('');list.scrollTop=scroll;
    const locked=[...state.selection].some(id=>itemLocked(state,id)),has=state.selection.size>0;
    for(const button of controls.querySelectorAll<HTMLButtonElement>('[data-layer-action]'))button.disabled=!has||button.dataset.layerAction!=='duplicate'&&locked||button.dataset.layerAction==='rename'&&state.selection.size!==1;
  }
  refresh();
  return {refresh,toggle,open,close};
}
