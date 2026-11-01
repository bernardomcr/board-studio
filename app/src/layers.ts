import type { BoardState, CommandBus, Command } from './core/commands';
import {nextId} from './core/model';
import {ensureBoardLayers,snapshotBoardLayers,boardLayerFlags,layerDescendants,ownLayerFlags,type BoardLayer,type BoardLayers} from './core/board-layers';
import type { Camera } from './core/camera';
import { captureSelection, duplicateSnapshot, groupLeaves, itemLocked,selectedBounds } from './core/groups';
import { layerEntity, layerLabel, layerTree, layerUpdateCommand, orderEntities, reorderLayerCommands, type LayerNode, type LayerDestination } from './core/layers';
import { icon } from './icons';

interface LayersAPI {
  state: BoardState; bus: CommandBus; camera: Camera;
  getBoardKey?():string|null;
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
.board-layer-row{border-top:1px solid #e7eaf1;background:var(--studio-surface,#fafbfe);font-weight:600}.board-layer-row.active{box-shadow:inset 3px 0 #4262ff}.board-layer-row.layer-chosen{background:#e7edff}.board-layer-row[data-drop=inside]{outline:2px solid #4262ff;outline-offset:-3px}.board-layer-row .layer-thumb{background:repeating-conic-gradient(#c8ccd4 0% 25%,#fff 0% 50%) 0/10px 10px}.board-layer-row .layer-kind{font-weight:400}.board-layer-row .layer-title{font-size:12px}
#layers-footer{height:auto;min-height:44px;flex-wrap:wrap}#layers-footer button{width:28px}.layer-empty{padding:10px 12px 14px 42px;color:#9aa1ad;font-size:11px;font-style:italic}
@media(max-width:680px){#layers-toggle{width:40px;padding:9px;gap:0}#layers-toggle .layers-label,#layers-toggle .layers-total{display:none}#layers-panel{top:64px;bottom:64px;width:280px}}
`;
  document.head.append(css);
  const controls = document.createElement('div'); controls.id='layers-controls';
  controls.innerHTML=`<button id="layers-toggle" aria-label="Camadas" aria-controls="layers-panel" aria-expanded="false">${icon('layers',18)}<span class="layers-label">Camadas</span><span class="layers-total">0</span></button><section id="layers-panel" role="region" aria-label="Camadas" hidden><header><span>Camadas</span><button data-layers-close aria-label="Fechar camadas">${icon('close',17)}</button></header><div id="layers-list" role="list" aria-label="Objetos do board"></div><div id="layers-footer"><button data-layer-action="up" aria-label="Mover camada acima" title="Mover acima">${icon('arrow-up',18)}</button><button data-layer-action="down" aria-label="Mover camada abaixo" title="Mover abaixo">${icon('arrow-down',18)}</button><button data-layer-action="rename" aria-label="Renomear camada" title="Renomear · F2">${icon('rename',18)}</button><span class="layers-footer-spacer"></span><button data-layer-action="duplicate" aria-label="Duplicar camada" title="Duplicar">${icon('duplicate',18)}</button><button data-layer-action="delete" aria-label="Excluir camada" title="Excluir">${icon('trash',18)}</button></div><div id="layers-status">Shift seleciona um intervalo · arraste para ordenar</div></section>`;
  document.body.append(controls);
  const toggleButton=controls.querySelector<HTMLButtonElement>('#layers-toggle')!,panel=controls.querySelector<HTMLElement>('#layers-panel')!,list=controls.querySelector<HTMLElement>('#layers-list')!;
  const collapsed = new Set<string>();
  // Layer rows are the primary surface. Object details are an explicit opt-in,
  // so many brush strokes never look like dozens of automatically made layers.
  const expandedLayers = new Set<string>();
  const selectedBoardLayers=new Set<string>();
  const imageVersions = new Map<string,{src:string;version:number}>();
  let renderKey='',anchorId:string|null=null,editingId:string|null=null,draggedId:string|null=null;
  let lastBoardKey=api.getBoardKey?.();
  let visibleIds:string[]=[];
  let pointerInteraction=false,pendingRefresh=false,pointerRelease:ReturnType<typeof setTimeout>|undefined;
  const footer=controls.querySelector('#layers-footer')!;
  footer.insertAdjacentHTML('afterbegin',`<button data-board-action="add" aria-label="Nova camada" title="Nova camada transparente">${icon('plus',18)}</button><button data-board-action="group" aria-label="Novo grupo de camadas" title="Agrupar camadas">${icon('group',18)}</button><button data-board-action="ungroup" aria-label="Desagrupar camadas" title="Desagrupar camadas">${icon('ungroup',18)}</button><button data-board-action="move-content" aria-label="Mover objetos para a camada ativa" title="Mover seleção para a camada ativa">${icon('layers',18)}</button>`);
  function documentChange(document:BoardLayers,assignments?:Array<[string,string]>,label='Editar camadas'){bus.exec({op:'BATCH',payload:{label,commands:[{op:'LAYERS_SET',payload:{document,assignments}}]}});changed();}
  function layerMembers(id:string){const ids=new Set(layerDescendants(ensureBoardLayers(state),id));return orderEntities(state).filter(key=>ids.has(layerEntity(state,key)?.layerId??''));}
  function chooseBoardLayer(id:string,event?:MouseEvent){const doc=ensureBoardLayers(state),node=doc.nodes.find(n=>n.id===id);if(!node)return;if(!event?.ctrlKey&&!event?.metaKey)selectedBoardLayers.clear();if(event?.ctrlKey||event?.metaKey){if(selectedBoardLayers.has(id))selectedBoardLayers.delete(id);else selectedBoardLayers.add(id);}else selectedBoardLayers.add(id);const leaf=node.kind==='layer'?id:doc.nodes.find(n=>n.kind==='layer'&&layerDescendants(doc,id).includes(n.id))?.id;if(leaf)bus.exec({op:'LAYERS_ACTIVE',payload:leaf});changed();}
  function addLayer(){const doc=snapshotBoardLayers(state),active=doc.nodes.find(n=>n.id===doc.activeId),selected=selectedBoardLayers.size===1?doc.nodes.find(n=>selectedBoardLayers.has(n.id)):undefined,parentId=selected?.kind==='group'?selected.id:active?.parentId,id=nextId('layer'),name=`Camada ${doc.nodes.filter(n=>n.kind==='layer').length+1}`;doc.nodes.push({id,kind:'layer',name,...(parentId?{parentId}:{})});doc.activeId=id;selectedBoardLayers.clear();selectedBoardLayers.add(id);documentChange(doc,undefined,'Nova camada');}
  function groupLayers(){const doc=snapshotBoardLayers(state),selected=[...selectedBoardLayers].filter(id=>!doc.nodes.some(n=>selectedBoardLayers.has(n.id)&&n.id!==id&&layerDescendants(doc,n.id).includes(id))),id=nextId('layer-group');doc.nodes.push({id,kind:'group',name:'Grupo de camadas'});for(const node of doc.nodes)if(selected.includes(node.id))node.parentId=id;selectedBoardLayers.clear();selectedBoardLayers.add(id);documentChange(doc,undefined,'Agrupar camadas');}
  function reorderBoard(id:string,targetId:string,position:'before'|'after'|'inside'){const doc=snapshotBoardLayers(state),node=doc.nodes.find(n=>n.id===id),target=doc.nodes.find(n=>n.id===targetId);if(!node||!target||id===targetId||layerDescendants(doc,id).includes(targetId))return;node.parentId=position==='inside'&&target.kind==='group'?targetId:target.parentId;doc.nodes=doc.nodes.filter(n=>n.id!==id);let at=doc.nodes.findIndex(n=>n.id===targetId);if(position==='after')at++;if(position==='inside')at=doc.nodes.length;doc.nodes.splice(at,0,node);documentChange(doc,undefined,'Ordenar camadas');}
  function shiftBoard(direction:'forward'|'backward'){const doc=ensureBoardLayers(state);for(const id of selectedBoardLayers){const n=doc.nodes.find(n=>n.id===id);if(!n)continue;const siblings=doc.nodes.filter(v=>v.parentId===n.parentId),index=siblings.findIndex(v=>v.id===id),target=siblings[index+(direction==='forward'?1:-1)];if(target)reorderBoard(id,target.id,direction==='forward'?'after':'before');}}
  function deleteBoardLayers(){const doc=snapshotBoardLayers(state),removed=new Set([...selectedBoardLayers].flatMap(id=>layerDescendants(doc,id))),members=orderEntities(state).filter(id=>removed.has(layerEntity(state,id)?.layerId??''));doc.nodes=doc.nodes.filter(n=>!removed.has(n.id));if(!doc.nodes.some(n=>n.kind==='layer')){const id=nextId('layer');doc.nodes.push({id,kind:'layer',name:'Camada 1'});doc.activeId=id;}else if(removed.has(doc.activeId))doc.activeId=doc.nodes.find(n=>n.kind==='layer')!.id;const commands:Command[]=members.map(id=>({op:state.widgets.has(id)?'WIDGET_REMOVE':state.connectors.has(id)?'CONNECTOR_REMOVE':'STROKE_REMOVE',payload:id}));commands.push({op:'LAYERS_SET',payload:{document:doc}},{op:'SELECTION_SET',payload:[]});bus.exec({op:'BATCH',payload:{label:'Excluir camadas',commands}});selectedBoardLayers.clear();changed();}
  function duplicateBoardLayers(){const doc=snapshotBoardLayers(state),rootIds=[...selectedBoardLayers].filter(id=>!doc.nodes.some(n=>selectedBoardLayers.has(n.id)&&n.id!==id&&layerDescendants(doc,n.id).includes(id))),selected=new Set(rootIds.flatMap(id=>layerDescendants(doc,id))),nodes=doc.nodes.filter(n=>selected.has(n.id));if(!nodes.length)return;const map=new Map(nodes.map(n=>[n.id,nextId(n.kind==='group'?'layer-group':'layer')])),members=orderEntities(state).filter(id=>selected.has(layerEntity(state,id)?.layerId??'')),snapshot=captureSelection(state,members,false),source=[...snapshot.widgets,...snapshot.connectors,...snapshot.strokes];doc.nodes.push(...nodes.map(n=>({...n,id:map.get(n.id)!,name:`${n.name} cópia`.slice(0,140),hidden:false,locked:false,parentId:n.parentId&&map.has(n.parentId)?map.get(n.parentId):n.parentId})));doc.activeId=nodes.find(n=>n.kind==='layer')?map.get(nodes.find(n=>n.kind==='layer')!.id)!:doc.activeId;bus.beginTransaction('Duplicar camadas');try{bus.exec({op:'LAYERS_SET',payload:{document:doc}});if(source.length){const clean={...snapshot,widgets:snapshot.widgets.map(ownLayerFlags),connectors:snapshot.connectors.map(ownLayerFlags),strokes:snapshot.strokes.map(ownLayerFlags)};duplicateSnapshot(state,bus,clean,0,0);const copies=[...state.selection],assignments=source.map((item,i)=>[copies[i]!,map.get(item.layerId!)!] as [string,string]);bus.exec({op:'LAYERS_SET',payload:{document:doc,assignments}});}}finally{bus.endTransaction();}selectedBoardLayers.clear();for(const id of rootIds)selectedBoardLayers.add(map.get(id)!);changed();}
  const releasePointer=()=>{pointerInteraction=false;if(pendingRefresh){pendingRefresh=false;refresh();}};
  controls.addEventListener('pointerdown',()=>{if(pointerRelease)clearTimeout(pointerRelease);pointerInteraction=true;},true);
  document.addEventListener('click',event=>{if(event.detail>0&&(event.target as Element).closest('#layers-list [data-layer-select]')){if(pointerRelease)clearTimeout(pointerRelease);pointerRelease=setTimeout(releasePointer,420);}else releasePointer();});
  window.addEventListener('pointerup',()=>{if(pointerInteraction)pointerRelease=setTimeout(releasePointer,120);},true);
  window.addEventListener('pointercancel',releasePointer,true);
  document.addEventListener('pointerdown',event=>{if((event.target as Element).closest('#app canvas')&&selectedBoardLayers.size){selectedBoardLayers.clear();renderKey='';refresh();}},true);

  function open(){panel.hidden=false;toggleButton.setAttribute('aria-expanded','true');document.body.classList.add('layers-open');renderKey='';refresh();api.onChange?.();}
  function close(){commitRename();panel.hidden=true;toggleButton.setAttribute('aria-expanded','false');document.body.classList.remove('layers-open');api.onChange?.();}
  function toggle(){if(panel.hidden)open();else close();}
  toggleButton.onclick=toggle;
  const changed=()=>{api.onChange?.();renderKey='';refresh();};

  function leaves(id:string){return groupLeaves(state,id);}
  function select(id:string,event:MouseEvent){
    selectedBoardLayers.clear();const membership=layerEntity(state,leaves(id)[0]??id)?.layerId;if(membership)bus.exec({op:'LAYERS_ACTIVE',payload:membership});
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
    if(selectedBoardLayers.size&&typeof destination==='string'){shiftBoard(destination==='front'||destination==='forward'?'forward':'backward');return;}
    const commands=reorderLayerCommands(state,ids,destination);
    if(commands.length)bus.exec({op:'BATCH',payload:{label:'Ordenar camadas',commands}});
    changed();
  }
  function startRename(id:string){
    if(ensureBoardLayers(state).nodes.some(n=>n.id===id)){editingId=id;renderKey='';refresh();queueMicrotask(()=>{const input=list.querySelector<HTMLInputElement>('[data-layer-name]');input?.focus();input?.select();});return;}
    if(state.groups.has(id)||itemLocked(state,id))return;
    editingId=id;renderKey='';refresh();
    queueMicrotask(()=>{const input=list.querySelector<HTMLInputElement>('[data-layer-name]');input?.focus();input?.select();});
  }
  function commitRename(){
    if(!editingId)return;
    const id=editingId,input=list.querySelector<HTMLInputElement>('[data-layer-name]'),name=input?.value.trim().slice(0,140);
    editingId=null;
    const doc=snapshotBoardLayers(state),node=doc.nodes.find(n=>n.id===id);if(name&&node){node.name=name;documentChange(doc,undefined,'Renomear camada');}else if(name&&layerEntity(state,id)?.name!==name)bus.exec(layerUpdateCommand(state,id,{name}));
    renderKey='';refresh();
  }
  function removeSelection(){
    if(selectedBoardLayers.size){deleteBoardLayers();return;}
    const ids=[...state.selection].filter(id=>!itemLocked(state,id));
    if(!ids.length)return;
    bus.exec({op:'BATCH',payload:{label:'Excluir camadas',commands:[...ids.map(id=>({op:state.widgets.has(id)?'WIDGET_REMOVE' as const:state.connectors.has(id)?'CONNECTOR_REMOVE' as const:'STROKE_REMOVE' as const,payload:id})),{op:'SELECTION_SET',payload:[]}]}});changed();
  }

  controls.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLButtonElement>('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-layers-close'))close();
    const boardAction=target.dataset.boardAction;if(boardAction==='add')addLayer();if(boardAction==='group')groupLayers();if(boardAction==='ungroup'){const doc=snapshotBoardLayers(state),removed=doc.nodes.filter(n=>n.kind==='group'&&selectedBoardLayers.has(n.id));for(const group of removed){for(const node of doc.nodes)if(node.parentId===group.id)node.parentId=group.parentId;doc.nodes=doc.nodes.filter(n=>n.id!==group.id);}if(removed.length){selectedBoardLayers.clear();documentChange(doc,undefined,'Desagrupar camadas');}}if(boardAction==='move-content'){const doc=snapshotBoardLayers(state),flags=boardLayerFlags(doc,doc.activeId),ids=[...state.selection].flatMap(id=>groupLeaves(state,id));if(!flags.hidden&&!flags.locked)documentChange(doc,ids.map(id=>[id,doc.activeId]),'Mover objetos para camada');}
    const boardId=target.closest<HTMLElement>('[data-board-layer-id]')?.dataset.boardLayerId;
    if(boardId){const doc=snapshotBoardLayers(state),node=doc.nodes.find(n=>n.id===boardId);if(target.hasAttribute('data-board-layer-select'))chooseBoardLayer(boardId,event);if(target.hasAttribute('data-board-layer-expand')){const expansion=node?.kind==='layer'?expandedLayers:collapsed;if(expansion.has(boardId))expansion.delete(boardId);else expansion.add(boardId);renderKey='';refresh();}if(node&&target.hasAttribute('data-board-layer-visibility')){node.hidden=!node.hidden;documentChange(doc,undefined,'Visibilidade da camada');}if(node&&target.hasAttribute('data-board-layer-lock')){node.locked=!node.locked;documentChange(doc,undefined,'Bloqueio da camada');}}
    const expand=target.dataset.layerExpand;
    if(expand){if(collapsed.has(expand))collapsed.delete(expand);else collapsed.add(expand);renderKey='';refresh();}
    const id=target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId;
    if(id&&target.hasAttribute('data-layer-select')){select(id,event);if(event.detail===2)focusLayer(id);}
    if(id&&target.hasAttribute('data-layer-visibility'))applyTo(id,{hidden:!leaves(id).every(leaf=>layerEntity(state,leaf)?.hidden)},'Visibilidade da camada');
    if(id&&target.hasAttribute('data-layer-lock'))applyTo(id,{locked:!leaves(id).every(leaf=>itemLocked(state,leaf))},'Bloqueio da camada');
    const action=target.dataset.layerAction;
    if(action==='up')reorder('forward');if(action==='down')reorder('backward');
    if(action==='rename'&&(selectedBoardLayers.size===1||state.selection.size===1))startRename(selectedBoardLayers.size?[...selectedBoardLayers][0]!:[...state.selection][0]!);
    if(action==='duplicate'){if(selectedBoardLayers.size)duplicateBoardLayers();else duplicateSnapshot(state,bus,captureSelection(state));changed();}
    if(action==='delete')removeSelection();
  });
  list.addEventListener('dblclick',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-layer-select]');const id=button?.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId;if(id){event.preventDefault();focusLayer(id);}});
  list.addEventListener('dblclick',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-board-layer-select]'),id=button?.closest<HTMLElement>('[data-board-layer-id]')?.dataset.boardLayerId;if(id){event.preventDefault();const members=layerMembers(id),bounds=selectedBounds(state,members);if(bounds)api.camera.fit(bounds,64);changed();}});
  list.addEventListener('focusout',event=>{if((event.target as HTMLElement).hasAttribute('data-layer-name'))commitRename();});
  panel.addEventListener('keydown',event=>{
    if((event.target as HTMLElement).hasAttribute('data-layer-name')){
      if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commitRename();}
      else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();editingId=null;renderKey='';refresh();}
      return;
    }
    if(event.key==='F2'&&(selectedBoardLayers.size===1||state.selection.size===1)){event.preventDefault();event.stopPropagation();startRename(selectedBoardLayers.size?[...selectedBoardLayers][0]!:[...state.selection][0]!);}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();removeSelection();}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();toggleButton.focus();}
    if((event.altKey||event.ctrlKey||event.metaKey)&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();event.stopPropagation();reorder(event.key==='ArrowUp'?'forward':'backward');}
  });
  list.addEventListener('dragstart',event=>{
    const boardRow=(event.target as Element).closest<HTMLElement>('[data-board-layer-id]');if(boardRow&&!((event.target as Element).closest('[data-layer-id]'))){draggedId=boardRow.dataset.boardLayerId!;event.dataTransfer?.setData('application/x-board-layer',draggedId);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';return;}
    const row=(event.target as Element).closest<HTMLElement>('[data-layer-id]');if(!row)return;
    const id=row.dataset.layerId!;if(leaves(id).some(leaf=>itemLocked(state,leaf))){event.preventDefault();return;}
    draggedId=id;row.classList.add('dragging');event.dataTransfer?.setData('application/x-board-layer',id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
  });
  list.addEventListener('dragover',event=>{
    if(!draggedId)return;
    const boardRow=(event.target as Element).closest<HTMLElement>('[data-board-layer-id]');if(boardRow&&ensureBoardLayers(state).nodes.some(n=>n.id===draggedId)){const target=ensureBoardLayers(state).nodes.find(n=>n.id===boardRow.dataset.boardLayerId);if(!target||target.id===draggedId||layerDescendants(ensureBoardLayers(state),draggedId).includes(target.id))return;event.preventDefault();for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;const local=(event.clientY-boardRow.getBoundingClientRect().top)/boardRow.offsetHeight;boardRow.dataset.drop=target.kind==='group'&&local>.25&&local<.75?'inside':local<.5?'before':'after';return;}
    if(boardRow){const doc=ensureBoardLayers(state),target=doc.nodes.find(n=>n.id===boardRow.dataset.boardLayerId),flags=target?boardLayerFlags(doc,target.id):undefined;if(target?.kind==='layer'&&!flags?.hidden&&!flags?.locked){event.preventDefault();for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;boardRow.dataset.drop='inside';}return;}
    const row=(event.target as Element).closest<HTMLElement>('[data-layer-id]');if(!row||row.dataset.layerId===draggedId||leaves(draggedId).includes(row.dataset.layerId!))return;
    event.preventDefault();for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;
    row.dataset.drop=event.clientY<row.getBoundingClientRect().top+row.offsetHeight/2?'before':'after';if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  });
  list.addEventListener('drop',event=>{
    const boardRow=(event.target as Element).closest<HTMLElement>('[data-board-layer-id]');if(boardRow&&draggedId&&ensureBoardLayers(state).nodes.some(n=>n.id===draggedId)&&boardRow.dataset.drop){event.preventDefault();const id=draggedId;draggedId=null;reorderBoard(id,boardRow.dataset.boardLayerId!,boardRow.dataset.drop==='inside'?'inside':boardRow.dataset.drop==='before'?'after':'before');for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;return;}
    if(boardRow&&draggedId&&boardRow.dataset.drop==='inside'){event.preventDefault();const doc=snapshotBoardLayers(state),target=doc.nodes.find(n=>n.id===boardRow.dataset.boardLayerId),members=leaves(draggedId);draggedId=null;if(target?.kind==='layer'&&!boardLayerFlags(doc,target.id).hidden&&!boardLayerFlags(doc,target.id).locked&&!members.some(id=>itemLocked(state,id))){doc.activeId=target.id;selectedBoardLayers.clear();documentChange(doc,members.map(id=>[id,target.id]),'Mover objetos para camada');bus.exec({op:'SELECTION_SET',payload:members});}for(const item of list.querySelectorAll<HTMLElement>('[data-drop]'))delete item.dataset.drop;return;}
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
    const title=editingId===node.id?`<input class="layer-name-input" data-layer-name="${escape(node.id)}" aria-label="Nome do objeto" value="${escape(layerEntity(state,node.id)?.name??label)}" maxlength="140">`:`<span class="layer-name-wrap"><span class="layer-title" title="${escape(label)}">${escape(label)}</span><span class="layer-kind">${kind(node.id)}</span></span>`;
    return `<div role="listitem" class="layer-row${selected?' selected':partial?' partly-selected':''}${hidden?' layer-hidden':''}" data-layer-id="${escape(node.id)}" style="--layer-depth:${depth}" draggable="${!members.some(id=>itemLocked(state,id))}">${isGroup?`<button class="layer-expander" data-layer-expand="${escape(node.id)}" aria-label="${expanded?'Recolher':'Expandir'} grupo" aria-expanded="${expanded}">${icon(expanded?'chevron-down':'chevron-right',15)}</button>`:'<span class="layer-spacer"></span>'}${editingId===node.id?`<span class="layer-thumb">${thumbnail(node.id)}</span>${title}`:`<button class="layer-select" data-layer-select aria-label="Selecionar objeto ${escape(label)}" aria-pressed="${selected}"><span class="layer-thumb">${thumbnail(node.id)}</span>${title}</button>`}<button class="layer-visibility" data-layer-visibility aria-label="${hidden?'Mostrar':'Ocultar'} ${escape(label)}" title="${hidden?'Mostrar':'Ocultar'}">${icon(hidden?'eye-off':'eye',16)}</button><button class="layer-lock" data-layer-lock aria-label="${locked?'Desbloquear':'Bloquear'} ${escape(label)}" title="${locked?'Desbloquear':'Bloquear'}">${icon(locked?'lock':'unlock',15)}</button></div>${isGroup&&expanded?node.children!.map(child=>row(child,depth+1)).join(''):''}`;
  }
  function boardRows(parentId?:string,depth=0):string{
    const doc=ensureBoardLayers(state),tree=layerTree(state),prune=(node:LayerNode,layerId:string):LayerNode|null=>{if(node.children){const children=node.children.map(n=>prune(n,layerId)).filter((n):n is LayerNode=>!!n);return children.length?{...node,children}:null;}return layerEntity(state,node.id)?.layerId===layerId?node:null;};
    return doc.nodes.filter(n=>n.parentId===parentId).slice().reverse().map(node=>{const flags=boardLayerFlags(doc,node.id),active=doc.activeId===node.id,chosen=selectedBoardLayers.has(node.id),expanded=node.kind==='group'?!collapsed.has(node.id):expandedLayers.has(node.id),members=layerMembers(node.id),isGroup=node.kind==='group',label=escape(node.name),title=editingId===node.id?`<input class="layer-name-input" data-layer-name="${escape(node.id)}" aria-label="Nome da camada" value="${label}" maxlength="140">`:`<span class="layer-name-wrap"><span class="layer-title">${label}</span><span class="layer-kind">${isGroup?'Grupo de camadas':members.length?`${members.length} ${members.length===1?'objeto':'objetos'}${active?' · Ativa':''}`:`Transparente${active?' · Ativa':''}`}</span></span>`;
      const header=`<div role="listitem" class="layer-row board-layer-row${active?' active':''}${chosen?' layer-chosen':''}${flags.hidden?' layer-hidden':''}" data-board-layer-id="${escape(node.id)}" style="--layer-depth:${depth}" draggable="true"><button class="layer-expander" data-board-layer-expand aria-label="${expanded?'Recolher':'Expandir'} ${isGroup?'grupo de camadas':`objetos da camada ${label}`}" aria-expanded="${expanded}">${icon(expanded?'chevron-down':'chevron-right',15)}</button>${editingId===node.id?title:`<button class="layer-select" data-board-layer-select aria-label="Ativar ${label}" aria-pressed="${active}"><span class="layer-thumb">${isGroup?icon('group',17):''}</span>${title}</button>`}<button class="layer-visibility" data-board-layer-visibility aria-label="${node.hidden?'Mostrar':'Ocultar'} camada ${label}" title="${node.hidden?'Mostrar':'Ocultar'} camada">${icon(flags.hidden?'eye-off':'eye',16)}</button><button class="layer-lock" data-board-layer-lock aria-label="${node.locked?'Desbloquear':'Bloquear'} camada ${label}" title="${node.locked?'Desbloquear':'Bloquear'} camada">${icon(flags.locked?'lock':'unlock',15)}</button></div>`;
      const children=!expanded?'':isGroup?boardRows(node.id,depth+1):tree.map(n=>prune(n,node.id)).filter((n):n is LayerNode=>!!n).map(n=>row(n,depth+1)).join('')||'<div class="layer-empty">Camada vazia e transparente</div>';return header+children;
    }).join('');
  }
  function refresh(){
    const boardKey=api.getBoardKey?.();if(boardKey!==lastBoardKey){lastBoardKey=boardKey;expandedLayers.clear();collapsed.clear();selectedBoardLayers.clear();imageVersions.clear();editingId=null;anchorId=null;draggedId=null;renderKey='';if(pointerRelease)clearTimeout(pointerRelease);pointerInteraction=false;pendingRefresh=false;}
    const layerDocument=ensureBoardLayers(state);for(const id of selectedBoardLayers)if(!layerDocument.nodes.some(n=>n.id===id))selectedBoardLayers.delete(id);
    controls.querySelector('.layers-total')!.textContent=String(layerDocument.nodes.filter(n=>n.kind==='layer').length);
    if(panel.hidden)return;
    const ids=orderEntities(state);
    if(pointerInteraction){pendingRefresh=true;return;}
    if(editingId&&list.contains(document.activeElement)&&document.activeElement?.matches('input'))return;
    const signature=ids.map(id=>{const item=layerEntity(state,id)!;let version=0;if(item.type==='image'){const previous=imageVersions.get(id);version=previous?.src===item.src?previous.version:(previous?.version??0)+1;imageVersions.set(id,{src:item.src,version});}return [id,item.type,item.z,item.layerId,item.name,item.hidden,item.locked,layerLabel(state,id),version];});
    const nextKey=JSON.stringify([signature,[...state.groups],[...state.selection],[...collapsed],[...expandedLayers],editingId,layerDocument,[...selectedBoardLayers]]);if(nextKey===renderKey)return;renderKey=nextKey;
    const scroll=list.scrollTop;visibleIds=[];list.innerHTML=boardRows();list.scrollTop=scroll;
    const locked=[...state.selection].some(id=>itemLocked(state,id)),has=state.selection.size>0;
    for(const button of controls.querySelectorAll<HTMLButtonElement>('[data-layer-action]'))button.disabled=selectedBoardLayers.size?button.dataset.layerAction==='rename'&&selectedBoardLayers.size!==1:!has||button.dataset.layerAction!=='duplicate'&&locked||button.dataset.layerAction==='rename'&&state.selection.size!==1;
    const layerContext=selectedBoardLayers.size>0||!has,noun=layerContext?(selectedBoardLayers.size>1?'camadas':'camada'):(state.selection.size>1?'objetos':'objeto'),labels:Record<string,string>={up:`Mover ${noun} acima`,down:`Mover ${noun} abaixo`,rename:`Renomear ${noun}`,duplicate:`Duplicar ${noun}`,delete:`Excluir ${noun}`};
    for(const button of controls.querySelectorAll<HTMLButtonElement>('[data-layer-action]')){const label=labels[button.dataset.layerAction!]!;button.setAttribute('aria-label',label);button.title=label;}
    controls.querySelector<HTMLButtonElement>('[data-board-action="move-content"]')!.disabled=!has||locked||boardLayerFlags(layerDocument,layerDocument.activeId).hidden||boardLayerFlags(layerDocument,layerDocument.activeId).locked;
    controls.querySelector<HTMLButtonElement>('[data-board-action="ungroup"]')!.disabled=!layerDocument.nodes.some(n=>n.kind==='group'&&selectedBoardLayers.has(n.id));
    controls.querySelector('#layers-status')!.textContent=`${layerDocument.nodes.find(n=>n.id===layerDocument.activeId)?.name??'Camada'} recebe os novos objetos · Ctrl seleciona camadas · arraste para ordenar`;
  }
  refresh();
  return {refresh,toggle,open,close};
}
