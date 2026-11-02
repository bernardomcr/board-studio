import type {BoardState,CommandBus} from './core/commands';
import type {Camera} from './core/camera';
import type {Widget,ShapeWidget} from './core/model';
import {widgetAABB,type Vec} from './core/geometry';
import {createMindMap,addMindChild,addMindSibling,toggleMindBranch,reparentMindNode,layoutMindMap,markMindManualPosition,setMindLayout,setMindColor,setMindLineShape,setMindDetails,setMindTheme,showMindLevels,selectMindSubtopics,MIND_THEMES,mindLayoutCommands,deleteMindSubtree,mindChildren,mindSubtree,mindRoot,mindNodeHidden,navigateMindNode,type MindLayout,type MindSide} from './core/mindmap';
import type {Connector} from './core/connectors';
import {itemLocked} from './core/groups';
import {ensureBoardLayers,boardLayerFlags} from './core/board-layers';
import {shapeIconSvg} from './core/shapes';
import {installHoldAction} from './hold-action';
import {boardFontOptions,loadBoardFont} from './fonts';
import {relativeBorderScale} from './core/style-scale';
import {sizeRangeMaximum,multipliedSize,formatSize} from './size-controls';
import {icon} from './icons';
import {compactContextPanel,positionContextPanel,workspaceLeft,workspaceTop} from './context-position';
import {installFontPickers} from './font-picker';
import {uiPalette} from './ui-palette';
import {brandColorRevision} from './brand-colors';
import {installMindAttachments} from './mind-attachments';

interface MindmapUIAPI{
  state:BoardState;bus:CommandBus;camera:Camera;
  setTool(tool:'select'):void;getTool?():string;
  onEdit(id:string):void;onChange?():void;onLink?():void;onImage?(parentId:string):void;
  onFinishEdit?():void;
  onTransition?(before:{widgets:Map<string,Widget>;connectors:Map<string,Connector>},duration:number):void;
  getBoardKey?():string|null;
}
const COLORS=[['#4262ff','Azul'],['#e25767','Vermelho'],['#f39b42','Laranja'],['#55a676','Verde'],['#2ba4ad','Turquesa'],['#9a65c8','Roxo'],['#da73aa','Rosa'],['#62748b','Cinza']] as const;
const escape=(value:unknown)=>String(value??'').replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]!));
const actionButton=(action:string,label:string,symbol:string,shortcut='')=>`<button type="button" data-mind-action="${action}" aria-label="${label}" title="${label}${shortcut?' ('+shortcut+')':''}">${icon(symbol,21)}</button>`;
const TOPIC_SHAPES=[['round_rectangle','Arredondado'],['rectangle','Retângulo'],['circle','Elipse'],['rhombus','Losango']] as const;
interface MindDrop {targetId:string;parentId:string;kind:'child'|'before'|'after'|'left'|'right';side:MindSide;order?:number}

/** Mind-map commands stay in the shared model/history; this module owns only UI. */
export function installMindmapUI(api:MindmapUIAPI){
  const {state,bus,camera}=api,style=document.createElement('style');
  style.textContent=`
  body.mind-node-selected #selection-properties,body.mind-node-selected #alignbar{display:none!important}
  #mindmap-properties{position:fixed;z-index:43;display:flex;align-items:center;gap:2px;padding:5px;min-height:46px;box-sizing:border-box;width:max-content;max-width:calc(100vw - 24px);background:#fff;color:#292823;border:1px solid #e6e7eb;border-radius:8px;box-shadow:0 4px 18px #19181226;font:12px Inter,'Segoe UI',sans-serif}
  #mindmap-properties[hidden],#mindmap-node-controls[hidden],#mindmap-drop-target[hidden]{display:none!important}
  body.home-visible #mindmap-properties,body.home-visible #mindmap-node-controls,body.home-visible #mindmap-drop-target{display:none!important}
  #mindmap-properties>button,#mindmap-properties summary{display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:7px;border:0;border-radius:5px;box-sizing:border-box;background:transparent;color:inherit;cursor:pointer;flex:none;list-style:none}
  #mindmap-properties summary::-webkit-details-marker{display:none}
  #mindmap-properties>button:hover,#mindmap-properties summary:hover,#mindmap-properties details[open]>summary{background:#f1f3fb;color:#3859ff}
  #mindmap-properties button:focus-visible,#mindmap-properties summary:focus-visible,#mindmap-node-controls button:focus-visible{outline:2px solid #4262ff;outline-offset:2px}
  #mindmap-properties .mind-separator{height:24px;width:1px;background:#e9e9e6;margin:0 4px;flex:none}
  #mindmap-properties details{flex:none}
  #mindmap-properties .property-popover{position:fixed;min-width:208px;box-sizing:border-box;padding:12px;background:#fff;color:#292823;border:1px solid #e6e7eb;border-radius:9px;box-shadow:0 5px 24px #19181226;z-index:44}
  #mindmap-properties .mind-colors{display:grid;grid-template-columns:repeat(4,30px);gap:9px;justify-content:center;padding:2px 0 12px}
  #mindmap-properties .mind-colors button{width:28px;height:28px;border:2px solid white;border-radius:50%;padding:0;box-shadow:0 0 0 1px #dce0e6;color:white;cursor:pointer;display:grid;place-items:center}
  #mindmap-properties .mind-colors button[aria-pressed=true]{box-shadow:0 0 0 2px #4262ff}
  #mindmap-properties .mind-custom-color{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #eceef2;padding-top:10px}
  #mindmap-properties input[type=color]{width:34px;height:28px;padding:0;border:0;background:transparent;cursor:pointer}
  #mindmap-properties .mind-layout-choice{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:5px;background:transparent;color:inherit;padding:9px;font:inherit;cursor:pointer;text-align:left}
  #mindmap-properties .mind-layout-choice:hover{background:#f1f3fb}
  #mindmap-properties .mind-layout-choice[aria-pressed=true]{background:#eef2ff;color:#3859ff}
  #mindmap-properties .mind-layout-choice .mind-layout-check{margin-left:auto;visibility:hidden}
  #mindmap-properties .mind-layout-choice[aria-pressed=true] .mind-layout-check{visibility:visible}
  #mindmap-properties .mind-form{display:flex;flex-direction:column;gap:12px;width:238px}#mindmap-properties .mind-form label{display:flex;flex-direction:column;gap:6px;color:#606978;font-size:11px}#mindmap-properties .mind-form input,#mindmap-properties .mind-form textarea,#mindmap-properties .mind-form select{font:12px Inter,Segoe UI,sans-serif;color:#292823;border:1px solid #d9dfe8;border-radius:5px;box-sizing:border-box;padding:7px;background:#fff;width:100%;min-width:0}#mindmap-properties .mind-form input[type=color]{height:30px;padding:2px;cursor:pointer}#mindmap-properties .mind-form input[type=range]{height:22px;border:0;padding:0;accent-color:#4262ff;cursor:ew-resize}#mindmap-properties .mind-form textarea{height:110px;resize:vertical;line-height:1.5}#mindmap-properties .mind-form .mind-form-row{display:flex;align-items:flex-end;gap:8px}#mindmap-properties .mind-form-row label{flex:1}#mindmap-properties .mind-form-row button,#mindmap-properties .mind-icon-presets button,#mindmap-properties .mind-transparent{display:flex;align-items:center;justify-content:center;border:1px solid #dce0e8;background:white;color:inherit;border-radius:5px;cursor:pointer;height:32px;min-width:32px;font:inherit;padding:6px}#mindmap-properties .mind-form button[aria-pressed=true]{background:#edf1ff;color:#4262ff;border-color:#aabaff}#mindmap-properties .mind-icon-presets{display:flex;gap:5px;flex-wrap:wrap}#mindmap-properties .mind-icon-presets button{font-size:17px}#mindmap-properties .mind-form small{font-size:10px;color:#858c99;line-height:1.5}#mindmap-properties .mind-theme-preview{display:flex;gap:3px;margin-left:auto}#mindmap-properties .mind-theme-preview i{width:9px;height:14px;border-radius:3px}
  #mindmap-node-controls{position:fixed;inset:0;display:block;z-index:41;transform:none;pointer-events:none}
  #mindmap-node-controls button{position:fixed;width:24px;height:24px;min-width:24px;display:grid;place-items:center;padding:3px;border:1px solid var(--studio-line,#dce0e8);border-radius:50%;background:var(--studio-surface,#fff);color:var(--studio-accent,#8050ba);box-shadow:0 3px 9px #15171b18;font:11px Inter,'Segoe UI',sans-serif;cursor:pointer;pointer-events:auto;animation:mind-control-appear 250ms cubic-bezier(.2,.8,.2,1) both}
  #mindmap-node-controls button[data-mind-add],#mindmap-node-controls button[data-mind-sibling]{background:var(--studio-accent,#8050ba);border-color:var(--studio-accent,#8050ba);color:var(--studio-surface,#fff)}
  #mindmap-node-controls button[data-mind-fold]{border:0;background:transparent;box-shadow:none;padding:0}
  #mindmap-node-controls button[data-mind-fold]::before{content:'';width:20px;height:20px;border:2px solid var(--mind-branch-color,var(--studio-accent));border-radius:50%;background:var(--studio-surface,#fff);box-sizing:border-box;transition:background-color 120ms}
  #mindmap-node-controls button[data-mind-fold]::after{content:'';position:absolute;width:4px;height:4px;border-radius:50%;background:var(--mind-branch-color,var(--studio-accent))}
  #mindmap-node-controls button:hover{filter:brightness(1.06)}
  @keyframes mind-control-appear{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
  @media(prefers-reduced-motion:reduce){#mindmap-node-controls button{animation:none}#mindmap-node-controls button[data-mind-fold]::before{transition:none}}
  #mindmap-drop-target{position:fixed;pointer-events:none;border:2px dashed #4262ff;border-radius:12px;box-shadow:0 0 0 5px #4262ff1f;box-sizing:border-box;z-index:39}
  #mindmap-drop-target span{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);white-space:nowrap;background:#4262ff;color:white;border-radius:5px;padding:6px 8px;font:11px Inter,'Segoe UI',sans-serif}
  #mindmap-properties .mind-menu-title{font-size:11px;font-weight:500;color:var(--studio-muted,#687385);margin:0}
  #mindmap-properties [data-menu=mind-attachments]>summary{gap:3px;width:auto;min-width:36px}
  #mindmap-properties .mind-attachment-count{font-size:10px;color:var(--studio-muted);font-variant-numeric:tabular-nums}
  #mindmap-properties [data-menu=mind-attachments]>.property-popover{width:292px}
  #mindmap-properties .mind-attachment-list{display:flex;flex-direction:column;gap:5px;width:100%;min-width:0;max-height:280px;overflow:auto}
  #mindmap-properties .mind-attachment-row{display:flex;align-items:center;gap:5px;padding:7px 0;border-bottom:1px solid var(--studio-line,#e6e7eb)}
  #mindmap-properties .mind-attachment-name{flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #mindmap-properties .mind-attachment-name small{display:block;margin-top:3px;color:var(--studio-muted,#746b80);font-size:10px}
  #mindmap-properties .mind-attachment-row button{display:grid;place-items:center;flex:none;width:30px;height:30px;padding:5px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
  #mindmap-properties .mind-attachment-row button:hover{background:var(--studio-soft,#eee9f6);color:var(--studio-accent,#8050ba)}
  #mindmap-properties .mind-menu-section{display:flex;flex-direction:column;gap:6px}
  #mindmap-properties .mind-icon-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
  #mindmap-properties .mind-icon-grid button{display:flex;align-items:center;justify-content:center;min-width:0;height:42px;padding:8px;border:1px solid transparent;border-radius:7px;background:transparent;color:inherit;cursor:pointer}
  #mindmap-properties .mind-icon-grid button[aria-pressed=true]{border-color:var(--studio-accent,#4262ff);background:var(--studio-tint,#eef1ff);color:var(--studio-accent,#4262ff)}
  #mindmap-properties .mind-icon-grid button:hover{background:var(--studio-soft,#f1f3fb)}
  #mindmap-properties .mind-topic-preview{display:grid;place-items:center;min-height:72px;padding:8px;background:var(--studio-raised,#f7f8fc);border-radius:8px;overflow:hidden}
  #mindmap-properties .mind-topic-preview>span{display:flex;max-width:180px;min-width:96px;min-height:45px;box-sizing:border-box;padding:9px 12px;overflow:hidden;font-size:16px;line-height:1.25;white-space:normal;overflow-wrap:anywhere}
  #mindmap-properties .mind-menu-action{display:flex;align-items:center;gap:9px;width:100%;min-height:34px;padding:7px;border:0;border-radius:6px;color:inherit;background:transparent;font:inherit;text-align:left;cursor:pointer}
  #mindmap-properties .mind-menu-action kbd{margin-left:auto;color:var(--studio-muted,#8790a0);font:10px Inter,'Segoe UI',sans-serif;white-space:nowrap}
  #mindmap-properties .mind-menu-action:hover{background:var(--studio-soft,#f1f3fb);color:var(--studio-accent,#4262ff)}
  #mindmap-properties .mind-submenu>summary{display:flex;align-items:center;justify-content:flex-start;gap:9px;width:100%;height:36px;padding:7px;font-size:12px}
  #mindmap-properties .mind-submenu>summary>svg:last-child{margin-left:auto;width:15px;height:15px}
  #mindmap-properties .mind-levels{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
  #mindmap-properties .mind-levels button{height:32px;min-width:32px;border:1px solid var(--studio-line,#e3e7ee);border-radius:6px;background:var(--studio-raised,#f7f8fc);color:inherit;font:inherit;cursor:pointer}
  #mindmap-properties .mind-lock-control{width:auto!important;gap:8px!important;padding:9px 12px!important;font:12px Inter,'Segoe UI',sans-serif;white-space:nowrap}
  #mindmap-properties button:disabled{opacity:.4;cursor:default}
  #mindmap-properties .mind-layout-choice{color:var(--studio-ink,#292823)}
  #mindmap-properties .mind-layout-choice:hover{background:var(--studio-soft,#f1f3fb)}
  #mindmap-properties .mind-layout-choice[aria-pressed=true]{background:var(--studio-tint,#eef2ff);color:var(--studio-accent,#8050ba)}
  #mindmap-properties .mind-custom-color{border-color:var(--studio-line,#eceef2)}
  #mindmap-properties .mind-colors button[aria-pressed=true]{box-shadow:0 0 0 2px var(--studio-accent,#8050ba)}
  #mindmap-drop-target{border-color:var(--studio-accent,#4262ff);box-shadow:0 0 0 4px color-mix(in srgb,var(--studio-accent,#4262ff) 14%,transparent)}
  #mindmap-drop-target[data-kind=before],#mindmap-drop-target[data-kind=after]{height:3px!important;border:0;border-radius:2px;background:var(--studio-accent,#4262ff);box-shadow:none}
  #mindmap-drop-target[data-kind=before]::before,#mindmap-drop-target[data-kind=after]::before{content:'';position:absolute;left:-3px;top:-2px;width:7px;height:7px;border-radius:50%;background:var(--studio-accent,#4262ff)}
  #mindmap-drop-target span{background:var(--studio-accent,#4262ff);color:var(--studio-surface,#fff)}
  @media(max-width:520px){#mindmap-properties{gap:0;padding:4px}#mindmap-properties>button,#mindmap-properties summary{width:31px;height:34px;padding:6px}#mindmap-properties .mind-separator{margin:0 2px}}
  `;document.head.append(style);
  const panel=document.createElement('section');panel.id='mindmap-properties';panel.hidden=true;panel.setAttribute('aria-label','Opções do mapa mental');
  const controls=document.createElement('div');controls.id='mindmap-node-controls';controls.hidden=true;controls.setAttribute('role','group');controls.setAttribute('aria-label','Ramos do tópico');
  const dropHint=document.createElement('div');dropHint.id='mindmap-drop-target';dropHint.hidden=true;dropHint.innerHTML='<span>Solte para mover este ramo</span>';
  document.body.append(panel,controls,dropHint);
  const toolbarButton=document.createElement('button');toolbarButton.type='button';toolbarButton.dataset.tool='mindmap';toolbarButton.dataset.label='Mapa mental';toolbarButton.setAttribute('aria-label','Mapa mental');toolbarButton.title='Mapa mental';toolbarButton.innerHTML=icon('mindmap',22);
  const toolbar=document.getElementById('toolbar')!;toolbar.querySelector('[data-tool="shape"]')?.after(toolbarButton);if(!toolbarButton.parentElement)toolbar.append(toolbarButton);
  let renderKey='',selectedId='',drop:MindDrop|null=null,inputEngaged=false,pointerInteraction=false,refreshDeferred=false,forceHistoryRefresh=false,mindPalette:'color'|'fillColor'|'borderColor'|null=null;
  let dragOrigin:{id:string;widgets:Map<string,Widget>}|undefined;
  // Editing is a board-local UI session. Saved maps reopen ready to use.
  let editingRootId:string|null=null,editingBoardKey:string|null|undefined;
  const transitionStart=()=>api.onTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches?{widgets:new Map([...state.widgets].filter(([,node])=>!!node.mind)),connectors:new Map([...state.connectors].filter(([,line])=>!!line.mindBranch))}:undefined;
  const transitionEnd=(before:ReturnType<typeof transitionStart>)=>{if(before)api.onTransition?.(before,250);};
  panel.addEventListener('pointerdown',()=>{pointerInteraction=true;},true);
  const release=()=>{pointerInteraction=false;if(refreshDeferred){refreshDeferred=false;refresh();}};document.addEventListener('click',release);window.addEventListener('pointerup',()=>setTimeout(release,120),true);window.addEventListener('pointercancel',release,true);
  panel.addEventListener('focusin',event=>{if((event.target as HTMLElement).matches('input,textarea,select'))inputEngaged=true;});panel.addEventListener('focusout',()=>queueMicrotask(()=>{inputEngaged=panel.contains(document.activeElement)&&!!document.activeElement?.matches('input,textarea,select');if(!inputEngaged)refresh();}));
  const selected=()=>{const node=state.selection.size===1?state.widgets.get([...state.selection][0]!):undefined;return node?.mind&&!node.hidden&&!mindNodeHidden(state,node.id)?node:undefined;};
  const active=()=>!document.body.classList.contains('home-visible')&&(!api.getTool||api.getTool()==='select');
  document.addEventListener('pointerdown',event=>{if(event.button!==0||!(event.target instanceof HTMLCanvasElement)||!active()){dragOrigin=undefined;return;}const node=selected();dragOrigin=node&&!node.locked?{id:node.id,widgets:new Map([...state.widgets].filter(([,widget])=>!!widget.mind))}:undefined;});
  const locked=(node:Widget)=>itemLocked(state,node.id);
  function isEditing(id:string){return editingRootId!==null&&editingBoardKey===api.getBoardKey?.()&&mindRoot(state,id)?.id===editingRootId;}
  function openEditor(id:string){
    const node=state.widgets.get(id),root=node?.mind?mindRoot(state,id):undefined;
    if(!node||!root||node.hidden||mindNodeHidden(state,id)||locked(node))return false;
    editingRootId=root.id;editingBoardKey=api.getBoardKey?.();renderKey='';
    api.setTool('select');bus.exec({op:'SELECTION_SET',payload:[id]});refresh();api.onChange?.();return true;
  }
  function finishEditing(){
    api.onFinishEdit?.();editingRootId=null;closeMenus();clearDrop();renderKey='';refresh();api.onChange?.();
  }
  const attachments=installMindAttachments({state,bus,getBoardKey:api.getBoardKey,onChange:()=>{renderKey='';refresh();api.onChange?.();}});
  const canUnlock=(node:Widget)=>locked(node)&&!boardLayerFlags(ensureBoardLayers(state),node.layerId??ensureBoardLayers(state).activeId).locked;
  installHoldAction(panel,()=>{const node=selected();if(!node||!canUnlock(node))return;bus.exec({op:'ENTITY_LOCK',payload:{ids:[node.id],locked:false}});renderKey='';refresh();api.onChange?.();});
  function focusNode(id:string,edit=false){
    api.setTool('select');bus.exec({op:'SELECTION_SET',payload:[id]});
    const node=state.widgets.get(id);if(node){const bounds=widgetAABB(node),a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});
      const dx=b.x-a.x>camera.width-200?camera.width/2-(a.x+b.x)/2:a.x<100?100-a.x:b.x>camera.width-100?camera.width-100-b.x:0;
      const dy=b.y-a.y>camera.height-200?camera.height/2-(a.y+b.y)/2:a.y<120?120-a.y:b.y>camera.height-80?camera.height-80-b.y:0;
      if(dx||dy)camera.panByScreen(dx,dy);
    }
    if(edit&&node&&!locked(node)){openEditor(id);api.onEdit(id);}refresh();api.onChange?.();
  }
  function create(){const background=state.background?.color??'#fbfaf7',rgb=/^#[a-f\d]{6}$/i.test(background)?parseInt(background.slice(1),16):0xffffff,dark=.2126*(rgb>>16)+.7152*(rgb>>8&255)+.0722*(rgb&255)<135,id=createMindMap(state,bus,{x:camera.x,y:camera.y},'Ideia central',1/camera.scale,{dark});if(state.widgets.has(id))focusNode(id,true);return id;}
  function add(id:string,kind:'child'|'sibling',before=false){
    const motion=transitionStart();
    const result=kind==='child'?addMindChild(state,bus,id):addMindSibling(state,bus,id,'Novo tópico',before);
    if(result){focusNode(result,true);transitionEnd(motion);}return result;
  }
  function collapseAll(id:string){const node=state.widgets.get(id);if(!node||locked(node))return;bus.beginTransaction('Recolher todos os níveis');try{showMindLevels(state,bus,id,1);if(!state.widgets.get(id)?.mind?.collapsed)toggleMindBranch(state,bus,id);}finally{bus.endTransaction();}}
  function perform(action:string){const node=selected();if(!node||locked(node))return;
    if(action==='done'){finishEditing();return;}
    if(action==='child'||action==='sibling'){add(node.id,action);return;}
    if(action==='edit'){api.onEdit(node.id);return;}
    if(action==='link'){api.onLink?.();return;}
    if(action==='image'){api.onImage?.(node.id);return;}
    const motion=action==='select-subtopics'?undefined:transitionStart();
    if(action==='collapse')toggleMindBranch(state,bus,node.id);
    if(action==='select-subtopics')selectMindSubtopics(state,bus,node.id);
    if(action==='expand-branch')showMindLevels(state,bus,node.id,0);
    if(action==='collapse-branch')collapseAll(node.id);
    if(action==='expand-map')showMindLevels(state,bus,mindRoot(state,node.id)?.id??node.id,0);
    if(action==='collapse-map')collapseAll(mindRoot(state,node.id)?.id??node.id);
    if(action==='reflow')layoutMindMap(state,bus,mindRoot(state,node.id)?.id??node.id);
    if(action==='delete')deleteMindSubtree(state,bus,node.id);
    renderKey='';refresh();api.onChange?.();transitionEnd(motion);
  }
  async function formatTopic(patch:Partial<Widget['style']>){const node=selected();if(!node||locked(node))return;const id=node.id;if(patch.fontFamily)await loadBoardFont(patch.fontFamily);const current=selected();if(!current||current!==node||locked(current))return;
    bus.beginTransaction('Formatar tópico');bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{style:{...current.style,...patch}}}});const commands=mindLayoutCommands(state,id);if(commands.length)bus.exec({op:'BATCH',payload:{commands}});bus.endTransaction();renderKey='';refresh();api.onChange?.();
  }
  function setTopicShape(shape:ShapeWidget['shape']){const node=selected();if(node?.type!=='shape'||locked(node))return;bus.beginTransaction('Mudar forma do tópico');bus.exec({op:'WIDGET_UPDATE',payload:{id:node.id,patch:{shape}}});const commands=mindLayoutCommands(state,node.id);if(commands.length)bus.exec({op:'BATCH',payload:{commands}});bus.endTransaction();renderKey='';refresh();api.onChange?.();}
  function formatMenu(node:Widget){
    const style=node.style,ratio=relativeBorderScale(node),fonts=[...boardFontOptions()];if(!fonts.some(font=>font.family===style.fontFamily))fonts.push({family:style.fontFamily,label:style.fontFamily,category:'display',slug:style.fontFamily});
    const toggle=(field:string,value:string,label:string,symbol:string)=>`<button type="button" data-mind-toggle="${field}" data-mind-toggle-value="${value}" aria-label="${label}" title="${label}" aria-pressed="${style[field as keyof typeof style]===value}">${icon(symbol,20)}</button>`;
    const palettes=[['color','Cor do texto do tópico','text-color'],['fillColor','Cor do fundo do tópico','fill'],['borderColor','Cor da borda do tópico','stroke']] as const;
    let body='';
    if(mindPalette){const [,label]=palettes.find(([field])=>field===mindPalette)!;const opacityField=mindPalette==='fillColor'?'fillOpacity':mindPalette==='borderColor'?'borderOpacity':null,value=opacityField?style[opacityField]??1:1;
      body=`<button class="mind-palette-back" type="button" data-mind-palette="close" aria-label="Voltar à tipografia do tópico" title="Voltar à tipografia">${icon('arrow-left',18)}</button>${opacityField?`<label class="mind-opacity">Opacidade<input type="range" min="0" max="1" step="0.01" data-mind-format="${opacityField}" aria-label="Opacidade ${mindPalette==='fillColor'?'do fundo':'da borda'} do tópico" value="${value}"></label>`:''}${uiPalette('mind-format',mindPalette,label,style[mindPalette])}${mindPalette==='fillColor'?`<button class="mind-transparent" type="button" data-mind-transparent aria-label="Fundo transparente do tópico" title="Fundo transparente">${icon('opacity',18)}</button>`:''}`;
    }else body=`<div class="mind-form mind-format-form"><select data-mind-format="fontFamily" aria-label="Fonte do tópico">${fonts.map(font=>`<option value="${escape(font.family)}" ${font.family===style.fontFamily?'selected':''}>${escape(font.label)}</option>`).join('')}</select><input class="mind-fontsize" type="number" min="1" data-mind-format="fontSize" aria-label="Tamanho do texto do tópico" title="Tamanho do texto" value="${formatSize(style.fontSize)}"><div class="mind-style-choices">${toggle('fontWeight','bold','Negrito no tópico','bold')}${toggle('fontStyle','italic','Itálico no tópico','italic')}${toggle('textDecoration','underline','Sublinhado no tópico','underline')}${toggle('textDecoration','line-through','Riscado no tópico','strike')}</div><div class="mind-style-choices">${palettes.map(([field,label,symbol])=>`<button type="button" data-mind-palette="${field}" aria-label="Paleta: ${label.toLowerCase()}" title="${label}">${icon(symbol,20)}<i style="background:${style[field]==='transparent'?'#fff':escape(style[field])}"></i></button>`).join('')}</div><hr><label class="mind-border-range">${icon('stroke',18)}<input type="range" min="0" max="${sizeRangeMaximum(ratio*100,50)}" step="0.05" data-mind-format="borderScale" aria-label="Espessura da borda do tópico" value="${formatSize(ratio*100)}"></label><div class="mind-style-choices"><button type="button" data-mind-border-factor="0.5" aria-label="Diminuir borda do tópico" title="Diminuir borda">${icon('minus',18)}</button><button type="button" data-mind-border-factor="2" aria-label="Aumentar borda do tópico" title="Aumentar borda">${icon('plus',18)}</button></div></div>`;
    if(!mindPalette){
      const alignment=(field:'textAlign'|'textAlignVertical',values:ReadonlyArray<readonly[string,string,string]>)=>`<div class="mind-icon-grid">${values.map(([value,label,symbol])=>toggle(field,value,label,symbol)).join('')}</div>`;
      body+=`<hr><div class="mind-menu-section"><p class="mind-menu-title">Alinhamento</p>${alignment('textAlign',[['left','Alinhar texto do tópico à esquerda','align-left'],['center','Centralizar texto do tópico','align-center'],['right','Alinhar texto do tópico à direita','align-right']])}${alignment('textAlignVertical',[['top','Alinhar texto do tópico no topo','align-top'],['middle','Alinhar texto do tópico no meio','align-center-y'],['bottom','Alinhar texto do tópico na base','align-bottom']])}</div>`;
      if(node.type==='shape')body+=`<hr><div class="mind-menu-section"><p class="mind-menu-title">Forma do tópico</p><div class="mind-icon-grid">${TOPIC_SHAPES.map(([shape,label])=>`<button type="button" data-mind-shape="${shape}" aria-label="Forma do tópico: ${label.toLowerCase()}" title="${label}" aria-pressed="${node.shape===shape}">${shapeIconSvg(shape)}</button>`).join('')}</div><div class="mind-topic-preview" aria-label="Prévia do tópico"><span style="font-family:${escape(style.fontFamily)};font-weight:${style.fontWeight??'normal'};font-style:${style.fontStyle??'normal'};color:${escape(style.color)};background:${style.fillColor==='transparent'?'transparent':escape(style.fillColor)};border:1.5px solid ${escape(style.borderColor)};border-radius:${node.shape==='circle'?'50%':node.shape==='round_rectangle'?'10px':'0'};text-align:${style.textAlign};align-items:${style.textAlignVertical==='top'?'flex-start':style.textAlignVertical==='bottom'?'flex-end':'center'};justify-content:${style.textAlign==='left'?'flex-start':style.textAlign==='right'?'flex-end':'center'}">${escape((node.content||'Tópico').slice(0,90))}</span></div></div>`;
    }
    return `<details data-menu="mind-format"><summary role="button" aria-label="Texto e aparência" title="Texto e aparência">${icon('text',21)}</summary><div class="property-popover">${body}</div></details>`;
  }
  function colorMenu(color:string){return `<details data-menu="mind-color"><summary role="button" aria-label="Cor do ramo" title="Cor do ramo"><span style="display:block;width:18px;height:18px;border-radius:50%;background:${escape(color)};box-shadow:inset 0 0 0 1px #0001"></span></summary><div class="property-popover"><div class="mind-colors">${COLORS.map(([c,name])=>`<button type="button" data-mind-color="${c}" aria-label="Cor do ramo: ${name.toLowerCase()}" title="${name}" aria-pressed="${c.toLowerCase()===color.toLowerCase()}" style="background:${c}"></button>`).join('')}</div><label class="mind-custom-color">Cor personalizada<input type="color" data-mind-color-input aria-label="Cor personalizada do ramo" value="${/^#[a-f\d]{6}$/i.test(color)?color:'#4262ff'}"></label></div></details>`;}
  const menuAction=(action:string,label:string,symbol:string,shortcut='')=>`<button type="button" class="mind-menu-action" data-mind-action="${action}" aria-label="${label}">${icon(symbol,18)}<span>${label}</span>${shortcut?`<kbd>${shortcut}</kbd>`:''}</button>`;
  const submenu=(name:string,label:string,symbol:string,body:string)=>`<details class="mind-submenu" data-menu="${name}"><summary role="button" aria-label="${label}" title="${label}">${icon(symbol,18)}<span>${label}</span>${icon('chevron-right',15)}</summary><div class="property-popover">${body}</div></details>`;
  function mapMenu(layout:MindLayout,line:string,theme:string){
    const layouts=[['balanced','Equilibrado'],['right','Ramos à direita'],['left','Ramos à esquerda'],['org','Organograma'],['list','Lista']];
    const layoutChoices=layouts.map(([value,label])=>`<button type="button" class="mind-layout-choice" data-mind-layout="${value}" aria-label="${label}" title="${label}" aria-pressed="${layout===value}"><svg width="34" height="26" viewBox="0 0 40 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${value==='balanced'?'<rect x="15" y="10" width="10" height="8" rx="2"/><path d="M15 14H5M25 14h10M5 7v14M35 7v14M2 7h6M2 21h6M32 7h6M32 21h6"/>':value==='org'?'<rect x="15" y="2" width="10" height="7" rx="2"/><path d="M20 9v6M7 21v-6h26v6"/><rect x="2" y="21" width="10" height="5" rx="1"/><rect x="28" y="21" width="10" height="5" rx="1"/>':value==='list'?'<rect x="4" y="2" width="12" height="6" rx="2"/><path d="M7 8v15h8M7 13h8M7 18h8M17 13h18M17 18h18M17 23h18"/>':`<rect x="${value==='left'?26:3}" y="10" width="11" height="8" rx="2"/><path d="${value==='left'?'M26 14H12M12 6v16M3 6h9M3 22h9':'M14 14h14M28 6v16M28 6h9M28 22h9'}"/>`}</svg><span>${label}</span></button>`).join('');
    const lines=[['curved','Arredondadas'],['straight','Retas'],['elbowed','Angulares']].map(([value,label])=>`<button type="button" class="mind-layout-choice" data-mind-line="${value}" aria-label="${label}" title="${label}" aria-pressed="${line===value}"><svg width="32" height="25" viewBox="0 0 36 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${value==='straight'?'M4 23 32 5':value==='elbowed'?'M4 23h14V5h14':'M4 23C24 23 12 5 32 5'}"/></svg><span>${label}</span></button>`).join('');
    const themes=Object.entries(MIND_THEMES).map(([value,data])=>`<button class="mind-layout-choice" type="button" data-mind-theme="${value}" aria-label="Paleta: ${data.label}" aria-pressed="${theme===value}"><span>${data.label}</span><span class="mind-theme-preview">${data.colors.slice(0,5).map(color=>`<i style="background:${color}"></i>`).join('')}</span></button>`).join('');
    return `<details data-menu="mind-map"><summary role="button" aria-label="Mapa" title="Mapa">${icon('mind-layout',21)}</summary><div class="property-popover">${submenu('mind-layout','Organização do mapa','mind-layout',layoutChoices)}${submenu('mind-lines','Linhas do mapa','connector',lines)}${submenu('mind-theme','Paleta do mapa','fill',themes)}<hr>${menuAction('reflow','Reorganizar mapa','arrange')}${menuAction('expand-map','Expandir mapa inteiro','plus')}${menuAction('collapse-map','Recolher mapa inteiro','minus')}</div></details>`;
  }
  function branchMenu(){return `<details data-menu="mind-branches"><summary role="button" aria-label="Ramos e níveis" title="Ramos e níveis">${icon('mindmap',21)}</summary><div class="property-popover">${menuAction('select-subtopics','Selecionar subtópicos','select')}${menuAction('expand-branch','Expandir todo o ramo','plus','Alt+0')}${menuAction('collapse-branch','Recolher todo o ramo','minus')}<hr><p class="mind-menu-title">Níveis visíveis</p><div class="mind-levels">${Array.from({length:10},(_,level)=>`<button type="button" data-mind-level="${level}" aria-label="${level?`Mostrar ${level} ${level===1?'nível':'níveis'} do ramo`:'Mostrar todos os níveis do ramo'}" title="${level?`${level} ${level===1?'nível':'níveis'}`:'Todos'} (Alt+${level})">${level||'Todos'}</button>`).join('')}</div></div></details>`;}
  function detailsMenu(node:Widget){const mind=node.mind!;return `<details data-menu="mind-details"><summary role="button" aria-label="Notas e ícone" title="Notas e ícone">${icon('sticky',21)}</summary><div class="property-popover"><div class="mind-form"><label>Notas do tópico<textarea data-mind-notes aria-label="Notas do tópico">${escape(mind.notes??'')}</textarea></label><label>Ícone do tópico<input type="text" data-mind-icon-input aria-label="Ícone do tópico" value="${escape(mind.icon??'')}" placeholder="Emoji ou símbolo" maxlength="128"></label><div class="mind-icon-presets">${['💡','🎯','🚀','⭐','✅','📌'].map(value=>`<button type="button" data-mind-icon="${value}" aria-label="Ícone ${value}">${value}</button>`).join('')}<button type="button" data-mind-icon="" aria-label="Remover ícone">${icon('close',16)}</button></div></div></div></details>`;}
  function attachmentMenu(node:Widget){const files=node.mind?.attachments??[],size=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(1)} KiB`:`${(bytes/(1024*1024)).toFixed(1)} MiB`;return `<details data-menu="mind-attachments"><summary role="button" aria-label="Anexos do tópico" title="${files.length} ${files.length===1?'anexo':'anexos'}">${icon('attachment',20)}${files.length?`<span class="mind-attachment-count" aria-label="${files.length} anexos">${files.length}</span>`:''}</summary><div class="property-popover"><button type="button" class="mind-menu-action" data-mind-attachment-add aria-label="Adicionar arquivo ao tópico">${icon('plus',18)}<span>Adicionar arquivo</span></button>${files.length?`<div class="mind-attachment-list" aria-label="Arquivos do tópico">${files.map(file=>`<div class="mind-attachment-row"><span class="mind-attachment-name" title="${escape(file.name)}">${escape(file.name)}<small>${size(file.size)}</small></span><button type="button" data-mind-attachment-download="${escape(file.id)}" aria-label="Baixar ${escape(file.name)}" title="Baixar ${escape(file.name)}">${icon('download',18)}</button><button type="button" data-mind-attachment-remove="${escape(file.id)}" aria-label="Remover ${escape(file.name)}" title="Remover ${escape(file.name)}">${icon('trash',18)}</button></div>`).join('')}</div>`:''}</div></details>`;}
  toolbarButton.addEventListener('click',event=>{event.stopPropagation();create();});
  panel.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;
    const node=selected();if(!node||locked(node))return;
    if(button.dataset.mindAction)perform(button.dataset.mindAction);
    if(button.dataset.mindColor){const node=selected();if(node)setMindColor(state,bus,node.id,button.dataset.mindColor);renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindLayout){const motion=transitionStart(),node=selected();if(node)setMindLayout(state,bus,node.id,button.dataset.mindLayout as MindLayout);renderKey='';refresh();api.onChange?.();transitionEnd(motion);}
    if(button.dataset.mindLine){const node=selected();if(node)setMindLineShape(state,bus,node.id,button.dataset.mindLine as 'straight'|'curved'|'elbowed');renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindTheme){const node=selected();if(node)setMindTheme(state,bus,node.id,button.dataset.mindTheme as keyof typeof MIND_THEMES);renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindIcon!==undefined){const node=selected();if(node)setMindDetails(state,bus,node.id,{icon:button.dataset.mindIcon});renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindLevel!==undefined){const motion=transitionStart();showMindLevels(state,bus,node.id,Number(button.dataset.mindLevel));renderKey='';refresh();api.onChange?.();transitionEnd(motion);}
    if(button.dataset.mindShape)setTopicShape(button.dataset.mindShape as ShapeWidget['shape']);
    if(button.hasAttribute('data-mind-attachment-add'))attachments.open(node.id);
    if(button.dataset.mindAttachmentDownload)attachments.download(node.id,button.dataset.mindAttachmentDownload);
    if(button.dataset.mindAttachmentRemove)attachments.remove(node.id,button.dataset.mindAttachmentRemove);
    if(button.dataset.mindToggle){const field=button.dataset.mindToggle as keyof Widget['style'],value=button.dataset.mindToggleValue??'normal';void formatTopic({[field]:['textAlign','textAlignVertical'].includes(field)?value:node.style[field]===value?field==='textDecoration'?'none':'normal':value});}
    if(button.dataset.mindPalette!==undefined){mindPalette=button.dataset.mindPalette==='close'?null:button.dataset.mindPalette as typeof mindPalette;renderKey='';refresh();}
    if(button.dataset.colorDomain==='mind-format'){const field=button.dataset.colorField!,value=button.dataset.color!;void formatTopic({[field]:value,...(field==='fillColor'?{fillOpacity:value==='transparent'?0:1}:{})});}
    if(button.hasAttribute('data-mind-transparent'))void formatTopic({fillColor:'transparent',fillOpacity:0});
    if(button.dataset.mindBorderFactor){const node=selected();if(node){const ratio=multipliedSize(relativeBorderScale(node)||.005,Number(button.dataset.mindBorderFactor));void formatTopic({borderScale:ratio,borderWidth:ratio*Math.min(node.width,node.height)});}}
  });
  panel.addEventListener('change',event=>{const input=event.target as HTMLInputElement,node=selected();if(!node||locked(node))return;if(input.matches('[data-mind-color-input]')){setMindColor(state,bus,node.id,input.value);renderKey='';refresh();api.onChange?.();}
    if(input.hasAttribute('data-mind-notes')){setMindDetails(state,bus,node.id,{notes:input.value});renderKey='';refresh();}
    if(input.hasAttribute('data-mind-icon-input')){setMindDetails(state,bus,node.id,{icon:input.value});renderKey='';refresh();}
    if(input.dataset.mindFormat){const field=input.dataset.mindFormat;let value:string|number=input.value;if(field==='fontSize'){value=Number(value);if(!Number.isFinite(value)||value<=0)return;}if(field==='fillOpacity'||field==='borderOpacity'){value=Number(value);if(!Number.isFinite(value))return;value=Math.max(0,Math.min(1,value));}if(field==='borderScale'){value=Number(value)/100;if(!Number.isFinite(value)||value<0)return;void formatTopic({borderScale:value,borderWidth:value*Math.min(node.width,node.height)});}else void formatTopic({...{[field]:value},...(field==='fillColor'?{fillOpacity:1}:{})});}
  });
  controls.addEventListener('pointerdown',event=>event.stopPropagation());
  controls.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;event.stopPropagation();if(button.hasAttribute('data-mind-notes-button')){panel.querySelector<HTMLElement>('[data-menu="mind-details"] summary')?.click();panel.querySelector<HTMLTextAreaElement>('[data-mind-notes]')?.focus();return;}perform(button.hasAttribute('data-mind-add')?'child':button.hasAttribute('data-mind-sibling')?'sibling':'collapse');});
  function closeMenus(){delete panel.dataset.openMenu;for(const details of panel.querySelectorAll<HTMLDetailsElement>('details'))details.open=false;if(mindPalette){mindPalette=null;renderKey='';queueMicrotask(refresh);}}
  document.addEventListener('pointerdown',event=>{if(!(event.target as Element).closest('.font-picker-popover,.brand-dialog')&&!panel.contains(event.target as Node))closeMenus();});
  panel.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())&&(!(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)||event.target instanceof HTMLInputElement&&event.target.type==='range'))return;if(event.key==='Escape'){event.preventDefault();closeMenus();}event.stopPropagation();});
  function refresh(){
    if(pointerInteraction&&!forceHistoryRefresh){refreshDeferred=true;return;}
    if(editingBoardKey!==api.getBoardKey?.()){editingRootId=null;editingBoardKey=api.getBoardKey?.();}
    const node=selected(),visible=!!node&&active(),editing=!!node&&isEditing(node.id);panel.hidden=!visible||!editing;controls.hidden=!visible;
    const readySelection=[...state.selection].some(id=>{const widget=state.widgets.get(id),topic=widget?.mind?id:state.connectors.get(id)?.mindBranch;return !!topic&&!isEditing(topic);});
    document.body.classList.toggle('mind-node-selected',visible||readySelection);if(!visible){renderKey='';return;}
    if(selectedId!==node!.id){selectedId=node!.id;closeMenus();}
    if(document.activeElement?.closest('.font-picker-popover')&&!forceHistoryRefresh)return;
    if(inputEngaged&&!forceHistoryRefresh){positionContextPanel(panel,state,camera);return;}
    const mind=node!.mind!,root=mindRoot(state,node!.id),children=mindChildren(state,node!.id),color=mind.color??node!.style.borderColor??'#4262ff',layout=root?.mind?.layout??'balanced',line=root?.mind?.lineShape??(layout==='org'||layout==='list'?'elbowed':'curved'),isLocked=locked(node!);
    const key=JSON.stringify([node!.id,editing,color,layout,line,!!mind.collapsed,children.map(child=>child.id),isLocked,canUnlock(node!),node!.style,node!.type==='shape'?node!.shape:null,node!.type==='frame'?node!.title:node!.content,mind.notes,mind.icon,mind.attachments?.map(file=>[file.id,file.name,file.size]),root?.mind?.theme,brandColorRevision()]);
    if(key!==renderKey){renderKey=key;const separator='<span class="mind-separator" aria-hidden="true"></span>';
      if(isLocked){
        panel.innerHTML=canUnlock(node!)?`<button type="button" class="mind-lock-control" data-hold-unlock aria-label="Mantenha pressionado para desbloquear tópico" title="Mantenha pressionado para desbloquear">${icon('lock',18)}<span>Desbloquear</span></button>`:`<button type="button" class="mind-lock-control" disabled aria-label="Camada bloqueada" title="Desbloqueie a camada no painel Camadas">${icon('lock',18)}<span>Camada bloqueada</span></button>`;
        controls.innerHTML='';
      }else{
        panel.innerHTML=actionButton('child','Adicionar subtópico','mind-child','Tab')+(mind.parentId?actionButton('sibling','Adicionar tópico irmão','plus','Enter'):'')+separator+formatMenu(node!)+colorMenu(color)+actionButton('link','Adicionar link','link','Ctrl+K')+actionButton('image','Imagem no tópico','image')+attachmentMenu(node!)+detailsMenu(node!)+separator+actionButton('collapse',mind.collapsed?'Expandir ramo':'Recolher ramo',mind.collapsed?'chevron-right':'chevron-down','Espaço')+branchMenu()+mapMenu(layout,line,root?.mind?.theme??'classic')+actionButton('delete','Excluir ramo','trash','Delete')+separator+actionButton('done','Concluir edição do mapa mental','check');
        const descendants=mindSubtree(state,node!.id).length-1;
        controls.innerHTML=(children.length?`<button type="button" data-mind-fold aria-label="${mind.collapsed?'Expandir':'Recolher'} ${children.length} ${children.length===1?'subtópico':'subtópicos'}" aria-expanded="${!mind.collapsed}" title="${mind.collapsed?'Expandir':'Recolher'} ${descendants} ${descendants===1?'subtópico':'subtópicos'} · Espaço"></button>`:'')+(editing?`<button type="button" data-mind-add aria-label="Adicionar subtópico no board" title="Adicionar subtópico (Tab)">${icon('plus',16)}</button>`+(mind.parentId?`<button type="button" data-mind-sibling aria-label="Adicionar tópico irmão no board" title="Adicionar tópico irmão (Enter)">${icon('plus',16)}</button>`:''):'');
        if(editing&&mind.notes)controls.insertAdjacentHTML('beforeend',`<button type="button" data-mind-notes-button aria-label="Abrir notas do tópico" title="${escape(mind.notes.slice(0,150))}">${icon('sticky',14)}</button>`);
        panel.querySelector<HTMLButtonElement>('[data-mind-action="collapse"]')!.disabled=!children.length;
        installFontPickers(panel);
      }
      compactContextPanel(panel);
    }
    positionContextPanel(panel,state,camera);
    const bounds=widgetAABB(node!),a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY}),side=mind.parentId?mind.side:layout==='left'?'left':'right',vertical=layout==='org',sign=side==='left'?-1:1,edge={x:side==='left'?a.x:b.x,y:(a.y+b.y)/2},centerX=(a.x+b.x)/2,safeLeft=workspaceLeft(),safeTop=workspaceTop();
    controls.style.setProperty('--mind-branch-color',color);controls.hidden=isLocked;
    const place=(selector:string,x:number,y:number)=>{const button=controls.querySelector<HTMLButtonElement>(selector);if(!button)return;button.style.left=`${x-12}px`;button.style.top=`${y-12}px`;button.hidden=x-12<safeLeft||x+12>innerWidth-12||y-12<safeTop||y+12>innerHeight-56;};
    place('[data-mind-add]',vertical?centerX:edge.x+sign*(children.length?43:19),vertical?b.y+(children.length?43:19):edge.y);
    place('[data-mind-sibling]',vertical?b.x+19:centerX,vertical?edge.y:b.y+19);
    place('[data-mind-fold]',vertical?centerX:edge.x+sign*18,vertical?b.y+18:edge.y);
    place('[data-mind-notes-button]',b.x+19,a.y-12);
    if(drop)positionDrop(drop);
  }
  function afterEdit(id:string,key:'Enter'|'Tab'){return add(id,key==='Tab'?'child':'sibling');}
  function handleKey(event:KeyboardEvent):boolean{
    const node=selected();if(!node||!active()||event.ctrlKey||event.metaKey)return false;
    if(event.altKey){const digit=event.code.match(/^(?:Digit|Numpad)([0-9])$/)?.[1]??(/^[0-9]$/.test(event.key)?event.key:undefined);if(digit!==undefined){event.preventDefault();if(!locked(node)){const motion=transitionStart();showMindLevels(state,bus,node.id,Number(digit));renderKey='';refresh();api.onChange?.();transitionEnd(motion);}return true;}return false;}
    if(event.key===' '){event.preventDefault();if(!locked(node))perform('collapse');return true;}
    if(event.key==='Escape'&&panel.querySelector('details[open]')){event.preventDefault();closeMenus();return true;}
    if(event.key==='Tab'){if(!isEditing(node.id))return false;event.preventDefault();if(event.shiftKey&&node.mind!.parentId)focusNode(node.mind!.parentId);else if(!locked(node))add(node.id,'child');return true;}
    if(event.key==='Enter'){event.preventDefault();if(isEditing(node.id)&&!locked(node))add(node.id,'sibling',event.shiftKey);return true;}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();if(!locked(node))perform('delete');return true;}
    if(event.key.startsWith('Arrow')&&!event.shiftKey){event.preventDefault();const expand=!locked(node)&&node.mind!.collapsed&&event.key===(node.mind!.side==='left'?'ArrowLeft':'ArrowRight'),motion=expand?transitionStart():undefined;if(expand)toggleMindBranch(state,bus,node.id);const target=navigateMindNode(state,node.id,event.key);if(target)focusNode(target);transitionEnd(motion);return true;}
    return false;
  }
  function dropTarget(sourceId:string,p:Vec):MindDrop|undefined{
    const source=state.widgets.get(sourceId),excluded=new Set(mindSubtree(state,sourceId));
    if(!source?.mind?.parentId||[...excluded].some(id=>itemLocked(state,id))||[...state.connectors.values()].some(connector=>connector.locked&&connector.mindBranch&&excluded.has(connector.mindBranch)))return;
    // Drop affordances live in screen pixels, so a few-pixel miss is equally
    // forgiving at 2% and at 2,000%. Geometry/model positions remain in world units.
    const padding=10/camera.scale,edgeBand=14/camera.scale;
    const candidates=[...state.widgets.values()].filter(node=>{if(!node.mind||node.hidden||locked(node)||mindNodeHidden(state,node.id)||excluded.has(node.id))return false;const box=widgetAABB(node);return p.x>=box.minX-padding&&p.x<=box.maxX+padding&&p.y>=box.minY-padding&&p.y<=box.maxY+padding;});
    const distance=(node:Widget)=>{const box=widgetAABB(node);return Math.hypot(Math.max(box.minX-p.x,0,p.x-box.maxX),Math.max(box.minY-p.y,0,p.y-box.maxY));};
    candidates.sort((a,b)=>distance(a)-distance(b)||b.z-a.z);
    for(const target of candidates){
      const bounds=widgetAABB(target),mind=target.mind!,band=Math.min((bounds.maxY-bounds.minY)*.25,edgeBand),layout=mind.layout??'balanced';
      // The hint must describe the final layout: only balanced roots accept
      // either side. Tree/list roots have children rather than lateral branches.
      const side:MindSide=mind.parentId?mind.side:layout==='left'||layout==='right'?layout:layout==='org'||layout==='list'?'right':p.x<(bounds.minX+bounds.maxX)/2?'left':'right';
      let next:MindDrop={targetId:target.id,parentId:target.id,kind:mind.parentId||layout==='org'||layout==='list'?'child':side,side};
      if(mind.parentId&&(p.y<=bounds.minY+band||p.y>=bounds.maxY-band)){
        const parent=state.widgets.get(mind.parentId);if(!parent?.mind||locked(parent)||parent.hidden||excluded.has(parent.id)||mindNodeHidden(state,parent.id))continue;
        const siblings=mindChildren(state,parent.id).filter(node=>node.id!==sourceId),index=siblings.findIndex(node=>node.id===target.id);if(index<0)continue;
        const after=p.y>=(bounds.minY+bounds.maxY)/2;next={targetId:target.id,parentId:parent.id,kind:after?'after':'before',side,order:index+(after?1:0)};
      }
      if(next.parentId===source.mind.parentId&&next.side===source.mind.side){const siblings=mindChildren(state,next.parentId).filter(node=>node.id!==sourceId),old=mindChildren(state,next.parentId).findIndex(node=>node.id===sourceId);if((next.order??siblings.length)===old)continue;}
      return next;
    }
    return;
  }
  function positionDrop(next:MindDrop){const node=state.widgets.get(next.targetId);if(!node){clearDrop();return;}const bounds=widgetAABB(node),a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY}),line=next.kind==='before'||next.kind==='after';dropHint.dataset.kind=next.kind;dropHint.dataset.parent=next.parentId;
    const half=next.kind==='left'||next.kind==='right',left=half?(next.kind==='left'?a.x-5:(a.x+b.x)/2):a.x-5,width=half?(b.x-a.x)/2+5:b.x-a.x+10;
    Object.assign(dropHint.style,{left:`${left}px`,top:`${line?(next.kind==='before'?a.y-5:b.y+3):a.y-5}px`,width:`${width}px`,height:`${line?3:b.y-a.y+10}px`});
    dropHint.querySelector('span')!.textContent=next.kind==='before'?'Inserir antes':next.kind==='after'?'Inserir depois':half?`Ramo à ${next.kind==='left'?'esquerda':'direita'}`:'Adicionar como subtópico';
  }
  function clearDrop(){drop=null;dragOrigin=undefined;dropHint.hidden=true;delete dropHint.dataset.kind;delete dropHint.dataset.parent;}
  function previewDrop(sourceId:string,p:Vec){drop=dropTarget(sourceId,p)??null;dropHint.hidden=!drop;if(drop)positionDrop(drop);return drop?.targetId??null;}
  function commitDrop(sourceId:string,p:Vec){const target=dropTarget(sourceId,p),origin=dragOrigin;clearDrop();if(!target){const old=origin?.id===sourceId?origin.widgets.get(sourceId):undefined,node=state.widgets.get(sourceId),excluded=new Set(mindSubtree(state,sourceId)),padding=10/camera.scale,blocked=origin&&[...origin.widgets.values()].some(widget=>{if(widget.id===sourceId||!excluded.has(widget.id)&&!widget.locked)return false;const box=widgetAABB(widget);return p.x>=box.minX-padding&&p.x<=box.maxX+padding&&p.y>=box.minY-padding&&p.y<=box.maxY+padding;});if(old&&node&&!blocked&&Math.hypot(node.x-old.x,node.y-old.y)*camera.scale>5&&markMindManualPosition(state,bus,sourceId)){renderKey='';refresh();api.onChange?.();}return false;}const motion=transitionStart(),changed=reparentMindNode(state,bus,sourceId,target.parentId,target.side,target.order);if(changed){renderKey='';refresh();api.onChange?.();transitionEnd(motion);}return changed;}
  window.addEventListener('resize',refresh);refresh();
  function refreshAfterHistory(){const active=document.activeElement instanceof HTMLInputElement&&panel.contains(document.activeElement)&&document.activeElement.type==='range'?document.activeElement:null,label=active?.getAttribute('aria-label');pointerInteraction=false;refreshDeferred=false;inputEngaged=false;renderKey='';forceHistoryRefresh=true;try{refresh();}finally{forceHistoryRefresh=false;}if(label)[...panel.querySelectorAll<HTMLInputElement>('input[type="range"]')].find(input=>input.getAttribute('aria-label')===label)?.focus({preventScroll:true});}
  window.addEventListener('board-brand-colors-changed',()=>{renderKey='';refresh();});
  return {refresh,create,selected,handleKey,afterEdit,previewDrop,commitDrop,clearDrop,refreshAfterHistory,openEditor,isEditing,finishEditing};
}
