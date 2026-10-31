import type {BoardState,CommandBus} from './core/commands';
import type {Camera} from './core/camera';
import type {Widget} from './core/model';
import {pointInWidget,widgetAABB,type Vec} from './core/geometry';
import {createMindMap,addMindChild,addMindSibling,toggleMindBranch,reparentMindNode,layoutMindMap,setMindLayout,setMindColor,setMindLineShape,setMindDetails,setMindTheme,MIND_THEMES,mindLayoutCommands,deleteMindSubtree,mindChildren,mindSubtree,mindRoot,mindNodeHidden,navigateMindNode,type MindLayout} from './core/mindmap';
import {boardFontOptions,loadBoardFont} from './fonts';
import {relativeBorderScale} from './core/style-scale';
import {sizeRangeMaximum,multipliedSize,formatSize} from './size-controls';
import {icon} from './icons';
import {compactContextPanel,positionContextPanel} from './context-position';
import {installFontPickers} from './font-picker';
import {uiPalette} from './ui-palette';
import {brandColorRevision} from './brand-colors';

interface MindmapUIAPI{
  state:BoardState;bus:CommandBus;camera:Camera;
  setTool(tool:'select'):void;getTool?():string;
  onEdit(id:string):void;onChange?():void;onLink?():void;onImage?(parentId:string):void;
}
const COLORS=[['#4262ff','Azul'],['#e25767','Vermelho'],['#f39b42','Laranja'],['#55a676','Verde'],['#2ba4ad','Turquesa'],['#9a65c8','Roxo'],['#da73aa','Rosa'],['#62748b','Cinza']] as const;
const escape=(value:unknown)=>String(value??'').replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]!));
const actionButton=(action:string,label:string,symbol:string,shortcut='')=>`<button type="button" data-mind-action="${action}" aria-label="${label}" title="${label}${shortcut?' ('+shortcut+')':''}">${icon(symbol,21)}</button>`;

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
  #mindmap-node-controls{position:fixed;display:flex;align-items:center;gap:6px;z-index:41;transform:translateY(-50%);pointer-events:none}
  #mindmap-node-controls button{height:26px;min-width:26px;display:flex;align-items:center;justify-content:center;gap:3px;padding:0 5px;border:1px solid #b8c6ff;border-radius:20px;background:#fff;color:#4262ff;box-shadow:0 2px 6px #15171b13;font:11px Inter,'Segoe UI',sans-serif;cursor:pointer;pointer-events:auto}
  #mindmap-node-controls button[data-mind-add]{border-color:#4262ff;background:#4262ff;color:#fff;padding:0;width:26px}
  #mindmap-node-controls button:hover{filter:brightness(.96)}
  #mindmap-drop-target{position:fixed;pointer-events:none;border:2px dashed #4262ff;border-radius:12px;box-shadow:0 0 0 5px #4262ff1f;box-sizing:border-box;z-index:39}
  #mindmap-drop-target span{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);white-space:nowrap;background:#4262ff;color:white;border-radius:5px;padding:6px 8px;font:11px Inter,'Segoe UI',sans-serif}
  @media(max-width:520px){#mindmap-properties{gap:0;padding:4px}#mindmap-properties>button,#mindmap-properties summary{width:31px;height:34px;padding:6px}#mindmap-properties .mind-separator{margin:0 2px}}
  `;document.head.append(style);
  const panel=document.createElement('section');panel.id='mindmap-properties';panel.hidden=true;panel.setAttribute('aria-label','Opções do mapa mental');
  const controls=document.createElement('div');controls.id='mindmap-node-controls';controls.hidden=true;controls.setAttribute('role','group');controls.setAttribute('aria-label','Ramos do tópico');
  const dropHint=document.createElement('div');dropHint.id='mindmap-drop-target';dropHint.hidden=true;dropHint.innerHTML='<span>Solte para mover este ramo</span>';
  document.body.append(panel,controls,dropHint);
  const toolbarButton=document.createElement('button');toolbarButton.type='button';toolbarButton.dataset.tool='mindmap';toolbarButton.dataset.label='Mapa mental';toolbarButton.setAttribute('aria-label','Mapa mental');toolbarButton.title='Mapa mental';toolbarButton.innerHTML=icon('mindmap',22);
  const toolbar=document.getElementById('toolbar')!;toolbar.querySelector('[data-tool="shape"]')?.after(toolbarButton);if(!toolbarButton.parentElement)toolbar.append(toolbarButton);
  let renderKey='',selectedId='',dropId:string|null=null,inputEngaged=false,pointerInteraction=false,refreshDeferred=false,forceHistoryRefresh=false,mindPalette:'color'|'fillColor'|'borderColor'|null=null;
  panel.addEventListener('pointerdown',()=>{pointerInteraction=true;},true);
  const release=()=>{pointerInteraction=false;if(refreshDeferred){refreshDeferred=false;refresh();}};document.addEventListener('click',release);window.addEventListener('pointerup',()=>setTimeout(release,120),true);window.addEventListener('pointercancel',release,true);
  panel.addEventListener('focusin',event=>{if((event.target as HTMLElement).matches('input,textarea,select'))inputEngaged=true;});panel.addEventListener('focusout',()=>queueMicrotask(()=>{inputEngaged=panel.contains(document.activeElement)&&!!document.activeElement?.matches('input,textarea,select');if(!inputEngaged)refresh();}));
  const selected=()=>{const node=state.selection.size===1?state.widgets.get([...state.selection][0]!):undefined;return node?.mind&&!node.hidden&&!mindNodeHidden(state,node.id)?node:undefined;};
  const active=()=>!document.body.classList.contains('home-visible')&&(!api.getTool||api.getTool()==='select');
  function focusNode(id:string,edit=false){
    api.setTool('select');bus.exec({op:'SELECTION_SET',payload:[id]});
    const node=state.widgets.get(id);if(node){const bounds=widgetAABB(node),a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});
      const dx=b.x-a.x>camera.width-200?camera.width/2-(a.x+b.x)/2:a.x<100?100-a.x:b.x>camera.width-100?camera.width-100-b.x:0;
      const dy=b.y-a.y>camera.height-200?camera.height/2-(a.y+b.y)/2:a.y<120?120-a.y:b.y>camera.height-80?camera.height-80-b.y:0;
      if(dx||dy)camera.panByScreen(dx,dy);
    }
    if(edit)api.onEdit(id);refresh();api.onChange?.();
  }
  function create(){const id=createMindMap(state,bus,{x:camera.x,y:camera.y});focusNode(id,true);return id;}
  function add(id:string,kind:'child'|'sibling',before=false){
    const result=kind==='child'?addMindChild(state,bus,id):addMindSibling(state,bus,id,'Novo tópico',before);
    if(result)focusNode(result,true);return result;
  }
  function perform(action:string){const node=selected();if(!node)return;
    if(action==='child'||action==='sibling'){add(node.id,action);return;}
    if(action==='edit'){api.onEdit(node.id);return;}
    if(action==='link'){api.onLink?.();return;}
    if(action==='image'){api.onImage?.(node.id);return;}
    if(action==='collapse')toggleMindBranch(state,bus,node.id);
    if(action==='reflow')layoutMindMap(state,bus,mindRoot(state,node.id)?.id??node.id);
    if(action==='delete')deleteMindSubtree(state,bus,node.id);
    renderKey='';refresh();api.onChange?.();
  }
  async function formatTopic(patch:Partial<Widget['style']>){const node=selected();if(!node||node.locked)return;const id=node.id;if(patch.fontFamily)await loadBoardFont(patch.fontFamily);const current=selected();if(!current||current!==node||current.locked)return;
    bus.beginTransaction('Formatar tópico');bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{style:{...current.style,...patch}}}});const commands=mindLayoutCommands(state,id);if(commands.length)bus.exec({op:'BATCH',payload:{commands}});bus.endTransaction();renderKey='';refresh();api.onChange?.();
  }
  function formatMenu(node:Widget){
    const style=node.style,ratio=relativeBorderScale(node),fonts=[...boardFontOptions()];if(!fonts.some(font=>font.family===style.fontFamily))fonts.push({family:style.fontFamily,label:style.fontFamily,category:'display',slug:style.fontFamily});
    const toggle=(field:string,value:string,label:string,symbol:string)=>`<button type="button" data-mind-toggle="${field}" data-mind-toggle-value="${value}" aria-label="${label}" title="${label}" aria-pressed="${style[field as keyof typeof style]===value}">${icon(symbol,20)}</button>`;
    const palettes=[['color','Cor do texto do tópico','text-color'],['fillColor','Cor do fundo do tópico','fill'],['borderColor','Cor da borda do tópico','stroke']] as const;
    let body='';
    if(mindPalette){const [,label]=palettes.find(([field])=>field===mindPalette)!;const opacityField=mindPalette==='fillColor'?'fillOpacity':mindPalette==='borderColor'?'borderOpacity':null,value=opacityField?style[opacityField]??1:1;
      body=`<button class="mind-palette-back" type="button" data-mind-palette="close" aria-label="Voltar à tipografia do tópico" title="Voltar à tipografia">${icon('arrow-left',18)}</button>${opacityField?`<label class="mind-opacity">Opacidade<input type="range" min="0" max="1" step="0.01" data-mind-format="${opacityField}" aria-label="Opacidade ${mindPalette==='fillColor'?'do fundo':'da borda'} do tópico" value="${value}"></label>`:''}${uiPalette('mind-format',mindPalette,label,style[mindPalette])}${mindPalette==='fillColor'?`<button class="mind-transparent" type="button" data-mind-transparent aria-label="Fundo transparente do tópico" title="Fundo transparente">${icon('opacity',18)}</button>`:''}`;
    }else body=`<div class="mind-form mind-format-form"><select data-mind-format="fontFamily" aria-label="Fonte do tópico">${fonts.map(font=>`<option value="${escape(font.family)}" ${font.family===style.fontFamily?'selected':''}>${escape(font.label)}</option>`).join('')}</select><input class="mind-fontsize" type="number" min="1" data-mind-format="fontSize" aria-label="Tamanho do texto do tópico" title="Tamanho do texto" value="${formatSize(style.fontSize)}"><div class="mind-style-choices">${toggle('fontWeight','bold','Negrito no tópico','bold')}${toggle('fontStyle','italic','Itálico no tópico','italic')}${toggle('textDecoration','underline','Sublinhado no tópico','underline')}${toggle('textDecoration','line-through','Riscado no tópico','strike')}</div><div class="mind-style-choices">${palettes.map(([field,label,symbol])=>`<button type="button" data-mind-palette="${field}" aria-label="Paleta: ${label.toLowerCase()}" title="${label}">${icon(symbol,20)}<i style="background:${style[field]==='transparent'?'#fff':escape(style[field])}"></i></button>`).join('')}</div><hr><label class="mind-border-range">${icon('stroke',18)}<input type="range" min="0" max="${sizeRangeMaximum(ratio*100,50)}" step="0.05" data-mind-format="borderScale" aria-label="Espessura da borda do tópico" value="${formatSize(ratio*100)}"></label><div class="mind-style-choices"><button type="button" data-mind-border-factor="0.5" aria-label="Diminuir borda do tópico" title="Diminuir borda">${icon('minus',18)}</button><button type="button" data-mind-border-factor="2" aria-label="Aumentar borda do tópico" title="Aumentar borda">${icon('plus',18)}</button></div></div>`;
    return `<details data-menu="mind-format"><summary role="button" aria-label="Texto e aparência" title="Texto e aparência">${icon('text',21)}</summary><div class="property-popover">${body}</div></details>`;
  }
  toolbarButton.addEventListener('click',event=>{event.stopPropagation();create();});
  panel.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;
    if(button.dataset.mindAction)perform(button.dataset.mindAction);
    if(button.dataset.mindColor){const node=selected();if(node)setMindColor(state,bus,node.id,button.dataset.mindColor);renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindLayout){const node=selected();if(node)setMindLayout(state,bus,node.id,button.dataset.mindLayout as MindLayout);renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindLine){const node=selected();if(node)setMindLineShape(state,bus,node.id,button.dataset.mindLine as 'straight'|'curved'|'elbowed');renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindTheme){const node=selected();if(node)setMindTheme(state,bus,node.id,button.dataset.mindTheme as keyof typeof MIND_THEMES);renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindIcon!==undefined){const node=selected();if(node)setMindDetails(state,bus,node.id,{icon:button.dataset.mindIcon});renderKey='';refresh();api.onChange?.();}
    if(button.dataset.mindToggle){const node=selected();if(node){const field=button.dataset.mindToggle as 'fontWeight'|'fontStyle'|'textDecoration',value=button.dataset.mindToggleValue??(field==='fontWeight'?'bold':'italic');void formatTopic({[field]:node.style[field]===value?field==='textDecoration'?'none':'normal':value});}}
    if(button.dataset.mindPalette!==undefined){mindPalette=button.dataset.mindPalette==='close'?null:button.dataset.mindPalette as typeof mindPalette;renderKey='';refresh();}
    if(button.dataset.colorDomain==='mind-format'){const field=button.dataset.colorField!,value=button.dataset.color!;void formatTopic({[field]:value,...(field==='fillColor'?{fillOpacity:value==='transparent'?0:1}:{})});}
    if(button.hasAttribute('data-mind-transparent'))void formatTopic({fillColor:'transparent',fillOpacity:0});
    if(button.dataset.mindBorderFactor){const node=selected();if(node){const ratio=multipliedSize(relativeBorderScale(node)||.005,Number(button.dataset.mindBorderFactor));void formatTopic({borderScale:ratio,borderWidth:ratio*Math.min(node.width,node.height)});}}
  });
  panel.addEventListener('change',event=>{const input=event.target as HTMLInputElement,node=selected();if(!node||node.locked)return;if(input.matches('[data-mind-color-input]')){setMindColor(state,bus,node.id,input.value);renderKey='';refresh();api.onChange?.();}
    if(input.hasAttribute('data-mind-notes')){setMindDetails(state,bus,node.id,{notes:input.value});renderKey='';refresh();}
    if(input.hasAttribute('data-mind-icon-input')){setMindDetails(state,bus,node.id,{icon:input.value});renderKey='';refresh();}
    if(input.dataset.mindFormat){const field=input.dataset.mindFormat;let value:string|number=input.value;if(field==='fontSize'){value=Number(value);if(!Number.isFinite(value)||value<=0)return;}if(field==='fillOpacity'||field==='borderOpacity'){value=Number(value);if(!Number.isFinite(value))return;value=Math.max(0,Math.min(1,value));}if(field==='borderScale'){value=Number(value)/100;if(!Number.isFinite(value)||value<0)return;void formatTopic({borderScale:value,borderWidth:value*Math.min(node.width,node.height)});}else void formatTopic({...{[field]:value},...(field==='fillColor'?{fillOpacity:1}:{})});}
  });
  controls.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;event.stopPropagation();if(button.hasAttribute('data-mind-notes-button')){panel.querySelector<HTMLElement>('[data-menu="mind-details"] summary')?.click();panel.querySelector<HTMLTextAreaElement>('[data-mind-notes]')?.focus();return;}perform(button.hasAttribute('data-mind-add')?'child':'collapse');});
  function closeMenus(){delete panel.dataset.openMenu;for(const details of panel.querySelectorAll<HTMLDetailsElement>('details'))details.open=false;if(mindPalette){mindPalette=null;renderKey='';queueMicrotask(refresh);}}
  document.addEventListener('pointerdown',event=>{if(!(event.target as Element).closest('.font-picker-popover,.brand-dialog')&&!panel.contains(event.target as Node))closeMenus();});
  panel.addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='range'&&(event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))return;if(event.key==='Escape'){event.preventDefault();closeMenus();}event.stopPropagation();});
  function refresh(){
    if(pointerInteraction&&!forceHistoryRefresh){refreshDeferred=true;return;}
    const node=selected(),visible=!!node&&active();panel.hidden=!visible;controls.hidden=!visible;
    document.body.classList.toggle('mind-node-selected',visible);if(!visible){renderKey='';return;}
    if(selectedId!==node!.id){selectedId=node!.id;closeMenus();}
    if(document.activeElement?.closest('.font-picker-popover')&&!forceHistoryRefresh)return;
    if(inputEngaged&&!forceHistoryRefresh){positionContextPanel(panel,state,camera);return;}
    const mind=node!.mind!,root=mindRoot(state,node!.id),children=mindChildren(state,node!.id),color=mind.color??node!.style.borderColor??'#4262ff',layout=root?.mind?.layout??'balanced',line=root?.mind?.lineShape??(layout==='org'||layout==='list'?'elbowed':'curved');
    const key=JSON.stringify([node!.id,color,layout,line,!!mind.collapsed,children.map(child=>child.id),node!.locked,node!.style,mind.notes,mind.icon,root?.mind?.theme,brandColorRevision()]);
    if(key!==renderKey){renderKey=key;const separator='<span class="mind-separator" aria-hidden="true"></span>';
      panel.innerHTML=actionButton('child','Adicionar subtópico','mind-child','Tab')+actionButton('sibling','Adicionar tópico irmão','plus','Enter')+actionButton('edit','Editar tópico','rename')+separator+actionButton('collapse',mind.collapsed?'Expandir ramo':'Recolher ramo',mind.collapsed?'chevron-right':'chevron-down')+`<details data-menu="mind-color"><summary role="button" aria-label="Cor do ramo" title="Cor do ramo"><span style="display:block;width:18px;height:18px;border-radius:50%;background:${escape(color)};box-shadow:inset 0 0 0 1px #0001"></span></summary><div class="property-popover"><div class="mind-colors">${COLORS.map(([c,name])=>`<button type="button" data-mind-color="${c}" aria-label="Cor do ramo: ${name.toLowerCase()}" title="${name}" aria-pressed="${c.toLowerCase()===color.toLowerCase()}" style="background:${c}"></button>`).join('')}</div><label class="mind-custom-color">Cor personalizada<input type="color" data-mind-color-input aria-label="Cor personalizada do ramo" value="${/^#[a-f\d]{6}$/i.test(color)?color:'#4262ff'}"></label></div></details>`+`<details data-menu="mind-layout"><summary role="button" aria-label="Organização do mapa" title="Organização do mapa">${icon('mind-layout',21)}</summary><div class="property-popover">${[['balanced','Equilibrado'],['right','Ramos à direita'],['left','Ramos à esquerda']].map(([value,label])=>`<button type="button" class="mind-layout-choice" data-mind-layout="${value}" aria-pressed="${layout===value}">${icon(value==='balanced'?'mind-layout':value==='left'?'arrow-left':'arrow-right',17)}<span>${label}</span><span class="mind-layout-check">${icon('check',15)}</span></button>`).join('')}</div></details>`+actionButton('reflow','Reorganizar mapa','arrange')+separator+actionButton('delete','Excluir ramo','trash','Delete');
      panel.querySelector('[data-menu="mind-color"]')!.insertAdjacentHTML('beforebegin',actionButton('link','Adicionar link','link','Ctrl+K'));
      const layoutPopover=panel.querySelector('[data-menu="mind-layout"] .property-popover')!;
      layoutPopover.insertAdjacentHTML('beforeend',[['org','Organograma'],['list','Lista']].map(([value,label])=>`<button type="button" class="mind-layout-choice" data-mind-layout="${value}" aria-pressed="${layout===value}">${icon('mind-layout',17)}<span>${label}</span><span class="mind-layout-check">${icon('check',15)}</span></button>`).join(''));
      panel.querySelector('[data-mind-action="reflow"]')!.insertAdjacentHTML('beforebegin',actionButton('image','Imagem no tópico','image')+`<details data-menu="mind-lines"><summary role="button" aria-label="Linhas do mapa" title="Linhas do mapa">${icon('connector',21)}</summary><div class="property-popover">${[['curved','Arredondadas'],['straight','Retas'],['elbowed','Angulares']].map(([value,label])=>`<button type="button" class="mind-layout-choice" data-mind-line="${value}" aria-pressed="${line===value}">${icon('connector',17)}<span>${label}</span><span class="mind-layout-check">${icon('check',15)}</span></button>`).join('')}</div></details>`);
      const theme=root?.mind?.theme??'classic';
      panel.querySelector('[data-menu="mind-color"]')!.insertAdjacentHTML('beforebegin',`<details data-menu="mind-details"><summary role="button" aria-label="Notas e ícone" title="Notas e ícone">${icon('sticky',21)}</summary><div class="property-popover"><div class="mind-form"><label>Notas do tópico<textarea data-mind-notes aria-label="Notas do tópico" placeholder="Detalhes e observações…">${escape(mind.notes??'')}</textarea></label><label>Ícone do tópico<input type="text" data-mind-icon-input aria-label="Ícone do tópico" value="${escape(mind.icon??'')}" placeholder="Cole um emoji ou símbolo" maxlength="128"></label><div class="mind-icon-presets">${['💡','🎯','🚀','⭐','✅','📌'].map(value=>`<button type="button" data-mind-icon="${value}" aria-label="Ícone ${value}">${value}</button>`).join('')}<button type="button" data-mind-icon="" aria-label="Remover ícone">${icon('close',16)}</button></div><small>Notas são salvas com o tópico. O ícone aparece junto do título.</small></div></div></details>${formatMenu(node!)}`);
      panel.querySelector('[data-menu="mind-layout"]')!.insertAdjacentHTML('afterend',`<details data-menu="mind-theme"><summary role="button" aria-label="Paleta do mapa" title="Paleta do mapa">${icon('fill',21)}</summary><div class="property-popover">${Object.entries(MIND_THEMES).map(([value,data])=>`<button class="mind-layout-choice" type="button" data-mind-theme="${value}" aria-label="Paleta: ${data.label}" aria-pressed="${theme===value}"><span>${data.label}</span><span class="mind-theme-preview">${data.colors.slice(0,5).map(color=>`<i style="background:${color}"></i>`).join('')}</span></button>`).join('')}</div></details>`);
      controls.innerHTML=(children.length?`<button type="button" data-mind-fold aria-label="${mind.collapsed?'Expandir':'Recolher'} ${children.length} subtópicos" title="${mind.collapsed?'Expandir':'Recolher'} ramo">${icon(mind.collapsed?'chevron-right':'minus',13)}<span>${children.length}</span></button>`:'')+`<button type="button" data-mind-add aria-label="Adicionar subtópico no board" title="Adicionar subtópico (Tab)">${icon('plus',17)}</button>`;
      if(mind.notes)controls.insertAdjacentHTML('beforeend',`<button type="button" data-mind-notes-button aria-label="Abrir notas do tópico" title="${escape(mind.notes.slice(0,150))}">${icon('sticky',14)}</button>`);
      panel.querySelector<HTMLButtonElement>('[data-mind-action="collapse"]')!.disabled=!children.length;
      if(node!.locked){for(const button of panel.querySelectorAll<HTMLButtonElement>('button'))button.disabled=true;for(const input of panel.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select'))input.disabled=true;for(const button of controls.querySelectorAll<HTMLButtonElement>('button'))button.disabled=true;}
      for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-mind-layout],[data-mind-line]')){
        const label=button.textContent?.trim()??'',layout=button.dataset.mindLayout,line=button.dataset.mindLine;button.setAttribute('aria-label',label);button.title=label;
        button.innerHTML=line?'<svg width="30" height="24" viewBox="0 0 36 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(line==='straight'?'M4 23 32 5':line==='elbowed'?'M4 23h14V5h14':'M4 23C24 23 12 5 32 5')+'"/></svg>':icon(layout==='balanced'?'mind-layout':layout==='right'?'arrow-right':layout==='left'?'arrow-left':layout==='org'?'mindmap':'list',21);
        button.parentElement?.classList.add('mind-choice-grid');
      }
      installFontPickers(panel);compactContextPanel(panel);
    }
    positionContextPanel(panel,state,camera);
    const bounds=widgetAABB(node!),side=mind.parentId?mind.side:'right',edge=camera.worldToScreen({x:side==='left'?bounds.minX:bounds.maxX,y:(bounds.minY+bounds.maxY)/2}),width=controls.offsetWidth||26,left=side==='left'?edge.x-width-12:edge.x+12;
    controls.style.left=`${left}px`;controls.style.top=`${edge.y}px`;controls.style.flexDirection=side==='left'?'row-reverse':'row';
    controls.hidden=left<72||left+width>innerWidth-12||edge.y<82||edge.y>innerHeight-65;
    if(dropId)positionDrop(dropId);
  }
  function afterEdit(id:string,key:'Enter'|'Tab'){return add(id,key==='Tab'?'child':'sibling');}
  function handleKey(event:KeyboardEvent):boolean{
    const node=selected();if(!node||!active()||event.ctrlKey||event.metaKey||event.altKey)return false;
    if(event.key===' '){event.preventDefault();if(!node.locked)toggleMindBranch(state,bus,node.id);return true;}
    if(event.key==='Escape'&&panel.querySelector('details[open]')){event.preventDefault();closeMenus();return true;}
    if(event.key==='Tab'){event.preventDefault();if(event.shiftKey&&node.mind!.parentId)focusNode(node.mind!.parentId);else if(!node.locked)add(node.id,'child');return true;}
    if(event.key==='Enter'){event.preventDefault();if(!node.locked)add(node.id,'sibling',event.shiftKey);return true;}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();if(!node.locked)perform('delete');return true;}
    if(event.key.startsWith('Arrow')&&!event.shiftKey){event.preventDefault();if(node.mind!.collapsed&&event.key===(node.mind!.side==='left'?'ArrowLeft':'ArrowRight'))toggleMindBranch(state,bus,node.id);const target=navigateMindNode(state,node.id,event.key);if(target)focusNode(target);return true;}
    return false;
  }
  function dropTarget(sourceId:string,p:Vec):Widget|undefined{
    const excluded=new Set(mindSubtree(state,sourceId));
    return [...state.widgets.values()].filter(node=>node.mind&&!node.hidden&&!node.locked&&!mindNodeHidden(state,node.id)&&!excluded.has(node.id)&&pointInWidget(node,p)).sort((a,b)=>b.z-a.z)[0];
  }
  function positionDrop(id:string){const node=state.widgets.get(id);if(!node){clearDrop();return;}const bounds=widgetAABB(node),a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});Object.assign(dropHint.style,{left:`${a.x-5}px`,top:`${a.y-5}px`,width:`${b.x-a.x+10}px`,height:`${b.y-a.y+10}px`});}
  function clearDrop(){dropId=null;dropHint.hidden=true;}
  function previewDrop(sourceId:string,p:Vec){const target=dropTarget(sourceId,p);dropId=target?.id??null;dropHint.hidden=!target;if(target)positionDrop(target.id);return dropId;}
  function commitDrop(sourceId:string,p:Vec){const target=dropTarget(sourceId,p);clearDrop();if(!target)return false;const changed=reparentMindNode(state,bus,sourceId,target.id);if(changed){refresh();api.onChange?.();}return changed;}
  window.addEventListener('resize',refresh);refresh();
  function refreshAfterHistory(){const active=document.activeElement instanceof HTMLInputElement&&panel.contains(document.activeElement)&&document.activeElement.type==='range'?document.activeElement:null,label=active?.getAttribute('aria-label');pointerInteraction=false;refreshDeferred=false;inputEngaged=false;renderKey='';forceHistoryRefresh=true;try{refresh();}finally{forceHistoryRefresh=false;}if(label)[...panel.querySelectorAll<HTMLInputElement>('input[type="range"]')].find(input=>input.getAttribute('aria-label')===label)?.focus({preventScroll:true});}
  window.addEventListener('board-brand-colors-changed',()=>{renderKey='';refresh();});
  return {refresh,create,selected,handleKey,afterEdit,previewDrop,commitDrop,clearDrop,refreshAfterHistory};
}
