import {FONT_OPTIONS,loadBoardFont} from './fonts';
import {compactContextPanel,positionContextPanel,installContextStyles} from './context-position';
import type { BoardState, CommandBus } from './core/commands';
import type { Camera } from './core/camera';
import type { ConnectorShape } from './core/connectors';
import { SHAPE_OPTIONS, nextId, type ShapeWidget, type Style, type Widget } from './core/model';
import {groupSelection,ungroupSelection,selectionRoots,captureSelection,duplicateSnapshot,frameSelection,itemLocked} from './core/groups';
import {shapeIconSvg} from './core/shapes';
import { widgetAABB } from './core/geometry';

interface EditorUIApi {
  state: BoardState;
  bus: CommandBus;
  camera: Camera;
  setTool(tool: string): void;
  getTool(): string;
  setConnectorDefault?(options: {shape: ConnectorShape; arrow: boolean}): void;
  setShape(shape: ShapeWidget['shape']): void;
  getShape(): ShapeWidget['shape'];
  onImage(): void;
  onCrop(): void;
  onResetCrop(): void;
  onStyleDefaults?(type:Widget["type"],patch:Partial<Style>):void;
  onReplaceImage?():void;onFlipImage?(axis:'x'|'y'):void;onDownloadImage?():void;
  onCopyImage?():void;onAddWaypoint?():void;onRemoveWaypoint?():void;
  getGroupScope?():string|null;onExitGroup?():void;
}

export function installEditorUI(api: EditorUIApi) {
  const { state, bus } = api;installContextStyles();
  const css = document.createElement('style');
  css.textContent = `
    .editor-panel{font:13px Inter,'Segoe UI',sans-serif;color:#292823;position:fixed;background:white;border:1px solid #e7e7e5;border-radius:10px;box-shadow:0 3px 14px #19181220;z-index:24}
    .editor-panel button,.editor-panel select,.editor-panel input{font:inherit;color:inherit}
    .editor-panel button{background:transparent;border:0;border-radius:6px;cursor:pointer;padding:8px}
    .editor-panel button:hover{background:#f2f4fc;color:#3859ff}
    .editor-panel button:disabled{color:#bdbdb7;cursor:default}
    .editor-panel button:focus-visible,.editor-panel select:focus-visible,.editor-panel input:focus-visible{outline:2px solid #3859ff;outline-offset:1px}
    .editor-panel[hidden]{display:none!important}
    #shape-picker{left:78px;top:50%;transform:translateY(-50%);width:292px;padding:16px;max-height:calc(100vh - 100px);overflow:auto}
    #shape-picker header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:15px;font-weight:600}
    #shape-picker header button{padding:3px 7px;font-size:18px}
    #shape-picker .shape-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
    #shape-picker .shape-choice{height:70px;padding:8px 3px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;border:1px solid transparent;font-size:10px;line-height:12px}
    #shape-picker .shape-choice[aria-pressed=true]{background:#f2f4fc;border-color:#3859ff;color:#3859ff}
    #shape-picker .shape-choice svg{width:37px;height:31px;flex-shrink:0}
    .editor-footnote{color:#73726c;font-size:11px;line-height:1.5;border-top:1px solid #eee;padding-top:12px;margin:14px 0 0}
    #connector-picker{left:78px;top:50%;transform:translateY(-50%);width:250px;padding:14px}
    #connector-picker header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:15px;font-weight:600}
    #connector-picker .connector-choice{display:flex;align-items:center;gap:12px;width:100%;padding:12px 8px;text-align:left}
    #connector-picker .connector-choice svg{width:37px;height:25px;flex-shrink:0}
    #connector-picker .connector-choice[aria-pressed=true]{background:#f2f4fc;color:#3859ff}
    #selection-properties{top:70px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 110px);padding:5px;display:flex;align-items:center;gap:3px;flex-wrap:wrap;justify-content:center}
    #selection-properties label{display:flex;align-items:center;gap:5px;font-size:11px;color:#73726c;padding:2px 5px}
    #selection-properties input[type=color]{width:26px;height:28px;padding:2px;border:0;background:none;cursor:pointer}
    #selection-properties input[type=number]{width:50px;height:28px;border:1px solid #e7e7e5;border-radius:4px;padding:3px}
    #selection-properties select{max-width:124px;height:29px;border:1px solid #e7e7e5;border-radius:4px;background:white;padding:3px}
    #selection-properties .divider{height:24px;width:1px;background:#e7e7e5;margin:0 3px}
    #selection-properties .swatch{height:21px;width:21px;border:1px solid #0002;padding:0;border-radius:50%;margin:0 1px}
    #selection-properties .selection-count{padding:5px 8px;color:#73726c;font-size:12px}
    #editor-context{width:236px;padding:5px}
    #editor-context button{display:flex;justify-content:space-between;width:100%;text-align:left;padding:10px}
    #editor-context kbd{color:#92928c;font:11px 'Segoe UI',sans-serif}
    #editor-context hr{border:0;border-top:1px solid #e7e7e5;margin:5px}
    #tool-hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);padding:8px 14px;background:#fffdf5ee;border:1px solid #e7e7e5;border-radius:8px;color:#73726c;font:12px 'Segoe UI',sans-serif;pointer-events:none;z-index:14;max-width:60vw;text-align:center}
    #tool-hint[hidden]{display:none}
    @media(max-width:900px){#selection-properties{top:62px;left:82px;right:10px;transform:none;max-width:none}#selection-properties .swatches{display:none}}
  `;
  document.head.append(css);
  const picker = document.createElement('section');
  picker.id = 'shape-picker'; picker.className = 'editor-panel'; picker.hidden = true;
  picker.setAttribute('aria-label', 'Escolher forma');
  picker.innerHTML = `<header>Formas <button data-close aria-label="Fechar formas">×</button></header><div class="shape-grid">${SHAPE_OPTIONS.map(s => `<button class="shape-choice" data-shape="${s.id}" aria-label="${s.label}" title="${s.label}">${shapeIcon(s.id)}<span>${s.label}</span></button>`).join('')}</div><p class="editor-footnote">Escolha uma forma e arraste no board para definir o tamanho. Shift mantém a proporção. Um clique cria no tamanho padrão.</p>`;
  const grid=picker.querySelector('.shape-grid')!;
  const filter=document.createElement('div');filter.style.cssText='display:flex;gap:6px;margin-bottom:12px';
  filter.innerHTML='<input id="shape-search" aria-label="Buscar formas" placeholder="Buscar formas…" style="width:155px;padding:8px;border:1px solid #ddd;border-radius:6px"><select id="shape-category" aria-label="Categoria de formas" style="min-width:0"><option value="">Todas</option><option value="basic">Básicas</option><option value="flowchart">Fluxograma</option></select>';
  grid.before(filter);
  const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function filterShapes(){const q=normalize((filter.querySelector('input') as HTMLInputElement).value),category=(filter.querySelector('select') as HTMLSelectElement).value;const options=SHAPE_OPTIONS.filter(o=>(!category||(o.category??'basic')===category)&&normalize(o.label+' '+o.id+' '+(o.keywords??'')).includes(q));grid.innerHTML=options.map(o=>'<button class="shape-choice" data-shape="'+o.id+'" aria-label="'+o.label+'" title="'+o.label+'">'+shapeIconSvg(o.id)+'<span>'+o.label+'</span></button>').join('')||'<p>Nenhuma forma encontrada.</p>';}
  filter.addEventListener('input',filterShapes);filter.addEventListener('change',e=>{if((e.target as Element).tagName==='SELECT')filterShapes();});filterShapes();
  document.body.append(picker);
  const connectorPicker = document.createElement('section');
  connectorPicker.id='connector-picker'; connectorPicker.className='editor-panel'; connectorPicker.hidden=true;
  connectorPicker.setAttribute('aria-label','Escolher linha ou seta');
  const connectorChoices: Array<{label:string;shape:ConnectorShape;arrow:boolean;path:string}> = [
    {label:'Linha reta sem seta',shape:'straight',arrow:false,path:'M3 22L34 3'},
    {label:'Seta reta',shape:'straight',arrow:true,path:'M3 22L34 3 M25 3H34V12'},
    {label:'Seta em cotovelo',shape:'elbowed',arrow:true,path:'M3 22H18V3H34 M27 0L34 3L27 7'},
    {label:'Seta curva',shape:'curved',arrow:true,path:'M3 22C22 22 15 3 34 3 M27 0L34 3L27 7'},
  ];
  let connectorDefault={shape:'straight' as ConnectorShape,arrow:true};
  connectorPicker.innerHTML='<header>Linhas e setas <button data-close aria-label="Fechar linhas e setas">×</button></header>'+connectorChoices.map((choice,index)=>`<button class="connector-choice" data-connector-choice="${index}" aria-label="${choice.label}"><svg viewBox="0 -2 38 29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${choice.path}"/></svg><span>${choice.label}</span></button>`).join('')+'<p class="editor-footnote">Arraste entre objetos ou clique no início e no fim. Depois, arraste a alça central para ajustar o caminho.</p>';
  document.body.append(connectorPicker);
  const properties = document.createElement('section');
  properties.id = 'selection-properties'; properties.className = 'editor-panel'; properties.hidden = true;
  properties.setAttribute('aria-label', 'Propriedades da seleção');
  document.body.append(properties);
  const context = document.createElement('section');
  context.id = 'editor-context'; context.className = 'editor-panel'; context.hidden = true;
  context.setAttribute('role','menu');
  document.body.append(context);
  const hint = document.createElement('div'); hint.id = 'tool-hint'; document.body.append(hint);
  function finish(){
    const fonts=properties.querySelector<HTMLSelectElement>('[data-field="fontFamily"]');if(fonts){const current=selected()[0]?.style.fontFamily??'Noto Sans';fonts.innerHTML=FONT_OPTIONS.map(f=>'<option value="'+f.family+'" style="font-family:'+f.family+'">'+f.label+'</option>').join('')+(['Arial','Georgia','Times New Roman','Courier New'].some(f=>current.startsWith(f))?'<option value="'+current+'">'+current.split(',')[0]+'</option>':'');fonts.value=current;if(fonts.selectedIndex<0)fonts.value='Noto Sans';}
delete properties.dataset.compacted;compactContextPanel(properties);positionContextPanel(properties,state,api.camera);queueMicrotask(()=>positionContextPanel(properties,state,api.camera));}
  let renderKey = '';let displayedSelection='';let captionsOpen=false;

  const selected = () => [...state.selection].map(id => state.widgets.get(id)).filter((w): w is Widget => !!w);
  const groupIds = () => selectionRoots(state).filter(id=>state.groups.has(id));
  let copiedStyle:Style|null=null;
  function applyStyle(patch: Partial<Style>) {
    const source=selected().find(w=>!w.locked);if(source)api.onStyleDefaults?.(source.type,patch);
    bus.beginTransaction('Formatar seleção');for (const w of selected().filter(w=>!w.locked)) bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{style:{...w.style,...patch}}}});bus.endTransaction();
  }
  function action(name:string){
    const ids=[...state.selection],unlocked=ids.filter(id=>!itemLocked(state,id));
    if(ids.some(id=>itemLocked(state,id))&&!["lock","duplicate","copy-style","copy-image","image","undo","redo","exit-group","download-image"].includes(name))return;
    if(name==='group')groupSelection(state,bus);
    if(name==='ungroup')ungroupSelection(state,bus);
    if(name==='duplicate')duplicateSnapshot(state,bus,captureSelection(state));
    if(name==='delete'){bus.beginTransaction('Excluir seleção');for(const id of unlocked)bus.exec({op:state.connectors.has(id)?'CONNECTOR_REMOVE':state.strokes.has(id)?'STROKE_REMOVE':'WIDGET_REMOVE',payload:id});bus.endTransaction();}
    if(name==='front'||name==='back')bus.exec({op:'WIDGET_REORDER',payload:{ids:unlocked,direction:name}});
    if(name==='lock'){const locked=!ids.every(id=>itemLocked(state,id));bus.beginTransaction(locked?'Bloquear':'Desbloquear');for(const id of ids)bus.exec({op:state.connectors.has(id)?'CONNECTOR_UPDATE':state.strokes.has(id)?'STROKE_UPDATE':'WIDGET_UPDATE',payload:{id,patch:{locked}}});bus.endTransaction();}
    if(name==='clear-highlight')applyStyle({highlightColor:'transparent'});
    if(name==='copy-style')copiedStyle=selected()[0]?structuredClone(selected()[0]!.style):null;
    if(name==='paste-style'&&copiedStyle)applyStyle(copiedStyle);
    if(name==='clear'){bus.beginTransaction('Limpar conteúdo');for(const w of selected().filter(w=>!w.locked))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:w.type==='frame'?{title:''}:{content:''}}});bus.endTransaction();}
    if(name==='frame')frameSelection(state,bus);
    if(name==='copy-image')api.onCopyImage?.();
    if(name==='exit-group')api.onExitGroup?.();
    if(name==='crop')api.onCrop();if(name==='reset-crop')api.onResetCrop();if(name==='replace-image')api.onReplaceImage?.();
    if(name==='flip-x')api.onFlipImage?.('x');if(name==='flip-y')api.onFlipImage?.('y');if(name==='download-image')api.onDownloadImage?.();
    if(name==='image')api.onImage();if(name==='undo')bus.undo();if(name==='redo')bus.redo();
    if(name==='add-waypoint')api.onAddWaypoint?.();if(name==='remove-waypoint')api.onRemoveWaypoint?.();
    if(name==='reset-route')for(const id of unlocked)if(state.connectors.has(id))bus.exec({op:'CONNECTOR_UPDATE',payload:{id,patch:{controlPoint:null,waypoints:null}}});
    if(name==='add-caption')captionsOpen=true;
    if(name==='add-caption')for(const id of unlocked){const c=state.connectors.get(id);if(c)bus.exec({op:'CONNECTOR_UPDATE',payload:{id,patch:{captions:[...(c.captions??[]),'Rótulo']}}});}
    context.hidden=true;renderKey='';refresh();
  }
  function closePanels(){picker.hidden=true;connectorPicker.hidden=true;context.hidden=true;}
  function openShapes(){
    picker.hidden=!picker.hidden;connectorPicker.hidden=true;context.hidden=true;
    for(const b of picker.querySelectorAll<HTMLButtonElement>('[data-shape]')) b.setAttribute('aria-pressed',String(b.dataset.shape===api.getShape()));
  }
  function openConnectors(){
    connectorPicker.hidden=!connectorPicker.hidden;picker.hidden=true;context.hidden=true;
    for(const button of connectorPicker.querySelectorAll<HTMLButtonElement>('[data-connector-choice]')){
      const choice=connectorChoices[Number(button.dataset.connectorChoice)]!;
      button.setAttribute('aria-pressed',String(choice.shape===connectorDefault.shape&&choice.arrow===connectorDefault.arrow));
    }
  }
  connectorPicker.addEventListener('click',e=>{
    const button=(e.target as Element).closest<HTMLButtonElement>('button');
    if(button?.hasAttribute('data-close'))connectorPicker.hidden=true;
    if(button?.dataset.connectorChoice!==undefined){
      const choice=connectorChoices[Number(button.dataset.connectorChoice)]; if(!choice)return;
      connectorDefault={shape:choice.shape,arrow:choice.arrow};api.setConnectorDefault?.(connectorDefault);api.setTool('connector');connectorPicker.hidden=true;refresh();
    }
  });
  picker.addEventListener('click',e=>{
    const button=(e.target as Element).closest<HTMLButtonElement>('button');
    if(button?.hasAttribute('data-close'))picker.hidden=true;
    if(button?.dataset.shape){api.setShape(button.dataset.shape as ShapeWidget['shape']);api.setTool('shape');picker.hidden=true;refresh();}
  });
  properties.addEventListener('click',e=>{
    const b=(e.target as Element).closest<HTMLButtonElement>('button');
    if(b?.dataset.action)action(b.dataset.action);
    if(b?.dataset.fill)applyStyle({fillColor:b.dataset.fill});
  });
  properties.addEventListener('change',async e=>{
    const input=e.target as HTMLInputElement;
    if(input.dataset.image){for(const w of selected().filter(w=>!w.locked))if(w.type==='image'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{[input.dataset.image]:input.dataset.image==='opacity'?Number(input.value)/100:input.value}}});renderKey='';refresh();return;}
    if(input.dataset.captionIndex!==undefined||input.dataset.captionPosition!==undefined){const c=state.connectors.get([...state.selection][0]!);if(!c||c.locked)return;const index=Number(input.dataset.captionIndex??input.dataset.captionPosition);const captions=[...(c.captions??[])],positions=captions.map((_,i)=>c.captionPositions?.[i]??(i+1)/(captions.length+1));if(input.dataset.captionIndex!==undefined)captions[index]=input.value;else positions[index]=Math.max(.02,Math.min(.98,Number(input.value)/100));bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{captions,captionPositions:positions}}});return;}
    const connectorField=input.dataset.connector;
    if(connectorField){
      for(const id of state.selection){const c=state.connectors.get(id);if(!c||c.locked)continue;
        const patch=connectorField==='shape'?{shape:input.value,...(input.value==='straight'?{controlPoint:null,waypoints:null}:{})}:connectorField==='caption'?{captions:[input.value]}:{style:{...c.style,[connectorField]:connectorField==='strokeWidth'?Math.max(1,Number(input.value)||1):input.value}};
        bus.exec({op:'CONNECTOR_UPDATE',payload:{id,patch}});
      }
      renderKey='';refresh();return;
    }
    const field=input.dataset.field;
    if(!field)return;
    if(field==='fontFamily')await loadBoardFont(input.value);
    if(field==='link'){for(const w of selected().filter(w=>!w.locked))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{link:input.value}}});}
    else if(field==='shape'){api.setShape(input.value as ShapeWidget['shape']);for(const w of selected().filter(w=>!w.locked))if(w.type==='shape')bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{shape:input.value}}});}
    else if(['width','height','rotation'].includes(field)) {
      const value=Number(input.value);
      if(Number.isFinite(value))for(const w of selected().filter(w=>!w.locked))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{[field]:field==='rotation'?value*Math.PI/180:Math.max(16,value)}}});
    } else {
      let value: string|number=['fontSize','borderWidth','fillOpacity','borderOpacity','cornerRadius'].includes(field)?Number(input.value):input.value;
      if(typeof value==='number'){
        if(!Number.isFinite(value))return;
        if(field==='fillOpacity')value=Math.max(0,Math.min(1,value));
        if(field==='fontSize')value=Math.max(8,Math.min(200,value));
        if(field==='borderWidth')value=Math.max(0,Math.min(30,value));
      }
      applyStyle({[field]:value});
    }
    renderKey=''; refresh();
  });
  properties.addEventListener('focusout',()=>queueMicrotask(refresh));
  context.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('[data-action]');if(b?.dataset.action)action(b.dataset.action);});
  document.addEventListener('pointerdown',e=>{
    const t=e.target as Element;
    if(!picker.contains(t)&&!t.closest('[data-tool="shape"]'))picker.hidden=true;
    if(!context.contains(t))context.hidden=true;
    if(!connectorPicker.contains(t)&&!t.closest('[data-tool="connector"]'))connectorPicker.hidden=true;
  });
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closePanels();});
  document.querySelector('#app canvas')?.addEventListener('contextmenu',e=>{
    e.preventDefault();
    const event=e as MouseEvent;
    const p=api.camera.screenToWorld({x:event.clientX,y:event.clientY});
    const hit=[...state.order].reverse().map(id=>state.widgets.get(id)).find(w=>{if(!w)return false;const r=widgetAABB(w);return p.x>=r.minX&&p.x<=r.maxX&&p.y>=r.minY&&p.y<=r.maxY;});
    if(hit&&!state.selection.has(hit.id)){
      const members=[...state.groups.values()].find(ids=>ids.includes(hit.id))??[hit.id];
      bus.exec({op:'SELECTION_SET',payload:members});
    }
    const items: Array<[string,string,string?]> = state.selection.size ? [['duplicate','Duplicar','Ctrl+D'],['group','Agrupar','Ctrl+G'],['ungroup','Desagrupar','Ctrl+Shift+G'],['front','Trazer para frente'],['back','Enviar para trás'],['lock','Bloquear / desbloquear'],['copy-style','Copiar estilo'],['paste-style','Colar estilo'],['copy-image','Copiar como imagem'],['frame','Criar quadro'],['clear','Limpar conteúdo'],['delete','Excluir','Del']] : [['image','Inserir imagem'],['undo','Desfazer','Ctrl+Z'],['redo','Refazer','Ctrl+Shift+Z']];
    context.innerHTML=items.map(([a,label,key])=>`<button role="menuitem" data-action="${a}" ${a==='group'&&selected().length<2||a==='ungroup'&&!groupIds().length?'disabled':''}><span>${label}</span><kbd>${key??''}</kbd></button>`).join('');
    context.hidden=false;context.style.left=`${Math.max(8,Math.min(innerWidth-244,event.clientX))}px`;context.style.top=`${Math.max(8,Math.min(innerHeight-context.offsetHeight-8,event.clientY))}px`;
  });
  function refresh(){
    positionContextPanel(properties,state,api.camera);
    const currentTool=api.getTool();
    const labels:Record<string,string>={shape:'Arraste para desenhar a forma · Shift mantém a proporção · Esc cancela',sticky_note:'Clique ou arraste para criar uma nota adesiva',frame:'Arraste para criar um quadro',connector:'Arraste entre objetos ou clique no início e no fim · Arraste a alça central para curvar',text:'Clique para adicionar texto',hand:'Arraste para mover a tela',pen:'Desenhe no board · Esc para selecionar',highlighter:'Realce livremente no board'};
    hint.textContent=labels[currentTool]??'';hint.hidden=!hint.textContent;
    const widgets=selected();
    const allIds=[...state.selection];
    const scope=api.getGroupScope?.();
    const w=widgets[0];
    const connector=[...state.selection].map(id=>state.connectors.get(id)).find(Boolean);
    properties.hidden=(!allIds.length)||['pen','highlighter','eraser'].includes(currentTool);
    if(properties.hidden)return;
    const selectionKey=[...state.selection].join('|');if(selectionKey!==displayedSelection)delete properties.dataset.openMenu;if(selectionKey===displayedSelection&&properties.contains(document.activeElement)&&document.activeElement?.matches('input,select,textarea'))return;displayedSelection=selectionKey;
    if(!w&&connector){
      const key=JSON.stringify(connector);
      if(key===renderKey)return;
      renderKey=key;
      properties.innerHTML=`<span class="selection-count">Conector</span><select aria-label="Tipo de linha" data-connector="shape">${[['straight','Reta'],['elbowed','Cotovelo'],['curved','Curva']].map(([v,l])=>`<option value="${v}" ${connector.shape===v?'selected':''}>${l}</option>`).join('')}</select><label>Cor <input type="color" aria-label="Cor do conector" data-connector="strokeColor" value="${validColor(connector.style.strokeColor,'#1a1a1a')}"></label><label>Traço <input type="number" aria-label="Espessura da linha" data-connector="strokeWidth" min="1" max="30" value="${connector.style.strokeWidth}"></label><select aria-label="Início da linha" data-connector="startCap"><option value="none">Início sem seta</option><option value="arrow" ${connector.style.startCap==='arrow'?'selected':''}>Seta no início</option></select><select aria-label="Fim da linha" data-connector="endCap"><option value="none">Fim sem seta</option><option value="arrow" ${connector.style.endCap==='arrow'?'selected':''}>Seta no fim</option></select><label>Rótulo <input type="text" aria-label="Rótulo do conector" data-connector="caption" style="width:140px;border:1px solid #e7e7e5;border-radius:4px;padding:5px"></label><button data-action="reset-route" title="Restaurar o caminho automático">Restaurar caminho</button><button data-action="delete" title="Excluir conector">×</button>`;
      for(const field of ['startCap','endCap']){const el=properties.querySelector<HTMLSelectElement>('[data-connector="'+field+'"]')!;el.innerHTML=[['none','Sem ponta'],['arrow','Seta aberta'],['triangle','Seta preenchida'],['circle','Círculo'],['diamond','Losango'],['bar','Barra']].map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('');el.value=(field==='startCap'?connector.style.startCap:connector.style.endCap)??'none';}
      properties.querySelector('[data-connector="caption"]')?.closest('label')?.remove();
      const styleSelect=document.createElement('select');styleSelect.dataset.connector='strokeStyle';styleSelect.setAttribute('aria-label','Estilo da linha');styleSelect.innerHTML='<option value="normal">Contínua</option><option value="dashed">Tracejada</option><option value="dotted">Pontilhada</option>';styleSelect.value=connector.style.strokeStyle??'normal';properties.append(styleSelect);
      const labels=document.createElement('details');labels.open=captionsOpen;labels.ontoggle=()=>{captionsOpen=labels.open;};labels.innerHTML='<summary style="padding:8px;cursor:pointer">Rótulos ('+(connector.captions?.length??0)+')</summary>';
      (connector.captions??[]).forEach((caption,i)=>{const row=document.createElement('label'),input=document.createElement('input'),position=document.createElement('input');input.dataset.captionIndex=String(i);input.setAttribute('aria-label','Rótulo '+(i+1));input.value=caption;position.type='number';position.min='2';position.max='98';position.value=String(Math.round((connector.captionPositions?.[i]??(i+1)/((connector.captions?.length??1)+1))*100));position.dataset.captionPosition=String(i);position.setAttribute('aria-label','Posição do rótulo '+(i+1));row.append(input,position);labels.append(row);});
      labels.insertAdjacentHTML('beforeend','<button data-action="add-caption">Adicionar rótulo</button>');properties.append(labels);
      properties.insertAdjacentHTML('beforeend','<button data-action="add-waypoint">Adicionar ponto</button><button data-action="remove-waypoint">Remover ponto</button><button data-action="lock">'+(connector.locked?'Desbloquear':'Bloquear')+'</button>');
      for(const el of properties.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))el.disabled=!!connector.locked;finish();
      return;
    }
    if(!w){properties.innerHTML='<span>'+allIds.length+' objetos</span><button data-action="group">Agrupar</button><button data-action="ungroup">Desagrupar</button><button data-action="duplicate">Duplicar</button><button data-action="lock">Bloquear / desbloquear</button><button data-action="delete">Excluir</button>';finish();return;}
    const key=JSON.stringify([widgets.map(w=>({...w,...(w.type==='image'?{src:undefined}:{})})),groupIds(),scope,allIds]);
    if(key===renderKey)return;
    renderKey=key;
    const btn=(a:string,label:string,title=label)=>`<button data-action="${a}" title="${title}">${label}</button>`;
    const num=(f:string,label:string,value:number,min:number,max=10000)=>`<label>${label}<input type="number" data-field="${f}" aria-label="${label}" value="${Math.round(value)}" min="${min}" max="${max}"></label>`;
    properties.innerHTML=`${scope?btn('exit-group','Sair do grupo'):''}${widgets.some(w=>w.locked)?'<span>🔒 Bloqueado</span>':''}${widgets.length>1?`<span class="selection-count">${widgets.length} objetos</span>`:''}${w.type==='shape'&&widgets.length===1?`<select aria-label="Tipo de forma" data-field="shape">${SHAPE_OPTIONS.map(s=>`<option value="${s.id}" ${w.shape===s.id?'selected':''}>${s.label}</option>`).join('')}</select>`:''}
      ${w.type!=='image'?`<label title="Preenchimento">Cor <input type="color" aria-label="Cor de preenchimento" data-field="fillColor" value="${validColor(w.style.fillColor,'#ffffff')}"></label><label title="Opacidade do preenchimento">Opacidade<input type="number" aria-label="Opacidade do preenchimento" data-field="fillOpacity" min="0" max="1" step="0.1" value="${w.style.fillOpacity}" style="width:48px"></label><span class="swatches">${['#ffffff','#fff9b1','#ffc7d9','#d5f692','#a6c8ff','#d6b6ff'].map(c=>`<button class="swatch" data-fill="${c}" style="background:${c}" title="Preencher com ${c}"></button>`).join('')}</span><label>Borda <input type="color" aria-label="Cor da borda" data-field="borderColor" value="${validColor(w.style.borderColor,'#1a1a1a')}"></label>${num('borderWidth','Traço',w.style.borderWidth,0,30)}<label>Borda α<input aria-label="Opacidade da borda" data-field="borderOpacity" type="number" min="0" max="1" step="0.1" value="${w.style.borderOpacity??1}"></label>${num('cornerRadius','Cantos',w.style.cornerRadius??16,0,1000)}<select data-field="borderStyle" aria-label="Estilo da borda">${[['normal','Contínua'],['dashed','Tracejada'],['dotted','Pontilhada']].map(([v,l])=>`<option value="${v}" ${w.style.borderStyle===v?'selected':''}>${l}</option>`).join('')}</select><span class="divider"></span>${num('fontSize','Texto',w.style.fontSize,8,200)}<select data-field="fontWeight" aria-label="Peso da fonte"><option value="normal">Regular</option><option value="bold" ${w.style.fontWeight==='bold'?'selected':''}>Negrito</option></select><select data-field="fontStyle" aria-label="Estilo da fonte"><option value="normal">Normal</option><option value="italic" ${w.style.fontStyle==='italic'?'selected':''}>Itálico</option></select><select data-field="textDecoration" aria-label="Decoração do texto">${[['none','Sem decoração'],['underline','Sublinhado'],['line-through','Riscado']].map(([v,l])=>`<option value="${v}" ${(w.style.textDecoration??'none')===v?'selected':''}>${l}</option>`).join('')}</select><label>Realce<input data-field="highlightColor" aria-label="Realce do texto" type="color" value="${validColor(w.style.highlightColor??'','#fff9b1')}"></label><button data-action="clear-highlight">Sem realce</button><select aria-label="Fonte do texto" data-field="fontFamily">${[['Arial, Helvetica, sans-serif','Arial'],['Inter, sans-serif','Inter'],['Segoe UI, sans-serif','Segoe UI'],['Georgia, serif','Georgia'],['Times New Roman, serif','Times New Roman'],['Courier New, monospace','Courier New']].map(([v,l])=>`<option value="${v}" ${w.style.fontFamily===v?'selected':''}>${l}</option>`).join('')}</select><label><input type="color" aria-label="Cor do texto" data-field="color" value="${validColor(w.style.color,'#1a1a1a')}"></label><select data-field="textAlign" aria-label="Alinhamento do texto">${[['left','Esquerda'],['center','Centro'],['right','Direita']].map(([v,l])=>`<option value="${v}" ${w.style.textAlign===v?'selected':''}>${l}</option>`).join('')}</select><select data-field="textAlignVertical" aria-label="Alinhamento vertical do texto">${[['top','Topo'],['middle','Meio'],['bottom','Base']].map(([v,l])=>`<option value="${v}" ${w.style.textAlignVertical===v?'selected':''}>${l}</option>`).join('')}</select>`:btn('crop','Recortar')+btn('reset-crop','Restaurar imagem')+btn('replace-image','Substituir')+btn('flip-x','Espelhar ↔')+btn('flip-y','Espelhar ↕')+btn('download-image','Baixar original')+`<select data-image="maskShape" aria-label="Máscara da imagem">${[['rectangle','Retângulo'],['ellipse','Elipse / círculo'],['round_rectangle','Cantos arredondados']].map(([v,l])=>`<option value="${v}" ${w.type==='image'&&(w.maskShape??'rectangle')===v?'selected':''}>${l}</option>`).join('')}</select><label>Opacidade<input data-image="opacity" aria-label="Opacidade da imagem" type="number" min="0" max="100" value="${w.type==='image'?Math.round((w.opacity??1)*100):100}"></label>`}
      ${widgets.length===1?`<span class="divider"></span>${num('width','L',w.width,16)}${num('height','A',w.height,16)}${num('rotation','°',w.rotation*180/Math.PI,-360,360)}`:''}
      ${widgets.length===1?`<label>Link<input data-field="link" aria-label="Link do objeto" type="url" style="width:130px"></label>`:''}<span class="divider"></span>${selectionRoots(state).length>=2?btn('group','Agrupar','Agrupar (Ctrl+G)'):''}${groupIds().length?btn('ungroup','Desagrupar','Desagrupar (Ctrl+Shift+G)'):''}${btn('duplicate','Duplicar','Duplicar (Ctrl+D)')}${btn('front','↑','Trazer para frente')}${btn('back','↓','Enviar para trás')}${btn('lock',allIds.every(id=>itemLocked(state,id))?'Desbloquear':'Bloquear')}${btn('frame','Criar quadro')}<details><summary style="padding:8px;cursor:pointer">Mais</summary><div style="display:flex;flex-wrap:wrap">${btn('copy-style','Copiar estilo')}${btn('paste-style','Colar estilo')}${btn('copy-image','Copiar como imagem')}${btn('clear','Limpar conteúdo')}</div></details>${btn('delete','×','Excluir (Delete)')}`;
    const link=properties.querySelector<HTMLInputElement>('[data-field="link"]');if(link)link.value=w.link??'';
    for(const el of properties.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))el.disabled=!!w.locked;finish();
  }
  refresh();
  return {refresh,openShapes,openConnectors,closePanels};
}

function validColor(color:string,fallback:string){return /^#[0-9a-f]{6}$/i.test(color)?color:fallback;}

function shapeIcon(id:string){
  const polygons:Record<string,string>={triangle:'18,3 34,29 2,29',rhombus:'18,2 35,16 18,30 1,16',hexagon:'9,3 27,3 35,16 27,29 9,29 1,16',parallelogram:'9,3 35,3 27,29 1,29',trapezoid:'10,3 26,3 35,29 1,29',pentagon:'18,2 35,13 29,30 7,30 1,13',octagon:'10,2 26,2 35,10 35,23 26,31 10,31 1,23 1,10',arrow_right:'2,10 22,10 22,2 35,16 22,30 22,22 2,22',star:'18,1 22,11 34,12 25,20 28,31 18,25 8,31 11,20 2,12 14,11'};
  let body=polygons[id]?`<polygon points="${polygons[id]}"/>`:id==='circle'?'<ellipse cx="18" cy="16" rx="16" ry="13"/>':id==='cylinder'?'<path d="M3 8C3 0 33 0 33 8V25C33 33 3 33 3 25Z M3 8C3 16 33 16 33 8"/>':`<rect x="2" y="3" width="32" height="26" rx="${id==='round_rectangle'?7:0}"/>`;
  return `<svg viewBox="0 0 36 33" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${body}</svg>`;
}
