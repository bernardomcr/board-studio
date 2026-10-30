import { Application, Container, Graphics } from "pixi.js";
import { Camera } from "./core/camera";
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
import {
  connectorEditPoints,connectorInsertWaypoint,connectorPointAt,
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
import { distanceToStroke, simplify, strokeOutline, strokeBounds, type Stroke, type StrokePoint } from "./core/strokes";
import { fromHtml, toHtml } from "./core/richtext";
import { boardToSvg } from "./core/exportSvg";
import { BoardScene } from "./render/scene";

import { installImages } from "./images";
import { installEditorUI } from "./editor-ui";
import {installBoardHome} from "./board-home";
import {ensureFonts,loadBoardFont,embedSvgFonts} from "./fonts";
import {installIcons} from "./icons";
import {positionContextPanel} from "./context-position";
import {readStoredBoard,writeStoredBoard} from "./core/board-storage";
import { installProjectFiles } from "./project-files";
import {groupLeaves,memberSelection,enclosingGroup,groupSelection,ungroupSelection,captureSelection,duplicateSnapshot,transformSnapshot,selectedBounds,itemLocked,type EntitySnapshot} from "./core/groups";
import {eraseStrokePoints} from "./core/eraser";
import {lassoHits} from "./core/lasso";
import { installDrawingUI } from "./drawing-ui";

await ensureFonts();
const host = document.getElementById("app")!;
const hud = document.getElementById("hud")!;
const toolbar = document.getElementById("toolbar") as HTMLElement;

const app = new Application();
await app.init({
  resizeTo: host,
  antialias: true,
  background: "#fbfaf7",
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
host.appendChild(app.canvas);

const camera = new Camera();
const world = new Container();
const gridLayer = new Graphics();
const overlay = new Graphics();

app.stage.addChild(gridLayer, world, overlay);

const STORAGE_KEY = "board-app:v1";
let home:ReturnType<typeof installBoardHome>|undefined;
const storageKey=()=>home?.currentKey()??STORAGE_KEY;

interface SavedBoard {
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
    state.widgets.clear();state.order=[];state.connectors.clear();state.connectorOrder=[];state.strokes.clear();state.strokeOrder=[];state.groups.clear();state.selection.clear();
    if(data.title)document.getElementById("board-title")!.textContent=data.title;

    // journal reconstroi estado E pilhas de undo/redo
    if (data.journal && Array.isArray(data.journal.applied)) {
      bus.restore(data.journal.applied, data.journal.undone ?? []);
      if (data.camera) {
        camera.x = data.camera.x;
        camera.y = data.camera.y;
        camera.scale = data.camera.scale;
      }
      return true;
    }

    for (const w of data.widgets) state.widgets.set((w as Widget).id, w as Widget);
    state.order = data.order ?? [];
    for (const c of data.connectors) state.connectors.set((c as Connector).id, c as Connector);
    state.connectorOrder = data.connectorOrder ?? [];
    for (const s of data.strokes) state.strokes.set((s as Stroke).id, s as Stroke);
    state.strokeOrder = data.strokeOrder ?? [];
    for (const [id, items] of data.groups ?? []) state.groups.set(id, items);
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
function savedBoard():SavedBoard{return structuredClone({savedAt:Date.now(),title:document.getElementById("board-title")!.textContent??"Board",widgets:[...state.widgets.values()],order:state.order,connectors:[...state.connectors.values()],connectorOrder:state.connectorOrder,strokes:[...state.strokes.values()],strokeOrder:state.strokeOrder,groups:[...state.groups.entries()],journal:bus.snapshot(),camera:{x:camera.x,y:camera.y,scale:camera.scale}});}
async function persistBoard(){if(home&&!home.currentId())return;try{await writeStoredBoard(storageKey(),savedBoard());document.getElementById("save-warning")?.remove();}catch{let notice=document.getElementById("save-warning");if(!notice){notice=document.createElement("div");notice.id="save-warning";notice.style.cssText="position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:80;background:#fff9b1;padding:12px 18px;border-radius:8px;font:13px Segoe UI";document.body.append(notice);}notice.textContent="Não foi possível salvar automaticamente. Use Salvar arquivo para guardar seu trabalho.";}}
function scheduleSave(){if(home&&!home.currentId())return;if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>{void persistBoard();},400);}
window.addEventListener("pagehide",()=>{void persistBoard();});

const state: BoardState = {
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
});

let images: ReturnType<typeof installImages> | undefined;
let editorUI: ReturnType<typeof installEditorUI> | undefined;
let drawingUI: ReturnType<typeof installDrawingUI> | undefined;
function syncScene(): void {
  scene.sync(state, camera.visibleWorldRect(), camera.scale);
  images?.sync();
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
  const cell = gridState.visualCell;
  const stepPx = cell * camera.scale;
  gridLayer.clear();
  if (stepPx < 6) return;

  const radius = Math.min(2, Math.max(0.75, stepPx / 40));
  const alpha = Math.min(1, Math.max(0.18, stepPx / 24));
  const rect = camera.visibleWorldRect();
  const startX = Math.floor(rect.minX / cell) * cell;
  const startY = Math.floor(rect.minY / cell) * cell;

  const maxDots = 60_000;
  let count = 0;
  for (let wx = startX; wx <= rect.maxX; wx += cell) {
    for (let wy = startY; wy <= rect.maxY; wy += cell) {
      if (++count > maxDots) break;
      const p = camera.worldToScreen({ x: wx, y: wy });
      gridLayer.circle(p.x, p.y, radius);
    }
    if (count > maxDots) break;
  }
  gridLayer.fill({ color: 0xc9c8c3, alpha });
}

// ------------------------------------------------------------- selection

const HANDLE_HIT = 7; // px de tela
const ROTATE_OFFSET = 26; // px acima do topo

function connectorAt(p: Vec, tolerance: number): Connector | undefined {
  for (let i = state.connectorOrder.length - 1; i >= 0; i--) {
    const connector = state.connectors.get(state.connectorOrder[i]!);
    if (!connector) continue;
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
      rects.push(widgetAABB(w));
      continue;
    }
    const c = state.connectors.get(id);
    if (c) {
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

function drawConnectPreview(): void {
  if (!connectPreview) return;
  const active=gesture.kind==="connect" ? gesture : pendingConnection;
  const source=active ? state.widgets.get(active.fromWidget) : undefined;
  const target=connectionTarget(connectPreview.to);
  const fromAnchor=source ? (active?.fixed ? active.fromAnchor : {kind:"anchor" as const,widgetId:source.id,...facingAnchor(source,connectPreview.to)}) : {kind:"point" as const,...connectPreview.from};
  const toAnchor=target && target.id!==source?.id ? {kind:"anchor" as const,widgetId:target.id,...nearestAnchor(target,connectPreview.to)} : {kind:"point" as const,...connectPreview.to};
  const geometry=connectorGeometry({id:"preview",type:"connector",start:fromAnchor!,end:toAnchor,shape:connectorDefault.shape,style:{strokeColor:"#3859ff",strokeWidth:2},z:0},state.widgets);
  const path=(geometry?.points ?? [connectPreview.from,connectPreview.to]).map(p=>camera.worldToScreen(p));
  const a=path[0]!,b=path[path.length-1]!;
  overlay.moveTo(a.x,a.y);for(const p of path.slice(1))overlay.lineTo(p.x,p.y);
  overlay.stroke({ width: 2, color: 0x3859ff, alpha: 0.8 });
  overlay.circle(a.x, a.y, 4).fill({ color: 0x3859ff });
  overlay.circle(b.x, b.y, 4).stroke({ width: 1.5, color: 0x3859ff });
  const hit = target;
  if(hit) overlay.poly(widgetCorners(hit).flatMap(p=>{const s=camera.worldToScreen(p);return [s.x,s.y]})).stroke({width:2,color:0x3859ff,alpha:.6});
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
  // usa o centro + tamanho escalado: funciona igual com rotação
  const center = camera.worldToScreen({ x: w.x + w.width / 2, y: w.y + w.height / 2 });
  const width = Math.max(40, w.width * camera.scale);
  const height = Math.max(24, w.height * camera.scale);
  editor.style.left = center.x - width / 2 + "px";
  editor.style.top = center.y - height / 2 + "px";
  editor.style.width = width + "px";
  editor.style.height = height + "px";
  editor.style.transform = "rotate(" + w.rotation + "rad)";
  editor.style.transformOrigin = "center center";
  editor.style.fontSize = Math.max(8, w.style.fontSize * camera.scale) + "px";
}

/** Editor WYSIWYG: mostra o texto formatado, não a marcação. */
function beginEdit(w: Widget): void {
  if (w.type === "image") { images?.cropSelected(); return; }
  endEdit(false);
  editingId = w.id;
  editorOriginal = editorContent(w);

  const el = document.createElement("div");
  el.contentEditable = "true";
  el.innerHTML = toHtml(editorOriginal);
  el.spellcheck = false;
  Object.assign(el.style, {
    position: "fixed",
    margin: "0",
    padding: "10px",
    border: "none",
    outline: "2px solid #3859ff",
    borderRadius: "2px",
    overflow: "auto",
    boxSizing: "border-box",
    background: w.type === "sticky_note" ? (STICKY_COLORS[styleKey(w)] ?? "#fff9b1") : "#ffffff",
    color: w.style.color,
    fontFamily: w.style.fontFamily,
    fontWeight:w.style.fontWeight??"normal",fontStyle:w.style.fontStyle??"normal",textDecoration:w.style.textDecoration??"none",backgroundColor:w.style.highlightColor??"transparent",
    fontSize: Math.max(8, w.style.fontSize * camera.scale) + "px",
    lineHeight: "1.35",
    textAlign: w.style.textAlign,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
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
    if (event.key === "Escape") {
      event.preventDefault();
      endEdit(false);
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

  el.addEventListener("blur", () => endEdit(true));
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
      bus.exec({ op: "WIDGET_UPDATE", payload: { id, patch } });
    }
  }
  syncScene();
  drawSelection();
}

function drawSelection(): void {
  overlay.clear();
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
      overlay.stroke({ width: selectedConnector.style.strokeWidth + 4, color: blue, alpha: 0.35 });
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

    for (const id of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as HandleId[]) {
      const p = handleScreen(id);
      if (!p) continue;
      overlay.rect(p.x - 4, p.y - 4, 8, 8).fill({ color: 0xffffff }).stroke({ width: 1.5, color: blue });
    }

    for(const h of connectionHandles(w)) {overlay.circle(h.point.x,h.point.y,5).fill(0xffffff).stroke({width:1.5,color:blue});}
    const r = rotateHandleScreen();
    const top = handleScreen("n");
    if (r && top) {
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

type Tool = "lasso" | "select" | "hand" | "connector" | "pen" | "highlighter" | "eraser" | WidgetType;
let pendingConnection: Extract<Gesture,{kind:"connect"}> | null = null;
let connectorDefault: {shape:ConnectorShape; arrow:boolean} = {shape:"straight",arrow:true};
let tool: Tool = "select";
const creationStyles:Partial<Record<WidgetType,Partial<Style>>>={};
let selectedShape: ShapeWidget["shape"] = "rectangle";

function setTool(next: Tool): void {
  tool = next;
  if(next !== "connector") pendingConnection=null;
  if (next !== "shape") editorUI?.closePanels();
  for (const btn of toolbar.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
    btn.classList.toggle("active", btn.dataset.tool === next);
  }
  updateCursor();
  editorUI?.refresh();
  drawingUI?.refresh();
}

function updateCursor(): void {
  app.canvas.style.cursor =
    tool === "hand" ? "grab" : tool === "select" ? "default" : "crosshair";
}

toolbar.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-tool]");
  if (!btn || btn.disabled || !btn.dataset.tool) return;
  if (btn.dataset.tool === "image") { imagePicker.click(); return; }
  if (btn.dataset.tool === "shape") { editorUI?.openShapes(); return; }
  if (btn.dataset.tool === "connector") { editorUI?.openConnectors(); return; }
  setTool(btn.dataset.tool as Tool);
});

// ------------------------------------------------------------ chrome (UI)

const zoomValue = document.getElementById("zoom-value")!;
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
    const canvas = app.renderer.extract.canvas({ target: app.stage }) as HTMLCanvasElement;
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

function toggleHelp(force?: boolean): void {
  const next = force ?? helpPanel.hasAttribute("hidden");
  helpPanel.toggleAttribute("hidden", !next);
}

document.getElementById("help")?.addEventListener("click", () => toggleHelp());
helpPanel.addEventListener("click", (event) => {
  if (event.target === helpPanel) toggleHelp(false);
});

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
  refreshAlignBar();
  (document.getElementById("undo") as HTMLButtonElement).disabled = !bus.canUndo;
  (document.getElementById("redo") as HTMLButtonElement).disabled = !bus.canRedo;
  zoomValue.textContent = `${Math.round(camera.scale * 100)}%`;
}

function fitToContent(): void {
  const rects = state.order
    .map((id) => state.widgets.get(id))
    .filter((w): w is Widget => Boolean(w))
    .map(widgetAABB);
  const all = unionRect(rects);
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
  | { kind: "connect"; fromWidget: string; fromAnchor: Endpoint; current: Vec; fixed?: boolean; startedAt?:Vec }
  | { kind: "bend"; id:string; index:number; points:Vec[] }
  | {kind:"multi-rotate";initial:EntitySnapshot;center:Vec;angle:number}
  | { kind: "reconnect"; id: string; which: "start" | "end"; current: Vec }
  | { kind: "draw"; points: StrokePoint[]; tool: "pen" | "highlighter"; color:string; width:number; pressure:boolean }
  | {kind:"lasso";points:Vec[]}
  | { kind: "erase"; radius: number;partial:boolean };

let gesture: Gesture = { kind: "none" };
let cursorWorld: Vec = { x: 0, y: 0 };
let clipboard: EntitySnapshot = {widgets:[],connectors:[],strokes:[],groups:[]};

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

/** URL do link sob o cursor, se houver. */
function linkUnder(p: Vec): string | null {
  for (let i = state.order.length - 1; i >= 0; i--) {
    const w = state.widgets.get(state.order[i]!);
    if (!w || !pointInWidget(w, p)) continue;
    const local = worldToLocal(w, p);
    const url = scene.linkAt(w.id, local.x, local.y);
    if (url) return url;
  }
  return null;
}

function connectionTarget(p:Vec):Widget|undefined {
  const direct = topmostAt(p); if(direct && direct.type!=="frame") return direct;
  return [...state.order].reverse().map(id=>state.widgets.get(id)).find(w=>{if(!w||w.type==="frame")return false;const anchor=anchorWorldOf(w,nearestAnchor(w,p));return !!anchor && Math.hypot(anchor.x-p.x,anchor.y-p.y)*camera.scale<14;});
}
function connectionHandles(w:Widget):Array<{point:Vec;anchor:Endpoint}> {
  if(w.type==="frame")return [];
  return [{x:.5,y:0},{x:1,y:.5},{x:.5,y:1},{x:0,y:.5}].map(a=>{
    const edge=anchorWorldOf(w,a)!,c=widgetCenter(w),d={x:edge.x-c.x,y:edge.y-c.y},length=Math.hypot(d.x,d.y)||1;
    const point=camera.worldToScreen({x:edge.x+d.x/length*20/camera.scale,y:edge.y+d.y/length*20/camera.scale});
    return {point,anchor:{kind:"anchor" as const,widgetId:w.id,...a}};
  });
}
function topmostAt(p: Vec): Widget | undefined {
  // respeita o z EFETIVO: quadros desenham atrás de tudo (z = -10000 + z)
  let best: Widget | undefined;
  let bestZ = Number.NEGATIVE_INFINITY;
  for (const id of state.order) {
    const w = state.widgets.get(id);
    if (!w || !pointInWidget(w, p)) continue;
    const z = w.type === "frame" ? -10000 + w.z : w.z;
    if (z > bestZ) {
      bestZ = z;
      best = w;
    }
  }
  return best;
}

function handleAtScreen(s: Vec): HandleId | null {
  if (state.selection.size < 1) return null;
  for (const id of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as HandleId[]) {
    const p = handleScreen(id);
    if (p && Math.hypot(p.x - s.x, p.y - s.y) <= HANDLE_HIT) return id;
  }
  return null;
}

function rotateHandleAtScreen(s: Vec): boolean {
  const p = rotateHandleScreen();
  return Boolean(p && Math.hypot(p.x - s.x, p.y - s.y) <= HANDLE_HIT + 2);
}

app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

app.canvas.addEventListener("dblclick", (e) => {
  const p = camera.screenToWorld({ x: e.offsetX, y: e.offsetY });
  const hit = topmostAt(p);
  if (!hit) { const c=connectorAt(p,8/camera.scale);if(c){bus.exec({op:"SELECTION_SET",payload:[c.id]});(document.querySelector('[data-connector="caption"]') as HTMLInputElement)?.focus();} return; }

  // duplo clique em objeto que não é grupo abre o editor
  const inGroup = enclosingGroup(state,hit.id,isolatedGroup);
  if (!inGroup) {
    if(!hit.locked)beginEdit(hit);
    return;
  }

  if(inGroup){isolatedGroup=inGroup;bus.exec({op:"SELECTION_SET",payload:groupLeaves(state,inGroup)});refreshChrome();}

});

app.canvas.addEventListener("pointerdown", (e) => {
  app.canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    gesture = { kind: "none" };
    return;
  }

  const screen = { x: e.offsetX, y: e.offsetY };
  const p = camera.screenToWorld(screen);
  cursorWorld = p;

  if (e.button === 2) return;
  editorUI?.closePanels();
  if (e.button === 1 || spaceDown || tool === "hand") {
    gesture = { kind: "pan", pointerId: e.pointerId };
    app.canvas.style.cursor = "grabbing";
    return;
  }

  // rejeição de palma: toque não desenha com caneta/marca-texto/borracha
  if (e.pointerType === "touch" && (tool === "pen" || tool === "highlighter" || tool === "eraser")) {
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

  if (tool === "pen" || tool === "highlighter") {
    const settings=drawingUI?.settings(tool) ?? {width:tool==="highlighter"?18:3,color:tool==="highlighter"?"#f5d128":"#191812",pressure:false};
    const pressure = settings.pressure && e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    const base = settings.width/2;
    const r = Math.max(0.6, base * (0.4 + 1.2 * pressure));
    gesture = { kind: "draw", points: [{ x: p.x, y: p.y, r }], tool,...settings };
    return;
  }

  if(tool==="lasso"){gesture={kind:"lasso",points:[p]};return;}
  if (tool === "eraser") {
    const radius=(drawingUI?.eraserRadius() ?? 12)/camera.scale;
    const partial=drawingUI?.eraserMode()==="partial";bus.beginTransaction(partial?"Apagar parte do traço":"Apagar traços");
    gesture = { kind: "erase", radius,partial };
    eraseAt(p, radius,partial);
    return;
  }

  if(tool === "select" && state.selection.size === 1) {
    const w=state.widgets.get([...state.selection][0]!);
    if(w && !w.locked)for(const h of connectionHandles(w)) if(Math.hypot(h.point.x-screen.x,h.point.y-screen.y)<9){
      gesture={kind:"connect",fromWidget:w.id,fromAnchor:h.anchor,current:p,fixed:true,startedAt:p};
      connectPreview={from:resolveEndpoint(h.anchor,state.widgets)!,to:p};return;
    }
  }
  if (tool === "connector") {
    if(pendingConnection){gesture={...pendingConnection,current:p};pendingConnection=null;return;}
    const hit = connectionTarget(p);
    const anchor = hit ? nearestAnchor(hit,p) : null;
    gesture = {kind:"connect", fromWidget:hit?.id ?? "", fromAnchor:hit && anchor ? {kind:"anchor",widgetId:hit.id,...anchor} : {kind:"point",x:p.x,y:p.y},current:p,startedAt:p};
    connectPreview = {from:resolveEndpoint(gesture.fromAnchor,state.widgets)!,to:p};
    drawSelection();return;
  }

  if (tool !== "select" && tool !== "image") {
    const widget = createWidget(tool, { x: p.x, y: p.y, shape: selectedShape,
      content: tool === "text" ? "Texto" : tool === "frame" ? "Quadro" : "" });
    widget.style={...widget.style,...creationStyles[widget.type]};
    gesture = { kind: "create", start: p, current: p, widget };
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
  const hit = topmostAt(p);
  if (isolatedGroup && hit && !groupLeaves(state,isolatedGroup).includes(hit.id)) {
    isolatedGroup = null;
  }
  if (!hit) {
    const connector = connectorAt(p, 6 / camera.scale);
    if (connector) {
      const ids=memberSelection(state,connector.id,isolatedGroup);bus.exec({op:"SELECTION_SET",payload:ids});
      if(!ids.some(id=>itemLocked(state,id))){bus.beginTransaction("Mover seleção");gesture={kind:"drag",ids,start:p,delta:{x:0,y:0},initial:captureSelection(state,ids),bounds:selectedBounds(state,ids)};return;}
      gesture = { kind: "none" };
      return;
    }
    const stroke=[...state.strokes.values()].reverse().find(st=>distanceToStroke(p,st)<6/camera.scale);
    if(stroke){const ids=memberSelection(state,stroke.id,isolatedGroup);bus.exec({op:"SELECTION_SET",payload:ids});if(!ids.some(id=>itemLocked(state,id))){bus.beginTransaction("Mover seleção");gesture={kind:"drag",ids,start:p,delta:{x:0,y:0},initial:captureSelection(state,ids),bounds:selectedBounds(state,ids)};}return;}
    isolatedGroup=null;
    bus.exec({ op: "SELECTION_SET", payload: [] });
    gesture = { kind: "marquee", start: p, current: p };
    return;
  }

  if (!state.selection.has(hit.id)) {
    const base = e.altKey ? [hit.id] : groupMembersOf(hit.id);
    const ids = e.shiftKey ? [...new Set([...state.selection, ...base])] : base;
    bus.exec({ op: "SELECTION_SET", payload: ids });
  } else if (e.shiftKey) {
    const ids = [...state.selection].filter((id) => id !== hit.id);
    bus.exec({ op: "SELECTION_SET", payload: ids });
    gesture = { kind: "none" };
    return;
  }

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

  if (gesture.kind === "none" && tool === "select") {
    hoveredLink = linkUnder(p);
    app.canvas.style.cursor = hoveredLink ? "pointer" : "default";
  }

  if(pendingConnection && gesture.kind === "none") {pendingConnection.current=p;connectPreview={from:resolveEndpoint(pendingConnection.fromAnchor,state.widgets)!,to:p};drawSelection();}
  switch (gesture.kind) {
    case "bend": {const index=gesture.index,c=state.connectors.get(gesture.id),points=gesture.points.map((v,i)=>i===index?p:v);bus.exec({op:"CONNECTOR_UPDATE",payload:{id:gesture.id,patch:{waypoints:points,controlPoint:null,...(c?.shape==="straight"?{shape:"curved"}:{})}}});return;}
    case "multi-rotate":{let angle=Math.atan2(p.y-gesture.center.y,p.x-gesture.center.x)-gesture.angle;if(e.shiftKey)angle=Math.round(angle/(Math.PI/12))*Math.PI/12;bus.exec({op:"BATCH",payload:{label:"Girar seleção",commands:transformSnapshot(state,gesture.initial,0,0,1,1,gesture.center,angle)}});return;}
    case "create": {
      let dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      if (e.shiftKey) { const n = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1)*n; dy = (dy < 0 ? -1 : 1)*n; }
      gesture.current = { x: gesture.start.x + dx, y: gesture.start.y + dy };
      const r = marqueeRect(gesture.start, gesture.current);
      const a = camera.worldToScreen({x:r.minX,y:r.minY});
      overlay.clear().rect(a.x,a.y,(r.maxX-r.minX)*camera.scale,(r.maxY-r.minY)*camera.scale).fill({color:0x3859ff,alpha:0.08}).stroke({color:0x3859ff,width:1.5});
      return;
    }
    case "pan": {
      if (!prev) return;
      camera.panByScreen(e.clientX - prev.x, e.clientY - prev.y);
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
      bus.exec({op:"BATCH",payload:{label:"Mover",commands:transformSnapshot(state,gesture.initial,dx,dy)}});
      drawSelection();
      return;
    }
    case "draw": {
      const bounds = app.canvas.getBoundingClientRect();
      const samples = e.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [e]) {
        const pos = camera.screenToWorld({x:sample.clientX-bounds.left,y:sample.clientY-bounds.top});
        const last = gesture.points[gesture.points.length - 1]!;
        if (Math.hypot(pos.x-last.x,pos.y-last.y)*camera.scale < .3) continue;
        const pressure = gesture.pressure && sample.pointerType === "pen" && sample.pressure > 0 ? sample.pressure : .5;
        const base = gesture.width/2;
        const targetRadius = Math.max(.3,base*(.4+1.2*pressure));
        gesture.points.push({...pos,r:last.r*.35+targetRadius*.65});
      }
      overlay.clear();
      const outline = strokeOutline(gesture.points);
      for (let i=0;i<outline.length;i+=2) {
        const pos=camera.worldToScreen({x:outline[i]!,y:outline[i+1]!}); outline[i]=pos.x;outline[i+1]=pos.y;
      }
      if (outline.length >= 6) {
        overlay.poly(outline).fill({
          color: gesture.color,
          alpha: gesture.tool === "highlighter" ? 0.35 : 1,
        });
      }
      return;
    }
    case "lasso":{gesture.points.push(p);const points=gesture.points.map(p=>camera.worldToScreen(p));overlay.clear().poly(points.flatMap(p=>[p.x,p.y])).fill({color:0x3859ff,alpha:.05}).stroke({color:0x3859ff,width:1});return;}
    case "erase": {
      eraseAt(p, gesture.radius,gesture.partial);
      const cursor=camera.worldToScreen(p);overlay.clear().circle(cursor.x,cursor.y,gesture.radius*camera.scale).stroke({width:1,color:0x3859ff});
      return;
    }
    case "reconnect": {
      gesture.current = p;
      const connector = state.connectors.get(gesture.id);
      if (connector) {
        const target = connectionTarget(p);
        let endpoint: Endpoint = { kind: "point", x: p.x, y: p.y };
        if (target) {
          const other = gesture.which === "start" ? connector.end : connector.start;
          const otherWidget = other.kind === "anchor" ? state.widgets.get(other.widgetId) : undefined;
          const anchor = nearestAnchor(target,p);
          endpoint = { kind: "anchor", widgetId: target.id, x: anchor.x, y: anchor.y };
        }
        bus.exec({
          op: "CONNECTOR_UPDATE",
          payload: { id: gesture.id, patch: gesture.which === "start" ? { start: endpoint } : { end: endpoint } },
        });
        drawSelection();
      }
      return;
    }
    case "connect": {
      gesture.current = p;
      const fromWidget = state.widgets.get(gesture.fromWidget);
      const from = fromWidget
        ? anchorWorldOf(fromWidget, { x: (gesture.fromAnchor as { x: number; y: number }).x, y: (gesture.fromAnchor as { x: number; y: number }).y })
        : null;
      const target = topmostAt(p);
      const fromAnchor = fromWidget ? (gesture.fixed ? gesture.fromAnchor : facingAnchor(fromWidget, p)) : null;
      connectPreview = {
        from: fromWidget && fromAnchor ? anchorWorldOf(fromWidget, fromAnchor) ?? p : {x:gesture.fromAnchor.x,y:gesture.fromAnchor.y},
        to: p,
      };
      if (target && target.id !== gesture.fromWidget && fromWidget) {
        const anchor = facingAnchor(target, widgetCenter(fromWidget));
        connectPreview.to = anchorWorldOf(target, anchor) ?? p;
      }
      drawSelection();
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
      const next = resizeWidget(start, gesture.handle, p, e.shiftKey);
      gesture.moved = true;
      bus.exec({ op: "WIDGET_UPDATE", payload: { id: gesture.id, patch: next } });

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

function eraseAt(p:Vec,radius:number,partial=false):void {
  for(const id of [...state.strokeOrder]){const stroke=state.strokes.get(id);if(!stroke||stroke.locked||distanceToStroke(p,stroke)>radius)continue;
    if(!partial){bus.exec({op:"STROKE_REMOVE",payload:id});continue;}
    const fragments=eraseStrokePoints(stroke,p,radius);
    if(fragments.length===1&&JSON.stringify(fragments[0])===JSON.stringify(stroke.points))continue;
    const groups=[...state.groups].map(([gid,members])=>[gid,[...members]] as [string,string[]]);
    bus.exec({op:"STROKE_REMOVE",payload:id});const ids:string[]=[];
    for(const points of fragments){const next=nextId("stroke");ids.push(next);bus.exec({op:"STROKE_CREATE",payload:{...stroke,id:next,points}});}
    if(ids.length)for(const [gid,members]of groups)bus.exec({op:"GROUP_CREATE",payload:{id:gid,items:members.flatMap(member=>member===id?ids:[member])}});
  }
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
  pointers.delete(e.pointerId);
  if (pointers.size < 2) lastPinch = null;

  switch (gesture.kind) {
    case "create": {
      if (e.type === "pointercancel") break;
      const {widget,start,current} = gesture;
      const dragged = Math.hypot(current.x-start.x,current.y-start.y)*camera.scale > 5;
      const rect = marqueeRect(start,current);
      const next = dragged ? {...widget,x:rect.minX,y:rect.minY,width:Math.max(12,rect.maxX-rect.minX),height:Math.max(12,rect.maxY-rect.minY)}
        : {...widget,x:start.x-widget.width/2,y:start.y-widget.height/2};
      bus.exec({op:"WIDGET_CREATE",payload:next});
      bus.exec({op:"SELECTION_SET",payload:[next.id]});
      setTool("select");
      if (next.type === "text") beginEdit(next);
      break;
    }
    case "pan":
      updateCursor();
      break;
    case "lasso":{const hits=lassoHits(state,gesture.points);bus.exec({op:"SELECTION_SET",payload:[...new Set(hits.flatMap(id=>memberSelection(state,id,isolatedGroup)))]});setTool("select");break;}
    case "drag": break;
    case "draw": {
      const raw = gesture.points;
      if (raw.length >= 1) {
        const points = raw;
        const stroke: Stroke = {
          id: `stroke_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`,
          type: "stroke",
          tool: gesture.tool,
          color: gesture.color,
          points,
          z: 0,
        };
        bus.exec({ op: "STROKE_CREATE", payload: stroke });
      }
      drawSelection();
      break;
    }
    case "reconnect":
      break;
    case "connect": {
      const originPoint=resolveEndpoint(gesture.fromAnchor,state.widgets)!;
      const startedAt=gesture.startedAt ?? originPoint;
      if(Math.hypot(gesture.current.x-startedAt.x,gesture.current.y-startedAt.y)*camera.scale<5 && tool==="connector") {pendingConnection={...gesture};gesture={kind:"none"};return;}
      const target = connectionTarget(gesture.current);
      const source = state.widgets.get(gesture.fromWidget);
      const origin = gesture.fromAnchor;
      const startPoint = source ? widgetCenter(source) : {x:origin.x,y:origin.y};
      const finish = gesture.current;
      if (target?.id !== source?.id || !source) {
        if (Math.hypot(finish.x-startPoint.x,finish.y-startPoint.y)*camera.scale > 4) {
          const startAnchor = source ? (gesture.fixed ? gesture.fromAnchor : facingAnchor(source,target ? widgetCenter(target) : finish)) : null;
          const endAnchor = target ? nearestAnchor(target,finish) : null;
          const connector: Connector = {id:crypto.randomUUID(),type:"connector",
            start:source && startAnchor ? {kind:"anchor",widgetId:source.id,...startAnchor} : origin,
            end:target && endAnchor ? {kind:"anchor",widgetId:target.id,...endAnchor} : {kind:"point",...finish},
            shape:connectorDefault.shape,style:{strokeColor:"#1a1a1a",strokeWidth:2,endCap:connectorDefault.arrow?"arrow":"none"},z:0};
          bus.exec({op:"CONNECTOR_CREATE",payload:connector});
          bus.exec({op:"SELECTION_SET",payload:[connector.id]});
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
        return w ? rectIntersectsWidget(r, w) : false;
      });
      for(const id of [...state.connectorOrder,...state.strokeOrder]){const bounds=selectedBounds(state,[id]);if(bounds&&bounds.minX<=r.maxX&&bounds.maxX>=r.minX&&bounds.minY<=r.maxY&&bounds.maxY>=r.minY)ids.push(id);}
      bus.exec({ op: "SELECTION_SET", payload: [...new Set(ids.flatMap(id=>memberSelection(state,id,isolatedGroup)))] });
      break;
    }
    default:
      break;
  }
  bus.endTransaction();
  gesture = { kind: "none" };
  activeGuides = [];
  connectPreview = null;
  drawSelection();
}
app.canvas.addEventListener("pointerup", endGesture);
app.canvas.addEventListener("pointercancel", endGesture);

app.canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (e.ctrlKey || !e.shiftKey) {
      camera.zoomAt({ x: e.offsetX, y: e.offsetY }, Math.exp(-e.deltaY * 0.0025));
    } else {
      camera.panByScreen(-e.deltaX, -e.deltaY);
    }
    gridDirty = true;
    refreshChrome();
  },
  { passive: false },
);

// ------------------------------------------------------------- keyboard

window.addEventListener("keydown", (e) => {
  if(document.body.classList.contains("home-visible"))return;
  // enquanto o usuário digita (editor inline, prompt, input), atalhos globais não valem
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "INPUT" ||
      target.isContentEditable)
  ) {
    return;
  }

  if (e.code === "Space") {
    spaceDown = true;
    app.canvas.style.cursor = "grab";
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === "z") {
    e.preventDefault();
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
    camera.scale = 1;
    camera.x = 0;
    camera.y = 0;
    gridDirty = true;
    refreshChrome();
    return;
  }
  if (mod && (e.key === "]" || e.key === "[")) {
    e.preventDefault();
    const ids = [...state.selection];
    if (ids.length === 0) return;
    const direction = e.key === "]"
      ? e.shiftKey ? "front" : "forward"
      : e.shiftKey ? "back" : "backward";
    bus.exec({ op: "WIDGET_REORDER", payload: { ids, direction } });
    return;
  }
  if (mod && key === "a") {
    e.preventDefault();
    bus.exec({ op: "SELECTION_SET", payload: [...state.order,...state.connectorOrder,...state.strokeOrder] });
    return;
  }
  if(mod&&key==="g"){e.preventDefault();if(e.shiftKey)ungroupSelection(state,bus);else groupSelection(state,bus);return;}
  if(mod&&key==="c"){e.preventDefault();clipboard=captureSelection(state);return;}
  if(mod&&key==="v"){if(!clipboard.widgets.length&&!clipboard.connectors.length&&!clipboard.strokes.length)return;e.preventDefault();duplicateSnapshot(state,bus,clipboard);return;}
  if(mod&&key==="d"){e.preventDefault();duplicateSnapshot(state,bus,captureSelection(state));return;}
  if (e.key === "1" && e.shiftKey) {
    fitToContent();
    return;
  }

  switch (e.key) {
    case "l":case "L":setTool("lasso");break;
    case "v":
    case "V":
      setTool("select");
      break;
    case "s":
    case "S":
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
      setTool("pen");
      break;
    case "e":
    case "E":
      setTool("eraser");
      break;
    case "h":
    case "H":
      setTool("highlighter");
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
        if (state.connectors.has(id)) bus.exec({ op: "CONNECTOR_REMOVE", payload: id });
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
      if(!w.locked)beginEdit(w);
      break;
    }
    case "Escape":
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
      break;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceDown = false;
    updateCursor();
  }
});

function editWaypoint(remove:boolean){
  const c=state.connectors.get([...state.selection][0]!);if(!c||c.locked)return;const g=connectorGeometry(c,state.widgets);if(!g)return;
  const points=connectorEditPoints(c,g);const waypoints=remove?points.slice(0,-1):connectorInsertWaypoint(c,g,connectorPointAt(g,1/(points.length+2)));
  bus.exec({op:"CONNECTOR_UPDATE",payload:{id:c.id,patch:{waypoints,controlPoint:null}}});
}
async function copySelectionImage(){
  const r=selectionRect();if(!r)return;
  const subset={...state,widgets:new Map([...state.widgets].filter(([id])=>state.selection.has(id))),order:state.order.filter(id=>state.selection.has(id)),connectors:new Map([...state.connectors].filter(([id])=>state.selection.has(id))),connectorOrder:state.connectorOrder.filter(id=>state.selection.has(id)),strokes:new Map([...state.strokes].filter(([id])=>state.selection.has(id))),strokeOrder:state.strokeOrder.filter(id=>state.selection.has(id))};
  const svg=await embedSvgFonts(boardToSvg(subset,{background:"none"}),[...subset.widgets.values()].map(w=>w.style.fontFamily)),url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
  try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement("canvas"),scale=Math.min(2,4096/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.ceil(img.width*scale));canvas.height=Math.max(1,Math.ceil(img.height*scale));canvas.getContext("2d")!.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve));if(blob){try{await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);}catch{downloadBlob(blob,"selecao.png");}}}finally{URL.revokeObjectURL(url);}
}
const lassoButton=document.createElement("button");lassoButton.dataset.tool="lasso";lassoButton.dataset.label="Selecionar com laço (L)";lassoButton.setAttribute("aria-label","Laço");lassoButton.title="Laço (L)";lassoButton.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 17c-9-1-7-13 4-13 11 0 13 11 3 13-6 2-11 0-8-3 3-2 7 3 3 7"/></svg>';toolbar.querySelector('[data-tool="eraser"]')?.after(lassoButton);
// Local editor controls
images = installImages({state,bus,camera,app,world,nodeAt:id=>scene.nodeAt(id),onChange:()=>{syncScene();refreshChrome();}});
const imagePicker = document.createElement("input");
imagePicker.type="file"; imagePicker.accept="image/*"; imagePicker.multiple=true;
imagePicker.addEventListener("change",()=>{if(imagePicker.files) void images?.importFiles(imagePicker.files); imagePicker.value="";});
editorUI = installEditorUI({state,bus,camera,setTool:t=>setTool(t as Tool),getTool:()=>tool,
  setConnectorDefault:options=>{connectorDefault=options;},
  onStyleDefaults:(type,patch)=>{creationStyles[type]={...creationStyles[type],...patch};},
  setShape:s=>{selectedShape=s;},getShape:()=>selectedShape,onImage:()=>imagePicker.click(),
  onCrop:()=>images?.cropSelected(),onResetCrop:()=>images?.resetCrop(),
  onReplaceImage:()=>images?.replaceSelected(),onFlipImage:axis=>images?.flipSelected(axis),onDownloadImage:()=>images?.downloadSelected(),
  getGroupScope:()=>isolatedGroup,onExitGroup:()=>{isolatedGroup=null;refreshChrome();},
  onAddWaypoint:()=>editWaypoint(false),onRemoveWaypoint:()=>editWaypoint(true),onCopyImage:()=>{void copySelectionImage();}});
installIcons();
drawingUI=installDrawingUI({getTool:()=>tool,setTool:t=>setTool(t as Tool)});
const projectFiles=installProjectFiles({state,bus,camera,sync:()=>{gridDirty=true;syncScene();drawSelection();refreshChrome();if(home&&!home.currentId())void home.adoptCurrent();else{home?.updateCurrent();scheduleSave();}}});
const title=document.getElementById("board-title")!;title.contentEditable="true";title.setAttribute("role","textbox");title.setAttribute("aria-label","Nome do board");title.setAttribute("spellcheck","false");title.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();title.blur();}});title.addEventListener("blur",()=>{if(!title.textContent?.trim())title.textContent="Board sem título";home?.updateCurrent({title:title.textContent??"Board"});scheduleSave();});

// ------------------------------------------------------------------ loop

let frames = 0;
let fps = 0;
let fpsAt = performance.now();

app.ticker.add(() => {
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
        if(w) editor.style.fontSize = `${Math.max(1,w.style.fontSize * camera.scale)}px`;
      }
    }
    syncScene();
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

  const snapped = snapPoint(cursorWorld, gridState);
  hud.textContent = [
    `tool      ${tool}`,
    `objetos   ${state.widgets.size}   seleção ${state.selection.size}`,
    `zoom      ${(camera.scale * 100).toFixed(0)}%   snap ${gridState.snapCell} u`,
    `mundo     ${cursorWorld.x.toFixed(1)}, ${cursorWorld.y.toFixed(1)} ${snapped.snapped ? "• snap" : ""}`,
    `undo/redo ${bus.undoStack.length}/${bus.redoStack.length}`,
    `fps       ${fps}`,
  ].join("\n");
});

home=installBoardHome({capture:savedBoard,open:async data=>{
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}endEdit(true);bus.endTransaction();gesture={kind:"none"};isolatedGroup=null;
  if(!loadBoard(data as SavedBoard))throw new Error("Não foi possível abrir este board.");
  await Promise.all([...new Set([...state.widgets.values()].map(w=>w.style.fontFamily))].map(loadBoardFont));
  setTool("select");gridDirty=true;syncScene();drawGrid();drawSelection();refreshChrome();
},thumbnail:async()=>{const svg=await embedSvgFonts(boardToSvg(state,{padding:30}),[...state.widgets.values()].map(w=>w.style.fontFamily));return 'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));},importFile:()=>projectFiles.open(),exportCurrent:()=>projectFiles.save()});
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
  load: loadBoard,
  saveNow: persistBoard,
  booted: false,
};


bootPromise.then(()=>{(window as unknown as {__board:{booted:boolean}}).__board.booted=true;});
