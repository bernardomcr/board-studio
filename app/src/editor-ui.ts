import { FONT_OPTIONS, loadBoardFont } from './fonts';
import { compactContextPanel, positionContextPanel, installContextStyles } from './context-position';
import type { BoardState, CommandBus, Command } from './core/commands';
import type { Camera } from './core/camera';
import type { Connector, ConnectorShape,ConnectorCaptionStyle } from './core/connectors';
import {appendConnectorCaption,rememberCaptionDefaults} from './core/connector-captions';
import type {ConnectorObjectChoice} from './core/connector-insert';
import { SHAPE_OPTIONS, type ShapeWidget, type Style, type Widget, type TextWidget } from './core/model';
import { groupSelection, ungroupSelection, selectionRoots, captureSelection, duplicateSnapshot, frameSelection, itemLocked, memberSelection, arrangementRoots, arrangeSelection, type ArrangeMode } from './core/groups';
import { shapeIconSvg } from './core/shapes';
import { icon } from './icons';
import { relativeBorderScale,scaledWidgetStyle } from './core/style-scale';
import {checklistFromLines,tableWithGrid} from './core/structured-text';
import {rememberAudioDefaults} from './audio-defaults';
import {sizeRangeMaximum,multipliedSize,formatSize} from './size-controls';
import {installFontPickers} from './font-picker';
import {uiPalette,UI_COLORS} from './ui-palette';
import {isFreeText,naturalText} from './core/text-layout';
import {brandColorRevision} from './brand-colors';
import {connectorDefaults,rememberConnectorDefaults} from './connector-defaults';

interface EditorUIApi {
  state: BoardState; bus: CommandBus; camera: Camera;
  setTool(tool: string): void; getTool(): string;
  setConnectorDefault?(options: { shape: ConnectorShape; arrow: boolean }): void;
  onInsertConnectorObject?(choice:ConnectorObjectChoice):boolean|void;
  onNewConnectorCaption?():void;
  canInsertConnectorObject?(choice?:ConnectorObjectChoice):boolean;
  setShape(shape: ShapeWidget['shape']): void; getShape(): ShapeWidget['shape'];
  onImage(): void; onCrop(): void; onResetCrop(): void;
  onCircleCrop?(): void; onEditText?(): void; onImageActualSize?(): void;
  onStyleDefaults?(type: Widget['type'], patch: Partial<Style>): void;
  onReplaceImage?(): void; onFlipImage?(axis: 'x' | 'y'): void; onDownloadImage?(): void;
  onCopyImage?(): void; onAddWaypoint?(): void; onRemoveWaypoint?(): void;
  onLink?():void;
  onCreateChecklist?():void;onCreateTable?():void;
  setStickyStackMode?(enabled:boolean):void;
  getGroupScope?(): string | null; onExitGroup?(): void;
  entityAt?(point:{x:number;y:number}):string|undefined;
  isTransforming?():boolean;
}

const MAIN_SHAPES = ['rectangle', 'round_rectangle', 'circle', 'triangle', 'rhombus'] as const;
const CAP_OPTIONS = [['none','Sem ponta'],['arrow','Seta aberta'],['triangle','Seta preenchida'],['circle','Círculo'],['diamond','Losango'],['bar','Barra']];
const LINE_STYLES = [['normal','Contínua'],['dashed','Tracejada'],['dotted','Pontilhada']];
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const validColor = (color: string, fallback = '#ffffff') => /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
const separator = '<span class="toolbar-separator" aria-hidden="true"></span>';
type CopiedStyle={kind:'widget';style:Style;imageOpacity?:number}|{kind:'connector';style:Connector['style']}|{kind:'stroke';color:string;opacity:number;width:number};

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
#selection-properties .size-range-actions{display:flex;align-items:center;gap:8px}#selection-properties .size-range-actions button{border:1px solid #e1e5ed;min-width:30px;height:30px;padding:5px;display:grid;place-items:center}#selection-properties .size-range-actions span{flex:1;font-size:11px;color:#7b8290;text-align:center}
#selection-properties .caption-item{padding:5px 0 9px;border-bottom:1px solid #eceef3}#selection-properties .caption-options{display:flex;align-items:center;gap:3px;margin-top:7px}#selection-properties .caption-options button{display:grid;place-items:center;width:29px;height:29px;padding:4px}#selection-properties .caption-options button[aria-pressed=true]{background:#edf1ff;color:#3859ff}#selection-properties .caption-options input[type=number]{width:47px;min-width:0}#selection-properties .caption-options input[type=color]{width:27px;height:27px;padding:1px;border:1px solid #e2e5eb;border-radius:50%}#selection-properties .connector-insert-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}#selection-properties .connector-insert-grid button{height:39px;display:grid;place-items:center;padding:6px}#selection-properties .connector-insert-grid svg{width:25px;height:25px}.connector-insert-note{font-size:11px;line-height:1.4;color:#838896;margin:10px 0 2px}
#shape-picker,#connector-picker{max-width:calc(100vw - 94px);max-height:calc(100dvh - 100px);overflow:auto}
#sticky-picker{width:142px;padding:12px;box-sizing:border-box;max-height:calc(100dvh - 130px);overflow:auto;border-radius:15px;z-index:36}#sticky-picker .sticky-colors{display:grid;grid-template-columns:repeat(2,50px);gap:8px}#sticky-picker .sticky-colors button{padding:0;width:50px;height:50px;border:1px solid #0002;border-radius:0;box-shadow:0 2px 4px #00000012}#sticky-picker .sticky-colors button[aria-pressed=true]{outline:2px solid #4262ff;outline-offset:2px}#sticky-picker .sticky-pad-open{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;width:100%;height:38px;padding:6px;border-radius:9px;background:#f1f2ef;font-weight:600}#sticky-picker.sticky-pad{width:280px;padding:15px 20px 30px}#sticky-picker.sticky-pad header{display:flex;align-items:center;justify-content:space-between;margin:0 -8px}#sticky-picker.sticky-pad h2{font-size:22px;line-height:1.3;font-weight:650;margin:2px 0 26px}#sticky-picker .sticky-pad-preview{display:block;position:relative;width:226px;height:226px;margin:0 auto 10px;padding:0;border:0;border-radius:0;background:var(--sticky-paper);box-shadow:0 16px 0 -1px #b59c35,0 22px 20px #0003;cursor:pointer}#sticky-picker .sticky-pad-preview:hover{transform:translateY(-3px);box-shadow:0 19px 0 -1px #b59c35,0 25px 22px #0003}
`;
  document.head.append(css);
  const panel = (id: string, label: string) => {
    const el = document.createElement('section'); el.id = id; el.className = 'editor-panel'; el.hidden = true;
    el.setAttribute('aria-label', label); document.body.append(el); return el;
  };
  const picker = panel('shape-picker', 'Escolher forma');
  const connectorPicker = panel('connector-picker', 'Escolher linha ou seta');
  const stickyPicker=panel('sticky-picker','Cor da nota adesiva');
  const properties = panel('selection-properties', 'Propriedades da seleção'); properties.setAttribute('role', 'toolbar');
  const context = panel('editor-context', 'Menu do objeto'); context.setAttribute('role', 'menu');
  const hint = document.createElement('div'); hint.id = 'tool-hint'; document.body.append(hint);
  const selected = () => [...state.selection].map(id => state.widgets.get(id)).filter((w): w is Widget => !!w);
  const connectors = () => [...state.selection].map(id => state.connectors.get(id)).filter((c): c is Connector => !!c);
  const groupIds = () => selectionRoots(state).filter(id => state.groups.has(id));
  let renderKey = '', displayedSelection = '', copiedStyle: CopiedStyle | null = null,forceHistoryRefresh=false;
  const strokeWidths=new WeakMap<object,number>();
  const strokeWidth=(points:Array<{r:number}>)=>{let width=strokeWidths.get(points);if(width===undefined){width=points.reduce((sum,p)=>sum+p.r*2,0)/Math.max(1,points.length);strokeWidths.set(points,width);}return width;};
  let pointerInteraction=false,refreshAfterPointer=false,pointerRelease:ReturnType<typeof setTimeout>|undefined;
  const releasePointer=()=>{pointerInteraction=false;if(refreshAfterPointer){refreshAfterPointer=false;refresh();}};
  properties.addEventListener('pointerdown',()=>{if(pointerRelease)clearTimeout(pointerRelease);pointerInteraction=true;},true);
  // Commit a blurred field without replacing the button that is being pressed.
  document.addEventListener('click',releasePointer);
  window.addEventListener('pointerup',()=>{if(pointerInteraction)pointerRelease=setTimeout(releasePointer,120);},true);
  window.addEventListener('pointercancel',releasePointer,true);
  let expandedShapes = false, shapeTargetSelection = false;
  let stickyColor='#fff9b1',stickyPad=false;
  const stickyColors=['#fff9b1','#f5d128','#ffd0aa','#f66060','#ffc7d9','#ef73a1','#a6ccf5','#a77bd4','#6be5d0','#4b83d1','#25b8a2','#93d275','#d5f692','#167d37','#f1f1f1','#1a1a1a'].map(color=>UI_COLORS.find(([value])=>value===color)!);
  function renderStickyPicker(){
    stickyPicker.classList.toggle('sticky-pad',stickyPad);
    stickyPicker.innerHTML=stickyPad?`<header><button data-sticky-back title="Voltar às cores" aria-label="Voltar às cores">${icon('arrow-left',18)}</button><button data-sticky-close aria-label="Fechar notas adesivas">${icon('close',18)}</button></header><h2>Bloco de notas adesivas</h2><button class="sticky-pad-preview" data-sticky-use style="--sticky-paper:${stickyColor}" aria-label="Posicionar bloco de notas" title="Posicionar bloco de notas"></button>`:`<div class="sticky-colors" role="group" aria-label="Cores de notas adesivas">${stickyColors.map(([color,name])=>`<button type="button" data-sticky-color="${color}" aria-label="Nota adesiva: ${name.toLowerCase()}" title="${name}" aria-pressed="${color===stickyColor}" style="background:${color}"></button>`).join('')}</div><button class="sticky-pad-open" data-sticky-pad>${icon('duplicate',18)}Bloco</button>`;
    positionToolPicker(stickyPicker);
  }
  const chooseSticky=(stack=false)=>{api.setStickyStackMode?.(stack);api.onStyleDefaults?.('sticky_note',{fillColor:stickyColor,fillOpacity:1});api.setTool('sticky_note');};
  stickyPicker.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;if(button.dataset.stickyColor){stickyColor=button.dataset.stickyColor;chooseSticky();stickyPicker.hidden=false;renderStickyPicker();}if(button.hasAttribute('data-sticky-pad')){stickyPad=true;renderStickyPicker();}if(button.hasAttribute('data-sticky-back')){stickyPad=false;renderStickyPicker();}if(button.hasAttribute('data-sticky-use')){chooseSticky(true);stickyPicker.hidden=true;}if(button.hasAttribute('data-sticky-close'))stickyPicker.hidden=true;});
  const stickyTool=document.querySelector('[data-tool="sticky_note"]');let openStickyAfterTool=false;
  stickyTool?.addEventListener('click',()=>{openStickyAfterTool=stickyPicker.hidden;api.setStickyStackMode?.(false);},true);
  // Run after the toolbar's tool-switch handler; native event listeners can run
  // a microtask checkpoint between capture and bubble, before setTool closes menus.
  stickyTool?.closest('#toolbar')?.addEventListener('click',event=>{if((event.target as Element).closest('[data-tool="sticky_note"]')!==stickyTool)return;stickyPad=false;stickyPicker.hidden=!openStickyAfterTool;if(openStickyAfterTool)renderStickyPicker();});
  let preserveAspect=true,borderGesture=false,connectorWidthGesture=false,opacityGesture=false,connectorShapeTarget=false;
  const finishThicknessGesture=()=>{if(!borderGesture&&!connectorWidthGesture&&!opacityGesture)return;borderGesture=false;connectorWidthGesture=false;opacityGesture=false;bus.endTransaction();};
  window.addEventListener('pointercancel',finishThicknessGesture,true);
  const connectorChoices: Array<{label:string;shape:ConnectorShape;arrow:boolean;path:string}> = [
    {label:'Linha reta sem seta',shape:'straight',arrow:false,path:'M3 22L34 3'},
    {label:'Seta reta',shape:'straight',arrow:true,path:'M3 22L34 3 M25 3H34V12'},
    {label:'Seta em cotovelo',shape:'elbowed',arrow:true,path:'M3 22H18V3H34 M27 0L34 3L27 7'},
    {label:'Seta curva',shape:'curved',arrow:true,path:'M3 22C22 22 15 3 34 3 M27 0L34 3L27 7'},
  ];
  const lineSymbol = (choice: typeof connectorChoices[number]) => `<svg viewBox="0 -2 38 29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${choice.path}"/></svg>`;
  connectorPicker.innerHTML = `<header>Linhas e setas<button data-close aria-label="Fechar linhas e setas">${icon('close',18)}</button></header>${connectorChoices.map((choice,index) => `<button class="connector-choice" data-connector-choice="${index}" aria-label="${choice.label}">${lineSymbol(choice)}<span>${choice.label}</span></button>`).join('')}<p class="editor-footnote">Arraste entre objetos ou clique no início e no fim. Arraste as alças para ajustar o caminho.</p>`;

  function shapeButtons(options: typeof SHAPE_OPTIONS) {
    return options.map(s => `<button class="shape-choice" data-shape="${s.id}" aria-label="${s.label}" title="${s.label}" aria-pressed="${s.id === (shapeTargetSelection ? selected()[0]?.type==='shape'?(selected()[0] as ShapeWidget).shape:undefined : api.getShape())}">${shapeIconSvg(s.id)}<span>${s.label}</span></button>`).join('');
  }
  function renderShapes() {
    picker.classList.toggle('expanded', expandedShapes);
    picker.innerHTML = `<header>${expandedShapes ? `<button data-shapes-back aria-label="Voltar às formas principais">${icon('arrow-left',18)}</button><span>Todas as formas</span>` : '<span>Formas</span>'}<button data-close aria-label="Fechar formas">${icon('close',18)}</button></header>${expandedShapes ? '<div class="shape-filter"><input aria-label="Buscar formas" id="shape-search" placeholder="Buscar formas…"><select aria-label="Categoria de formas" id="shape-category"><option value="">Todas</option><option value="basic">Básicas</option><option value="flowchart">Fluxograma</option></select></div>' : ''}<div class="shape-grid">${shapeButtons(expandedShapes ? SHAPE_OPTIONS : MAIN_SHAPES.map(id => SHAPE_OPTIONS.find(s => s.id === id)!))}</div>${expandedShapes ? '' : `<div class="picker-section">Linhas e setas</div><div class="shape-grid">${connectorChoices.map((c,i) => `<button class="shape-choice" data-picker-line="${i}" aria-label="${c.label}">${lineSymbol(c)}<span>${c.label}</span></button>`).join('')}</div><button class="picker-more" data-more-shapes>${icon('plus',16)}Mais formas</button>`}<p class="editor-footnote">${shapeTargetSelection ? 'Escolha uma forma para transformar a seleção.' : 'Escolha e arraste no board para definir o tamanho. Shift mantém a proporção.'}</p>`;
  }
  function filterShapes() {
    const normalize = (v:string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const q=normalize(picker.querySelector<HTMLInputElement>('input')?.value??''), category=picker.querySelector<HTMLSelectElement>('select')?.value;
    const options=SHAPE_OPTIONS.filter(o => (!category || (o.category??'basic')===category) && normalize(`${o.label} ${o.id} ${o.keywords??''}`).includes(q));
    picker.querySelector('.shape-grid')!.innerHTML=shapeButtons(options)||'<p class="empty-message">Nenhuma forma encontrada.</p>';
  }
  function closeMenus() {
    finishThicknessGesture();
    const focused=document.activeElement as HTMLElement|null;
    if(focused&&properties.contains(focused)&&focused.matches('input,select,textarea'))focused.closest('details')?.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});
    delete properties.dataset.openMenu;for(const menu of properties.querySelectorAll<HTMLDetailsElement>('details'))menu.open=false;
  }
  function closePanels() {
    if(picker.contains(document.activeElement)||connectorPicker.contains(document.activeElement))document.querySelector<HTMLButtonElement>('[data-tool="select"]')?.focus({preventScroll:true});
    picker.hidden=true;connectorPicker.hidden=true;stickyPicker.hidden=true;context.hidden=true;connectorShapeTarget=false;closeMenus();
  }
  function openShapes() {
    const open=picker.hidden; closePanels(); picker.hidden=!open; shapeTargetSelection=false;connectorShapeTarget=false; expandedShapes=false; renderShapes();
    positionToolPicker(picker);
  }
  function openConnectors() {
    const open=connectorPicker.hidden; closePanels(); connectorPicker.hidden=!open;
    positionToolPicker(connectorPicker);
    const defaults=connectorDefaults();
    for(const b of connectorPicker.querySelectorAll<HTMLButtonElement>('[data-connector-choice]')){
      const c=connectorChoices[Number(b.dataset.connectorChoice)]!;b.setAttribute('aria-pressed',String(c.shape===defaults.shape&&c.arrow===(defaults.style.endCap!=='none')));
    }
  }
  function positionToolPicker(panel:HTMLElement){const toolbar=document.getElementById('toolbar')?.getBoundingClientRect(),button=document.querySelector<HTMLElement>(`[data-tool="${panel===picker?'shape':panel===stickyPicker?'sticky_note':'connector'}"]`)?.getBoundingClientRect();Object.assign(panel.style,{top:`${(toolbar?.bottom??66)+10}px`,transform:'none',maxWidth:`${innerWidth-24}px`,maxHeight:`${Math.max(100,innerHeight-(toolbar?.bottom??66)-28)}px`});panel.style.left=`${Math.max(12,Math.min(innerWidth-panel.offsetWidth-12,button?.left??toolbar?.left??12))}px`;}
  window.addEventListener('resize',()=>{for(const panel of [picker,connectorPicker,stickyPicker])if(!panel.hidden)positionToolPicker(panel);});
  function chooseConnector(index:number) {
    const choice=connectorChoices[index];if(!choice)return;
    const options={shape:choice.shape,arrow:choice.arrow};rememberConnectorDefaults({shape:choice.shape,style:{endCap:choice.arrow?'arrow':'none'}});api.setConnectorDefault?.(options);api.setTool('connector');closePanels();refresh();
  }
  picker.addEventListener('input',filterShapes);
  // Blurring search while pressing a result must not replace that pressed node.
  picker.addEventListener('change',event=>{if((event.target as HTMLElement).tagName==='SELECT')filterShapes();});
  picker.addEventListener('click',event=>{
    const b=(event.target as Element).closest<HTMLButtonElement>('button');if(!b)return;
    if(b.hasAttribute('data-close'))picker.hidden=true;
    if(b.hasAttribute('data-more-shapes')){expandedShapes=true;renderShapes();positionToolPicker(picker);picker.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});}
    if(b.hasAttribute('data-shapes-back')){expandedShapes=false;renderShapes();positionToolPicker(picker);}
    if(b.dataset.pickerLine!==undefined)chooseConnector(Number(b.dataset.pickerLine));
    if(b.dataset.shape){
      const shape=b.dataset.shape as ShapeWidget['shape'];api.setShape(shape);
      if(connectorShapeTarget){if(api.onInsertConnectorObject?.({type:'shape',shape})===false)return;connectorShapeTarget=false;}
      else if(shapeTargetSelection)convertSelectionType('shape',shape);
      else api.setTool('shape');
      picker.hidden=true;renderKey='';refresh();
    }
  });
  connectorPicker.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLButtonElement>('button');if(b?.hasAttribute('data-close'))connectorPicker.hidden=true;if(b?.dataset.connectorChoice!==undefined)chooseConnector(Number(b.dataset.connectorChoice));});

  function applyStyle(patch: Partial<Style>) {
    const source=selected().find(w=>!w.locked);if(source&&!source.audio)api.onStyleDefaults?.(source.type,patch);
    if(selected().some(w=>w.audio&&!w.locked))rememberAudioDefaults(patch);
    const commands:Command[]=selected().filter(w=>!w.locked).map(w=>({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{style:{...w.style,...patch}}}}));
    if(commands.length)bus.exec({op:'BATCH',payload:{label:'Formatar seleção',commands}});
  }
  function convertSelectionType(type:'text'|'shape'|'sticky_note',shape:ShapeWidget['shape']='rectangle',stickyRatio=1){
    stickyRatio=1;
    const node=selected()[0];if(state.selection.size!==1||!node||node.locked||node.type==='frame'||node.type==='image'||node.type==='sticky_note'&&node.stickyPad||node.audio||node.table||node.checklist)return;
    if(type===node.type&&(type==='text'||type==='shape'&&node.type==='shape'&&node.shape===shape||type==='sticky_note'&&Math.abs(node.width/node.height-stickyRatio)<.000001))return;
    const center={x:node.x+node.width/2,y:node.y+node.height/2};let width=node.width,height=node.height;const style={...node.style};
    if(node.type==='text'&&type!=='text'){width+=20;height+=20;if(style.fillColor==='transparent'||style.fillOpacity===0){style.fillColor=type==='sticky_note'?'#fff9b1':'#ffffff';style.fillOpacity=1;}if(type==='shape'&&style.borderWidth===0){style.borderWidth=1;style.borderScale=1/Math.min(width,height);}}
    if(type==='text'){const natural=naturalText({...node,type:'text',content:node.content,style:{...node.style}} as TextWidget);width=natural.width;height=natural.height;}
    else if(type==='sticky_note'){const area=width*height;width=Math.sqrt(area*stickyRatio);height=width/stickyRatio;}
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
    bus.exec({op:'WIDGET_UPDATE',payload:{id:node.id,patch:{type,shape:type==='shape'?shape:type==='sticky_note'?'square':undefined,textSizing:type==='text'?'natural':undefined,width,height,x:center.x-width/2,y:center.y-height/2,style}}});
    if(type==='shape')api.setShape(shape);renderKey='';refresh();
  }
  function setBorderScale(ratio:number,live=false) {
    if(!Number.isFinite(ratio))return;ratio=Math.max(0,ratio);
    const items=selected().filter(w=>!w.locked);
    if(live&&!borderGesture){finishThicknessGesture();bus.beginTransaction('Espessura da borda');borderGesture=true;}
    else if(!live)bus.beginTransaction('Espessura da borda');
    const commands:Command[]=items.map(w=>{const patch={borderScale:ratio,borderWidth:ratio*Math.min(w.width,w.height)};if(w.audio)rememberAudioDefaults(patch);else api.onStyleDefaults?.(w.type,patch);return {op:'WIDGET_UPDATE',payload:{id:w.id,patch:{style:{...w.style,...patch}}}};});
    if(commands.length)bus.exec({op:'BATCH',payload:{label:'Espessura da borda',commands}});
    if(!live)bus.endTransaction();
    const output=properties.querySelector<HTMLOutputElement>('[data-border-output]');if(output)output.textContent=`${formatSize(ratio*100)}%`;
    const slider=properties.querySelector<HTMLInputElement>('[data-border-scale]');slider?.setAttribute('aria-valuetext',`${formatSize(ratio*100)}% do tamanho do objeto`);
    for(const button of properties.querySelectorAll<HTMLButtonElement>('[data-border-preset]'))button.setAttribute('aria-pressed',String(Math.abs(Number(button.dataset.borderPreset)-ratio)<.0001));
  }
  function applyConnector(field:string,value:string|number) {
    if(connectors().some(c=>!c.locked))rememberConnectorDefaults(field==='shape'?{shape:value as ConnectorShape}:{style:{[field]:value}});
    const commands:Command[]=connectors().filter(c=>!c.locked).map(c=>{
      const patch=field==='shape'?{shape:value,...(value==='straight'?{controlPoint:null,waypoints:null}:{})}:{style:{...c.style,[field]:value}};
      return {op:'CONNECTOR_UPDATE',payload:{id:c.id,patch}};
    });if(commands.length)bus.exec({op:'BATCH',payload:{label:'Formatar conector',commands}});
  }
  function updateCaptionStyle(c:Connector,index:number,patch:ConnectorCaptionStyle){
    if(c.locked||!c.captions||index<0||index>=c.captions.length)return;
    const captionStyles=c.captions.map((_,i)=>({...c.captionStyles?.[i],...(i===index?patch:{})}));
    rememberCaptionDefaults(patch);
    bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{captionStyles}}});renderKey='';refresh();
  }
  function setConnectorWidth(width:number,live=false){
    if(!Number.isFinite(width)||width<=0)return;
    if(connectors().some(c=>!c.locked))rememberConnectorDefaults({style:{strokeWidth:width}});
    if(live&&!connectorWidthGesture){finishThicknessGesture();bus.beginTransaction('Espessura do conector');connectorWidthGesture=true;}
    else if(!live)bus.beginTransaction('Espessura do conector');
    const commands:Command[]=connectors().filter(c=>!c.locked).map(c=>({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{style:{...c.style,strokeWidth:width}}}}));
    if(commands.length)bus.exec({op:'BATCH',payload:{label:'Espessura do conector',commands}});
    if(!live)bus.endTransaction();
    const output=properties.querySelector<HTMLOutputElement>('[data-connector-width-output]');if(output)output.textContent=formatSize(width);
    properties.querySelector<HTMLInputElement>('[data-connector-width]')?.setAttribute('aria-valuetext',`${formatSize(width)} unidades`);
  }
  function applyStroke(field:string,value:string|number) {
    const commands:Command[]=[];for(const id of state.selection){const s=state.strokes.get(id);if(!s||s.locked)continue;
      const average=field==='color'||field==='opacity'?0:s.points.reduce((sum,p)=>sum+p.r,0)/Math.max(1,s.points.length);
      commands.push({op:'STROKE_UPDATE',payload:{id,patch:field==='color'?{color:value}:field==='opacity'?{opacity:Math.max(0,Math.min(100,Number(value)))/100}:{points:s.points.map(p=>({...p,r:p.r*Math.max(.5,Number(value))/(Math.max(.05,average)*2)}))}}});
    }if(commands.length)bus.exec({op:'BATCH',payload:{label:'Formatar traço',commands}});
  }
  function setOpacity(input:HTMLInputElement,live:boolean){
    const domain=input.dataset.field?'field':input.dataset.image?'image':'stroke',field=input.dataset.field??input.dataset.image??input.dataset.stroke!,raw=Number(input.value);
    if(!Number.isFinite(raw))return;const value=Math.max(0,Math.min(1,raw/(domain==='field'?1:100))),commands:Command[]=[];
    if(domain==='stroke'){for(const id of state.selection){const stroke=state.strokes.get(id);if(stroke&&!stroke.locked&&(stroke.opacity??(stroke.tool==='highlighter'?.35:1))!==value)commands.push({op:'STROKE_UPDATE',payload:{id,patch:{opacity:value}}});}}
    else for(const w of selected().filter(w=>!w.locked)){
      if(domain==='image'){if(w.type==='image'&&(w.opacity??1)!==value)commands.push({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{opacity:value}}});}
      else if(w.style[field as 'fillOpacity'|'borderOpacity']!==value)commands.push({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{style:{...w.style,[field]:value}}}});
    }
    if(live&&!opacityGesture){finishThicknessGesture();bus.beginTransaction('Opacidade');opacityGesture=true;}
    if(commands.length){if(!live)bus.beginTransaction('Opacidade');bus.exec({op:'BATCH',payload:{label:'Opacidade',commands}});if(!live)bus.endTransaction();}
    if(domain==='field'){const w=selected().find(w=>!w.locked);if(w?.audio)rememberAudioDefaults({[field]:value});else if(w)api.onStyleDefaults?.(w.type,{[field]:value});}
    const output=input.closest('.opacity-control')?.querySelector('output');if(output)output.textContent=`${Math.round(value*100)}%`;
  }
  function canPasteStyle(){return !!copiedStyle&&[...state.selection].some(id=>!itemLocked(state,id)&&(copiedStyle!.kind==='widget'?state.widgets.has(id):copiedStyle!.kind==='connector'?state.connectors.has(id):state.strokes.has(id)));}
  function action(name:string) {
    if(name==='add-link'){api.onLink?.();return;}
    if(name==='create-checklist'){api.onCreateChecklist?.();return;}
    if(name==='create-table'){api.onCreateTable?.();return;}
    const ids=[...state.selection],unlocked=ids.filter(id=>!itemLocked(state,id));
    if(ids.some(id=>itemLocked(state,id))&&!['lock','duplicate','copy-style','copy-image','image','undo','redo','exit-group','download-image'].includes(name))return;
    if(name==='group')groupSelection(state,bus);if(name==='ungroup')ungroupSelection(state,bus);
    if(name==='duplicate')duplicateSnapshot(state,bus,captureSelection(state));
    if(name==='delete'){bus.beginTransaction('Excluir seleção');for(const id of unlocked)bus.exec({op:state.connectors.has(id)?'CONNECTOR_REMOVE':state.strokes.has(id)?'STROKE_REMOVE':'WIDGET_REMOVE',payload:id});bus.endTransaction();}
    if(name==='front'||name==='back')bus.exec({op:'WIDGET_REORDER',payload:{ids:unlocked,direction:name}});
    if(name==='lock'){const locked=!ids.every(id=>itemLocked(state,id));bus.beginTransaction(locked?'Bloquear':'Desbloquear');for(const id of ids)bus.exec({op:state.connectors.has(id)?'CONNECTOR_UPDATE':state.strokes.has(id)?'STROKE_UPDATE':'WIDGET_UPDATE',payload:{id,patch:{locked}}});bus.endTransaction();}
    if(name==='copy-style'&&ids.length===1){const w=selected()[0],c=connectors()[0],s=state.strokes.get(ids[0]!);copiedStyle=w?{kind:'widget',style:structuredClone(w.style),...(w.type==='image'?{imageOpacity:w.opacity??1}:{})}:c?{kind:'connector',style:structuredClone(c.style)}:s?{kind:'stroke',color:s.color,opacity:s.opacity??(s.tool==='highlighter'?.35:1),width:strokeWidth(s.points)}:null;}
    if(name==='paste-style'&&copiedStyle){
      const appearance=copiedStyle,commands:Command[]=[];
      for(const id of unlocked){const w=state.widgets.get(id),c=state.connectors.get(id),s=state.strokes.get(id);
        if(w&&appearance.kind==='widget')commands.push({op:'WIDGET_UPDATE',payload:{id,patch:{style:{borderScale:undefined,borderOpacity:undefined,cornerRadius:undefined,fontWeight:undefined,fontStyle:undefined,textDecoration:undefined,highlightColor:undefined,...structuredClone(appearance.style)},...(w.type==='image'&&appearance.imageOpacity!==undefined?{opacity:appearance.imageOpacity}:{})}}});
        if(c&&appearance.kind==='connector')commands.push({op:'CONNECTOR_UPDATE',payload:{id,patch:{style:{startCap:undefined,endCap:undefined,strokeStyle:undefined,...structuredClone(appearance.style)}}}});
        if(s&&appearance.kind==='stroke'){const factor=appearance.width/Math.max(.000001,strokeWidth(s.points));commands.push({op:'STROKE_UPDATE',payload:{id,patch:{color:appearance.color,opacity:appearance.opacity,points:s.points.map(point=>({...point,r:point.r*factor}))}}});}
      }
      if(commands.length)bus.exec({op:'BATCH',payload:{label:'Colar estilo',commands}});
      if(commands.length&&appearance.kind==='connector')rememberConnectorDefaults({style:appearance.style});
      if(commands.length&&appearance.kind==='widget'&&selected().some(w=>w.audio&&!w.locked))rememberAudioDefaults(appearance.style);
    }
    if(name==='clear'){bus.beginTransaction('Limpar conteúdo');for(const w of selected().filter(w=>!w.locked&&w.type!=='image')){
      const patch=w.type==='frame'?{title:''}:{content:'',...(w.checklist?{checklist:{items:w.checklist.items.map(item=>({...item,text:'',checked:false}))}}:{}),...(w.table?{table:{...tableWithGrid(w.table,w.table.cells.length,w.table.cells[0]!.length,''),cells:w.table.cells.map(row=>row.map(()=>''))}}:{})};
      bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch}});
    }bus.endTransaction();}
    if(name==='frame')frameSelection(state,bus);if(name==='copy-image')api.onCopyImage?.();if(name==='exit-group')api.onExitGroup?.();
    if(name==='crop')api.onCrop();if(name==='circle-crop')(api.onCircleCrop??api.onCrop)();if(name==='reset-crop')api.onResetCrop();if(name==='replace-image')api.onReplaceImage?.();
    if(name==='flip-x')api.onFlipImage?.('x');if(name==='flip-y')api.onFlipImage?.('y');if(name==='download-image')api.onDownloadImage?.();
    if(name==='image-actual-size')api.onImageActualSize?.();
    if(name==='edit-text')api.onEditText?.();
    if(name==='image')api.onImage();if(name==='undo')bus.undo();if(name==='redo')bus.redo();
    if(name==='add-waypoint')api.onAddWaypoint?.();if(name==='remove-waypoint')api.onRemoveWaypoint?.();
    if(name==='reset-route'){
      const commands:Command[]=connectors().filter(c=>!c.locked).map(c=>({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{controlPoint:null,waypoints:null}}}));
      if(commands.length)bus.exec({op:'BATCH',payload:{label:'Restaurar caminho',commands}});
    }
    if(name==='reverse-connector'){bus.beginTransaction('Inverter direção');for(const c of connectors().filter(c=>!c.locked))bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{start:c.end,end:c.start,style:{...c.style,startCap:c.style.endCap??'none',endCap:c.style.startCap??'none'},waypoints:c.waypoints?[...c.waypoints].reverse():c.waypoints,captionPositions:(c.captions??[]).map((_,i)=>1-(c.captionPositions?.[i]??(i+1)/((c.captions?.length??0)+1)))}}});bus.endTransaction();const c=connectors().find(c=>!c.locked);if(c)rememberConnectorDefaults({style:c.style});}
    if(name==='add-caption'){
      if(api.onNewConnectorCaption&&connectors().length===1){closeMenus();api.onNewConnectorCaption();return;}
      properties.dataset.openMenu='captions';
      const commands:Command[]=connectors().filter(c=>!c.locked).map(c=>{
        return {op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:appendConnectorCaption(c)}};
      });
      if(commands.length)bus.exec({op:'BATCH',payload:{label:'Adicionar rótulo',commands}});
    }
    if(name==='more-connector-shapes'){closeMenus();expandedShapes=true;shapeTargetSelection=false;connectorShapeTarget=true;renderShapes();picker.hidden=false;positionToolPicker(picker);picker.querySelector<HTMLInputElement>('input')?.focus();}
    if(name==='more-shapes'){closeMenus();expandedShapes=true;shapeTargetSelection=true;connectorShapeTarget=false;renderShapes();picker.hidden=false;positionToolPicker(picker);picker.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});}
    context.hidden=true;renderKey='';refresh();
  }

  const button=(name:string,label:string,symbol=name,extra='')=>`<button class="toolbar-button" data-action="${name}" title="${label}" aria-label="${label}" ${extra}>${icon(symbol)}</button>`;
  const menuAction=(name:string,label:string,symbol=name,key='',disabled=false)=>`<button class="menu-action" data-action="${name}" aria-label="${escapeHtml(label)}" ${disabled?'disabled':''}>${icon(symbol,17)}<span>${label}</span>${key?`<kbd>${key}</kbd>`:''}</button>`;
  const menu=(id:string,label:string,symbol:string,body:string,wide=false)=>`<details class="property-menu" data-menu="${id}"><summary role="button" aria-label="${label}" title="${label}">${symbol}${id==='size'||id==='arrange'?`<span class="submenu-label">${label}</span>${icon('chevron-right',14).replace('<svg ','<svg class="submenu-arrow" ')}`:icon('chevron-down',8).replace('<svg ','<svg class="menu-chevron" ' )}</summary><div class="property-popover${wide?' wide':''}"><p class="popover-title">${label}</p>${body}</div></details>`;
  const options=(values:string[][],current:string)=>values.map(([v,l])=>`<option value="${escapeHtml(v)}" ${v===current?'selected':''}>${escapeHtml(l)}</option>`).join('');
  const select=(domain:string,field:string,label:string,values:string[][],value:string)=>`<label>${label}<select aria-label="${label}" data-${domain}="${field}">${options(values,value)}</select></label>`;
  const number=(domain:string,field:string,label:string,value:number,min=0,max=Infinity,step=1)=>`<label>${label}<input type="number" aria-label="${label}" data-${domain}="${field}" value="${formatSize(value)}" ${Number.isFinite(min)?`min="${min}"`:''} ${Number.isFinite(max)?`max="${max}"`:''} step="${step}"></label>`;
  const rangeActions=(kind:'border'|'connector')=>`<div class="size-range-actions"><button data-thickness="${kind}" data-factor="0.5" title="Diminuir espessura" aria-label="Diminuir espessura ${kind==='border'?'da borda':'da linha'}">${icon('minus',16)}</button><button data-thickness="${kind}" data-factor="2" title="Aumentar espessura" aria-label="Aumentar espessura ${kind==='border'?'da borda':'da linha'}">${icon('plus',16)}</button></div>`;
  const opacity=(domain:string,field:string,label:string,value:number,max=1)=>`<div class="range-control opacity-control"><label>${icon('opacity',16)}<span>${label}</span><output>${Math.round(value/max*100)}%</output></label><input type="range" min="0" max="${max}" step="${max/100}" aria-label="${label}" data-${domain}="${field}" value="${value}"></div>`;
  const choice=(domain:string,field:string,label:string,values:string[][],value:string,symbol:(value:string)=>string)=>`<div class="icon-choices" role="group" aria-label="${label}">${values.map(([id,name])=>`<button type="button" data-choice-domain="${domain}" data-choice-field="${field}" data-choice="${id}" aria-label="${label}: ${name!.toLowerCase()}" title="${name}" aria-pressed="${id===value}">${symbol(id!)}</button>`).join('')}<select hidden aria-hidden="true" tabindex="-1" data-${domain}="${field}">${options(values,value)}</select></div>`;
  const patternSymbol=(value:string)=>`<svg width="38" height="20" viewBox="0 0 38 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 10h30"${value==='dashed'?' stroke-dasharray="6 5"':value==='dotted'?' stroke-dasharray="1 5"':''}/></svg>`;
  const colorSymbol=(value:string)=>`<span class="toolbar-color${value==='transparent'?' transparent':''}" style="background:${escapeHtml(value)}"></span>`;
  const borderSymbol=(style:Style)=>`<span class="toolbar-border-color${style.borderColor==='transparent'?' transparent':''}" style="--border-color:${validColor(style.borderColor,'#a3aab5')};--border-alpha:${style.borderOpacity??1}"></span>`;
  function palette(domain:string,field:string,label:string,value:string) {
    return uiPalette(domain,field,label,value);
  }
  function fillMenu(style:Style) {return menu('fill','Preenchimento',colorSymbol(style.fillColor),opacity('field','fillOpacity','Opacidade do preenchimento',style.fillOpacity)+palette('field','fillColor','Cor de preenchimento',style.fillColor));}
  function borderMenu(w:Widget,corners=false) {
    const style=w.style,ratio=relativeBorderScale(w),percent=Number(formatSize(ratio*100));
    const presets=[['Sem',0],['Fina',.005],['Média',.02],['Grossa',.05]] as const;
    const scale=`<div class="range-control"><label for="border-scale">Espessura<output data-border-output for="border-scale">${formatSize(percent)}%</output></label><input id="border-scale" type="range" min="0" max="${sizeRangeMaximum(percent,50)}" step="0.05" aria-label="Espessura proporcional da borda" data-border-scale value="${percent}">${rangeActions('border')}<div class="border-presets">${presets.map(([name,value])=>`<button data-border-preset="${value}" title="Borda ${name.toLowerCase()}" aria-label="Borda ${name.toLowerCase()}" aria-pressed="${Math.abs(ratio-value)<.0001}"><span class="border-sample" style="--border-preview:${value===0?0:value<.01?1:value<.04?3:5}px"></span></button>`).join('')}</div></div>`;
    return menu('border','Borda',borderSymbol(style),choice('field','borderStyle','Estilo da borda',LINE_STYLES,style.borderStyle,patternSymbol)+scale+opacity('field','borderOpacity','Opacidade da borda',style.borderOpacity??1)+(corners?number('field','cornerRadius','Cantos arredondados',style.cornerRadius??16):'')+palette('field','borderColor','Cor da borda',style.borderColor));
  }
  function textMenus(w:Widget) {
    const s=w.style;
    const fontOptions=FONT_OPTIONS.map(f=>[f.family,f.label]);if(!fontOptions.some(([family])=>family===s.fontFamily))fontOptions.push([s.fontFamily,s.fontFamily.split(',')[0]!]);
    const toggle=(field:string,value:string,label:string,symbol:string)=>`<button class="toolbar-button" data-style-toggle="${field}" data-value="${value}" aria-label="${label}" title="${label}" aria-pressed="${String(s[field as keyof Style]===value)}">${icon(symbol)}</button>`;
    const compact=`<div class="compact-type-controls">${select('field','fontFamily','Família tipográfica',fontOptions,s.fontFamily)}${number('field','fontSize','Tamanho tipográfico',s.fontSize,1)}</div>`;
    const alignments=choice('field','textAlign','Alinhamento do texto',[['left','Esquerda'],['center','Centro'],['right','Direita']],s.textAlign,v=>icon(v==='left'?'align-left':v==='center'?'align-center':'align-right'))+(w.type==='text'?'':'<hr>'+choice('field','textAlignVertical','Alinhamento vertical do texto',[['top','Topo'],['middle','Meio'],['bottom','Base']],s.textAlignVertical,v=>icon(v==='top'?'align-top':v==='middle'?'align-center-y':'align-bottom')));
    const styles=`<div class="icon-choices type-style-choices">${toggle('fontWeight','bold','Negrito','bold')}${toggle('fontStyle','italic','Itálico','italic')}${toggle('textDecoration','underline','Sublinhado','underline')}${toggle('textDecoration','line-through','Riscado','strike')}</div>`;
    const tasks=selected().every(w=>w.type==='text'||w.type==='shape');
    const content=w.type==='frame'?w.title:w.content,listType=w.checklist?'check':content.split('\n').every(line=>/^\s*•\s/.test(line))?'bullet':content.split('\n').every(line=>/^\s*\d+\.\s/.test(line))?'number':'';
    const lists=`<div class="icon-choices"><button type="button" data-text-list="bullet" aria-label="Lista com marcadores" title="Lista com marcadores" aria-pressed="${listType==='bullet'}">${icon('list')}</button><button type="button" data-text-list="number" aria-label="Lista numerada" title="Lista numerada" aria-pressed="${listType==='number'}">${icon('list-ordered')}</button>${tasks?`<button type="button" data-text-list="check" aria-label="Lista de tarefas" title="Lista de tarefas" aria-pressed="${listType==='check'}">${icon('checklist')}</button>`:''}</div><hr><div class="icon-choices"><button type="button" data-text-list="outdent" aria-label="Diminuir recuo" title="Diminuir recuo">${icon('indent-decrease')}</button><button type="button" data-text-list="indent" aria-label="Aumentar recuo" title="Aumentar recuo">${icon('indent-increase')}</button></div>`;
    const plain=selected().every(w=>!w.table&&!w.audio),free=w.type==='text'&&!w.mind;
    return `<select class="toolbar-font" aria-label="Fonte do texto" data-field="fontFamily">${options(fontOptions,s.fontFamily)}</select><input class="toolbar-fontsize" type="number" data-field="fontSize" aria-label="Texto" title="Tamanho do texto" min="1" value="${formatSize(s.fontSize)}">${separator}${menu('text-style','Estilo do texto',icon('bold'),styles)}${menu('text','Texto',icon(s.textAlign==='left'?'align-left':s.textAlign==='center'?'align-center':'align-right'),compact+alignments+(!free&&plain?'<hr>'+lists:''))}${free&&plain?menu('text-list','Listas e recuos',icon('list'),lists):''}${state.selection.size===1?button('add-link','Adicionar link','link'):''}${menu('text-color','Cor do texto',icon('text-color'),palette('field','color','Cor do texto',s.color))}${menu('text-highlight','Realce do texto',icon('highlighter'),palette('field','highlightColor','Realce do texto',s.highlightColor??'transparent'))}`;
  }
  function shapeMenu(w:Widget) {
    const shapes=[...MAIN_SHAPES,'speech_bubble','parallelogram','star'] as ShapeWidget['shape'][];
    const symbol=w.type==='shape'?shapeIconSvg(w.shape):icon(w.type==='text'?'text':'sticky');
    const sticky=(ratio:number)=>`<svg width="28" height="24" viewBox="0 0 32 28" aria-hidden="true"><rect x="${ratio===1?5:2}" y="4" width="${ratio===1?22:28}" height="20" fill="#fff5a0" stroke="currentColor" stroke-width="1.2"/><path d="M5 21h22" stroke="#d6b844"/></svg>`;
    return menu('shape','Alterar tipo',symbol,`<div class="compact-types icon-choices"><button data-convert-type="text" title="Texto livre" aria-label="Converter em texto livre" aria-pressed="${w.type==='text'}">${icon('text')}</button><button data-convert-type="sticky_note" data-sticky-ratio="1" title="Nota adesiva quadrada" aria-label="Converter em nota adesiva quadrada" aria-pressed="${w.type==='sticky_note'&&Math.abs(w.width/w.height-1)<.01}">${sticky(1)}</button>${shapes.map(id=>`<button data-convert-type="shape" data-convert-shape="${id}" aria-label="Converter em ${SHAPE_OPTIONS.find(s=>s.id===id)!.label.toLowerCase()}" title="${SHAPE_OPTIONS.find(s=>s.id===id)!.label}" aria-pressed="${w.type==='shape'&&w.shape===id}">${shapeIconSvg(id)}</button>`).join('')}</div>${menuAction('more-shapes','Mais formas','plus')}`);
  }
  function sizeMenu(w:Widget) {
    const aspect=isFreeText(w)?'':`<label class="aspect-control"><span>${icon(preserveAspect?'lock':'unlock',16)}Manter proporção</span><input type="checkbox" aria-label="Manter proporção" data-aspect-lock ${preserveAspect?'checked':''}></label>`;
    return menu('size','Tamanho e rotação',icon('size'),`<div class="transform-grid">${number('field','x','Posição X',w.x,-Infinity)}${number('field','y','Posição Y',w.y,-Infinity)}${number('field','width','Largura',w.width,1)}${number('field','height','Altura',w.height,1)}</div>${aspect}<hr>${number('field','rotation','Rotação',w.rotation*180/Math.PI,-Infinity)}${w.type==='text'?'<p class="control-note">Arraste as alças no board para aumentar ou reduzir o texto.</p>':''}`);
  }
  function arrangeMenu(widgets:Widget[],locked:boolean) {
    const alignments=[['left','Alinhar à esquerda','align-left-edge'],['hcenter','Centralizar horizontalmente','align-center-x'],['right','Alinhar à direita','align-right-edge'],['top','Alinhar ao topo','align-top'],['vcenter','Centralizar verticalmente','align-center-y'],['bottom','Alinhar à base','align-bottom'],['dist-x','Distribuir horizontalmente','distribute-x'],['dist-y','Distribuir verticalmente','distribute-y']];
    const count=arrangementRoots(state,api.getGroupScope?.()).length,allWidgets=widgets.length===state.selection.size;
    return menu('arrange','Organizar',icon('arrange'),(allWidgets?`<div class="icon-choices">${button('front','Trazer para frente','front',locked?'disabled':'')}${button('back','Enviar para trás','back',locked?'disabled':'')}</div><hr>`:'')+(count>1?`<div class="icon-choices arrange-choices">${alignments.map(([mode,label,symbol])=>`<button title="${label}" aria-label="${label}" data-align="${mode}" ${locked||mode!.startsWith('dist')&&count<3?'disabled':''}>${icon(symbol!,20)}</button>`).join('')}</div><hr>`:'')+menuAction('frame','Criar quadro','frame','',locked));
  }
  function commonMenus(widgets:Widget[]) {
    const ids=[...state.selection],locked=ids.some(id=>itemLocked(state,id)),allLocked=ids.every(id=>itemLocked(state,id)),w=widgets[0];
    const pad=w?.type==='sticky_note'&&w.stickyPad;
    const link=w&&ids.length===1&&!pad?`<hr><label>Link do objeto<input type="url" aria-label="Link do objeto" data-field="link" placeholder="https://" value="${escapeHtml(w.link)}"></label>`:'';
    const advanced=(widgets.length||ids.length>1?arrangeMenu(widgets,locked):'')+(w&&ids.length===1?sizeMenu(w):'');
    const structured=w&&ids.length===1&&!pad&&(w.type==='text'||w.type==='shape')&&!w.mind&&!w.audio&&!w.checklist?'<hr>'+menuAction('create-table',w.table?'Editar tabela':'Converter em tabela','grid','',locked):'';
    return `${separator}${selectionRoots(state).length>=2?button('group','Agrupar','group',locked?'disabled':''):''}${groupIds().length?button('ungroup','Desagrupar','ungroup',locked?'disabled':''):''}${button('lock',allLocked?'Desbloquear':'Bloquear',allLocked?'unlock':'lock')}${menu('more','Mais',icon('more'),menuAction('duplicate','Duplicar','duplicate','Ctrl+D')+menuAction('copy-image','Copiar como imagem','image')+'<hr>'+advanced+'<hr>'+menuAction('copy-style','Copiar estilo','stroke','',ids.length!==1)+menuAction('paste-style','Colar estilo','fill','',!canPasteStyle()||locked)+structured+(widgets.some(w=>w.type!=='image'&&!(w.type==='sticky_note'&&w.stickyPad))?menuAction('clear','Limpar conteúdo','eraser','',locked):'')+link+'<hr>'+menuAction('delete','Excluir','trash','Del',locked))}`;
  }
  function connectorToolbar(c:Connector) {
    const capIcon=(cap:string,start=false)=>{
      const capPath:Record<string,string>={none:'',arrow:'<path d="m13 6 6 6-6 6"/>',triangle:'<path d="m12 6 8 6-8 6z" fill="currentColor"/>',circle:'<circle cx="17" cy="12" r="4" fill="white"/>',diamond:'<path d="m12 12 5-5 5 5-5 5z" fill="white"/>',bar:'<path d="M19 5v14"/>'};
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g${start?' transform="translate(24 0) scale(-1 1)"':''}><path d="M3 12h16"/>${capPath[cap]??''}</g></svg>`;
    };
    const thickness=`<div class="range-control"><label for="connector-width">Espessura<output data-connector-width-output for="connector-width">${formatSize(c.style.strokeWidth)}</output></label><input id="connector-width" type="range" min="0.1" max="${sizeRangeMaximum(c.style.strokeWidth*2,256)}" step="0.1" aria-label="Espessura da linha" data-connector-width value="${c.style.strokeWidth}">${rangeActions('connector')}</div>`;
    const routeSymbol=(shape:string)=>`<svg width="30" height="24" viewBox="0 0 36 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${shape==='straight'?'M4 23 32 5':shape==='elbowed'?'M4 23h14V5h14':'M4 23C24 23 12 5 32 5'}"/></svg>`;
    const stroke=menu('stroke','Traço',routeSymbol(c.shape),choice('connector','shape','Tipo de linha',[['straight','Reta'],['elbowed','Cotovelo'],['curved','Curva']],c.shape,routeSymbol)+thickness+choice('connector','strokeStyle','Estilo da linha',LINE_STYLES,c.style.strokeStyle??'normal',patternSymbol));
    const route=menu('route','Caminho',icon('route'),`<div class="icon-choices">${button('add-waypoint','Adicionar ponto','plus')}${button('remove-waypoint','Remover ponto','minus',!(c.waypoints?.length)?'disabled':'')}${button('reset-route','Restaurar caminho','undo')}</div>`);
    const captions=c.captions??[];
    const labels=menu('captions',`Rótulos (${captions.length})`,icon('label')+(captions.length?`<span class="menu-count">${captions.length}</span>`:''),captions.length?captions.map((caption,i)=>{
      const s=c.captionStyles?.[i]??{},side=s.side??'center';
      return `<div class="caption-item"><div class="caption-row"><input type="text" aria-label="Rótulo ${i+1}" data-caption-index="${i}" value="${escapeHtml(caption)}"><input type="number" aria-label="Posição do rótulo ${i+1}" title="Posição ao longo da linha (%)" data-caption-position="${i}" min="2" max="98" value="${Math.round((c.captionPositions?.[i]??(i+1)/(captions.length+1))*100)}"><button data-remove-caption="${i}" aria-label="Excluir rótulo ${i+1}">${icon('close',15)}</button></div><div class="caption-options"><button data-caption-follow="${i}" aria-pressed="${!!s.followPath}" title="Seguir a linha" aria-label="Rótulo ${i+1}: seguir a linha">${icon('connector',18)}</button>${(['above','center','below'] as const).map((sideValue,n)=>`<button data-caption-side="${i}" data-value="${sideValue}" aria-pressed="${side===sideValue}" aria-label="Rótulo ${i+1}: ${['acima da linha','no meio da linha','abaixo da linha'][n]}" title="${['Acima','No meio','Abaixo'][n]}">${icon(['align-top','align-center-y','align-bottom'][n]!,17)}</button>`).join('')}<input type="number" min="0.1" step="any" data-caption-font="${i}" aria-label="Tamanho do rótulo ${i+1}" title="Tamanho do texto" value="${formatSize(s.fontSize??14)}"><input type="color" data-caption-color="${i}" aria-label="Cor do rótulo ${i+1}" title="Cor do texto" value="${validColor(s.color??c.style.strokeColor)}"></div></div>`;
    }).join('')+'<hr>'+menuAction('add-caption','Adicionar rótulo','plus'):'<p class="empty-message">Adicione texto ao longo do conector.</p>'+menuAction('add-caption','Adicionar rótulo','plus'),true);
    const insertChoices:Array<ConnectorObjectChoice&{label:string}>=[{type:'text',label:'Texto'},{type:'sticky_note',ratio:1,label:'Nota quadrada'},...(['rectangle','round_rectangle','circle','triangle','rhombus','speech_bubble','parallelogram','star'] as const).map(shape=>({type:'shape' as const,shape,label:SHAPE_OPTIONS.find(s=>s.id===shape)?.label??shape}))];
    const insertion=menu('insert-object','Inserir objeto no conector',icon('shape'),`<div class="connector-insert-grid">${insertChoices.map(choice=>`<button data-connector-insert="${choice.type}" data-shape="${choice.shape??''}" data-ratio="${choice.ratio??1}" aria-label="Inserir ${choice.label.toLowerCase()} no conector" title="${api.canInsertConnectorObject?.(choice)===false?'Aumente o espaço entre os objetos':choice.label}" ${api.canInsertConnectorObject?.(choice)===false?'disabled':''}>${choice.type==='shape'?shapeIconSvg(choice.shape!):icon(choice.type==='text'?'text':'sticky')}</button>`).join('')}</div><hr>${menuAction('more-connector-shapes','Mais formas','plus','',api.canInsertConnectorObject?.()===false)}`);
    return menu('start-cap','Início da linha',capIcon(c.style.startCap??'none',true),choice('connector','startCap','Início da linha',CAP_OPTIONS,c.style.startCap??'none',v=>capIcon(v,true)))+button('reverse-connector','Inverter direção','swap')+menu('end-cap','Fim da linha',capIcon(c.style.endCap??'none'),choice('connector','endCap','Fim da linha',CAP_OPTIONS,c.style.endCap??'none',v=>capIcon(v)))+separator+stroke+menu('line-color','Cor do conector',colorSymbol(c.style.strokeColor),palette('connector','strokeColor','Cor do conector',c.style.strokeColor))+separator+insertion+(api.onNewConnectorCaption?button('add-caption','Adicionar texto ao conector','text'):captions.length?'':labels)+(captions.length?labels:'')+route;
  }

  properties.addEventListener('click',event=>{
    const b=(event.target as Element).closest<HTMLButtonElement>('button');if(!b||b.disabled)return;
    if(b.dataset.connectorInsert){api.onInsertConnectorObject?.({type:b.dataset.connectorInsert as ConnectorObjectChoice['type'],shape:(b.dataset.shape||undefined) as ShapeWidget['shape']|undefined,ratio:Number(b.dataset.ratio)});closeMenus();renderKey='';refresh();return;}
    if(b.dataset.captionFollow!==undefined){const c=connectors()[0],index=Number(b.dataset.captionFollow);if(c)updateCaptionStyle(c,index,{followPath:!c.captionStyles?.[index]?.followPath});return;}
    if(b.dataset.captionSide!==undefined){const c=connectors()[0];if(c)updateCaptionStyle(c,Number(b.dataset.captionSide),{side:b.dataset.value as ConnectorCaptionStyle['side']});return;}
    if(b.dataset.convertType){convertSelectionType(b.dataset.convertType as 'text'|'shape'|'sticky_note',(b.dataset.convertShape??'rectangle') as ShapeWidget['shape'],Number(b.dataset.stickyRatio??1));return;}
    if(b.dataset.choice!==undefined){const select=b.closest('.icon-choices')?.querySelector<HTMLSelectElement>('select');if(select){select.value=b.dataset.choice;select.dispatchEvent(new Event('change',{bubbles:true}));}return;}
    if(b.dataset.textList){
      const kind=b.dataset.textList;bus.beginTransaction('Formatar lista');
      for(const w of selected().filter(w=>!w.locked&&w.type!=='image'&&!w.table&&!w.audio)){
        const content=w.checklist?w.checklist.items.map(item=>item.text).join('\n'):w.type==='frame'?w.title:w.content,lines=content.split('\n'),active=kind==='bullet'?lines.every(line=>/^\s*•\s/.test(line)):kind==='number'?lines.every(line=>/^\s*\d+\.\s/.test(line)):false,counters=new Map<number,number>();
        if(kind==='check'){
          if(w.type!=='text'&&w.type!=='shape')continue;
          if(w.checklist)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{checklist:undefined,content,style:{...w.style}}}});
          else{const checklist=checklistFromLines(content.replace(/^([ \t]*)(?:•\s+|\d+\.\s+)/gm,'$1')),plain=checklist.items.map(item=>item.text).join('\n'),natural=w.type==='text'&&!w.mind?naturalText({...w,content:plain}):null;
            bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{checklist,content:plain,...(natural?{width:natural.width+w.style.fontSize*1.4,height:natural.height}:{}),style:{...w.style}}}});
          }continue;
        }
        const next=lines.map(line=>{
          if(kind==='indent')return `  ${line}`;if(kind==='outdent')return line.replace(/^(?: {1,2}|\t)/,'');
          const plain=line.replace(/^([ \t]*)(?:•\s+|\d+\.\s+)/,'$1');if(active)return plain;
          const indent=plain.match(/^[ \t]*/)?.[0]??'',body=plain.slice(indent.length);
          if(kind==='bullet')return `${indent}• ${body}`;
          const level=indent.length,count=(counters.get(level)??0)+1;counters.set(level,count);for(const key of counters.keys())if(key>level)counters.delete(key);return `${indent}${count}. ${body}`;
        }).join('\n');
        const checklist=w.checklist&&(kind==='indent'||kind==='outdent')?{items:w.checklist.items.map((item,index)=>({...item,text:next.split('\n')[index]??''}))}:undefined;
        bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:w.type==='frame'?{title:next,checklist}:{content:next,checklist,style:{...w.style}}}});
      }
      bus.endTransaction();renderKey='';refresh();return;
    }
    if(b.dataset.action)action(b.dataset.action);
    if(b.dataset.borderPreset!==undefined){setBorderScale(Number(b.dataset.borderPreset));renderKey='';refresh();}
    if(b.dataset.thickness){const factor=Number(b.dataset.factor);if(b.dataset.thickness==='border'){const current=selected()[0];if(current)setBorderScale(multipliedSize(relativeBorderScale(current)||.005,factor));}else{const current=connectors()[0];if(current)setConnectorWidth(multipliedSize(current.style.strokeWidth,factor,.1));}renderKey='';refresh();}
    if(b.dataset.color){const domain=b.dataset.colorDomain!,field=b.dataset.colorField!;if(domain==='field')applyStyle({[field]:b.dataset.color});else if(domain==='connector')applyConnector(field,b.dataset.color);else applyStroke(field,b.dataset.color);renderKey='';refresh();}
    if(b.dataset.styleToggle){const field=b.dataset.styleToggle as keyof Style;applyStyle({[field]:selected()[0]?.style[field]===b.dataset.value?field==='textDecoration'?'none':'normal':b.dataset.value});renderKey='';refresh();}
    if(b.dataset.replaceShape){api.setShape(b.dataset.replaceShape as ShapeWidget['shape']);bus.beginTransaction('Mudar forma');for(const w of selected())if(w.type==='shape'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{shape:b.dataset.replaceShape}}});bus.endTransaction();renderKey='';refresh();}
    if(b.dataset.align)arrangeSelection(state,bus,b.dataset.align as ArrangeMode,api.getGroupScope?.());
    if(b.dataset.removeCaption!==undefined){const c=connectors()[0];if(c&&!c.locked){const i=Number(b.dataset.removeCaption),captions=c.captions??[];bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{captions:captions.filter((_,n)=>n!==i),captionPositions:captions.flatMap((_,n)=>n===i?[]:[c.captionPositions?.[n]??(n+1)/(captions.length+1)]),...(c.captionStyles?{captionStyles:c.captionStyles.filter((_,n)=>n!==i)}:{})}}});renderKey='';refresh();}}
  });
  properties.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.hasAttribute('data-border-scale'))setBorderScale(Number(input.value)/100,true);else if(input.hasAttribute('data-connector-width'))setConnectorWidth(Number(input.value),true);else if(input.closest('.opacity-control'))setOpacity(input,true);});
  properties.addEventListener('change',async event=>{
    const input=event.target as HTMLInputElement;
    if(input.disabled)return;
    if(input.dataset.captionFont!==undefined||input.dataset.captionColor!==undefined){const c=connectors()[0];if(!c)return;const i=Number(input.dataset.captionFont??input.dataset.captionColor);if(input.dataset.captionFont!==undefined){const fontSize=Number(input.value);if(!Number.isFinite(fontSize)||fontSize<=0)return;updateCaptionStyle(c,i,{fontSize});}else updateCaptionStyle(c,i,{color:input.value});return;}
    if(input.closest('.opacity-control')){if(opacityGesture){setOpacity(input,true);finishThicknessGesture();}else setOpacity(input,false);renderKey='';refresh();return;}
    if(input.hasAttribute('data-border-scale')){const ratio=Number(input.value)/100;if(borderGesture)finishThicknessGesture();else if(selected().some(w=>Math.abs(relativeBorderScale(w)-ratio)>1e-12))setBorderScale(ratio);input.max=String(sizeRangeMaximum(ratio*100,50));renderKey='';refresh();return;}
    if(input.hasAttribute('data-connector-width')){const width=Number(input.value);if(connectorWidthGesture)finishThicknessGesture();else if(connectors().some(c=>c.style.strokeWidth!==width))setConnectorWidth(width);input.max=String(sizeRangeMaximum(width*2,256));renderKey='';refresh();return;}
    if(input.hasAttribute('data-aspect-lock')){preserveAspect=input.checked;renderKey='';return;}
    if(input.dataset.image){bus.beginTransaction('Formatar imagem');for(const w of selected())if(w.type==='image'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{[input.dataset.image]:input.dataset.image==='opacity'?Math.max(0,Math.min(100,Number(input.value)))/100:input.value}}});bus.endTransaction();}
    else if(input.dataset.captionIndex!==undefined||input.dataset.captionPosition!==undefined){const c=connectors()[0];if(!c||c.locked)return;const i=Number(input.dataset.captionIndex??input.dataset.captionPosition),captions=[...(c.captions??[])],captionPositions=captions.map((_,n)=>c.captionPositions?.[n]??(n+1)/(captions.length+1));if(input.dataset.captionIndex!==undefined)captions[i]=input.value;else captionPositions[i]=Math.max(.02,Math.min(.98,Number(input.value)/100));bus.exec({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{captions,captionPositions}}});}
    else if(input.dataset.connector){if(input.dataset.connector==='strokeWidth')setConnectorWidth(Number(input.value));else applyConnector(input.dataset.connector,input.value);}
    else if(input.dataset.stroke){const value=input.dataset.stroke==='width'?Math.max(.5,Number(input.value)):input.value;if(typeof value==='number'&&!Number.isFinite(value))return;applyStroke(input.dataset.stroke,value);}
    else if(input.dataset.field){
      const field=input.dataset.field;
      if(field==='fontFamily'){const target=[...state.selection].join('|');await loadBoardFont(input.value);if(!input.isConnected||target!==[...state.selection].join('|'))return;}
      if(field==='link'){for(const w of selected().filter(w=>!w.locked))bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{link:input.value}}});}
      else if(field==='shape'){api.setShape(input.value as ShapeWidget['shape']);for(const w of selected())if(w.type==='shape'&&!w.locked)bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{shape:input.value}}});}
      else if(['x','y','width','height','rotation'].includes(field)){
        const value=Number(input.value);if(!Number.isFinite(value))return;
        bus.beginTransaction('Transformar seleção');
        for(const w of selected().filter(w=>!w.locked)){
          const patch:Partial<Widget>={[field]:field==='rotation'?value*Math.PI/180:field==='width'||field==='height'?Math.max(1,value):value};
          if(preserveAspect&&(field==='width'||field==='height')){const ratio=w.width/w.height;if(field==='width')patch.height=Math.max(1,value)/ratio;else patch.width=Math.max(1,value)*ratio;}
          if(w.type==='sticky_note'&&(field==='width'||field==='height'))patch.width=patch.height=Math.max(.000001,value);
          if((w.table||w.checklist)&&(field==='width'||field==='height'))patch.style=scaledWidgetStyle(w,(patch.width??w.width)/w.width,(patch.height??w.height)/w.height);
          bus.exec({op:'WIDGET_UPDATE',payload:{id:w.id,patch}});
        }bus.endTransaction();
      }
      else{let value:string|number=['fontSize','fillOpacity','borderOpacity','cornerRadius'].includes(field)?Number(input.value):input.value;if(typeof value==='number'){if(!Number.isFinite(value))return;if(field==='fillOpacity'||field==='borderOpacity')value=Math.max(0,Math.min(1,value));if(field==='fontSize')value=Math.max(1,value);if(field==='cornerRadius')value=Math.max(0,value);}applyStyle({[field]:value});}
    }
    // Formatting may already have mounted and focused the replacement font
    // trigger through the command bus. A second rebuild would discard it.
    if(input.dataset.field==='fontFamily'&&!input.isConnected)return;
    renderKey='';refresh();
  });
  properties.addEventListener('focusout',()=>queueMicrotask(refresh));
  context.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLButtonElement>('[data-action]');if(b?.dataset.action&&!b.disabled)action(b.dataset.action);});
  document.addEventListener('pointerdown',event=>{
    const t=event.target as Element;
    if(t.closest('.font-picker-popover,.brand-dialog'))return;
    if(!stickyPicker.contains(t)&&!t.closest('[data-tool="sticky_note"]'))stickyPicker.hidden=true;
    if(!picker.contains(t)&&!t.closest('[data-tool="shape"]')&&!t.closest('[data-action="more-shapes"]'))picker.hidden=true;
    if(!context.contains(t))context.hidden=true;
    if(!connectorPicker.contains(t)&&!t.closest('[data-tool="connector"]'))connectorPicker.hidden=true;
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels();});
  document.querySelector('#app canvas')?.addEventListener('contextmenu',event=>{
    if((event as MouseEvent).altKey){event.preventDefault();return;}
    event.preventDefault();const e=event as MouseEvent,rect=(event.currentTarget as HTMLElement).getBoundingClientRect(),p=api.camera.screenToWorld({x:e.clientX-rect.left,y:e.clientY-rect.top});
    const hit=api.entityAt?.(p);
    if(hit&&!state.selection.has(hit))bus.exec({op:'SELECTION_SET',payload:memberSelection(state,hit,api.getGroupScope?.())});
    const locked=[...state.selection].some(id=>itemLocked(state,id));
    const w=selected()[0];
    context.innerHTML=state.selection.size?
      menuAction('duplicate','Duplicar','duplicate','Ctrl+D')+(selectionRoots(state).length>=2?menuAction('group','Agrupar','group','Ctrl+G',locked):'')+(groupIds().length?menuAction('ungroup','Desagrupar','ungroup','Ctrl+Shift+G',locked):'')+'<hr>'+menuAction('front','Trazer para frente','front','',locked)+menuAction('back','Enviar para trás','back','',locked)+menuAction('lock',[...state.selection].every(id=>itemLocked(state,id))?'Desbloquear':'Bloquear','lock')+(w?.type==='image'?'<hr>'+menuAction('crop','Recortar','crop','',locked)+menuAction('circle-crop','Recortar em círculo','crop-circle','',locked):'')+'<hr>'+menuAction('copy-style','Copiar estilo','stroke','',state.selection.size!==1)+menuAction('paste-style','Colar estilo','fill','',!canPasteStyle()||locked)+menuAction('copy-image','Copiar como imagem','image')+'<hr>'+menuAction('delete','Excluir','trash','Del',locked):menuAction('image','Inserir imagem','image')+menuAction('undo','Desfazer','undo','Ctrl+Z')+menuAction('redo','Refazer','redo','Ctrl+Shift+Z');
    for(const b of context.querySelectorAll('button'))b.setAttribute('role','menuitem');context.hidden=false;context.style.left=`${Math.max(8,Math.min(innerWidth-250,e.clientX))}px`;context.style.top=`${Math.max(8,Math.min(innerHeight-context.offsetHeight-8,e.clientY))}px`;
  });

  function refresh() {
    if(pointerInteraction&&!forceHistoryRefresh){refreshAfterPointer=true;return;}
    positionContextPanel(properties,state,api.camera);
    const currentTool=api.getTool(),labels:Record<string,string>={shape:'Arraste para desenhar a forma · Shift mantém a proporção · Esc cancela',sticky_note:'Clique ou arraste para criar uma nota adesiva',frame:'Arraste para criar um quadro',connector:'Arraste entre objetos ou clique no início e no fim · Arraste as alças para ajustar',text:'Clique para adicionar texto',hand:'Arraste para mover a tela',brush:'Pinte no board · Alt + arraste para ajustar tamanho e opacidade',highlighter:'Realce livremente no board'};
    hint.textContent=labels[currentTool]??'';hint.hidden=!hint.textContent;
    const ids=[...state.selection],selectionKey=ids.join('|'),widgets=selected(),cs=connectors(),strokes=ids.map(id=>state.strokes.get(id)).filter(s=>!!s),scope=api.getGroupScope?.();
    properties.hidden=!ids.length||['hand','brush','highlighter','eraser'].includes(currentTool);
    if(selectionKey!==displayedSelection){closeMenus();displayedSelection=selectionKey;renderKey='';}
    if(properties.hidden)return;
    if(api.isTransforming?.()&&!forceHistoryRefresh)return;
    if(opacityGesture&&!forceHistoryRefresh)return;
    if(!forceHistoryRefresh&&(properties.contains(document.activeElement)&&document.activeElement?.matches('input,select,textarea')||document.activeElement?.closest('.font-picker-popover')))return;
    // Toolbar controls never display media payloads, text bodies or stroke samples.
    const widgetKeys=widgets.map(w=>[w.id,w.type,w.x,w.y,w.width,w.height,w.rotation,w.locked,w.link,w.style,w.type==='shape'?w.shape:undefined,w.type==='image'?w.maskShape:undefined,w.type==='image'?w.opacity:undefined,!!w.checklist,!!w.table]);
    const connectorKeys=cs.map(c=>[c.id,c.locked,c.shape,c.style,c.captions,c.captionPositions,c.captionStyles,c.start,c.end,c.waypoints?.length??0]);
    const strokeKeys=strokes.map(s=>[s.id,s.locked,s.color,s.opacity,s.tool,strokes.length===ids.length?strokeWidth(s.points):undefined]);
    const key=JSON.stringify([widgetKeys,connectorKeys,strokeKeys,selectionRoots(state),groupIds(),arrangementRoots(state,scope).length,scope,ids,!!copiedStyle,brandColorRevision()]);if(key===renderKey)return;renderKey=key;
    const w=widgets[0],single=ids.length===1,locked=ids.some(id=>itemLocked(state,id)),allWidgets=widgets.length===ids.length,allText=allWidgets&&widgets.every(w=>w.type!=='image');
    let html=scope?button('exit-group','Sair do grupo','arrow-left')+separator:'';
    if(!single)html+=`<span class="selection-count">${groupIds().length===1&&selectionRoots(state).length===1?'Grupo':`${ids.length} objetos`}</span>`;
    if(cs.length===ids.length&&cs[0])html+=connectorToolbar(cs[0]);
    else if(strokes.length===ids.length&&strokes[0]){
      const s=strokes[0],width=strokeWidth(s.points);
      html+=menu('stroke','Traço do pincel',icon('brush'),opacity('stroke','opacity','Opacidade do traço',(s.opacity??(s.tool==='highlighter'?.35:1))*100,100)+palette('stroke','color','Cor do traço',s.color)+number('stroke','width','Espessura do traço',width,.5,Infinity,.5));
    }else if(w){
      if(single&&w.type!=='frame'&&w.type!=='image'&&!(w.type==='sticky_note'&&w.stickyPad)&&!w.audio&&!w.table&&!w.checklist)html+=shapeMenu(w)+separator;
      if(allText){
        if(!widgets.every(w=>w.type==='sticky_note'&&w.stickyPad))html+=(widgets.every(w=>w.audio)?menu('audio-ink','Cor do player',icon('audio'),palette('field','color','Cor do player',w.style.color)):textMenus(w))+separator;
        if(widgets.every(w=>w.type==='shape'||w.type==='frame'))html+=borderMenu(w,widgets.every(w=>w.type==='shape'&&w.shape==='round_rectangle'));
        html+=fillMenu(w.style);
      }
      if(single&&w.type==='image'){
        const opacityIcon=icon('opacity');
        html+=button('download-image','Baixar original','download')+button('crop','Recortar','crop')+separator+menu('image-opacity','Opacidade da imagem',opacityIcon,opacity('image','opacity','Opacidade da imagem',(w.opacity??1)*100,100))+borderMenu(w,true);
      }
    }
    html+=commonMenus(widgets);
    properties.innerHTML=html;installFontPickers(properties);
    if(locked){
      for(const el of properties.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))el.disabled=true;
      for(const el of properties.querySelectorAll<HTMLButtonElement>('button'))if(!['lock','duplicate','copy-style','copy-image','download-image','exit-group'].includes(el.dataset.action??''))el.disabled=true;
    }
    compactContextPanel(properties);positionContextPanel(properties,state,api.camera);queueMicrotask(()=>positionContextPanel(properties,state,api.camera));
  }
  function refreshAfterHistory(){
    const active=document.activeElement instanceof HTMLInputElement&&properties.contains(document.activeElement)&&document.activeElement.type==='range'?document.activeElement:null,label=active?.getAttribute('aria-label');
    finishThicknessGesture();pointerInteraction=false;refreshAfterPointer=false;if(pointerRelease)clearTimeout(pointerRelease);renderKey='';forceHistoryRefresh=true;
    try{refresh();}finally{forceHistoryRefresh=false;}
    if(label)[...properties.querySelectorAll<HTMLInputElement>('input[type="range"]')].find(input=>input.getAttribute('aria-label')===label)?.focus({preventScroll:true});
  }
  refresh();
  window.addEventListener('board-brand-colors-changed',()=>{renderKey='';refresh();});
  return {refresh,openShapes,openConnectors,closePanels,finalizePropertyGestures:finishThicknessGesture,refreshAfterHistory};
}
