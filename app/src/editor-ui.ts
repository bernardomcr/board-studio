import { FONT_OPTIONS, loadBoardFont } from './fonts';
import { compactContextPanel, positionContextPanel, installContextStyles } from './context-position';
import type { BoardState, CommandBus } from './core/commands';
import type { Camera } from './core/camera';
import type { Connector, ConnectorShape } from './core/connectors';
import { SHAPE_OPTIONS, type ShapeWidget, type Style, type Widget } from './core/model';
import { groupSelection, ungroupSelection, selectionRoots, captureSelection, duplicateSnapshot, frameSelection, itemLocked, memberSelection, arrangementRoots, arrangeSelection, type ArrangeMode } from './core/groups';
import { shapeIconSvg } from './core/shapes';
import { widgetAABB } from './core/geometry';
import { icon } from './icons';

interface EditorUIApi {
  state: BoardState; bus: CommandBus; camera: Camera;
  setTool(tool: string): void; getTool(): string;
  setConnectorDefault?(options: { shape: ConnectorShape; arrow: boolean }): void;
  setShape(shape: ShapeWidget['shape']): void; getShape(): ShapeWidget['shape'];
  onImage(): void; onCrop(): void; onResetCrop(): void;
  onCircleCrop?(): void; onEditText?(): void; onImageActualSize?(): void;
  onStyleDefaults?(type: Widget['type'], patch: Partial<Style>): void;
  onReplaceImage?(): void; onFlipImage?(axis: 'x' | 'y'): void; onDownloadImage?(): void;
  onCopyImage?(): void; onAddWaypoint?(): void; onRemoveWaypoint?(): void;
  getGroupScope?(): string | null; onExitGroup?(): void;
}

const MAIN_SHAPES = ['rectangle', 'round_rectangle', 'circle', 'triangle', 'rhombus'] as const;
const COLORS = [
  ['transparent', 'Transparente'], ['#ffffff', 'Branco'], ['#f1f1f1', 'Cinza claro'], ['#b3b3b3', 'Cinza'], ['#595959', 'Cinza escuro'], ['#1a1a1a', 'Preto'],
  ['#fff9b1', 'Amarelo claro'], ['#f5d128', 'Amarelo'], ['#ff9d48', 'Laranja'], ['#f66060', 'Vermelho'], ['#ffc7d9', 'Rosa claro'], ['#ef73a1', 'Rosa'],
  ['#d5f692', 'Verde claro'], ['#93d275', 'Verde'], ['#a6ccf5', 'Azul claro'], ['#4b83d1', 'Azul'], ['#d6b6ff', 'Lilás'], ['#a77bd4', 'Roxo'],
] as const;
const CAP_OPTIONS = [['none','Sem ponta'],['arrow','Seta aberta'],['triangle','Seta preenchida'],['circle','Círculo'],['diamond','Losango'],['bar','Barra']];
const LINE_STYLES = [['normal','Contínua'],['dashed','Tracejada'],['dotted','Pontilhada']];
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const validColor = (color: string, fallback = '#ffffff') => /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
const separator = '<span class="toolbar-separator" aria-hidden="true"></span>';

export function installEditorUI(api: EditorUIApi) {
  const { state, bus } = api;
  installContextStyles();
  const css = document.createElement('style');
  css.textContent = `
.editor-panel{font:13px Inter,'Segoe UI',sans-serif;color:#292823;position:fixed;background:white;border:1px solid #e7e7e5;border-radius:9px;box-shadow:0 3px 14px #19181220;z-index:24}
.editor-panel button,.editor-panel select,.editor-panel input{font:inherit;color:inherit}.editor-panel button{background:transparent;border:0;border-radius:5px;cursor:pointer;padding:8px}.editor-panel button:hover{background:#f1f3fb;color:#3859ff}.editor-panel button:disabled{opacity:.45;cursor:default}.editor-panel button:focus-visible,.editor-panel summary:focus-visible,.editor-panel select:focus-visible,.editor-panel input:focus-visible{outline:2px solid #3859ff;outline-offset:2px}.editor-panel[hidden]{display:none!important}
#shape-picker{left:78px;top:50%;transform:translateY(-50%);width:276px;max-height:calc(100vh - 100px);overflow:auto;padding:14px;box-sizing:border-box}#shape-picker.expanded{width:326px}#shape-picker header,#connector-picker header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:14px;font-weight:600}#shape-picker header button,#connector-picker header button{display:flex;align-items:center;justify-content:center;padding:4px}#shape-picker .shape-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}#shape-picker .shape-choice{height:68px;padding:6px 3px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;border:1px solid transparent;font-size:10px;line-height:12px}#shape-picker .shape-choice svg{width:36px;height:30px;flex-shrink:0}#shape-picker .shape-choice[aria-pressed=true]{background:#edf1ff;border-color:#3859ff;color:#3859ff}#shape-picker .picker-section{font-size:11px;color:#73726c;margin:13px 0 7px}#shape-picker .picker-more{width:100%;display:flex;gap:8px;justify-content:center;align-items:center;margin-top:12px;border:1px solid #deded9;padding:10px}#shape-picker .shape-filter{display:flex;gap:6px;margin-bottom:12px}#shape-picker .shape-filter input{width:100%;min-width:0;padding:8px;border:1px solid #deded9;border-radius:5px}#shape-picker .shape-filter select{max-width:115px;min-width:0;border:1px solid #deded9;border-radius:5px;background:white;font-size:11px}.editor-footnote{color:#85857f;font-size:11px;line-height:1.5;border-top:1px solid #ededeb;padding-top:10px;margin:12px 0 0}
#connector-picker{left:78px;top:50%;transform:translateY(-50%);width:244px;padding:14px;box-sizing:border-box}#connector-picker .connector-choice{display:flex;align-items:center;gap:12px;width:100%;padding:12px 8px;text-align:left}#connector-picker .connector-choice svg{width:37px;height:25px;flex-shrink:0}#connector-picker .connector-choice[aria-pressed=true]{background:#edf1ff;color:#3859ff}
#editor-context{width:242px;padding:5px}#editor-context button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:9px;font-size:12px}#editor-context kbd{margin-left:auto;color:#92928c;font:10px 'Segoe UI',sans-serif}#editor-context hr{border:0;border-top:1px solid #e7e7e5;margin:5px}
#tool-hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);padding:8px 14px;background:#fffdf5ee;border:1px solid #e7e7e5;border-radius:8px;color:#73726c;font:12px 'Segoe UI',sans-serif;pointer-events:none;z-index:14;max-width:60vw;text-align:center}#tool-hint[hidden]{display:none}
`;
  document.head.append(css);
  const panel = (id: string, label: string) => {
    const el = document.createElement('section'); el.id = id; el.className = 'editor-panel'; el.hidden = true;
    el.setAttribute('aria-label', label); document.body.append(el); return el;
  };
  const picker = panel('shape-picker', 'Escolher forma');
  const connectorPicker = panel('connector-picker', 'Escolher linha ou seta');
  const properties = panel('selection-properties', 'Propriedades da seleção'); properties.setAttribute('role', 'toolbar');
  const context = panel('editor-context', 'Menu do objeto'); context.setAttribute('role', 'menu');
  const hint = document.createElement('div'); hint.id = 'tool-hint'; document.body.append(hint);
  const selected = () => [...state.selection].map(id => state.widgets.get(id)).filter((w): w is Widget => !!w);
  const connectors = () => [...state.selection].map(id => state.connectors.get(id)).filter((c): c is Connector => !!c);
  const groupIds = () => selectionRoots(state).filter(id => state.groups.has(id));
  let renderKey = '', displayedSelection = '', copiedStyle: Style | null = null;
  let pointerInteraction=false,refreshAfterPointer=false,pointerRelease:ReturnType<typeof setTimeout>|undefined;
  const releasePointer=()=>{pointerInteraction=false;if(refreshAfterPointer){refreshAfterPointer=false;refresh();}};
  properties.addEventListener('pointerdown',()=>{if(pointerRelease)clearTimeout(pointerRelease);pointerInteraction=true;},true);
  // Commit a blurred field without replacing the button that is being pressed.
  document.addEventListener('click',releasePointer);
  window.addEventListener('pointerup',()=>{if(pointerInteraction)pointerRelease=setTimeout(releasePointer,120);},true);
  window.addEventListener('pointercancel',releasePointer,true);
  let expandedShapes = false, shapeTargetSelection = false;
  let connectorDefault = { shape: 'straight' as ConnectorShape, arrow: true };
  const connectorChoices: Array<{label:string;shape:ConnectorShape;arrow:boolean;path:string}> = [
    {label:'Linha reta sem seta',shape:'straight',arrow:false,path:'M3 22L34 3'},
    {label:'Seta reta',shape:'straight',arrow:true,path:'M3 22L34 3 M25 3H34V12'},
    {label:'Seta em cotovelo',shape:'elbowed',arrow:true,path:'M3 22H18V3H34 M27 0L34 3L27 7'},
    {label:'Seta curva',shape:'curved',arrow:true,path:'M3 22C22 22 15 3 34 3 M27 0L34 3L27 7'},
  ];
  const lineSymbol = (choice: typeof connectorChoices[number]) => `<svg viewBox="0 -2 38 29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${choice.path}"/></svg>`;
  connectorPicker.innerHTML = `<header>Linhas e setas<button data-close aria-label="Fechar linhas e setas">${icon('close',18)}</button></header>${connectorChoices.map((choice,index) => `<button class="connector-choice" data-connector-choice="${index}" aria-label="${choice.label}">${lineSymbol(choice)}<span>${choice.label}</span></button>`).join('')}<p class="editor-footnote">Arraste entre objetos ou clique no início e no fim. Arraste as alças para ajustar o caminho.</p>`;

  function shapeButtons(options: typeof SHAPE_OPTIONS) {
    return options.map(s => `<button class="shape-choice" data-shape="${s.id}" aria-label="${s.label}" title="${s.label}" aria-pressed="${s.id === (shapeTargetSelection && selected()[0]?.type === 'shape' ? (selected()[0] as ShapeWidget).shape : api.getShape())}">${shapeIconSvg(s.id)}<span>${s.label}</span></button>`).join('');
  }
  function renderShapes() {
    picker.classList.toggle('expanded', expandedShapes);
    picker.innerHTML = `<header>${expandedShapes ? `<button data-shapes-back aria-label="Voltar às formas principais">${icon('arrow-left',18)}</button><span>Todas as formas</span>` : '<span>Formas</span>'}<button data-close aria-label="Fechar formas">${icon('close',18)}</button></header>${expandedShapes ? '<div class="shape-filter"><input aria-label="Buscar formas" id="shape-search" placeholder="Buscar formas…"><select aria-label="Categoria de formas" id="shape-category"><option value="">Todas</option><option value="basic">Básicas</option><option value="flowchart">Fluxograma</option></select></div>' : ''}<div class="shape-grid">${shapeButtons(expandedShapes ? SHAPE_OPTIONS : MAIN_SHAPES.map(id => SHAPE_OPTIONS.find(s => s.id === id)!))}</div>${expandedShapes ? '' : `<div class="picker-section">Linhas e setas</div><div class="shape-grid">${connectorChoices.slice(0,3).map((c,i) => `<button class="shape-choice" data-picker-line="${i}" aria-label="${c.label}">${lineSymbol(c)}<span>${c.label}</span></button>`).join('')}</div><button class="picker-more" data-more-shapes>${icon('plus',16)}Mais formas</button>`}<p class="editor-footnote">${shapeTargetSelection ? 'Escolha uma forma para transformar a seleção.' : 'Escolha e arraste no board para definir o tamanho. Shift mantém a proporção.'}</p>`;
  }
  function filterShapes() {
    const normalize = (v:string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const q=normalize(picker.querySelector<HTMLInputElement>('input')?.value??''), category=picker.querySelector<HTMLSelectElement>('select')?.value;
    const options=SHAPE_OPTIONS.filter(o => (!category || (o.category??'basic')===category) && normalize(`${o.label} ${o.id} ${o.keywords??''}`).includes(q));
    picker.querySelector('.shape-grid')!.innerHTML=shapeButtons(options)||'<p class="empty-message">Nenhuma forma encontrada.</p>';
  }
  function closeMenus() { delete properties.dataset.openMenu; for(const menu of properties.querySelectorAll<HTMLDetailsElement>('details'))menu.open=false; }
  function closePanels() { picker.hidden=true; connectorPicker.hidden=true; context.hidden=true; closeMenus(); }
  function openShapes() {
    const open=picker.hidden; closePanels(); picker.hidden=!open; shapeTargetSelection=false; expandedShapes=false; renderShapes();
  }
  function openConnectors() {
    const open=connectorPicker.hidden; closePanels(); connectorPicker.hidden=!open;
    for(const b of connectorPicker.querySelectorAll<HTMLButtonElement>('[data-connector-choice]')){
      const c=connectorChoices[Number(b.dataset.connectorChoice)]!;b.setAttribute('aria-pressed',String(c.shape===connectorDefault.shape&&c.arrow===connectorDefault.arrow));
    }
  }
  function chooseConnector(index:number) {
    const choice=connectorChoices[index];if(!choice)return;
    connectorDefault={shape:choice.shape,arrow:choice.arrow};api.setConnectorDefault?.(connectorDefault);api.setTool('connector');closePanels();refresh();
  }
  picker.addEventListener('input',filterShapes);
  // Blurring search while pressing a result must not replace that pressed node.
  picker.addEventListener('change',event=>{if((event.target as HTMLElement).tagName==='SELECT')filterShapes();});
  picker.addEventListener('click',event=>{
    const b=(event.target as Element).closest<HTMLButtonElement>('button');if(!b)return;
    if(b.hasAttribute('data-close'))picker.hidden=true;
    if(b.hasAttribute('data-more-shapes')){expandedShapes=true;renderShapes();picker.querySelector<HTMLInputElement>('input')?.focus();}
    if(b.hasAttribute('data-shapes-back')){expandedShapes=false;renderShapes();}
    if(b.dataset.pickerLine!==undefined)chooseConnector(Number(b.dataset.pickerLine));
    if(b.dataset.shape){
      const shape=b.dataset.shape as ShapeWidget['shape'];api.setShape(shape);
      if(shapeTargetSelection){bus.beginTransaction('Mudar forma');for(const w of selected())if(w.type==='shape'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{shape}}});bus.endTransaction();}
      else api.setTool('shape');
      picker.hidden=true;renderKey='';refresh();
    }
  });
  connectorPicker.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLButtonElement>('button');if(b?.hasAttribute('data-close'))connectorPicker.hidden=true;if(b?.dataset.connectorChoice!==undefined)chooseConnector(Number(b.dataset.connectorChoice));});

  function applyStyle(patch: Partial<Style>) {
    const source=selected().find(w=>!w.locked);if(source)api.onStyleDefaults?.(source.type,patch);
    bus.beginTransaction('Formatar seleção');for(const w of selected().filter(w=>!w.locked))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{style:{...w.style,...patch}}}});bus.endTransaction();
  }
  function applyConnector(field:string,value:string|number) {
    bus.beginTransaction('Formatar conector');for(const c of connectors().filter(c=>!c.locked)){
      const patch=field==='shape'?{shape:value,...(value==='straight'?{controlPoint:null,waypoints:null}:{})}:{style:{...c.style,[field]:value}};
      bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch}});
    }bus.endTransaction();
  }
  function applyStroke(field:string,value:string|number) {
    bus.beginTransaction('Formatar traço');for(const id of state.selection){const s=state.strokes.get(id);if(!s||s.locked)continue;
      const average=s.points.reduce((sum,p)=>sum+p.r,0)/Math.max(1,s.points.length);
      bus.exec({op:'STROKE_UPDATE',payload:{id,patch:field==='color'?{color:value}:{points:s.points.map(p=>({...p,r:p.r*Math.max(.1,Number(value))/(Math.max(.05,average)*2)}))}}});
    }bus.endTransaction();
  }
  function action(name:string) {
    const ids=[...state.selection],unlocked=ids.filter(id=>!itemLocked(state,id));
    if(ids.some(id=>itemLocked(state,id))&&!['lock','duplicate','copy-style','copy-image','image','undo','redo','exit-group','download-image'].includes(name))return;
    if(name==='group')groupSelection(state,bus);if(name==='ungroup')ungroupSelection(state,bus);
    if(name==='duplicate')duplicateSnapshot(state,bus,captureSelection(state));
    if(name==='delete'){bus.beginTransaction('Excluir seleção');for(const id of unlocked)bus.exec({op:state.connectors.has(id)?'CONNECTOR_REMOVE':state.strokes.has(id)?'STROKE_REMOVE':'WIDGET_REMOVE',payload:id});bus.endTransaction();}
    if(name==='front'||name==='back')bus.exec({op:'WIDGET_REORDER',payload:{ids:unlocked,direction:name}});
    if(name==='lock'){const locked=!ids.every(id=>itemLocked(state,id));bus.beginTransaction(locked?'Bloquear':'Desbloquear');for(const id of ids)bus.exec({op:state.connectors.has(id)?'CONNECTOR_UPDATE':state.strokes.has(id)?'STROKE_UPDATE':'WIDGET_UPDATE',payload:{id,patch:{locked}}});bus.endTransaction();}
    if(name==='copy-style')copiedStyle=selected()[0]?structuredClone(selected()[0]!.style):null;
    if(name==='paste-style'&&copiedStyle)applyStyle(copiedStyle);
    if(name==='clear'){bus.beginTransaction('Limpar conteúdo');for(const w of selected().filter(w=>!w.locked&&w.type!=='image'))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:w.type==='frame'?{title:''}:{content:''}}});bus.endTransaction();}
    if(name==='frame')frameSelection(state,bus);if(name==='copy-image')api.onCopyImage?.();if(name==='exit-group')api.onExitGroup?.();
    if(name==='crop')api.onCrop();if(name==='circle-crop')(api.onCircleCrop??api.onCrop)();if(name==='reset-crop')api.onResetCrop();if(name==='replace-image')api.onReplaceImage?.();
    if(name==='flip-x')api.onFlipImage?.('x');if(name==='flip-y')api.onFlipImage?.('y');if(name==='download-image')api.onDownloadImage?.();
    if(name==='image-actual-size')api.onImageActualSize?.();
    if(name==='edit-text')api.onEditText?.();
    if(name==='image')api.onImage();if(name==='undo')bus.undo();if(name==='redo')bus.redo();
    if(name==='add-waypoint')api.onAddWaypoint?.();if(name==='remove-waypoint')api.onRemoveWaypoint?.();
    if(name==='reset-route')for(const c of connectors().filter(c=>!c.locked))bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{controlPoint:null,waypoints:null}}});
    if(name==='reverse-connector'){bus.beginTransaction('Inverter direção');for(const c of connectors().filter(c=>!c.locked))bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{start:c.end,end:c.start,style:{...c.style,startCap:c.style.endCap??'none',endCap:c.style.startCap??'none'},waypoints:c.waypoints?[...c.waypoints].reverse():c.waypoints,captionPositions:(c.captions??[]).map((_,i)=>1-(c.captionPositions?.[i]??(i+1)/((c.captions?.length??0)+1)))}}});bus.endTransaction();}
    if(name==='add-caption'){properties.dataset.openMenu='captions';for(const c of connectors().filter(c=>!c.locked)){
      const captions=[...(c.captions??[]),'Rótulo'];const captionPositions=captions.map((_,i)=>c.captionPositions?.[i]??(i+1)/(captions.length+1));
      bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{captions,captionPositions}}});
    }}
    if(name==='more-shapes'){closeMenus();expandedShapes=true;shapeTargetSelection=true;renderShapes();picker.hidden=false;picker.querySelector<HTMLInputElement>('input')?.focus();}
    context.hidden=true;renderKey='';refresh();
  }

  const button=(name:string,label:string,symbol=name,extra='')=>`<button class="toolbar-button" data-action="${name}" title="${label}" aria-label="${label}" ${extra}>${icon(symbol)}</button>`;
  const menuAction=(name:string,label:string,symbol=name,key='',disabled=false)=>`<button class="menu-action" data-action="${name}" aria-label="${escapeHtml(label)}" ${disabled?'disabled':''}>${icon(symbol,17)}<span>${label}</span>${key?`<kbd>${key}</kbd>`:''}</button>`;
  const menu=(id:string,label:string,symbol:string,body:string,wide=false)=>`<details class="property-menu" data-menu="${id}"><summary aria-label="${label}" title="${label}">${symbol}${icon('chevron-down',8).replace('<svg ','<svg class="menu-chevron" ' )}</summary><div class="property-popover${wide?' wide':''}"><p class="popover-title">${label}</p>${body}</div></details>`;
  const options=(values:string[][],current:string)=>values.map(([v,l])=>`<option value="${v}" ${v===current?'selected':''}>${l}</option>`).join('');
  const select=(domain:string,field:string,label:string,values:string[][],value:string)=>`<label>${label}<select aria-label="${label}" data-${domain}="${field}">${options(values,value)}</select></label>`;
  const number=(domain:string,field:string,label:string,value:number,min=0,max=10000,step=1)=>`<label>${label}<input type="number" aria-label="${label}" data-${domain}="${field}" value="${Math.round(value*100)/100}" min="${min}" max="${max}" step="${step}"></label>`;
  const colorSymbol=(value:string)=>`<span class="toolbar-color${value==='transparent'?' transparent':''}" style="background:${escapeHtml(value)}"></span>`;
  function palette(domain:string,field:string,label:string,value:string) {
    return `<div class="color-grid" aria-label="${label}">${COLORS.map(([c,name])=>`<button class="color-swatch${c==='transparent'?' transparent':''}" data-color-domain="${domain}" data-color-field="${field}" data-color="${c}" style="background:${c}" title="${name}" aria-label="${label}: ${name.toLowerCase()}" aria-pressed="${c.toLowerCase()===value.toLowerCase()}">${c===value?icon('check',15):''}</button>`).join('')}</div><label>Cor personalizada<input type="color" aria-label="${label}" data-${domain}="${field}" value="${validColor(value,field==='borderColor'||field==='color'||field==='strokeColor'?'#1a1a1a':'#ffffff')}"></label>`;
  }
  function fillMenu(style:Style) {return menu('fill','Preenchimento',colorSymbol(style.fillColor),palette('field','fillColor','Cor de preenchimento',style.fillColor)+number('field','fillOpacity','Opacidade do preenchimento',style.fillOpacity,0,1,.05));}
  function borderMenu(style:Style,corners=false) {
    return menu('border','Borda',icon('stroke'),palette('field','borderColor','Cor da borda',style.borderColor)+number('field','borderWidth','Espessura da borda',style.borderWidth,0,30,.5)+select('field','borderStyle','Estilo da borda',LINE_STYLES,style.borderStyle)+number('field','borderOpacity','Opacidade da borda',style.borderOpacity??1,0,1,.05)+(corners?number('field','cornerRadius','Cantos arredondados',style.cornerRadius??16,0,1000):''));
  }
  function textMenus(w:Widget) {
    const s=w.style;
    const fontOptions=FONT_OPTIONS.map(f=>[f.family,f.label]);if(!fontOptions.some(([family])=>family===s.fontFamily))fontOptions.push([s.fontFamily,s.fontFamily.split(',')[0]!]);
    const toggle=(field:string,value:string,label:string,symbol:string)=>`<button class="toolbar-button" data-style-toggle="${field}" data-value="${value}" aria-label="${label}" title="${label}" aria-pressed="${String(s[field as keyof Style]===value)}">${icon(symbol)}</button>`;
    const textBody=select('field','textAlign','Alinhamento do texto',[['left','Esquerda'],['center','Centro'],['right','Direita']],s.textAlign)+select('field','textAlignVertical','Alinhamento vertical do texto',[['top','Topo'],['middle','Meio'],['bottom','Base']],s.textAlignVertical)+select('field','textDecoration','Decoração do texto',[['none','Sem decoração'],['underline','Sublinhado'],['line-through','Riscado']],s.textDecoration??'none')+'<hr><p class="popover-title">Realce do texto</p>'+palette('field','highlightColor','Realce do texto',s.highlightColor??'transparent');
    return `<select class="toolbar-font" aria-label="Fonte do texto" data-field="fontFamily">${options(fontOptions,s.fontFamily)}</select><input class="toolbar-fontsize" type="number" data-field="fontSize" aria-label="Texto" title="Tamanho do texto" min="8" max="200" value="${s.fontSize}">${separator}${toggle('fontWeight','bold','Negrito','bold')}${toggle('fontStyle','italic','Itálico','italic')}${menu('text-color','Cor do texto',icon('text-color'),palette('field','color','Cor do texto',s.color))}${menu('text','Texto',icon('align-left'),textBody)}`;
  }
  function shapeMenu(w:ShapeWidget) {
    return menu('shape','Tipo de forma',shapeIconSvg(w.shape),`<div class="compact-shapes">${MAIN_SHAPES.map(id=>`<button data-replace-shape="${id}" aria-label="${SHAPE_OPTIONS.find(s=>s.id===id)!.label}" title="${SHAPE_OPTIONS.find(s=>s.id===id)!.label}">${shapeIconSvg(id)}</button>`).join('')}</div>${select('field','shape','Tipo de forma',SHAPE_OPTIONS.map(s=>[s.id,s.label]),w.shape)}${menuAction('more-shapes','Mais formas','plus')}`);
  }
  function sizeMenu(w:Widget) {
    return menu('size','Tamanho e rotação',icon('size'),number('field','width','Largura',w.width,16)+number('field','height','Altura',w.height,16)+number('field','rotation','Rotação',w.rotation*180/Math.PI,-360,360));
  }
  function arrangeMenu(widgets:Widget[],locked:boolean) {
    const alignments=[['left','Alinhar à esquerda'],['hcenter','Centralizar horizontalmente'],['right','Alinhar à direita'],['top','Alinhar ao topo'],['vcenter','Centralizar verticalmente'],['bottom','Alinhar à base'],['dist-x','Distribuir horizontalmente'],['dist-y','Distribuir verticalmente']];
    const count=arrangementRoots(state,api.getGroupScope?.()).length,allWidgets=widgets.length===state.selection.size;
    return menu('arrange','Organizar',icon('arrange'),(allWidgets?menuAction('front','Trazer para frente','front','',locked)+menuAction('back','Enviar para trás','back','',locked)+'<hr>':'')+(count>1?alignments.map(([mode,label])=>`<button class="menu-action" data-align="${mode}" ${locked||mode!.startsWith('dist')&&count<3?'disabled':''}>${icon('align',17)}${label}</button>`).join('')+'<hr>':'')+menuAction('frame','Criar quadro','frame','',locked));
  }
  function commonMenus(widgets:Widget[]) {
    const ids=[...state.selection],locked=ids.some(id=>itemLocked(state,id)),allLocked=ids.every(id=>itemLocked(state,id)),w=widgets[0];
    const link=w&&ids.length===1?`<hr><label>Link do objeto<input type="url" aria-label="Link do objeto" data-field="link" placeholder="https://" value="${escapeHtml(w.link)}"></label>`:'';
    return `${separator}${selectionRoots(state).length>=2?button('group','Agrupar','group',locked?'disabled':''):''}${groupIds().length?button('ungroup','Desagrupar','ungroup',locked?'disabled':''):''}${widgets.length||ids.length>1?arrangeMenu(widgets,locked):''}${button('lock',allLocked?'Desbloquear':'Bloquear',allLocked?'unlock':'lock')}${menu('more','Mais',icon('more'),menuAction('duplicate','Duplicar','duplicate','Ctrl+D')+menuAction('copy-image','Copiar como imagem','image')+(w?'<hr>'+menuAction('copy-style','Copiar estilo','stroke')+menuAction('paste-style','Colar estilo','fill','',!copiedStyle||locked):'')+(widgets.some(w=>w.type!=='image')?menuAction('clear','Limpar conteúdo','eraser','',locked):'')+link+'<hr>'+menuAction('delete','Excluir','trash','Del',locked))}`;
  }
  function connectorToolbar(c:Connector) {
    const capIcon=(cap:string,start=false)=>{
      const capPath:Record<string,string>={none:'',arrow:'<path d="m13 6 6 6-6 6"/>',triangle:'<path d="m12 6 8 6-8 6z" fill="currentColor"/>',circle:'<circle cx="17" cy="12" r="4" fill="white"/>',diamond:'<path d="m12 12 5-5 5 5-5 5z" fill="white"/>',bar:'<path d="M19 5v14"/>'};
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g${start?' transform="translate(24 0) scale(-1 1)"':''}><path d="M3 12h16"/>${capPath[cap]??''}</g></svg>`;
    };
    const currentLine=connectorChoices.find(choice=>choice.shape===c.shape&&!choice.arrow)??connectorChoices.find(choice=>choice.shape===c.shape)!;
    const stroke=menu('stroke','Traço',lineSymbol(currentLine),select('connector','shape','Tipo de linha',[['straight','Reta'],['elbowed','Cotovelo'],['curved','Curva']],c.shape)+number('connector','strokeWidth','Espessura da linha',c.style.strokeWidth,1,30,.5)+select('connector','strokeStyle','Estilo da linha',LINE_STYLES,c.style.strokeStyle??'normal'));
    const route=menu('route','Caminho',icon('route'),menuAction('add-waypoint','Adicionar ponto','plus')+menuAction('remove-waypoint','Remover ponto','minus','',!(c.waypoints?.length))+menuAction('reset-route','Restaurar caminho','undo'));
    const captions=c.captions??[];
    const labels=menu('captions',`Rótulos (${captions.length})`,icon('label')+`<span class="menu-count">${captions.length}</span>`,captions.length?captions.map((caption,i)=>`<div class="caption-row"><input type="text" aria-label="Rótulo ${i+1}" data-caption-index="${i}" value="${escapeHtml(caption)}"><input type="number" aria-label="Posição do rótulo ${i+1}" data-caption-position="${i}" min="2" max="98" value="${Math.round((c.captionPositions?.[i]??(i+1)/(captions.length+1))*100)}"><button data-remove-caption="${i}" aria-label="Excluir rótulo ${i+1}">${icon('close',15)}</button></div>`).join('')+'<hr>'+menuAction('add-caption','Adicionar rótulo','plus'):'<p class="empty-message">Adicione texto ao longo do conector.</p>'+menuAction('add-caption','Adicionar rótulo','plus'),true);
    return menu('start-cap','Início da linha',capIcon(c.style.startCap??'none',true),select('connector','startCap','Início da linha',CAP_OPTIONS,c.style.startCap??'none'))+button('reverse-connector','Inverter direção','swap')+menu('end-cap','Fim da linha',capIcon(c.style.endCap??'none'),select('connector','endCap','Fim da linha',CAP_OPTIONS,c.style.endCap??'none'))+separator+stroke+menu('line-color','Cor do conector',colorSymbol(c.style.strokeColor),palette('connector','strokeColor','Cor do conector',c.style.strokeColor))+separator+labels+route;
  }

  properties.addEventListener('click',event=>{
    const b=(event.target as Element).closest<HTMLButtonElement>('button');if(!b||b.disabled)return;
    if(b.dataset.action)action(b.dataset.action);
    if(b.dataset.color){const domain=b.dataset.colorDomain!,field=b.dataset.colorField!;if(domain==='field')applyStyle({[field]:b.dataset.color});else if(domain==='connector')applyConnector(field,b.dataset.color);else applyStroke(field,b.dataset.color);renderKey='';refresh();}
    if(b.dataset.styleToggle){const field=b.dataset.styleToggle as keyof Style;applyStyle({[field]:selected()[0]?.style[field]===b.dataset.value?'normal':b.dataset.value});renderKey='';refresh();}
    if(b.dataset.replaceShape){api.setShape(b.dataset.replaceShape as ShapeWidget['shape']);bus.beginTransaction('Mudar forma');for(const w of selected())if(w.type==='shape'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{shape:b.dataset.replaceShape}}});bus.endTransaction();renderKey='';refresh();}
    if(b.dataset.align)arrangeSelection(state,bus,b.dataset.align as ArrangeMode,api.getGroupScope?.());
    if(b.dataset.removeCaption!==undefined){const c=connectors()[0];if(c&&!c.locked){const i=Number(b.dataset.removeCaption),captions=c.captions??[];bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{captions:captions.filter((_,n)=>n!==i),captionPositions:captions.flatMap((_,n)=>n===i?[]:[c.captionPositions?.[n]??(n+1)/(captions.length+1)])}}});renderKey='';refresh();}}
  });
  properties.addEventListener('change',async event=>{
    const input=event.target as HTMLInputElement;
    if(input.disabled)return;
    if(input.dataset.image){bus.beginTransaction('Formatar imagem');for(const w of selected())if(w.type==='image'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{[input.dataset.image]:input.dataset.image==='opacity'?Math.max(0,Math.min(100,Number(input.value)))/100:input.value}}});bus.endTransaction();}
    else if(input.dataset.captionIndex!==undefined||input.dataset.captionPosition!==undefined){const c=connectors()[0];if(!c||c.locked)return;const i=Number(input.dataset.captionIndex??input.dataset.captionPosition),captions=[...(c.captions??[])],captionPositions=captions.map((_,n)=>c.captionPositions?.[n]??(n+1)/(captions.length+1));if(input.dataset.captionIndex!==undefined)captions[i]=input.value;else captionPositions[i]=Math.max(.02,Math.min(.98,Number(input.value)/100));bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{captions,captionPositions}}});}
    else if(input.dataset.connector)applyConnector(input.dataset.connector,input.dataset.connector==='strokeWidth'?Math.max(1,Math.min(30,Number(input.value)||1)):input.value);
    else if(input.dataset.stroke)applyStroke(input.dataset.stroke,input.dataset.stroke==='width'?Math.max(.1,Math.min(60,Number(input.value)||1)):input.value);
    else if(input.dataset.field){
      const field=input.dataset.field;
      if(field==='fontFamily'){const target=[...state.selection].join('|');await loadBoardFont(input.value);if(target!==[...state.selection].join('|'))return;}
      if(field==='link'){for(const w of selected().filter(w=>!w.locked))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{link:input.value}}});}
      else if(field==='shape'){api.setShape(input.value as ShapeWidget['shape']);for(const w of selected())if(w.type==='shape'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{shape:input.value}}});}
      else if(['width','height','rotation'].includes(field)){const value=Number(input.value);if(Number.isFinite(value))for(const w of selected().filter(w=>!w.locked))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{[field]:field==='rotation'?value*Math.PI/180:Math.max(16,value)}}});}
      else{let value:string|number=['fontSize','borderWidth','fillOpacity','borderOpacity','cornerRadius'].includes(field)?Number(input.value):input.value;if(typeof value==='number'){if(!Number.isFinite(value))return;if(field==='fillOpacity'||field==='borderOpacity')value=Math.max(0,Math.min(1,value));if(field==='fontSize')value=Math.max(8,Math.min(200,value));if(field==='borderWidth')value=Math.max(0,Math.min(30,value));if(field==='cornerRadius')value=Math.max(0,value);}applyStyle({[field]:value});}
    }
    renderKey='';refresh();
  });
  properties.addEventListener('focusout',()=>queueMicrotask(refresh));
  context.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLButtonElement>('[data-action]');if(b?.dataset.action&&!b.disabled)action(b.dataset.action);});
  document.addEventListener('pointerdown',event=>{
    const t=event.target as Element;
    if(!picker.contains(t)&&!t.closest('[data-tool="shape"]')&&!t.closest('[data-action="more-shapes"]'))picker.hidden=true;
    if(!context.contains(t))context.hidden=true;
    if(!connectorPicker.contains(t)&&!t.closest('[data-tool="connector"]'))connectorPicker.hidden=true;
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels();});
  document.querySelector('#app canvas')?.addEventListener('contextmenu',event=>{
    event.preventDefault();const e=event as MouseEvent,p=api.camera.screenToWorld({x:e.clientX,y:e.clientY});
    const hit=[...state.order].reverse().map(id=>state.widgets.get(id)).find(w=>{if(!w)return false;const r=widgetAABB(w);return p.x>=r.minX&&p.x<=r.maxX&&p.y>=r.minY&&p.y<=r.maxY;});
    if(hit&&!state.selection.has(hit.id))bus.exec({op:'SELECTION_SET',payload:memberSelection(state,hit.id,api.getGroupScope?.())});
    const locked=[...state.selection].some(id=>itemLocked(state,id));
    const w=selected()[0];
    context.innerHTML=state.selection.size?
      menuAction('duplicate','Duplicar','duplicate','Ctrl+D')+(selectionRoots(state).length>=2?menuAction('group','Agrupar','group','Ctrl+G',locked):'')+(groupIds().length?menuAction('ungroup','Desagrupar','ungroup','Ctrl+Shift+G',locked):'')+'<hr>'+menuAction('front','Trazer para frente','front','',locked)+menuAction('back','Enviar para trás','back','',locked)+menuAction('lock',[...state.selection].every(id=>itemLocked(state,id))?'Desbloquear':'Bloquear','lock')+(w?.type==='image'?'<hr>'+menuAction('crop','Recortar','crop','',locked)+menuAction('circle-crop','Recortar em círculo','crop-circle','',locked):'')+'<hr>'+menuAction('copy-style','Copiar estilo','stroke')+menuAction('paste-style','Colar estilo','fill','',!copiedStyle||locked)+menuAction('copy-image','Copiar como imagem','image')+'<hr>'+menuAction('delete','Excluir','trash','Del',locked):menuAction('image','Inserir imagem','image')+menuAction('undo','Desfazer','undo','Ctrl+Z')+menuAction('redo','Refazer','redo','Ctrl+Shift+Z');
    for(const b of context.querySelectorAll('button'))b.setAttribute('role','menuitem');context.hidden=false;context.style.left=`${Math.max(8,Math.min(innerWidth-250,e.clientX))}px`;context.style.top=`${Math.max(8,Math.min(innerHeight-context.offsetHeight-8,e.clientY))}px`;
  });

  function refresh() {
    if(pointerInteraction){refreshAfterPointer=true;return;}
    positionContextPanel(properties,state,api.camera);
    const currentTool=api.getTool(),labels:Record<string,string>={shape:'Arraste para desenhar a forma · Shift mantém a proporção · Esc cancela',sticky_note:'Clique ou arraste para criar uma nota adesiva',frame:'Arraste para criar um quadro',connector:'Arraste entre objetos ou clique no início e no fim · Arraste as alças para ajustar',text:'Clique para adicionar texto',hand:'Arraste para mover a tela',pen:'Desenhe no board · Esc para selecionar',highlighter:'Realce livremente no board'};
    hint.textContent=labels[currentTool]??'';hint.hidden=!hint.textContent;
    const ids=[...state.selection],selectionKey=ids.join('|'),widgets=selected(),cs=connectors(),strokes=ids.map(id=>state.strokes.get(id)).filter(s=>!!s),scope=api.getGroupScope?.();
    properties.hidden=!ids.length||['hand','pen','highlighter','eraser'].includes(currentTool);
    if(selectionKey!==displayedSelection){closeMenus();displayedSelection=selectionKey;renderKey='';}
    if(properties.hidden)return;
    if(properties.contains(document.activeElement)&&document.activeElement?.matches('input,select,textarea'))return;
    const key=JSON.stringify([widgets.map(w=>({...w,...(w.type==='image'?{src:undefined}:{})})),cs,strokes,[...state.groups],scope,ids,!!copiedStyle]);if(key===renderKey)return;renderKey=key;
    const w=widgets[0],single=ids.length===1,locked=ids.some(id=>itemLocked(state,id)),allWidgets=widgets.length===ids.length,allText=allWidgets&&widgets.every(w=>w.type!=='image');
    let html=scope?button('exit-group','Sair do grupo','arrow-left')+separator:'';
    if(!single)html+=`<span class="selection-count">${groupIds().length===1&&selectionRoots(state).length===1?'Grupo':`${ids.length} objetos`}</span>`;
    if(cs.length===ids.length&&cs[0])html+=connectorToolbar(cs[0]);
    else if(strokes.length===ids.length&&strokes[0]){
      const s=strokes[0],width=s.points.reduce((sum,p)=>sum+p.r*2,0)/Math.max(1,s.points.length);
      html+=menu('stroke','Traço da caneta',icon('pen'),palette('stroke','color','Cor do traço',s.color)+number('stroke','width','Espessura do traço',width,.1,60,.5));
    }else if(w){
      if(single&&w.type==='shape')html+=shapeMenu(w)+separator;
      if(allText){
        html+=textMenus(w)+separator;
        if(widgets.every(w=>w.type!=='text'))html+=fillMenu(w.style);
        if(widgets.every(w=>w.type==='shape'||w.type==='frame'))html+=borderMenu(w.style,widgets.every(w=>w.type==='shape'&&w.shape==='round_rectangle'));
      }
      if(single&&w.type==='image'){
        html+=button('crop','Recortar','crop')+menu('image','Imagem',icon('image'),menuAction('circle-crop','Recortar em círculo','crop-circle')+select('image','maskShape','Máscara da imagem',[['rectangle','Retângulo'],['ellipse','Elipse / círculo'],['round_rectangle','Cantos arredondados']],w.maskShape??'rectangle')+number('image','opacity','Opacidade da imagem',(w.opacity??1)*100,0,100)+'<hr>'+menuAction('replace-image','Substituir imagem','image')+menuAction('flip-x','Espelhar ↔','flip')+menuAction('flip-y','Espelhar ↕','flip')+menuAction('image-actual-size','Tamanho original','size')+menuAction('reset-crop','Restaurar imagem','undo')+menuAction('download-image','Baixar original','download'))+separator+borderMenu(w.style,w.maskShape==='round_rectangle');
      }
      if(single)html+=sizeMenu(w);
    }
    html+=commonMenus(widgets);
    properties.innerHTML=html;
    if(locked){
      for(const el of properties.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))el.disabled=true;
      for(const el of properties.querySelectorAll<HTMLButtonElement>('button'))if(!['lock','duplicate','copy-style','copy-image','download-image','exit-group'].includes(el.dataset.action??''))el.disabled=true;
    }
    compactContextPanel(properties);positionContextPanel(properties,state,api.camera);queueMicrotask(()=>positionContextPanel(properties,state,api.camera));
  }
  refresh();
  return {refresh,openShapes,openConnectors,closePanels};
}
