import { Application, Container, Graphics } from "pixi.js";
import { Camera } from "./core/camera";
import {PanMomentum} from './core/pan-momentum';
import {resizeCursor,ROTATE_CURSOR} from './core/cursors';
import {paintBoardGrid} from './render/grid-paint';
import { gridStateAt, snapPoint, type GridState } from "./core/grid";
import { CommandBus, type AlignMode, type BoardState, type Command } from "./core/commands";
import { nextId, createWidget, STICKY_COLORS, type Widget, type WidgetType, type Style, type ShapeWidget } from "./core/model";
import {
  handleWorld,
  pointInWidget,
  rectIntersectsWidget,
  resizeWidget,
  unionRect,
  widgetAABB,
  widgetCenter,
  worldToLocal,
  rotate,
  widgetCorners,
  type HandleId,
  type Rect,
  type Vec,
} from "./core/geometry";
import { snapMove, type Guide } from "./core/snapping";
import {visibleFrames,framePointVisible,pointInVisibleWidget} from './core/frame-visibility';
import {
  connectorEditPoints,connectorInsertWaypoint,connectorPointAt,connectorClosestFraction,
  connectorMidpoint,
  resolveEndpoint,
  connectorBounds,
  connectorGeometry,
  distanceToConnector,
  facingAnchor,
  nearestAnchor,
  type Connector,
  type ConnectorShape,
  type Endpoint,
} from "./core/connectors";
import { distanceToStroke, strokeBounds, type Stroke, type StrokePoint } from "./core/strokes";
import { fromHtml, toHtml } from "./core/richtext";
import { boardToSvg } from "./core/exportSvg";
import { BoardScene } from "./render/scene";
import { paintConnector } from "./render/connector-paint";

import { installImages } from "./images";
import { installEditorUI } from "./editor-ui";
import { installConnectorCompletion } from "./connector-completion";
import {installBoardHome} from "./board-home";
import {ensureFonts,loadBoardFont,embedSvgFonts} from "./fonts";
import {installIcons} from "./icons";
import {positionContextPanel} from "./context-position";
import {readStoredBoard,writeStoredBoard} from "./core/board-storage";
import { installProjectFiles } from "./project-files";
import {groupLeaves,memberSelection,enclosingGroup,groupSelection,ungroupSelection,captureSelection,duplicateSnapshot,transformSnapshot,selectedBounds,itemLocked,type EntitySnapshot} from "./core/groups";
import {eraseStrokeArea,strokeIntersectsEraser} from "./core/eraser";
import { installDrawingUI, type DrawingSettings } from "./drawing-ui";
import {installBrushPreview,installBrushCursor} from './brush-preview';
import {isClipboardEditor} from './clipboard-images';
import {creationWidgetAt,installCreationPreview} from './render/creation-preview';
import {installZoomUI} from './zoom-ui';
import { installBackground } from "./background";
import { DEFAULT_BACKGROUND, validateBoardBackground, type BoardBackground } from "./core/background";
import {naturalText,resizeFreeText,textFontScale,isFreeText,effectiveTextFontSize,boxTextInsets,fitBoxText,isBoxText} from './core/text-layout';
import {snapshotUserFonts,restoreUserFonts,type UserFont} from './user-fonts';
import {boundedSvgBitmap} from './render/svg-bitmap';
import {installLayers} from './layers';
import {migrateFrameCommands,migrateFrameSnapshots} from './core/layer-migration';
import {installMindmapUI} from './mindmap-ui';
import {mindNodeHidden,mindConnectorHidden,mindLayoutCommands,deleteMindSubtree,attachMindWidget} from './core/mindmap';
import {installLinkUI} from './link-ui';
import {installAudio} from './audio';
import {installStructuredTextUI} from './structured-text-ui';

await ensureFonts();
const host = document.getElementById("app")!;
const hud = document.getElementById("hud")!;
const toolbar = document.getElementById("toolbar") as HTMLElement;

const app = new Application();
await app.init({
  resizeTo: host,
  antialias: true,
  background: "#fbfaf7",
  resolution: Math.min(window.devicePixelRatio || 1, 3),
  autoDensity: true,
});
host.appendChild(app.canvas);

const camera = new Camera();
const momentum=new PanMomentum();
window.addEventListener('pointerdown',()=>momentum.stop(),true);
window.addEventListener('keydown',()=>momentum.stop(),true);
window.addEventListener('blur',()=>momentum.stop());
document.addEventListener('visibilitychange',()=>{if(document.hidden)momentum.stop();});
const world = new Container();
const gridLayer = new Graphics();
const overlay = new Graphics();

app.stage.addChild(gridLayer, world, overlay);
const brushPreview=installBrushPreview(app.stage,camera);

const STORAGE_KEY = "board-app:v1";
let home:ReturnType<typeof installBoardHome>|undefined;
let boardEpoch=0;
const mediaBoardKey=()=>{if(home?.transitioning())return null;const id=home?.currentId();return id?`${id}:${boardEpoch}`:null;};
const storageKey=()=>home?.currentKey()??STORAGE_KEY;

interface SavedBoard {
  userFonts?:UserFont[];
  layerOrderVersion?:1;
  background?: BoardBackground;
  savedAt?:number;
  title?:string;
  widgets: unknown[];
  order: string[];
  connectors: unknown[];
  connectorOrder: string[];
  strokes: unknown[];
  strokeOrder: string[];
  groups: Array<[string, string[]]>;
  journal?: { applied: Command[]; undone: Command[] };
  camera: { x: number; y: number; scale: number };
}

function loadBoard(stored?:SavedBoard): boolean {
  try {
    const raw = stored ? null : localStorage.getItem(STORAGE_KEY);
    if (!stored&&!raw) return false;
    const data = stored ?? JSON.parse(raw!) as SavedBoard;
    boardEpoch++;
    state.widgets.clear();state.order=[];state.connectors.clear();state.connectorOrder=[];state.strokes.clear();state.strokeOrder=[];state.groups.clear();state.selection.clear();
    state.background={...DEFAULT_BACKGROUND};
    if(data.title)document.getElementById("board-title")!.textContent=data.title;

    // journal reconstroi estado E pilhas de undo/redo
    if (data.journal && Array.isArray(data.journal.applied)) {
      const frames=new Set((data.widgets as Widget[]).filter(w=>w.type==='frame').map(w=>w.id));
      bus.restore(data.layerOrderVersion===1?data.journal.applied:migrateFrameCommands(data.journal.applied,frames),data.layerOrderVersion===1?(data.journal.undone??[]):migrateFrameCommands(data.journal.undone??[],frames));
      state.background=validateBoardBackground(data.background)??state.background;
      if (data.camera) {
        camera.x = data.camera.x;
        camera.y = data.camera.y;
        camera.scale = data.camera.scale;
      }
      return true;
    }

    for (const w of data.layerOrderVersion===1?data.widgets as Widget[]:migrateFrameSnapshots(data.widgets as Widget[]))state.widgets.set(w.id,isFreeText(w)?naturalText(w):w);
    state.order = data.order ?? [];
    for (const c of data.connectors) state.connectors.set((c as Connector).id, c as Connector);
    state.connectorOrder = data.connectorOrder ?? [];
    for (const s of data.strokes) state.strokes.set((s as Stroke).id, s as Stroke);
    state.strokeOrder = data.strokeOrder ?? [];
    for (const [id, items] of data.groups ?? []) state.groups.set(id, items);
    state.background=validateBoardBackground(data.background)??{...DEFAULT_BACKGROUND};
    if (data.camera) {
      camera.x = data.camera.x;
      camera.y = data.camera.y;
      camera.scale = data.camera.scale;
    }
    return true;
  } catch {
    return false;
  }
}

let saveTimer:ReturnType<typeof setTimeout>|null=null;
function savedBoard():SavedBoard{return structuredClone({layerOrderVersion:1 as const,userFonts:snapshotUserFonts([...state.widgets.values()].map(w=>w.style.fontFamily)),savedAt:Date.now(),title:document.getElementById("board-title")!.textContent??"Board",background:state.background??{...DEFAULT_BACKGROUND},widgets:[...state.widgets.values()],order:state.order,connectors:[...state.connectors.values()],connectorOrder:state.connectorOrder,strokes:[...state.strokes.values()],strokeOrder:state.strokeOrder,groups:[...state.groups.entries()],journal:bus.snapshot(),camera:{x:camera.x,y:camera.y,scale:camera.scale}});}
async function persistBoard(){if(home&&(!home.currentId()||home.transitioning()))return;try{await writeStoredBoard(storageKey(),savedBoard());document.getElementById("save-warning")?.remove();}catch{let notice=document.getElementById("save-warning");if(!notice){notice=document.createElement("div");notice.id="save-warning";notice.style.cssText="position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:80;background:#fff9b1;padding:12px 18px;border-radius:8px;font:13px Segoe UI";document.body.append(notice);}notice.textContent="Não foi possível salvar automaticamente. Use Salvar arquivo para guardar seu trabalho.";}}
function scheduleSave(){if(home&&(!home.currentId()||home.transitioning()))return;if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;if(gesture.kind!=='none'){scheduleSave();return;}void persistBoard();},400);}
window.addEventListener("pagehide",()=>{void persistBoard();});

const state: BoardState = {
  background: {...DEFAULT_BACKGROUND},
  widgets: new Map(),
  order: [],
  connectors: new Map(),
  connectorOrder: [],
  strokes: new Map(),
  strokeOrder: [],
  groups: new Map(),
  selection: new Set(),
};
const scene = new BoardScene(world);
const bus = new CommandBus(state, () => {
  syncScene();
  drawSelection();
  refreshChrome();
  scheduleSave();
},500,()=>!home?.transitioning());

let images: ReturnType<typeof installImages> | undefined;
let editorUI: ReturnType<typeof installEditorUI> | undefined;
let connectorCompletion: ReturnType<typeof installConnectorCompletion> | undefined;
let drawingUI: ReturnType<typeof installDrawingUI> | undefined;
let brushCursor: ReturnType<typeof installBrushCursor> | undefined;
let backgroundUI: ReturnType<typeof installBackground> | undefined;
let layersUI: ReturnType<typeof installLayers> | undefined;
let mindmapUI:ReturnType<typeof installMindmapUI>|undefined;
let linkUI:ReturnType<typeof installLinkUI>|undefined;
let audioUI:ReturnType<typeof installAudio>|undefined;
let structuredUI:ReturnType<typeof installStructuredTextUI>|undefined;
let clickedObjectLink:{id:string;url:string;start:Vec}|null=null;
let lastBackground:BoardBackground|undefined;
function syncScene(): void {
  if(lastBackground!==state.background){lastBackground=state.background;gridDirty=true;}
  scene.sync(state, camera.visibleWorldRect(), camera.scale);
  images?.sync();
  backgroundUI?.sync();
  audioUI?.refresh();structuredUI?.refresh();
}

function syncSize(): void {
  camera.width = app.renderer.width / app.renderer.resolution;
  camera.height = app.renderer.height / app.renderer.resolution;
}
app.renderer.on("resize", () => {
  syncSize();
  gridDirty = true;
});
syncSize();

// ------------------------------------------------------------------ grid

let gridState: GridState = gridStateAt(camera.scale);
let gridDirty = true;
let lastScale = camera.scale;
let lastCamera = { x: camera.x, y: camera.y, scale: camera.scale };

function drawGrid(): void {
  gridState = gridStateAt(camera.scale);
  paintBoardGrid(gridLayer,camera,state.background);
}

// ------------------------------------------------------------- selection

const HANDLE_HIT = 7; // px de tela
const ROTATE_OFFSET = 46; // Clear of the connection dot above the shape.

function connectorAt(p: Vec, tolerance: number): Connector | undefined {
  for (const connector of [...state.connectors.values()].sort((a,b)=>b.z-a.z)) {
    if (connector.hidden||mindConnectorHidden(state,connector)) continue;
    const geometry = connectorGeometry(connector, state.widgets);
    if (geometry && distanceToConnector(p, geometry) <= tolerance) return connector;
  }
  return undefined;
}

function selectionRect(): Rect | null {
  const rects: Rect[] = [];
  for (const id of state.selection) {
    const w = state.widgets.get(id);
    if (w) {
      if(widgetHidden(w))continue;
      rects.push(widgetAABB(w));
      continue;
    }
    const c = state.connectors.get(id);
    if (c) {
      if(c.hidden||mindConnectorHidden(state,c))continue;
      const geometry = connectorGeometry(c, state.widgets);
      if (geometry) rects.push(connectorBounds(geometry));
    }
  }
  for(const id of state.selection){const st=state.strokes.get(id);if(st)rects.push(strokeBounds(st));}
  return unionRect(rects);
}

function selectionBox(): Widget | null {
  const r = selectionRect();
  return r ? createWidget("shape",{x:r.minX,y:r.minY,width:r.maxX-r.minX,height:r.maxY-r.minY}) : null;
}
function isSingleSelection(): boolean {
  return state.selection.size === 1;
}

/** Handle em coordenadas de TELA (para hit-test e desenho). */
function handleScreen(id: HandleId): Vec | null {
  const only = [...state.selection][0];
  const w = only ? state.widgets.get(only) : undefined;
  if (state.selection.size > 1) { const box = selectionBox(); return box ? camera.worldToScreen(handleWorld(box,id)) : null; }
  if (!w) return null;
  return camera.worldToScreen(handleWorld(w, id));
}

function rotateHandleScreen(): Vec | null {
  const only = [...state.selection][0];
  const w = state.selection.size>1?selectionBox():only ? state.widgets.get(only) : undefined;
  if (!w) return null;
  const top = handleWorld(w, "n");
  const c = widgetCenter(w);
  const up = rotate({ x: 0, y: -1 }, w.rotation);
  const distance = ROTATE_OFFSET / camera.scale;
  return camera.worldToScreen({ x: top.x + up.x * distance, y: top.y + up.y * distance });
}

let activeGuides: Guide[] = [];
let connectPreview: { from: Vec; to: Vec } | null = null;
let connectionMagnet:Extract<Endpoint,{kind:'anchor'}>|null=null;

function drawConnectPreview(): void {
  if (!connectPreview) return;
  const active=gesture.kind==="connect" ? gesture : pendingConnection;
  const source=active ? state.widgets.get(active.fromWidget) : undefined;
  const cursor=active?.current??connectPreview.to;
  const picked=connectionPick(cursor,resolveEndpoint(active?.fromAnchor??{kind:'point',...connectPreview.from},state.widgets)??undefined,source?.id,active?.snapDisabled),target=picked?.widget;
  const fromAnchor=source ? (active?.fixed ? active.fromAnchor : {kind:"anchor" as const,widgetId:source.id,...facingAnchor(source,target?widgetCenter(target):cursor)}) : {kind:"point" as const,...connectPreview.from};
  const from=resolveEndpoint(fromAnchor!,state.widgets)??connectPreview.from;
  const toAnchor=target&&picked ? {kind:"anchor" as const,widgetId:target.id,...picked.anchor} : {kind:"point" as const,...cursor};
  const preview:Connector={id:"preview",type:"connector",start:fromAnchor!,end:toAnchor,shape:active?.shape??connectorDefault.shape,style:{strokeColor:"#3859ff",strokeWidth:2,endCap:(active?.arrow??connectorDefault.arrow)?"arrow":"none"},z:0};
  const geometry=connectorGeometry(preview,state.widgets);
  const path=(geometry?.points ?? [connectPreview.from,connectPreview.to]).map(p=>camera.worldToScreen(p));
  const a=path[0]!,b=path[path.length-1]!;
  const screenCurve=(c:NonNullable<typeof geometry>['cubic'])=>c?{p0:camera.worldToScreen(c.p0),p1:camera.worldToScreen(c.p1),p2:camera.worldToScreen(c.p2),p3:camera.worldToScreen(c.p3)}:undefined;
  paintConnector(overlay,{...preview,style:{...preview.style,strokeWidth:Math.max(.7,2*camera.scale)}},{points:path,cubic:screenCurve(geometry?.cubic),cubics:geometry?.cubics?.map(c=>screenCurve(c)!)},false);
  overlay.circle(a.x, a.y, 4).fill({ color: 0x3859ff });
  overlay.circle(b.x, b.y, 4).stroke({ width: 1.5, color: 0x3859ff });
  const hit = target;
  if(hit) overlay.poly(widgetCorners(hit).flatMap(p=>{const s=camera.worldToScreen(p);return [s.x,s.y]})).stroke({width:2,color:0x3859ff,alpha:.6});
  drawConnectionTargets(cursor,source?.id);
}

function drawConnectionDots(w:Widget):void {
  if(w.locked||widgetHidden(w)||w.mind&&tool!=='connector')return;
  if(tool!=='connector'&&Math.min(w.width,w.height)*camera.scale<24)return;
  for(const h of connectionHandles(w)){
    overlay.circle(h.point.x,h.point.y,5).fill(0x3859ff).stroke({width:2,color:0xffffff});
  }
}

function drawGuides(): void {
  for (const g of activeGuides) {
    const color = g.kind === "center" ? 0xff5fa2 : 0x3859ff;
    if (g.orientation === "vertical") {
      const a = camera.worldToScreen({ x: g.position, y: g.from });
      const b = camera.worldToScreen({ x: g.position, y: g.to });
      overlay.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color });
    } else {
      const a = camera.worldToScreen({ x: g.from, y: g.position });
      const b = camera.worldToScreen({ x: g.to, y: g.position });
      overlay.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color });
    }
  }
}

// ---------------------------------------------------------- editor inline

let editor: HTMLDivElement | null = null;
let editingId: string | null = null;
let editorOriginal = "";

function editorContent(w: Widget): string {
  return w.type === "frame" ? w.title : w.content;
}

function positionEditor(w: Widget): void {
  if (!editor) return;
  const content=fromHtml(editor.innerHTML),current:Widget={...w,...(w.type==='frame'?{title:content}:{content})};
  // usa o centro + tamanho escalado: funciona igual com rotação
  const center = camera.worldToScreen({ x: w.x + w.width / 2, y: w.y + w.height / 2 });
  const width = Math.max(isFreeText(w)?8:.000001, w.width * camera.scale);
  const height = Math.max(isFreeText(w)?8:.000001, w.height * camera.scale);
  const font=textFontScale(effectiveTextFontSize(current)*camera.scale);
  const topLeft=w.rotation===0&&width===w.width*camera.scale&&height===w.height*camera.scale?camera.worldToScreen({x:w.x,y:w.y}):(()=>{const offset=rotate({x:-width/2,y:-height/2},w.rotation);return {x:center.x+offset.x,y:center.y+offset.y};})();
  editor.style.left = topLeft.x + "px";
  editor.style.top = topLeft.y + "px";
  editor.style.width = width/font.scale + "px";
  editor.style.height = height/font.scale + "px";
  editor.style.transform = `rotate(${w.rotation}rad) scale(${font.scale})`;
  editor.style.transformOrigin = '0 0';
  editor.style.fontSize = font.fontSize + "px";
  if(isFreeText(w))editor.style.padding='0';else{
    const insets=boxTextInsets(w),fit=isBoxText(current)?fitBoxText(current):null,block=fit?.blockHeight??0;
    const top=!fit||w.style.textAlignVertical==='top'?insets.top:w.style.textAlignVertical==='bottom'?Math.max(insets.top,w.height-insets.bottom-block):insets.top+Math.max(0,(fit.height-block)/2),ratio=camera.scale/font.scale;
    editor.style.padding=`${top*ratio}px ${insets.right*ratio}px ${insets.bottom*ratio}px ${insets.left*ratio}px`;
  }
}

/** Editor WYSIWYG: mostra o texto formatado, não a marcação. */
function beginEdit(w: Widget): void {
  if(structuredUI?.edit(w))return;
  if (w.type === "image") { images?.cropSelected(); return; }
  endEdit(false);
  editingId = w.id;
  editorOriginal = editorContent(w);

  const el = document.createElement("div");
  el.id='inline-editor';
  el.contentEditable = "true";
  el.innerHTML = toHtml(editorOriginal);
  el.spellcheck = false;
  Object.assign(el.style, {
    position: "fixed",
    margin: "0",
    padding: isFreeText(w)?"0":"10px",
    border: "none",
    outline: isFreeText(w)?"none":"2px solid #3859ff",
    borderRadius: "2px",
    overflow: isFreeText(w)?"visible":"hidden",
    boxSizing: "border-box",
    background: w.type === "sticky_note" ? (STICKY_COLORS[styleKey(w)] ?? "#fff9b1") : "#ffffff",
    color: w.style.color,
    fontFamily: w.style.fontFamily,
    fontWeight:w.style.fontWeight??"normal",fontStyle:w.style.fontStyle??"normal",textDecoration:w.style.textDecoration??"none",backgroundColor:w.style.highlightColor??"transparent",
    fontSize: Math.max(.1, w.style.fontSize * camera.scale) + "px",
    lineHeight: "1.35",
    textAlign: w.style.textAlign,
    whiteSpace: isFreeText(w)?"pre":"pre-wrap",
    wordBreak: isFreeText(w)?"normal":"break-word",
    zIndex: "50",
  });

  document.body.appendChild(el);
  editor = el; // precisa existir antes de posicionar/medir
  positionEditor(w);
  el.focus();

  // seleciona tudo para digitar por cima, como no Miro
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  scene.setTextVisible(w.id, false);

  el.addEventListener("keydown", (event) => {
    if(w.mind&&!event.ctrlKey&&!event.metaKey&&(event.key==='Tab'||event.key==='Enter'&&!event.shiftKey)){
      event.preventDefault();event.stopPropagation();endEdit(true);if(event.key==='Tab')mindmapUI?.afterEdit(w.id,'Tab');return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();endEdit(false);
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      endEdit(true);
    } else if ((event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const command = event.key.toLowerCase() === "b" ? "bold" : event.key.toLowerCase() === "i" ? "italic" : "underline";
      document.execCommand(command);
    }
  });

  el.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  });

  el.addEventListener("blur", () => {if(!linkUI?.editing())endEdit(true);});
  el.addEventListener('input',()=>positionEditor(isFreeText(w)?naturalText({...w,content:fromHtml(el.innerHTML)}):w));
}

function styleKey(w: Widget): string {
  const entry = Object.entries(STICKY_COLORS).find(([, hex]) => hex === w.style.fillColor);
  return entry ? entry[0] : "light_yellow";
}

function endEdit(commit: boolean): void {
  if (!editor || !editingId) {
    editor = null;
    editingId = null;
    return;
  }
  const id = editingId;
  const value = fromHtml(editor.innerHTML);
  const el = editor;
  editor = null;
  editingId = null;
  el.remove();

  const w = state.widgets.get(id);
  if (w) {
    scene.setTextVisible(id, true);
    if (commit && value !== editorOriginal) {
      const patch = w.type === "frame" ? { title: value } : { content: value };
      if(w.mind)bus.beginTransaction('Editar tópico');
      bus.exec({ op: "WIDGET_UPDATE", payload: { id, patch } });
      if(w.mind){const commands=mindLayoutCommands(state,id);if(commands.length)bus.exec({op:'BATCH',payload:{label:'Organizar mapa',commands}});bus.endTransaction();}
    }
  }
  syncScene();
  drawSelection();
}

function drawSelection(): void {
  overlay.clear();
  if(['hand','brush','highlighter','eraser'].includes(tool))return;
  if(state.selection.size&&[...state.selection].every(entityHidden))return;
  const hover=hoveredConnectionWidget?state.widgets.get(hoveredConnectionWidget):undefined;
  if(hover&&(!state.selection.has(hover.id)||state.selection.size!==1)&&(tool==="select"||tool==="connector"))drawConnectionDots(hover);
  if(gesture.kind==='reconnect'){const c=state.connectors.get(gesture.id),other=c?.[gesture.which==='start'?'end':'start'];drawConnectionTargets(gesture.current,other?.kind==='anchor'?other.widgetId:undefined);}
  if (state.selection.size === 0) {
    drawGuides();
    drawConnectPreview();
    return;
  }

  const blue = 0x3859ff;
  const onlyId = [...state.selection][0]!;
  const selectedConnector = state.widgets.has(onlyId) ? undefined : state.connectors.get(onlyId);

  if (selectedConnector && isSingleSelection()) {
    const geometry = connectorGeometry(selectedConnector, state.widgets);
    if (geometry) {
      const pts = geometry.points.map((p) => camera.worldToScreen(p));
      overlay.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) overlay.lineTo(pts[i]!.x, pts[i]!.y);
      overlay.stroke({ width: selectedConnector.style.strokeWidth*camera.scale + 4, color: blue, alpha: 0.35 });
      for (const p of [pts[0]!, pts[pts.length - 1]!]) {
        overlay.circle(p.x, p.y, 5).fill({ color: 0xffffff }).stroke({ width: 1.5, color: blue });
      }
    }
    if(geometry)for(const point of connectorEditPoints(selectedConnector,geometry)){const p=camera.worldToScreen(point);overlay.rect(p.x-4,p.y-4,8,8).fill(0xffffff).stroke({width:1.5,color:blue});}
    drawGuides();
    drawConnectPreview();
    return;
  }

  if (isSingleSelection()) {
    const only = onlyId;
    const w = state.widgets.get(only);
    if (!w) return;
    const corners = widgetCorners(w).map((p) => camera.worldToScreen(p));
    overlay.poly(corners.flatMap((p) => [p.x, p.y])).stroke({ width: 1.5, color: blue });

    if(selectionHandlesVisible())for (const id of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as HandleId[]) {
      const p = handleScreen(id);
      if (!p) continue;
      overlay.rect(p.x - 4, p.y - 4, 8, 8).fill({ color: 0xffffff }).stroke({ width: 1.5, color: blue });
    }

    drawConnectionDots(w);
    const r = rotateHandleScreen();
    const top = handleScreen("n");
    if (r && top&&selectionHandlesVisible()) {
      overlay.moveTo(top.x, top.y).lineTo(r.x, r.y).stroke({ width: 1.5, color: blue });
      overlay.circle(r.x, r.y, 5).fill({ color: 0xffffff }).stroke({ width: 1.5, color: blue });
    }
    drawGuides();
    drawConnectPreview();
    return;
  }

  const rect = selectionRect();
  if (!rect) {
    drawGuides();
    return;
  }
  const a = camera.worldToScreen({ x: rect.minX, y: rect.minY });
  const b = camera.worldToScreen({ x: rect.maxX, y: rect.maxY });
  overlay.rect(a.x - 2, a.y - 2, b.x - a.x + 4, b.y - a.y + 4).stroke({ width: 1.5, color: blue });
  for (const id of ["nw","n","ne","e","se","s","sw","w"] as HandleId[]) {
    const p = handleScreen(id); if(p) overlay.rect(p.x-4,p.y-4,8,8).fill(0xffffff).stroke({width:1.5,color:blue});
  }
  const rotationPoint=rotateHandleScreen(),topPoint=handleScreen("n");if(rotationPoint&&topPoint){overlay.moveTo(topPoint.x,topPoint.y).lineTo(rotationPoint.x,rotationPoint.y).stroke({width:1.5,color:blue});overlay.circle(rotationPoint.x,rotationPoint.y,5).fill(0xffffff).stroke({width:1.5,color:blue});}
  drawGuides();
  drawConnectPreview();
}

// ---------------------------------------------------------------- tools

type Tool = "select" | "hand" | "connector" | "brush" | "highlighter" | "eraser" | WidgetType;
let pendingConnection: Extract<Gesture,{kind:"connect"}> | null = null;
let connectorDefault: {shape:ConnectorShape; arrow:boolean} = {shape:"curved",arrow:true};
let tool: Tool = "select";
let stickyStackMode=false;
const creationStyles:Partial<Record<WidgetType,Partial<Style>>>={};
let selectedShape: ShapeWidget["shape"] = "rectangle";
const creationPreview=installCreationPreview({parent:world,camera,canvas:app.canvas,getTool:()=>tool,getGesture:()=>gesture,temporaryHand:()=>spaceDown,getTemplate:()=>{
  if(!['shape','sticky_note','text','frame'].includes(tool))return;
  const widget=createWidget(tool as WidgetType,{x:0,y:0,shape:selectedShape,content:tool==='text'?'Texto':tool==='frame'?'Quadro':''});
  widget.style={...widget.style,...creationStyles[widget.type]};return widget;
}});

function setTool(next: Tool): void {
  momentum.stop();
  if(next!=='sticky_note')stickyStackMode=false;
  creationPreview.clear();
  connectorCompletion?.close();
  tool = next;
  if(next !== "connector") { pendingConnection=null; connectPreview=null; connectionMagnet=null; }
  if (next !== "shape") editorUI?.closePanels();
  for (const btn of toolbar.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
    btn.classList.toggle("active", btn.dataset.tool === next||btn.dataset.tool==='shape'&&next==='connector');
    if(btn.dataset.tool==="select"){btn.setAttribute("aria-pressed",String(next==="select"));btn.dataset.label=next==="select"?"Desativar seleção e navegar":"Selecionar e mover objetos (V)";}
  }
  document.body.classList.toggle("navigation-mode",next==="hand");
  updateCursor();
  editorUI?.refresh();
  drawingUI?.refresh();
  brushCursor?.update();
  drawSelection();
}

function updateCursor(): void {
  if(gesture.kind==='pan'||gesture.kind==='drag'||gesture.kind==='bend'||gesture.kind==='reconnect'){app.canvas.style.cursor='grabbing';return;}
  if(gesture.kind==='resize'||gesture.kind==='multi-resize'){app.canvas.style.cursor=resizeCursor(gesture.handle,gesture.kind==='resize'?gesture.startWidget.rotation:gesture.box.rotation);return;}
  if(gesture.kind==='rotate'||gesture.kind==='multi-rotate'){app.canvas.style.cursor=ROTATE_CURSOR;return;}
  if(gesture.kind==='connect'||pendingConnection){app.canvas.style.cursor='default';return;}
  if(tool==='connector'){app.canvas.style.cursor='crosshair';return;}
  connectionMagnet=null;
  if(tool==='brush'||tool==='highlighter'||tool==='eraser'){app.canvas.style.cursor=spaceDown?'grab':'none';return;}
  app.canvas.style.cursor =
    tool === "hand" ? "grab" : tool === "select" ? "default" : "crosshair";
}

toolbar.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-tool]");
  if (!btn || btn.disabled || !btn.dataset.tool) return;
  if (btn.dataset.tool === "image") { imagePickerBoardKey=mediaBoardKey();imagePicker.click(); return; }
  if (btn.dataset.tool === "shape") { editorUI?.openShapes(); return; }
  if (btn.dataset.tool === "connector") { if(tool==='connector')editorUI?.openConnectors();else setTool('connector');return; }
  if (btn.dataset.tool === "select") {setTool(tool==="select"?"hand":"select");return;}
  if((btn.dataset.tool==='brush'||btn.dataset.tool==='eraser')&&tool===btn.dataset.tool){setTool('hand');return;}
  setTool(btn.dataset.tool as Tool);
});

// ------------------------------------------------------------ chrome (UI)

const zoomValue = document.getElementById("zoom-value")!;
const zoomUI=installZoomUI({camera,onChange:()=>{gridDirty=true;refreshChrome();},fit:fitToContent});
hud.hidden = true;

document.getElementById("zoombar")!.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-zoom]");
  if (!btn) return;
  const mid = { x: camera.width / 2, y: camera.height / 2 };
  if (btn.dataset.zoom === "in") camera.zoomAt(mid, 1.2);
  else if (btn.dataset.zoom === "out") camera.zoomAt(mid, 1 / 1.2);
  else if (btn.dataset.zoom === "fit") fitToContent();
  else {
    camera.scale = 1;
    gridDirty = true;
  }
  gridDirty = true;
  refreshChrome();
});

async function exportPng(): Promise<void> {
  try {
    const canvas = app.renderer.extract.canvas({ target: app.stage,clearColor:state.background?.color??DEFAULT_BACKGROUND.color }) as HTMLCanvasElement;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "board.png";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn("export png falhou", error);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportSvg(): Promise<void> {
  const svg = await embedSvgFonts(boardToSvg(state),[...new Set([...state.widgets.values()].map(w=>w.style.fontFamily))]);
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "board.svg");
}

document.getElementById("export")?.addEventListener("click", () => void exportPng());
document.getElementById("export-svg")?.addEventListener("click", () => exportSvg());

const helpPanel = document.getElementById("help-panel")!;
let helpPreviousFocus:HTMLElement|null=null;

function toggleHelp(force?: boolean): void {
  const next = force ?? helpPanel.hasAttribute("hidden");
  if(next===!helpPanel.hidden)return;
  if(next)helpPreviousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  helpPanel.toggleAttribute("hidden", !next);
  if(next)helpPanel.querySelector<HTMLButtonElement>('[data-help-close]')?.focus();
  else if(helpPreviousFocus?.isConnected)helpPreviousFocus.focus();
}

document.getElementById("help")?.addEventListener("click", () => toggleHelp());
helpPanel.addEventListener("click", (event) => {
  if (event.target === helpPanel||(event.target as Element).closest('[data-help-close]')) toggleHelp(false);
});
window.addEventListener('keydown',event=>{
  if(home?.transitioning()){event.preventDefault();event.stopImmediatePropagation();return;}
  if(helpPanel.hidden)return;
  if(event.key==='Escape'){event.preventDefault();toggleHelp(false);}
  else if(event.key==='Tab'){
    event.preventDefault();const controls=[...helpPanel.querySelectorAll<HTMLElement>('button,a[href],[tabindex="0"]')];
    const index=controls.indexOf(document.activeElement as HTMLElement);controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus();
  }
  event.stopImmediatePropagation();
},true);

document.getElementById("undo")!.addEventListener("click", () => bus.undo());
document.getElementById("redo")!.addEventListener("click", () => bus.redo());

const alignbar = document.getElementById("alignbar")!;

function refreshAlignBar(): void {
  if (state.selection.size < 2) {
    alignbar.classList.remove("visible");
    return;
  }
  const rect = selectionRect();
  if (!rect) {
    alignbar.classList.remove("visible");
    return;
  }
  alignbar.classList.add("visible");
  const top = camera.worldToScreen({ x: rect.minX, y: rect.minY });
  const width = alignbar.offsetWidth || 280;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, top.x));
  alignbar.style.left = `${left}px`;
  alignbar.style.top = `${Math.max(8, top.y - 46)}px`;
}

alignbar.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-align]");
  if (!btn?.dataset.align) return;
  const ids = [...state.selection];
  const mode = btn.dataset.align;
  if (mode === "dist-x") bus.exec({ op: "WIDGET_DISTRIBUTE", payload: { ids, axis: "x" } });
  else if (mode === "dist-y") bus.exec({ op: "WIDGET_DISTRIBUTE", payload: { ids, axis: "y" } });
  else bus.exec({ op: "WIDGET_ALIGN", payload: { ids, mode: mode as AlignMode } });
});

function refreshChrome(): void {
  if(isolatedGroup&&!state.groups.has(isolatedGroup))isolatedGroup=null;
  editorUI?.refresh();
  layersUI?.refresh();
  mindmapUI?.refresh();
  audioUI?.refresh();structuredUI?.refresh();
  refreshAlignBar();
  (document.getElementById("undo") as HTMLButtonElement).disabled = !bus.canUndo;
  (document.getElementById("redo") as HTMLButtonElement).disabled = !bus.canRedo;
  zoomValue.textContent = `${Math.round(camera.scale * 100)}%`;
  zoomUI?.refresh();
}

function fitToContent(): void {
  const all = selectedBounds(state,[...state.order,...state.connectorOrder,...state.strokeOrder]);
  if (!all) {
    camera.scale = 1;
    camera.x = 0;
    camera.y = 0;
  } else {
    camera.fit(all, 120);
  }
  gridDirty = true;
}

// -------------------------------------------------------------- pointer

type Gesture =
  | { kind: "none" }
  | { kind: "multi-resize"; handle:HandleId; box:Widget; items:Widget[]; initial:EntitySnapshot }
  | { kind: "create"; start: Vec; current: Vec; widget: Widget }
  | { kind: "pan"; pointerId: number }
  | { kind: "drag"; ids: string[]; start: Vec; delta: Vec; initial:EntitySnapshot; bounds:Rect|null }
  | { kind: "marquee"; start: Vec; current: Vec }
  | { kind: "resize"; id: string; handle: HandleId; startWidget: Widget; moved: boolean }
  | { kind: "rotate"; id: string; startWidget: Widget; grabAngle: number; moved: boolean }
  | { kind: "connect"; fromWidget: string; fromAnchor: Endpoint; current: Vec; fixed?: boolean; startedAt?:Vec;shape?:ConnectorShape;arrow?:boolean;snapDisabled?:boolean }
  | { kind: "bend"; id:string; index:number; points:Vec[] }
  | {kind:"multi-rotate";initial:EntitySnapshot;center:Vec;angle:number}
  | { kind: "reconnect"; id: string; which: "start" | "end"; current: Vec;snapDisabled?:boolean }
  | { kind: "draw"; points: StrokePoint[]; tool: "brush" | "highlighter"; color:string; width:number; opacity:number;precision:boolean;precisionStrength?:number;precisionSmoothing?:number }
  | {kind:'brush-adjust';start:Vec;tool:'brush'|'highlighter';initial:DrawingSettings}
  | {kind:'eraser-adjust';start:Vec;radius:number}
  | { kind: "erase"; radius: number;partial:boolean;last:Vec;pending:Vec[] };

let gesture: Gesture = { kind: "none" };
let cursorWorld: Vec = { x: 0, y: 0 };
let clipboard: EntitySnapshot = {widgets:[],connectors:[],strokes:[],groups:[]};
let clipboardToken='';
const BOARD_CLIPBOARD_TYPE='application/x-board-studio';
const canvasClipboardBlocked=()=>!!home?.transitioning()||document.body.classList.contains('home-visible')||[...document.querySelectorAll<HTMLElement>('dialog[open],[role="dialog"][aria-modal="true"]')].some(dialog=>!dialog.hidden&&dialog.getClientRects().length>0);
document.addEventListener('copy',event=>{
  if(event.defaultPrevented||isClipboardEditor(event.target)||canvasClipboardBlocked()||!event.clipboardData)return;
  const snapshot=captureSelection(state);if(!snapshot.widgets.length&&!snapshot.connectors.length&&!snapshot.strokes.length)return;
  clipboard=snapshot;clipboardToken=crypto.randomUUID();
  event.clipboardData.setData(BOARD_CLIPBOARD_TYPE,clipboardToken);
  event.clipboardData.setData('text/plain',snapshot.widgets.map(w=>w.type==='frame'?w.title:w.content).filter(Boolean).join('\n')||'Objetos do Board Studio');
  event.preventDefault();
});
// Images consume their native paste first. A stale in-app copy must never
// suppress a screenshot or a photo copied later in another application.
window.addEventListener('paste',event=>{
  if(event.defaultPrevented||isClipboardEditor(event.target)||canvasClipboardBlocked()||!event.clipboardData)return;
  if(clipboardToken&&event.clipboardData.getData(BOARD_CLIPBOARD_TYPE)===clipboardToken){event.preventDefault();duplicateSnapshot(state,bus,clipboard);}
});

const pointers = new Map<number, { x: number; y: number }>();
let spaceDown = false;
let lastPinch: { dist: number; mid: { x: number; y: number } } | null = null;

function anchorWorldOf(w: Widget, anchor: { x: number; y: number }): Vec | null {
  const geometryPoint = { x: w.x + anchor.x * w.width, y: w.y + anchor.y * w.height };
  // aplica rotação em torno do centro, se houver
  const c = widgetCenter(w);
  const d = rotate({ x: geometryPoint.x - c.x, y: geometryPoint.y - c.y }, w.rotation);
  return { x: c.x + d.x, y: c.y + d.y };
}

/** Membros do grupo ao qual o objeto pertence (inclui ele mesmo). */
/** Grupo "aberto" por duplo clique: selecionar um membro não pega o grupo todo. */
let isolatedGroup: string | null = null;

function groupMembersOf(id:string):string[]{return memberSelection(state,id,isolatedGroup);}

/** Objetos cujo centro cai dentro do quadro. */
function containedInFrame(frame: Widget): string[] {
  const out: string[] = [];
  for (const id of state.order) {
    if (id === frame.id) continue;
    const w = state.widgets.get(id);
    if (!w || w.type === "frame") continue;
    const c = widgetCenter(w);
    if (c.x >= frame.x && c.x <= frame.x + frame.width && c.y >= frame.y && c.y <= frame.y + frame.height) {
      out.push(id);
    }
  }
  return out;
}

let hoveredLink: string | null = null;
let hoveredConnectionWidget:string|null=null;

/** URL do link sob o cursor, se houver. */
function linkUnder(p: Vec): string | null {
  const item=frontmostEntityAt(p),w=item?state.widgets.get(item.id):undefined;
  if(!w||widgetHidden(w))return null;
  const local=worldToLocal(w,p);return scene.linkAt(w.id,local.x,local.y);
}
function widgetHidden(w:Widget):boolean{return !!w.hidden||mindNodeHidden(state,w.id);}
function entityHidden(id:string):boolean{const w=state.widgets.get(id);if(w)return widgetHidden(w);const c=state.connectors.get(id);return c?!!c.hidden||mindConnectorHidden(state,c):!!state.strokes.get(id)?.hidden;}

function connectionTarget(p:Vec):Widget|undefined {
  const direct = topmostAt(p); if(direct && direct.type!=="frame"&&!widgetHidden(direct)&&!direct.locked) return direct;
  const frames=visibleFrames(state);
  return [...state.widgets.values()].sort((a,b)=>b.z-a.z).find(w=>{if(w.type==="frame"||widgetHidden(w)||w.locked)return false;const anchor=anchorWorldOf(w,nearestAnchor(w,p));return !!anchor&&framePointVisible(w,anchor,frames)&&Math.hypot(anchor.x-p.x,anchor.y-p.y)*camera.scale<14;});
}
function nearbyConnectionTargets(p:Vec,excludeId?:string):Widget[]{
  const view=camera.visibleWorldRect(),distance=(w:Widget)=>{const b=widgetAABB(w);return Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minY-p.y,0,p.y-b.maxY))*camera.scale;};
  return [...state.widgets.values()].filter(w=>!widgetHidden(w)&&!w.locked&&w.type!=='frame'&&w.id!==excludeId&&rectIntersectsWidget(view,w)&&distance(w)<=320).sort((a,b)=>distance(a)-distance(b)||b.z-a.z).slice(0,8);
}
function visibleConnectionPort(w:Widget,anchor:Endpoint):boolean {
  const point=resolveEndpoint(anchor,state.widgets);if(!point)return false;
  if(!framePointVisible(w,point,visibleFrames(state)))return false;
  const cover=topmostAt(point);return !cover||cover.id===w.id;
}
/** Enter/hold radii make magnetic ports stable instead of flickering at one threshold. */
function connectionPick(p:Vec,from?:Vec,excludeId?:string,snapDisabled=false):{widget:Widget;anchor:Vec}|undefined {
  if(snapDisabled){connectionMagnet=null;return;}
  if(connectionMagnet){const w=state.widgets.get(connectionMagnet.widgetId),point=resolveEndpoint(connectionMagnet,state.widgets);if(w&&!widgetHidden(w)&&!w.locked&&w.id!==excludeId&&point&&visibleConnectionPort(w,connectionMagnet)&&Math.hypot(point.x-p.x,point.y-p.y)*camera.scale<=22)return {widget:w,anchor:{x:connectionMagnet.x,y:connectionMagnet.y}};}
  connectionMagnet=null;
  let best:{widget:Widget;anchor:Vec;distance:number}|undefined;
  for(const w of nearbyConnectionTargets(p,excludeId))for(const port of connectionHandles(w)){const point=resolveEndpoint(port.anchor,state.widgets)!;const distance=Math.hypot(point.x-p.x,point.y-p.y)*camera.scale;if(distance<=14&&visibleConnectionPort(w,port.anchor)&&(!best||distance<best.distance))best={widget:w,anchor:{x:port.anchor.x,y:port.anchor.y},distance};}
  if(best){connectionMagnet={kind:'anchor',widgetId:best.widget.id,...best.anchor};return best;}
  const widget=connectionTarget(p);if(!widget||widget.id===excludeId)return;
  return {widget,anchor:connectionAttachment(widget,p,from)};
}
function connectionPointer(p:Vec,from:Endpoint,constrain:boolean):Vec {
  const origin=resolveEndpoint(from,state.widgets);if(!constrain||!origin)return p;
  const dx=p.x-origin.x,dy=p.y-origin.y,angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,distance=Math.hypot(dx,dy);
  return {x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance};
}
function drawConnectionTargets(p:Vec,excludeId?:string):void {
  for(const w of nearbyConnectionTargets(p,excludeId))for(const port of connectionHandles(w)){
    if(!visibleConnectionPort(w,port.anchor))continue;const worldPoint=resolveEndpoint(port.anchor,state.widgets)!,s=camera.worldToScreen(worldPoint);
    const active=connectionMagnet?.widgetId===w.id&&Math.hypot(connectionMagnet.x-port.anchor.x,connectionMagnet.y-port.anchor.y)<.001;
    if(active)overlay.circle(s.x,s.y,11).fill({color:0x3859ff,alpha:.17});
    overlay.circle(s.x,s.y,active?5:4).fill(active?0x3859ff:0xffffff).stroke({width:active?2:1.5,color:0x3859ff});
  }
}
function connectionAttachment(w:Widget,p:Vec,from?:Vec):Vec {
  const nearest=nearestAnchor(w,p),edge=anchorWorldOf(w,nearest)!;
  // Aiming inside an object means attach the facing edge; close to its edge,
  // keep the user's precise attachment and magnetize only the four side centres.
  if(from&&pointInWidget(w,p)&&Math.hypot(edge.x-p.x,edge.y-p.y)*camera.scale>18)return facingAnchor(w,from);
  for(const h of connectionHandles(w)){const point=resolveEndpoint(h.anchor,state.widgets)!;if(Math.hypot(point.x-p.x,point.y-p.y)*camera.scale<=12)return {x:h.anchor.x,y:h.anchor.y};}
  return nearest;
}
function hoverConnectionTarget(p:Vec):Widget|undefined {
  const direct=connectionTarget(p);if(direct&&!direct.locked)return direct;
  const margin=36/camera.scale;
  return [...state.widgets.values()].sort((a,b)=>b.z-a.z).find(w=>{if(w.locked||widgetHidden(w)||w.type==='frame'||tool==='select'&&Math.min(w.width,w.height)*camera.scale<24&&!pointInWidget(w,p))return false;const b=widgetAABB(w);return p.x>=b.minX-margin&&p.x<=b.maxX+margin&&p.y>=b.minY-margin&&p.y<=b.maxY+margin;});
}
function connectionHandles(w:Widget):Array<{point:Vec;anchor:Endpoint}> {
  if(w.type==="frame")return [];
  return [{x:.5,y:0},{x:1,y:.5},{x:.5,y:1},{x:0,y:.5}].map(a=>{
    const c=widgetCenter(w),towards=anchorWorldOf(w,{x:.5+(a.x-.5)*4,y:.5+(a.y-.5)*4})!;
    const anchor=facingAnchor(w,towards),edge=anchorWorldOf(w,anchor)!,d={x:edge.x-c.x,y:edge.y-c.y},length=Math.hypot(d.x,d.y)||1;
    const point=camera.worldToScreen({x:edge.x+d.x/length*20/camera.scale,y:edge.y+d.y/length*20/camera.scale});
    return {point,anchor:{kind:"anchor" as const,widgetId:w.id,...anchor}};
  });
}
function topmostAt(p: Vec): Widget | undefined {
  // The frame mask and the global layer order also govern canvas input.
  const frames=visibleFrames(state);
  let best: Widget | undefined;
  let bestZ = Number.NEGATIVE_INFINITY;
  for (const id of state.order) {
    const w = state.widgets.get(id);
    if (!w || widgetHidden(w) || !pointInVisibleWidget(w,p,frames)) continue;
    const z = w.z;
    if (z > bestZ) {
      bestZ = z;
      best = w;
    }
  }
  return best;
}

/** Canvas picking follows the same cross-type stack as the layers panel. */
function frontmostEntityAt(p:Vec){
  const widget=topmostAt(p),connector=connectorAt(p,6/camera.scale);
  const tolerance=6/camera.scale;
  const stroke=[...state.strokes.values()].filter(st=>{if(st.hidden)return false;const bounds=strokeBounds(st);return p.x>=bounds.minX-tolerance&&p.x<=bounds.maxX+tolerance&&p.y>=bounds.minY-tolerance&&p.y<=bounds.maxY+tolerance&&distanceToStroke(p,st)<tolerance;}).sort((a,b)=>b.z-a.z)[0];
  return [widget,connector,stroke].filter(item=>!!item).sort((a,b)=>b!.z-a!.z)[0];
}

function handleAtScreen(s: Vec): HandleId | null {
  if (state.selection.size < 1||!selectionHandlesVisible()) return null;
  for (const id of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as HandleId[]) {
    const p = handleScreen(id);
    if (p && Math.hypot(p.x - s.x, p.y - s.y) <= HANDLE_HIT) return id;
  }
  return null;
}

function rotateHandleAtScreen(s: Vec): boolean {
  if(!selectionHandlesVisible())return false;
  const p = rotateHandleScreen();
  return Boolean(p && Math.hypot(p.x - s.x, p.y - s.y) <= HANDLE_HIT + 2);
}
function selectionHandlesVisible():boolean{const box=selectionBox();return !!box&&box.width*camera.scale>=32&&box.height*camera.scale>=24;}
/** Group membership is one selection unit across shapes, strokes and connectors. */
function selectClickedEntity(id:string,event:PointerEvent):boolean{
  const base=event.altKey?[id]:groupMembersOf(id);
  if(event.shiftKey){
    const remove=base.every(member=>state.selection.has(member)),next=new Set(state.selection);
    for(const member of base)if(remove)next.delete(member);else next.add(member);
    bus.exec({op:'SELECTION_SET',payload:[...next]});return remove;
  }
  if(!state.selection.has(id)||event.altKey)bus.exec({op:'SELECTION_SET',payload:base});
  return false;
}

let liveGestureFrame=0,liveGestureUpdate:(()=>void)|null=null;
function queueGestureUpdate(update:()=>void):void{liveGestureUpdate=update;if(!liveGestureFrame)liveGestureFrame=requestAnimationFrame(flushGestureUpdate);}
function flushGestureUpdate():void{if(liveGestureFrame)cancelAnimationFrame(liveGestureFrame);liveGestureFrame=0;const update=liveGestureUpdate;liveGestureUpdate=null;update?.();}

app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

app.canvas.addEventListener("dblclick", (e) => {
  if(tool==="hand")return;
  const p = camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
  const front=frontmostEntityAt(p),hit=front&&state.widgets.has(front.id)?state.widgets.get(front.id):undefined;
  if (!hit) {
    const c=connectorAt(p,8/camera.scale);
    if(c&&!c.locked){
      const geometry=connectorGeometry(c,state.widgets);
      const fraction=geometry?connectorClosestFraction(geometry,p):.5;
      const captions=[...(c.captions??[])],positions=captions.map((_,i)=>c.captionPositions?.[i]??(i+1)/(captions.length+1));
      let index=positions.findIndex(position=>Math.abs(position-fraction)<.08);
      if(index<0){index=captions.length;captions.push("");positions.push(Math.max(.02,Math.min(.98,fraction)));}
      bus.exec({op:"BATCH",payload:{label:"Editar texto da conexão",commands:[
        {op:"CONNECTOR_UPDATE",payload:{id:c.id,patch:{captions,captionPositions:positions}}},
        {op:"SELECTION_SET",payload:[c.id]},
      ]}});
      const panel=document.getElementById("selection-properties")!;
      panel.dataset.openMenu="captions";
      const menu=panel.querySelector<HTMLDetailsElement>('details[data-menu="captions"]');if(menu)menu.open=true;
      panel.querySelector<HTMLInputElement>(`[data-caption-index="${index}"]`)?.focus();
    }
    return;
  }

  // duplo clique em objeto que não é grupo abre o editor
  const inGroup = enclosingGroup(state,hit.id,isolatedGroup);
  if (!inGroup) {
    if(!hit.locked)beginEdit(hit);
    return;
  }

  if(inGroup){isolatedGroup=inGroup;bus.exec({op:"SELECTION_SET",payload:memberSelection(state,hit.id,inGroup)});refreshChrome();}

});

app.canvas.addEventListener("pointerdown", (e) => {
  momentum.stop();
  if(e.button===2&&e.altKey&&(tool==='brush'||tool==='eraser')){
    e.preventDefault();app.canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    gesture=tool==='eraser'?{kind:'eraser-adjust',start:{x:e.clientX,y:e.clientY},radius:drawingUI?.eraserRadius()??12}:{kind:'brush-adjust',start:{x:e.clientX,y:e.clientY},tool:'brush',initial:drawingUI!.settings('brush')};brushCursor?.move(e.clientX,e.clientY);brushCursor?.adjusting(true);return;
  }
  if(e.button===2)return;
  flushGestureUpdate();
  clickedObjectLink=null;
  app.canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    brushPreview.clear();creationPreview.clear();bus.endTransaction();
    gesture = { kind: "none" };
    return;
  }

  const screen = { x: e.offsetX, y: e.offsetY };
  const p = camera.screenToWorld(screen);
  cursorWorld = p;

  connectorCompletion?.close();
  editorUI?.closePanels();
  if (e.button === 1 || spaceDown || tool === "hand") {
    creationPreview.clear();
    gesture = { kind: "pan", pointerId: e.pointerId };
    momentum.begin({x:e.clientX,y:e.clientY},performance.now());
    app.canvas.style.cursor = "grabbing";
    return;
  }

  // rejeição de palma: toque não desenha com caneta/marca-texto/borracha
  if (e.pointerType === "touch" && (tool === "brush" || tool === "highlighter" || tool === "eraser")) {
    return;
  }

  if(tool==="select"&&(e.ctrlKey||e.metaKey)){const link=topmostAt(p)?.link;if(link&&/^(https?:|mailto:)/i.test(link)){window.open(link,"_blank","noopener,noreferrer");return;}}
  if (tool === "select" && !e.shiftKey && !e.altKey) {
    const url = linkUnder(p);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
  }

  if (tool === "brush" || tool === "highlighter") {
    const settings:DrawingSettings=drawingUI?.settings(tool) ?? {width:tool==="highlighter"?18:6,color:tool==="highlighter"?"#f5d128":"#191812",opacity:tool==='highlighter'?.35:1,precision:false};
    if(settings.precision)settings.precisionSmoothing=(2+(settings.precisionStrength??75)*.16)/camera.scale;
    brushCursor?.move(e.clientX,e.clientY);
    if(e.altKey&&e.button===0){e.preventDefault();gesture={kind:'brush-adjust',start:{x:e.clientX,y:e.clientY},initial:settings,tool};brushCursor?.adjusting(true);return;}
    const r = settings.width/2;
    gesture = { kind: "draw", points: [{ x: p.x, y: p.y, r }], tool,...settings };
    brushPreview.update(gesture.points,settings);
    return;
  }

  if (tool === "eraser") {
    const radius=(drawingUI?.eraserRadius() ?? 12)/camera.scale;
    const partial=drawingUI?.eraserMode()==="partial";bus.beginTransaction(partial?"Apagar parte do traço":"Apagar traços");
    gesture = { kind: "erase", radius,partial,last:p,pending:[] };
    eraseAt(p, radius,partial);
    return;
  }

  if(tool === "select" || tool === "connector") {
    const candidates=[...new Set([...(state.selection.size===1?state.selection:[]),hoveredConnectionWidget,hoverConnectionTarget(p)?.id])].flatMap(id=>{const w=id?state.widgets.get(id):undefined;return w&&!widgetHidden(w)&&!w.locked?[w]:[];});
    for(const w of candidates)for(const h of connectionHandles(w)) if(Math.hypot(h.point.x-screen.x,h.point.y-screen.y)<10){
      connectionMagnet=null;gesture={kind:"connect",fromWidget:w.id,fromAnchor:h.anchor,current:p,fixed:true,startedAt:p,shape:'curved',arrow:true,snapDisabled:e.ctrlKey||e.metaKey};app.canvas.style.cursor='default';
      connectPreview={from:resolveEndpoint(h.anchor,state.widgets)!,to:p};drawSelection();return;
    }
  }
  if (tool === "connector") {
    if(pendingConnection){gesture={...pendingConnection,current:connectionPointer(p,pendingConnection.fromAnchor,e.shiftKey),snapDisabled:e.ctrlKey||e.metaKey};pendingConnection=null;return;}
    connectionMagnet=null;const hit = e.ctrlKey||e.metaKey?undefined:connectionTarget(p);
    const anchor = hit ? nearestAnchor(hit,p) : null;
    gesture = {kind:"connect", fromWidget:hit?.id ?? "", fromAnchor:hit && anchor ? {kind:"anchor",widgetId:hit.id,...anchor} : {kind:"point",x:p.x,y:p.y},current:p,startedAt:p,snapDisabled:e.ctrlKey||e.metaKey};
    connectPreview = {from:resolveEndpoint(gesture.fromAnchor,state.widgets)!,to:p};
    drawSelection();return;
  }

  const existingCreationTarget=tool==='shape'&&(
    (state.selection.size>0&&(handleAtScreen(screen)!==null||rotateHandleAtScreen(screen)))||
    (()=>{const item=frontmostEntityAt(p),widget=item?state.widgets.get(item.id):undefined;return !!widget&&widget.type!=='frame';})());
  if (tool !== "select" && tool !== "image"&&!existingCreationTarget) {
    const start=tool==='text'?{x:camera.x,y:camera.y}:p;
    const widget = createWidget(tool, { x: start.x, y: start.y, shape: selectedShape,
      content: tool === "text" ? "Texto" : tool === "frame" ? "Quadro" : "" });
    widget.style={...widget.style,...creationStyles[widget.type]};
    if(widget.type==='text')widget.style.fontSize=24/camera.scale;
    gesture = { kind: "create", start, current: p, widget };
    creationPreview.show(creationWidgetAt(widget,start,p,camera.scale));
    return;
  }

    // 1a) pontas de conector selecionado (reconectar / soltar)
  const selectedId = [...state.selection][0];
  const selectedConn = selectedId ? state.connectors.get(selectedId) : undefined;
  if (selectedConn && !selectedConn.locked) {
    const geometry = connectorGeometry(selectedConn, state.widgets);
    if (geometry) {
      const ends: Array<{ which: "start" | "end"; p: Vec }> = [
        { which: "start", p: geometry.points[0]! },
        { which: "end", p: geometry.points[geometry.points.length - 1]! },
      ];
      for (const { which, p: endpoint } of ends) {
        const es = camera.worldToScreen(endpoint);
        if (Math.hypot(es.x - screen.x, es.y - screen.y) <= 9) {
          bus.beginTransaction("Reconectar");
          gesture = { kind: "reconnect", id: selectedConn.id, which, current: p };
          connectionMagnet=null;app.canvas.style.cursor='default';
          return;
        }
      }
      const points=connectorEditPoints(selectedConn,geometry);
      for(let index=0;index<points.length;index++){const mid=camera.worldToScreen(points[index]!);if(Math.hypot(mid.x-screen.x,mid.y-screen.y)<9){
        if(e.altKey){bus.exec({op:"CONNECTOR_UPDATE",payload:{id:selectedConn.id,patch:{waypoints:points.filter((_,i)=>i!==index),controlPoint:null}}});return;}
        bus.beginTransaction("Ajustar trajetória");gesture={kind:"bend",id:selectedConn.id,index,points};return;
      }}
    }
  }

if (state.selection.size > 1) {
    const handle = handleAtScreen(screen), box = selectionBox();
    if(box&&rotateHandleAtScreen(screen)&&![...state.selection].some(id=>itemLocked(state,id))){const center=widgetCenter(box);bus.beginTransaction("Girar seleção");gesture={kind:"multi-rotate",initial:captureSelection(state),center,angle:Math.atan2(p.y-center.y,p.x-center.x)};return;}
    if(handle && box && ![...state.selection].some(id=>itemLocked(state,id))) {
      bus.beginTransaction("Redimensionar seleção");
      gesture={kind:"multi-resize",handle,box,items:[...state.selection].map(id=>state.widgets.get(id)).filter((w):w is Widget=>!!w).map(w=>({...w})),initial:captureSelection(state)};return;
    }
  }
// 1) handles (só com seleção única)
  if (isSingleSelection()) {
    const only = [...state.selection][0]!;
    const w = state.widgets.get(only);
    if (w && !w.locked) {
      if (rotateHandleAtScreen(screen)) {
        const c = widgetCenter(w);
        const grabAngle = Math.atan2(p.y - c.y, p.x - c.x);
        bus.beginTransaction("Girar");
        gesture = { kind: "rotate", id: only, startWidget: { ...w }, grabAngle, moved: false };
        return;
      }
      const handle = handleAtScreen(screen);
      if (handle) {
        bus.beginTransaction("Redimensionar");
        gesture = { kind: "resize", id: only, handle, startWidget: { ...w }, moved: false };
        return;
      }
    }
  }

  // 2) objeto
  const front=frontmostEntityAt(p),hit=front&&state.widgets.has(front.id)?state.widgets.get(front.id):undefined;
  if (isolatedGroup && hit && !groupLeaves(state,isolatedGroup).includes(hit.id)) {
    isolatedGroup = null;
  }
  if (!hit) {
    const connector = front?.type==='connector'?state.connectors.get(front.id):undefined;
    if (connector) {
      if(selectClickedEntity(connector.id,e)){gesture={kind:'none'};return;}const ids=[...state.selection];
      if(!ids.some(id=>itemLocked(state,id))){bus.beginTransaction("Mover seleção");gesture={kind:"drag",ids,start:p,delta:{x:0,y:0},initial:captureSelection(state,ids),bounds:selectedBounds(state,ids)};return;}
      gesture = { kind: "none" };
      return;
    }
    const stroke=front?.type==='stroke'?state.strokes.get(front.id):undefined;
    if(stroke){if(selectClickedEntity(stroke.id,e)){gesture={kind:'none'};return;}const ids=[...state.selection];if(!ids.some(id=>itemLocked(state,id))){bus.beginTransaction("Mover seleção");gesture={kind:"drag",ids,start:p,delta:{x:0,y:0},initial:captureSelection(state,ids),bounds:selectedBounds(state,ids)};}return;}
    isolatedGroup=null;
    bus.exec({ op: "SELECTION_SET", payload: [] });
    gesture = { kind: "marquee", start: p, current: p };
    return;
  }

  if(selectClickedEntity(hit.id,e)){gesture={kind:'none'};return;}

  if(hit.link&&/^(https?:|mailto:)/i.test(hit.link)&&!e.altKey&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey)clickedObjectLink={id:hit.id,url:hit.link,start:p};

  let dragIds = [...state.selection];
  if (hit.type === "frame") {
    dragIds = [hit.id, ...containedInFrame(hit)];
  } else {
    for (const id of [...state.selection]) {
      const w = state.widgets.get(id);
      if (w?.type === "frame") dragIds.push(...containedInFrame(w));
    }
    dragIds = [...new Set(dragIds)];
  }
  if(dragIds.some(id=>itemLocked(state,id)))return;
  bus.beginTransaction("Mover seleção");
  gesture = { kind: "drag", ids: dragIds, start: p, delta: { x: 0, y: 0 },initial:captureSelection(state,dragIds),bounds:selectedBounds(state,dragIds) };
});

app.canvas.addEventListener("pointermove", (e) => {
  if(tool==='brush'||tool==='highlighter'||tool==='eraser')brushCursor?.move(e.clientX,e.clientY);
  const prev = pointers.get(e.pointerId);
  if (prev) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  const screen = { x: e.offsetX, y: e.offsetY };
  const p = camera.screenToWorld(screen);
  cursorWorld = p;

  if (pointers.size === 2 && prev) {
    const [a, b] = [...pointers.values()] as { x: number; y: number }[];
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    if (lastPinch) {
      camera.panByScreen(mid.x - lastPinch.mid.x, mid.y - lastPinch.mid.y);
      camera.zoomAt(mid, dist / lastPinch.dist);
    }
    lastPinch = { dist, mid };
    gridDirty = true;
    return;
  }

  if(gesture.kind!=='none')updateCursor();
  if (gesture.kind === "none" && (tool === "select"||tool==='shape')) {
    const hoveredWidget=topmostAt(p);
    hoveredLink = linkUnder(p)??hoveredWidget?.link??null;
    const hover=hoverConnectionTarget(p),nextHover=hover?.id??null;
    if(nextHover!==hoveredConnectionWidget){hoveredConnectionWidget=nextHover;drawSelection();}
    const atDot=hover&&connectionHandles(hover).some(h=>Math.hypot(h.point.x-screen.x,h.point.y-screen.y)<=10);
    const selected=state.selection.size===1?state.connectors.get([...state.selection][0]!):undefined,geometry=selected&&!selected.locked?connectorGeometry(selected,state.widgets):null;
    const grab=geometry&&[geometry.points[0]!,geometry.points.at(-1)!,...connectorEditPoints(selected!,geometry)].some(point=>{const s=camera.worldToScreen(point);return Math.hypot(s.x-screen.x,s.y-screen.y)<=10;});
    const locked=[...state.selection].some(id=>itemLocked(state,id)),handle=!locked?handleAtScreen(screen):null,rotating=!locked&&rotateHandleAtScreen(screen),box=state.selection.size===1?state.widgets.get([...state.selection][0]!):selectionBox();
    app.canvas.style.cursor=handle?resizeCursor(handle,box?.rotation??0):rotating?ROTATE_CURSOR:atDot?'pointer':grab?'grab':hoveredLink?'pointer':hoveredWidget?.locked?'not-allowed':hoveredWidget?(isFreeText(hoveredWidget)&&state.selection.has(hoveredWidget.id)?'text':'move'):tool==='shape'?'crosshair':'default';
  }
  if(gesture.kind==='none'&&tool==='connector'){const hover=hoverConnectionTarget(p),nextHover=hover?.id??null;if(nextHover!==hoveredConnectionWidget){hoveredConnectionWidget=nextHover;drawSelection();}app.canvas.style.cursor=!pendingConnection&&hover&&connectionHandles(hover).some(h=>Math.hypot(h.point.x-screen.x,h.point.y-screen.y)<=10)?'pointer':pendingConnection?'default':'crosshair';}

  if(pendingConnection && gesture.kind === "none") {pendingConnection.current=connectionPointer(p,pendingConnection.fromAnchor,e.shiftKey);pendingConnection.snapDisabled=e.ctrlKey||e.metaKey;connectPreview={from:resolveEndpoint(pendingConnection.fromAnchor,state.widgets)!,to:pendingConnection.current};drawSelection();}
  switch (gesture.kind) {
    case 'brush-adjust':{
      const dx=e.clientX-gesture.start.x,dy=e.clientY-gesture.start.y;
      drawingUI?.adjust(gesture.tool,{width:gesture.initial.width+dx/Math.max(.02,camera.scale)*.4,opacity:gesture.initial.opacity-dy*.005},false);
      return;
    }
    case 'eraser-adjust':drawingUI?.adjustEraserRadius(gesture.radius+(e.clientX-gesture.start.x)*.5,false);brushCursor?.update();return;
    case "bend": {const id=gesture.id,index=gesture.index,c=state.connectors.get(id),points=gesture.points.map((v,i)=>i===index?p:v);const singleCurve=(c?.shape==='curved'||c?.shape==='elbowed')&&!c.waypoints?.length&&points.length===1;const patch=singleCurve?{controlPoint:points[0],waypoints:null}:{waypoints:points,controlPoint:null,...(c?.shape==="straight"?{shape:"curved" as const}:{})};queueGestureUpdate(()=>bus.exec({op:'CONNECTOR_UPDATE',payload:{id,patch}}));return;}
    case "multi-rotate":{let angle=Math.atan2(p.y-gesture.center.y,p.x-gesture.center.x)-gesture.angle;if(e.shiftKey)angle=Math.round(angle/(Math.PI/12))*Math.PI/12;bus.exec({op:"BATCH",payload:{label:"Girar seleção",commands:transformSnapshot(state,gesture.initial,0,0,1,1,gesture.center,angle)}});return;}
    case "create": {
      let dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      if (e.shiftKey) { const n = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1)*n; dy = (dy < 0 ? -1 : 1)*n; }
      gesture.current = { x: gesture.start.x + dx, y: gesture.start.y + dy };
      overlay.clear();creationPreview.show(creationWidgetAt(gesture.widget,gesture.start,gesture.current,camera.scale));
      return;
    }
    case "pan": {
      if (!prev) return;
      camera.panByScreen(e.clientX - prev.x, e.clientY - prev.y);
      momentum.move({x:e.clientX,y:e.clientY},performance.now());
      gridDirty = true;
      return;
    }
    case "drag": {
      let dx = p.x - gesture.start.x;
      let dy = p.y - gesture.start.y;

      if (!e.altKey) {
        const movingIds = new Set(gesture.ids);
        const bounds = gesture.bounds;
        const targets = state.order
          .filter((id) => !movingIds.has(id))
          .map((id) => state.widgets.get(id))
          .filter((w): w is Widget => Boolean(w))
          .map(widgetAABB);

        if (bounds) {
          const result = snapMove(
            bounds,
            targets,
            { dx, dy },
            Math.max(6 / camera.scale, gridState.snapThreshold * 0.5),
            gridState.snapCell,
          );
          dx = result.dx;
          dy = result.dy;
          activeGuides = result.guides;
        }
      } else {
        activeGuides = [];
      }

      gesture.delta = { x: dx, y: dy };
      const moving=gesture;
      queueGestureUpdate(()=>{bus.exec({op:"BATCH",payload:{label:"Mover",commands:transformSnapshot(state,moving.initial,dx,dy)}});if(moving.ids.length===1&&state.widgets.get(moving.ids[0]!)?.mind&&Math.hypot(dx,dy)*camera.scale>5)mindmapUI?.previewDrop(moving.ids[0]!,p);});
      return;
    }
    case "draw": {
      const bounds = app.canvas.getBoundingClientRect();
      const samples = e.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [e]) {
        const pos = camera.screenToWorld({x:sample.clientX-bounds.left,y:sample.clientY-bounds.top});
        const last = gesture.points[gesture.points.length - 1]!;
        if (Math.hypot(pos.x-last.x,pos.y-last.y)*camera.scale < .3) continue;
        gesture.points.push({...pos,r:gesture.width/2});
      }
      brushPreview.update(gesture.points,gesture);
      return;
    }
    case "erase": {
      const erasing=gesture;erasing.pending.push(p);queueGestureUpdate(()=>{const points=erasing.pending;erasing.pending=[];if(points.length){erasePath([erasing.last,...points],erasing.radius,erasing.partial);erasing.last=points.at(-1)!;}});
      const cursor=camera.worldToScreen(p);overlay.clear().circle(cursor.x,cursor.y,gesture.radius*camera.scale).stroke({width:1,color:0x3859ff});
      return;
    }
    case "reconnect": {
      const connector = state.connectors.get(gesture.id);
      if (connector) {
        const other = gesture.which === "start" ? connector.end : connector.start;
        gesture.current=connectionPointer(p,other,e.shiftKey);gesture.snapDisabled=e.ctrlKey||e.metaKey;
        const picked=connectionPick(gesture.current,resolveEndpoint(other,state.widgets)??undefined,other.kind==='anchor'?other.widgetId:undefined,gesture.snapDisabled),target=picked?.widget;
        let endpoint: Endpoint = { kind: "point", x: gesture.current.x, y: gesture.current.y };
        if (target) {
          const anchor = picked!.anchor;
          endpoint = { kind: "anchor", widgetId: target.id, x: anchor.x, y: anchor.y };
        }
        const id=gesture.id,patch=gesture.which==='start'?{start:endpoint}:{end:endpoint};queueGestureUpdate(()=>bus.exec({op:'CONNECTOR_UPDATE',payload:{id,patch}}));
      }
      return;
    }
    case "connect": {
      gesture.current = connectionPointer(p,gesture.fromAnchor,e.shiftKey);gesture.snapDisabled=e.ctrlKey||e.metaKey;
      app.canvas.style.cursor='default';
      connectPreview = {from:resolveEndpoint(gesture.fromAnchor,state.widgets)??p,to:gesture.current};
      queueGestureUpdate(drawSelection);
      return;
    }
    case "marquee": {
      gesture.current = p;
      const r = marqueeRect(gesture.start, gesture.current);
      const a = camera.worldToScreen({ x: r.minX, y: r.minY });
      const b = camera.worldToScreen({ x: r.maxX, y: r.maxY });
      overlay.clear();
      overlay
        .rect(a.x, a.y, b.x - a.x, b.y - a.y)
        .fill({ color: 0x3859ff, alpha: 0.08 })
        .stroke({ width: 1, color: 0x3859ff });
      return;
    }
    case "multi-resize": {
      const box = resizeWidget(gesture.box,gesture.handle,p,e.shiftKey);
      const sx = box.width/gesture.box.width, sy=box.height/gesture.box.height;
      bus.exec({op:"BATCH",payload:{label:"Redimensionar seleção",commands:transformSnapshot(state,gesture.initial,box.x-gesture.box.x,box.y-gesture.box.y,sx,sy,{x:gesture.box.x,y:gesture.box.y})}});
      return;
    }
    case "resize": {
      const start = gesture.startWidget;
      const next = isFreeText(start)?resizeFreeText(start,gesture.handle,p):resizeWidget(start, gesture.handle, p, e.shiftKey);
      gesture.moved = true;
      const resizingId=gesture.id;queueGestureUpdate(()=>bus.exec({ op: "WIDGET_UPDATE", payload: { id: resizingId, patch: next } }));

      return;
    }
    case "rotate": {
      const start = gesture.startWidget;
      const c = widgetCenter(start);
      const angle = Math.atan2(p.y - c.y, p.x - c.x);
      let rotation = start.rotation + (angle - gesture.grabAngle);
      if (e.shiftKey) rotation = Math.round(rotation / (Math.PI / 12)) * (Math.PI / 12);
      gesture.moved = true;
      bus.exec({ op: "WIDGET_UPDATE", payload: { id: gesture.id, patch: { rotation } } });
      gesture.startWidget = { ...start, rotation };
      gesture.grabAngle = angle;
      return;
    }
    default:
      return;
  }
});

let lastMarqueeRect: Rect | null = null;

function eraseAt(p:Vec,radius:number,partial=false,from:Vec=p):void {erasePath([from,p],radius,partial);}
function erasePath(points:Vec[],radius:number,partial:boolean):void {
  if(points.length<2)return;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}const commands:Command[]=[];
  for(const id of state.strokeOrder){const stroke=state.strokes.get(id);if(!stroke||stroke.hidden||stroke.locked)continue;const bounds=strokeBounds(stroke);if(bounds.maxX<minX-radius||bounds.minX>maxX+radius||bounds.maxY<minY-radius||bounds.minY>maxY+radius)continue;let erased=stroke;
    for(let i=1;i<points.length;i++){if(partial)erased=eraseStrokeArea(erased,points[i-1]!,points[i]!,radius);else if(strokeIntersectsEraser(stroke,points[i-1]!,points[i]!,radius)){commands.push({op:'STROKE_REMOVE',payload:id});break;}}
    if(partial&&erased!==stroke)commands.push({op:'STROKE_UPDATE',payload:{id,patch:{erasures:erased.erasures}}});
  }
  if(commands.length)bus.exec({op:'BATCH',payload:{label:partial?'Apagar área do desenho':'Apagar traços',commands}});
}

function marqueeRect(a: Vec, b: Vec): Rect {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

function endGesture(e: PointerEvent): void {
  flushGestureUpdate();
  const objectLink=clickedObjectLink;clickedObjectLink=null;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) lastPinch = null;

  if(e.type==="pointercancel"){
    mindmapUI?.clearDrop();
    creationPreview.clear();
    brushPreview.clear();brushCursor?.adjusting(false);drawingUI?.commitSettings();
    bus.endTransaction();gesture={kind:"none"};pendingConnection=null;connectPreview=null;activeGuides=[];drawSelection();updateCursor();refreshChrome();return;
  }
  let completionId:string|undefined;
  switch (gesture.kind) {
    case 'brush-adjust':drawingUI?.commitSettings();brushCursor?.adjusting(false);break;
    case 'eraser-adjust':drawingUI?.adjustEraserRadius(drawingUI.eraserRadius());brushCursor?.adjusting(false);break;
    case "create": {
      if (e.type === "pointercancel") break;
      const {widget,start,current} = gesture;
      const next=creationWidgetAt(widget,start,current,camera.scale);creationPreview.clear();
      bus.exec({op:'BATCH',payload:{label:'Criar objeto',commands:[{op:'WIDGET_CREATE',payload:next},{op:'SELECTION_SET',payload:[next.id]}]}});
      setTool(next.type==='shape'?'shape':next.type==='sticky_note'&&stickyStackMode?'sticky_note':'select');
      if (next.type === "text") beginEdit(state.widgets.get(next.id)!);
      break;
    }
    case "pan":
      momentum.release(performance.now());scheduleSave();
      updateCursor();
      break;
    case "drag": {if(gesture.ids.length===1&&state.widgets.get(gesture.ids[0]!)?.mind&&Math.hypot(gesture.delta.x,gesture.delta.y)*camera.scale>5){const rect=app.canvas.getBoundingClientRect();mindmapUI?.commitDrop(gesture.ids[0]!,camera.screenToWorld({x:e.clientX-rect.left,y:e.clientY-rect.top}));}mindmapUI?.clearDrop();break;}
    case "draw": {
      const raw = gesture.points;
      brushPreview.clear();
      if (raw.length >= 1&&gesture.opacity>0) {
        const points = raw;
        const stroke: Stroke = {
          id: `stroke_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`,
          type: "stroke",
          tool: gesture.tool,
          color: gesture.color,
          opacity:gesture.opacity,precision:gesture.precision,precisionSmoothing:gesture.precisionSmoothing,
          points,
          z: 0,
        };
        bus.exec({ op: "STROKE_CREATE", payload: stroke });
      }
      drawSelection();
      break;
    }
    case "reconnect": {
      const c=state.connectors.get(gesture.id);
      if(c&&c[gesture.which].kind==="point"&&c[gesture.which==="start"?"end":"start"].kind==="anchor")completionId=c.id;
      connectionMagnet=null;app.canvas.style.cursor='default';
      break;
    }
    case "connect": {
      const originPoint=resolveEndpoint(gesture.fromAnchor,state.widgets)!;
      const startedAt=gesture.startedAt ?? originPoint;
      if(Math.hypot(gesture.current.x-startedAt.x,gesture.current.y-startedAt.y)*camera.scale<5 && tool==="connector") {pendingConnection={...gesture};gesture={kind:"none"};return;}
      const source = state.widgets.get(gesture.fromWidget);
      if(source&&gesture.fixed&&Math.hypot(gesture.current.x-startedAt.x,gesture.current.y-startedAt.y)*camera.scale<5){
        const center=widgetCenter(source),dx=originPoint.x-center.x,dy=originPoint.y-center.y,length=Math.hypot(dx,dy)||1;
        const distance=Math.max(180,Math.min(320,180/camera.scale));
        gesture.current={x:originPoint.x+dx/length*distance,y:originPoint.y+dy/length*distance};
      }
      const picked=connectionPick(gesture.current,originPoint,source?.id,gesture.snapDisabled),target=picked?.widget;
      const origin = gesture.fromAnchor;
      const startPoint = source ? widgetCenter(source) : {x:origin.x,y:origin.y};
      const finish = gesture.current;
      if (!source||!pointInWidget(source,finish)) {
        if (Math.hypot(finish.x-startPoint.x,finish.y-startPoint.y)*camera.scale > 4) {
          const startAnchor = source ? (gesture.fixed ? gesture.fromAnchor : facingAnchor(source,target ? widgetCenter(target) : finish)) : null;
          const endAnchor = target ? picked!.anchor : null;
          const connector: Connector = {id:crypto.randomUUID(),type:"connector",
            start:source && startAnchor ? {kind:"anchor",widgetId:source.id,...startAnchor} : origin,
            end:target && endAnchor ? {kind:"anchor",widgetId:target.id,...endAnchor} : {kind:"point",...finish},
            shape:gesture.shape??connectorDefault.shape,style:{strokeColor:"#1a1a1a",strokeWidth:2,endCap:(gesture.arrow??connectorDefault.arrow)?"arrow":"none"},z:0};
          bus.exec({op:"BATCH",payload:{label:"Criar conexão",commands:[
            {op:"CONNECTOR_CREATE",payload:connector},
            {op:"SELECTION_SET",payload:[connector.id]},
          ]}});
          if(source&&!target)completionId=connector.id;
        }
      }
      connectPreview = null;
      setTool("select");
      break;
    }
    case "marquee": {
      const r = marqueeRect(gesture.start, gesture.current);
      lastMarqueeRect = r;
      const ids = state.order.filter((id) => {
        const w = state.widgets.get(id);
        return w&&!widgetHidden(w) ? rectIntersectsWidget(r, w) : false;
      });
      for(const id of [...state.connectorOrder,...state.strokeOrder]){const bounds=selectedBounds(state,[id]);if(bounds&&bounds.minX<=r.maxX&&bounds.maxX>=r.minX&&bounds.minY<=r.maxY&&bounds.maxY>=r.minY)ids.push(id);}
      bus.exec({ op: "SELECTION_SET", payload: [...new Set(ids.flatMap(id=>memberSelection(state,id,isolatedGroup)))] });
      break;
    }
    default:
      break;
  }
  bus.endTransaction();
  if(objectLink&&e.type==='pointerup'){const rect=app.canvas.getBoundingClientRect(),point=camera.screenToWorld({x:e.clientX-rect.left,y:e.clientY-rect.top});if(Math.hypot(point.x-objectLink.start.x,point.y-objectLink.start.y)*camera.scale<4&&state.widgets.has(objectLink.id))window.open(objectLink.url,'_blank','noopener,noreferrer');}
  gesture = { kind: "none" };
  updateCursor();
  refreshChrome();
  activeGuides = [];
  connectPreview = null;
  drawSelection();
  if(completionId)connectorCompletion?.show(completionId);
}
app.canvas.addEventListener("pointerup", endGesture);
app.canvas.addEventListener("pointercancel", endGesture);
app.canvas.addEventListener("pointerleave",()=>{if(gesture.kind==="none"&&hoveredConnectionWidget){hoveredConnectionWidget=null;drawSelection();}});

app.canvas.addEventListener(
  "wheel",
  (e) => {
    momentum.stop();
    e.preventDefault();
    connectorCompletion?.close();
    if (e.ctrlKey || !e.shiftKey) {
      const unit=e.deltaMode===1?16:e.deltaMode===2?camera.height:1;
      camera.zoomAt({ x: e.offsetX, y: e.offsetY }, Math.exp(-e.deltaY*unit*0.0025));
    } else {
      const unit=e.deltaMode===1?16:e.deltaMode===2?camera.height:1;
      camera.panByScreen(-e.deltaX*unit, -e.deltaY*unit);
    }
    gridDirty = true;
    refreshChrome();
  },
  { passive: false },
);

// ------------------------------------------------------------- keyboard

window.addEventListener("keydown", (e) => {
  if(document.body.classList.contains("home-visible")||home?.transitioning())return;
  if(e.key==="Escape"&&document.querySelector('#selection-properties details[open],#shape-picker:not([hidden]),#connector-picker:not([hidden]),#editor-context:not([hidden])')){
    e.preventDefault();editorUI?.closePanels();return;
  }
  // enquanto o usuário digita (editor inline, prompt, input), atalhos globais não valem
  const target = e.target as HTMLElement | null;
  const rangeHistory = target instanceof HTMLInputElement && target.type === 'range' && (e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase());
  if(rangeHistory){
    e.preventDefault();editorUI?.finalizePropertyGestures();connectorCompletion?.close();
    if(e.key.toLowerCase()==='y'||e.shiftKey)bus.redo();else bus.undo();
    editorUI?.refreshAfterHistory();mindmapUI?.refreshAfterHistory();return;
  }
  if (
    target &&
    (target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "INPUT" ||
      target.isContentEditable)
  ) {
    return;
  }

  // Native controls own Space/Enter and navigation while they have focus.
  // Modifier commands such as Undo remain available outside text-entry fields.
  if([' ','Enter','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key)&&target?.closest('button,summary,a[href],[role="button"],[role="menuitem"],[role="checkbox"]')&&!e.ctrlKey&&!e.metaKey)return;

  if(mindmapUI?.handleKey(e))return;
  if (e.code === "Space") {
    spaceDown = true;
    app.canvas.style.cursor = "grab";
    brushCursor?.update();e.preventDefault();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === "z") {
    e.preventDefault();
    connectorCompletion?.close();
    if (e.shiftKey) bus.redo();
    else bus.undo();
    return;
  }
  if (mod && key === "y") {
    e.preventDefault();
    bus.redo();
    return;
  }
  if (mod && e.key === "0") {
    e.preventDefault();camera.zoomAt({x:camera.width/2,y:camera.height/2},1/camera.scale);
    gridDirty = true;
    refreshChrome();
    return;
  }
  if (mod && (e.key === "]" || e.key === "[")) {
    e.preventDefault();
    const ids = [...state.selection];
    if (ids.length === 0||ids.some(id=>itemLocked(state,id))) return;
    const direction = e.key === "]"
      ? e.shiftKey ? "front" : "forward"
      : e.shiftKey ? "back" : "backward";
    bus.exec({ op: "WIDGET_REORDER", payload: { ids, direction } });
    return;
  }
  if (mod && key === "a") {
    e.preventDefault();
    bus.exec({ op: "SELECTION_SET", payload: [...state.order,...state.connectorOrder,...state.strokeOrder].filter(id=>!entityHidden(id)) });
    return;
  }
  if(mod&&key==="g"){e.preventDefault();if([...state.selection].some(id=>itemLocked(state,id)))return;if(e.shiftKey)ungroupSelection(state,bus);else groupSelection(state,bus);return;}
  // Let the browser dispatch native copy/paste events, including clipboard images.
  if(mod&&(key==='c'||key==='v'))return;
  if(mod&&key==="d"){e.preventDefault();duplicateSnapshot(state,bus,captureSelection(state));return;}
  if (e.key === "1" && e.shiftKey) {
    fitToContent();
    return;
  }

  switch (e.key) {

    case "v":
    case "V":
      setTool("select");
      break;
    case "s":
    case "S":
      stickyStackMode=false;
      setTool("sticky_note");
      break;
    case "r":
    case "R":
      setTool("shape");
      editorUI?.openShapes();
      break;
    case "t":
    case "T":
      setTool("text");
      break;
    case "c":
    case "C":
      setTool("connector");
      break;
    case "f":
    case "F":
      setTool("frame");
      break;
    case "p":
    case "P":
    case "b":
    case "B":
      setTool("brush");
      break;
    case "e":
    case "E":
      setTool("eraser");
      break;
    case "?":
      e.preventDefault();
      toggleHelp();
      break;
    case "i":
    case "I":
      hud.hidden = !hud.hidden;
      break;
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown": {
      if (state.selection.size === 0) break;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      bus.exec({op:"BATCH",payload:{label:"Mover seleção",commands:transformSnapshot(state,captureSelection(state),dx,dy)}});
      break;
    }
    case "Delete":
    case "Backspace": {
      if (state.selection.size === 0) break;
      e.preventDefault();
      bus.beginTransaction("Excluir seleção");
      for (const id of [...state.selection]) {
        if(itemLocked(state,id))continue;
        if(state.widgets.get(id)?.mind)deleteMindSubtree(state,bus,id);
        else if (state.connectors.has(id)) bus.exec({ op: "CONNECTOR_REMOVE", payload: id });
        else if (state.strokes.has(id)) bus.exec({ op: "STROKE_REMOVE", payload: id });
        else bus.exec({ op: "WIDGET_REMOVE", payload: id });
      }
      bus.endTransaction();
      break;
    }
    case "Enter": {
      const id = [...state.selection][0];
      const w = id ? state.widgets.get(id) : undefined;
      if (!w) break;
      e.preventDefault();
      if(!w.locked)beginEdit(w);
      break;
    }
    case "Escape":
      flushGestureUpdate();
      brushPreview.clear();brushCursor?.adjusting(false);
      if (!helpPanel.hasAttribute("hidden")) {
        toggleHelp(false);
        break;
      }
      bus.endTransaction();
      gesture = {kind:"none"};
      editorUI?.closePanels();
      bus.exec({ op: "SELECTION_SET", payload: [] });
      setTool("select");
      isolatedGroup = null;
      drawSelection();
      break;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceDown = false;
    updateCursor();
    brushCursor?.update();
  }
});

function editWaypoint(remove:boolean){
  const c=state.connectors.get([...state.selection][0]!);if(!c||c.locked)return;const g=connectorGeometry(c,state.widgets);if(!g)return;
  const points=connectorEditPoints(c,g);const waypoints=remove?points.slice(0,-1):connectorInsertWaypoint(c,g,connectorPointAt(g,1/(points.length+2)));
  bus.exec({op:"CONNECTOR_UPDATE",payload:{id:c.id,patch:{waypoints,controlPoint:null}}});
}
async function copySelectionImage(){
  const r=selectionRect();if(!r)return;
  const selectedConnectors=[...state.connectors].filter(([id])=>state.selection.has(id)).map(([id,c])=>{
    const endpoint=(e:Endpoint):Endpoint=>{if(e.kind==='point'||state.selection.has(e.widgetId))return e;const point=resolveEndpoint(e,state.widgets);return point?{kind:'point',...point}:e;};
    return [id,{...c,start:endpoint(c.start),end:endpoint(c.end)}] as const;
  });
  const subset={...state,widgets:new Map([...state.widgets].filter(([id])=>state.selection.has(id))),order:state.order.filter(id=>state.selection.has(id)),connectors:new Map(selectedConnectors),connectorOrder:state.connectorOrder.filter(id=>state.selection.has(id)),strokes:new Map([...state.strokes].filter(([id])=>state.selection.has(id))),strokeOrder:state.strokeOrder.filter(id=>state.selection.has(id))};
  const svg=boundedSvgBitmap(await embedSvgFonts(boardToSvg(subset,{background:"none"}),[...subset.widgets.values()].map(w=>w.style.fontFamily))),url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
  try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement("canvas"),scale=Math.min(2,4096/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.ceil(img.width*scale));canvas.height=Math.max(1,Math.ceil(img.height*scale));canvas.getContext("2d")!.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve));if(blob){try{await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);}catch{downloadBlob(blob,"selecao.png");}}}finally{URL.revokeObjectURL(url);}
}
// Local editor controls
images = installImages({state,bus,camera,app,world,getBoardKey:mediaBoardKey,nodeAt:id=>scene.nodeAt(id),onChange:()=>{syncScene();refreshChrome();}});
backgroundUI=installBackground({state,bus,camera,app,world,getBoardKey:mediaBoardKey,onChange:()=>{gridDirty=true;syncScene();refreshChrome();}});
layersUI=installLayers({state,bus,camera,onSelect:()=>{isolatedGroup=null;setTool('select');},onChange:()=>{syncScene();drawSelection();refreshChrome();}});
const mindImagePicker=document.createElement('input');mindImagePicker.type='file';mindImagePicker.accept='image/*';mindImagePicker.multiple=true;
let mindImageTarget:{parentId:string;boardKey:string|null}|null=null;
mindImagePicker.addEventListener('change',()=>{const files=Array.from(mindImagePicker.files??[]),target=mindImageTarget;mindImagePicker.value='';mindImageTarget=null;if(!target||!files.length)return;void images?.importFiles(files,{label:'Imagem no mapa mental',canInsert:()=>target.boardKey===mediaBoardKey()&&!!state.widgets.get(target.parentId)?.mind&&!state.widgets.get(target.parentId)?.locked,afterCreate:ids=>{for(const id of ids)attachMindWidget(state,bus,target.parentId,id);}});});
mindmapUI=installMindmapUI({state,bus,camera,setTool:t=>setTool(t),getTool:()=>tool,onEdit:id=>{const w=state.widgets.get(id);if(w&&!w.locked)beginEdit(w);},onLink:()=>linkUI?.open(),onImage:parentId=>{mindImageTarget={parentId,boardKey:mediaBoardKey()};mindImagePicker.click();},onChange:()=>{syncScene();drawSelection();refreshChrome();}});
linkUI=installLinkUI({state,bus,camera,getBoardKey:mediaBoardKey,getEditor:()=>editor,commitEditor:()=>endEdit(true),onChange:()=>{syncScene();drawSelection();refreshChrome();}});
audioUI=installAudio({state,bus,camera,getTool:()=>tool,setTool:t=>setTool(t),getBoardKey:mediaBoardKey,onChange:()=>{syncScene();drawSelection();refreshChrome();}});
structuredUI=installStructuredTextUI({state,bus,camera,getTool:()=>tool,setTool:t=>setTool(t as Tool),onChange:()=>{syncScene();drawSelection();refreshChrome();}});
connectorCompletion=installConnectorCompletion({state,bus,camera});
const imagePicker = document.createElement("input");
let imagePickerBoardKey:string|null=null;
imagePicker.type="file"; imagePicker.accept="image/*"; imagePicker.multiple=true;
imagePicker.addEventListener("change",()=>{const boardKey=imagePickerBoardKey;if(imagePicker.files) void images?.importFiles(imagePicker.files,{canInsert:()=>boardKey===mediaBoardKey()}); imagePicker.value="";});
editorUI = installEditorUI({state,bus,camera,setTool:t=>setTool(t as Tool),getTool:()=>tool,
  entityAt:p=>frontmostEntityAt(p)?.id,
  isTransforming:()=>['drag','resize','multi-resize','rotate','multi-rotate','bend','reconnect'].includes(gesture.kind),
  onLink:()=>linkUI?.open(),
  setConnectorDefault:options=>{connectorDefault=options;},
  onStyleDefaults:(type,patch)=>{creationStyles[type]={...creationStyles[type],...patch};},
  setStickyStackMode:enabled=>{stickyStackMode=enabled;},
  setShape:s=>{selectedShape=s;},getShape:()=>selectedShape,onImage:()=>{imagePickerBoardKey=mediaBoardKey();imagePicker.click();},
  onCrop:()=>images?.cropSelected(),onResetCrop:()=>images?.resetCrop(),
  onCircleCrop:()=>images?.circleCropSelected(),onEditText:()=>{const w=state.widgets.get([...state.selection][0]!);if(w&&!w.locked&&w.type!=="image")beginEdit(w);},
  onImageActualSize:()=>{
    const w=state.widgets.get([...state.selection][0]!);if(w?.type!=="image"||w.locked||state.selection.size!==1)return;
    const width=w.naturalWidth*(w.crop?.width??1),height=w.naturalHeight*(w.crop?.height??1);
    bus.exec({op:"WIDGET_UPDATE",payload:{id:w.id,patch:{x:w.x+(w.width-width)/2,y:w.y+(w.height-height)/2,width,height}}});
  },
  onReplaceImage:()=>images?.replaceSelected(),onFlipImage:axis=>images?.flipSelected(axis),onDownloadImage:()=>images?.downloadSelected(),
  onCreateChecklist:()=>structuredUI?.configureChecklist(state.widgets.get([...state.selection][0]!)),onCreateTable:()=>structuredUI?.configureTable(state.widgets.get([...state.selection][0]!)),
  getGroupScope:()=>isolatedGroup,onExitGroup:()=>{const group=isolatedGroup;isolatedGroup=null;if(group)bus.exec({op:"SELECTION_SET",payload:groupLeaves(state,group)});refreshChrome();},
  onAddWaypoint:()=>editWaypoint(false),onRemoveWaypoint:()=>editWaypoint(true),onCopyImage:()=>{void copySelectionImage();}});
installIcons();
drawingUI=installDrawingUI({getTool:()=>tool,setTool:t=>setTool(t as Tool),onChange:()=>brushCursor?.update()});
brushCursor=installBrushCursor({camera,getTool:()=>tool,getSettings:()=>drawingUI!.settings(tool==='highlighter'?'highlighter':'brush'),getEraserRadius:()=>drawingUI?.eraserRadius()??12,temporaryHand:()=>spaceDown||gesture.kind==='pan'});
app.canvas.addEventListener('pointerleave',()=>brushCursor?.leave());
const projectFiles=installProjectFiles({state,bus,camera,getBoardKey:mediaBoardKey,sync:()=>{boardEpoch++;gridDirty=true;syncScene();drawSelection();refreshChrome();if(home&&!home.currentId())void home.adoptCurrent();else{home?.updateCurrent();scheduleSave();}}});
const title=document.getElementById("board-title")!;title.contentEditable="true";title.setAttribute("role","textbox");title.setAttribute("aria-label","Nome do board");title.setAttribute("spellcheck","false");title.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();title.blur();}});title.addEventListener("blur",()=>{if(!title.textContent?.trim())title.textContent="Board sem título";home?.updateCurrent({title:title.textContent??"Board"});scheduleSave();});

// ------------------------------------------------------------------ loop

let frames = 0;
let fps = 0;
let fpsAt = performance.now();

app.ticker.add(() => {
  if(momentum.active){if(gesture.kind!=='none'||document.hidden||home?.transitioning()||document.body.classList.contains('home-visible'))momentum.stop();else{const delta=momentum.tick(performance.now());camera.panByScreen(delta.x,delta.y);gridDirty=true;if(!momentum.active)scheduleSave();}}
  const resolution=Math.min(window.devicePixelRatio||1,3);
  if(resolution!==app.renderer.resolution){const width=app.screen.width,height=app.screen.height;app.renderer.resolution=resolution;app.renderer.resize(width,height);syncSize();syncScene();brushPreview.request();creationPreview.refresh();gridDirty=true;}
  if (camera.scale !== lastScale) {
    lastScale = camera.scale;
    gridDirty = true;
    refreshChrome();
  }

  world.position.set(
    camera.width / 2 - camera.x * camera.scale,
    camera.height / 2 - camera.y * camera.scale,
  );
  world.scale.set(camera.scale);

  if (camera.x !== lastCamera.x || camera.y !== lastCamera.y || camera.scale !== lastCamera.scale) {
    lastCamera = { x: camera.x, y: camera.y, scale: camera.scale };
    if (editor && editingId) {
      const w = state.widgets.get(editingId);
      if (w) {
        positionEditor(w);
      }
    }
    syncScene();
    brushPreview.request();brushCursor?.update();creationPreview.refresh();mindmapUI?.refresh();audioUI?.refresh();structuredUI?.refresh();
    if (state.selection.size > 0) {drawSelection();positionContextPanel(document.getElementById("selection-properties")!,state,camera);}
  }

  if (gridDirty) {
    drawGrid();
    if (state.selection.size > 0) drawSelection();
    gridDirty = false;
  }

  frames++;
  const now = performance.now();
  if (now - fpsAt > 500) {
    fps = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0;
    fpsAt = now;
  }

  if(!hud.hidden){const snapped = snapPoint(cursorWorld, gridState);
  hud.textContent = [
    `tool      ${tool}`,
    `objetos   ${state.widgets.size}   seleção ${state.selection.size}`,
    `zoom      ${(camera.scale * 100).toFixed(0)}%   snap ${gridState.snapCell} u`,
    `mundo     ${cursorWorld.x.toFixed(1)}, ${cursorWorld.y.toFixed(1)} ${snapped.snapped ? "• snap" : ""}`,
    `undo/redo ${bus.undoStack.length}/${bus.redoStack.length}`,
    `fps       ${fps}`,
  ].join("\n");}
});

home=installBoardHome({capture:savedBoard,afterTransition:()=>refreshChrome(),beforeTransition:()=>{momentum.stop();audioUI?.pauseAll();flushGestureUpdate();endEdit(true);editorUI?.finalizePropertyGestures();bus.endTransaction();gesture={kind:'none'};pointers.clear();brushPreview.clear();creationPreview.clear();connectorCompletion?.close();},open:async data=>{
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}endEdit(true);bus.endTransaction();gesture={kind:"none"};isolatedGroup=null;
  await restoreUserFonts((data as SavedBoard).userFonts);
  await Promise.all([...new Set((data as SavedBoard).widgets.map(w=>(w as Widget).style.fontFamily))].map(loadBoardFont));
  if(!loadBoard(data as SavedBoard))throw new Error("Não foi possível abrir este board.");
  setTool("select");gridDirty=true;syncScene();drawGrid();drawSelection();refreshChrome();
},thumbnail:async()=>{const svg=boundedSvgBitmap(await embedSvgFonts(boardToSvg(state,{padding:30}),[...state.widgets.values()].map(w=>w.style.fontFamily)),1024,1024*1024);return 'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));},importFile:()=>projectFiles.open(),exportCurrent:()=>projectFiles.save()});
const bootPromise=home.start();

(window as unknown as { __board: unknown }).__board = {
  app,
  camera,
  state,
  bus,
  grid: () => gridStateAt(camera.scale),
  geom: { widgetAABB, widgetCorners, pointInWidget, rectIntersectsWidget, resizeWidget, handleWorld },
  snap: snapMove,
  linksFor: (id: string) => scene.linksFor(id),
  lastMarquee: () => lastMarqueeRect,
  gesture: () => gesture,
  eraseAt,
  navigation:{stop:()=>momentum.stop(),active:()=>momentum.active},
  load: loadBoard,
  saveNow: persistBoard,
  booted: false,
};


bootPromise.then(()=>{(window as unknown as {__board:{booted:boolean}}).__board.booted=true;});
