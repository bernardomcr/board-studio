import type { BoardState, CommandBus, Command } from "./core/commands";
import type { Camera } from "./core/camera";
import { MIN_SCALE, MAX_SCALE } from "./core/camera";
import { SHAPE_OPTIONS, type Widget } from "./core/model";
import type { Connector, Endpoint } from "./core/connectors";
import type { Stroke } from "./core/strokes";
import { DEFAULT_BACKGROUND, validateBoardBackground, type BoardBackground } from "./core/background";
import {loadBoardFont} from './fonts';
import {validateUserFonts,snapshotUserFonts,restoreUserFonts,type UserFont} from './user-fonts';
import {migrateFrameSnapshots} from './core/layer-migration';
import {validateMindMetadata,validateMindMapGraph} from './core/mindmap';
import {validateAudioMetadata} from './core/audio';
import {validateStructuredMetadataFields} from './core/structured-text';

interface BoardFile {
  userFonts?:UserFont[];
  layerOrderVersion?:1;
  format: "local-board"; version: 1; title: string;
  widgets: Widget[]; order: string[]; connectors: Connector[]; connectorOrder: string[];
  strokes: Stroke[]; strokeOrder: string[]; groups: Array<[string, string[]]>;
  camera: { x: number; y: number; scale: number };
  background?: BoardBackground;
}
const fail = (message: string): never => { throw new Error(message); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Estrutura de arquivo inválida.");
  return value as Record<string, unknown>;
}
function list(value: unknown, max = 20000): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail("Lista inválida ou arquivo muito grande.");
  return value;
}
function str(value: unknown, max = 1000000): string {
  if (typeof value !== "string" || value.length > max) return fail("Campo de texto inválido.");
  return value;
}
function number(value: unknown, low = -Infinity, high = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) return fail("Medida ou posição inválida.");
  return value;
}
function one<T extends string>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) return fail("Opção desconhecida no arquivo.");
  return value as T;
}
const id = (value: unknown) => { const result = str(value, 256); return result.length ? result : fail("Identificador vazio."); };
function color(value: unknown): string {
  const result = str(value, 80);
  if (!/^(#[\da-f]{3,8}|transparent|black|white|rgba?\([\d\s.,%]+\))$/i.test(result)) return fail("Cor inválida.");
  return result;
}
function unique(items: { id: string }[], seen: Set<string>) {
  for (const item of items) { if (seen.has(item.id)) fail("Identificadores repetidos."); seen.add(item.id); }
}
function order(value: unknown, items: { id: string }[]): string[] {
  const values = list(value).map(id), expected = new Set(items.map(item => item.id));
  if (values.length !== expected.size || new Set(values).size !== values.length || values.some(value => !expected.has(value))) fail("Ordem de objetos inconsistente.");
  return values;
}
/** Validates and reconstructs every accepted field without touching live state. */
export function validateBoardFile(value: unknown): BoardFile {
  const data = record(value);
  if (data.format !== "local-board" || data.version !== 1) fail("Este arquivo não é um projeto Board compatível.");
  const userFonts=data.userFonts===undefined?undefined:validateUserFonts(data.userFonts);
  const widgets = list(data.widgets).map(raw => {
    const w = record(raw), style = record(w.style);
    const type = one(w.type, ["shape", "sticky_note", "text", "frame", "image"] as const);
    if(w.audio!==undefined&&(type!=='shape'||w.checklist!==undefined||w.table!==undefined))fail('Cartão de áudio incompatível com este objeto.');
    if((w.checklist!==undefined||w.table!==undefined)&&type!=='shape'&&type!=='text')fail('Conteúdo estruturado incompatível com este objeto.');
    const base = {
      mind:w.mind===undefined?undefined:validateMindMetadata(w.mind),
      audio:w.audio===undefined?undefined:validateAudioMetadata(w.audio),...validateStructuredMetadataFields(w),
      id: id(w.id), type, name:w.name===undefined?undefined:str(w.name,1000),hidden:!!w.hidden, locked:w.locked===undefined?undefined:!!w.locked, link:w.link===undefined?undefined:str(w.link,4000), x: number(w.x), y: number(w.y), width: number(w.width, .001), height: number(w.height, .001),
      rotation: number(w.rotation), z: number(w.z),
      style: {
        fillColor: color(style.fillColor), fillOpacity: number(style.fillOpacity, 0, 1), borderColor: color(style.borderColor),
        borderOpacity:style.borderOpacity===undefined?undefined:number(style.borderOpacity,0,1),cornerRadius:style.cornerRadius===undefined?undefined:number(style.cornerRadius,0),
        borderScale:style.borderScale===undefined?undefined:number(style.borderScale,0),borderWidth: number(style.borderWidth, 0), borderStyle: one(style.borderStyle, ["normal", "dotted", "dashed"] as const),
        fontWeight:style.fontWeight===undefined?undefined:one(style.fontWeight,["normal","bold"] as const),fontStyle:style.fontStyle===undefined?undefined:one(style.fontStyle,["normal","italic"] as const),textDecoration:style.textDecoration===undefined?undefined:one(style.textDecoration,["none","underline","line-through"] as const),highlightColor:style.highlightColor===undefined?undefined:color(style.highlightColor),
        color: color(style.color), fontFamily: str(style.fontFamily, 256), fontSize: number(style.fontSize, .1),
        textAlign: one(style.textAlign, ["left", "center", "right"] as const), textAlignVertical: one(style.textAlignVertical, ["top", "middle", "bottom"] as const),
      },
    };
    if (type === "frame") return { ...base, type, title: str(w.title) };
    const content = str(w.content);
    if (type === "shape") return { ...base, type, content, shape: one(w.shape, SHAPE_OPTIONS.map(option => option.id)) };
    if (type === "sticky_note") return { ...base, type, content, shape: one(w.shape, ["square"] as const) };
    if (type === "text") return { ...base, type, content,...(w.textSizing==='natural'?{textSizing:'natural' as const}:{}) };
    const src = str(w.src, 50000000);
    if (!/^data:image\/(png|jpeg|webp|gif|avif|bmp);base64,[A-Za-z0-9+/=\s]+$/.test(src)) fail("A imagem deve estar incorporada no arquivo.");
    let crop: { x: number; y: number; width: number; height: number } | undefined;
    if (w.crop !== undefined) {
      const c = record(w.crop); crop = { x: number(c.x, 0, 1), y: number(c.y, 0, 1), width: number(c.width, .000001, 1), height: number(c.height, .000001, 1) };
      if (crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) fail("Recorte de imagem inválido.");
    }
    return { ...base, type, content, src, crop, maskShape:w.maskShape===undefined?undefined:one(w.maskShape,["rectangle","ellipse","round_rectangle"] as const),flipX:!!w.flipX,flipY:!!w.flipY,opacity:w.opacity===undefined?undefined:number(w.opacity,0,1),naturalWidth: number(w.naturalWidth, 1), naturalHeight: number(w.naturalHeight, 1) };
  }) as Widget[];
  const embeddedFamilies=new Set(userFonts?.map(font=>font.family));
  for(const widget of widgets)if(widget.style.fontFamily.startsWith('BoardCustom-')&&!embeddedFamilies.has(widget.style.fontFamily))fail('O arquivo não inclui os dados de uma fonte personalizada usada no board.');
  const widgetIds = new Set(widgets.map(widget => widget.id));
  const endpoint = (value: unknown): Endpoint => {
    const ep = record(value), kind = one(ep.kind, ["point", "anchor"] as const);
    if (kind === "point") return { kind, x: number(ep.x), y: number(ep.y) };
    const widgetId = id(ep.widgetId); if (!widgetIds.has(widgetId)) fail("Conector aponta para objeto ausente.");
    return { kind, widgetId, x: number(ep.x, 0, 1), y: number(ep.y, 0, 1) };
  };
  const connectors: Connector[] = list(data.connectors).map(raw => {
    const c = record(raw), style = record(c.style);
    return { id: id(c.id),mindBranch:c.mindBranch===undefined?undefined:id(c.mindBranch),name:c.name===undefined?undefined:str(c.name,1000),hidden:!!c.hidden,locked:!!c.locked,waypoints:c.waypoints==null?c.waypoints as null|undefined:list(c.waypoints,1000).map(v=>{const p=record(v);return {x:number(p.x),y:number(p.y)}}),captionPositions:c.captionPositions===undefined?undefined:list(c.captionPositions,100).map(v=>number(v,0,1)), type: one(c.type, ["connector"] as const), start: endpoint(c.start), end: endpoint(c.end),
      shape: one(c.shape, ["straight", "elbowed", "curved"] as const), z: number(c.z),
      controlPoint: c.controlPoint == null ? c.controlPoint as null | undefined : (() => { const p = record(c.controlPoint); return { x: number(p.x), y: number(p.y) }; })(),
      style: { strokeStyle:style.strokeStyle===undefined?undefined:one(style.strokeStyle,["normal","dashed","dotted"] as const),strokeColor: color(style.strokeColor), strokeWidth: number(style.strokeWidth, .01),
        startCap: style.startCap === undefined ? undefined : one(style.startCap, ["none", "arrow","triangle","circle","diamond","bar"] as const),
        endCap: style.endCap === undefined ? undefined : one(style.endCap, ["none", "arrow","triangle","circle","diamond","bar"] as const) },
      captions: c.captions === undefined ? undefined : list(c.captions, 100).map(value => str(value)),
    };
  });
  validateMindMapGraph(widgets,connectors);
  let totalPoints = 0;
  const strokes: Stroke[] = list(data.strokes).map(raw => {
    const s = record(raw), points = list(s.points, 200000); totalPoints += points.length;
    const erasures=s.erasures===undefined?undefined:list(s.erasures,200000).map(value=>{const e=record(value),cutPoints=list(e.points,200000);if(!cutPoints.length)fail('Área apagada inválida.');totalPoints+=cutPoints.length;return {radius:number(e.radius,.000001),points:cutPoints.map(value=>{const p=record(value);return {x:number(p.x),y:number(p.y)};})};});
    if (totalPoints > 1000000) fail("O arquivo contém pontos de desenho demais.");
    return { id: id(s.id),name:s.name===undefined?undefined:str(s.name,1000),hidden:!!s.hidden,locked:!!s.locked,type: one(s.type, ["stroke"] as const), tool: one(s.tool, ["brush", "pen", "highlighter"] as const), color: color(s.color), z: number(s.z),
      opacity:s.opacity===undefined?undefined:number(s.opacity,0,1),precision:s.precision===undefined?undefined:typeof s.precision==='boolean'?s.precision:fail('Precisão de pincel inválida.'),precisionSmoothing:s.precisionSmoothing===undefined?undefined:number(s.precisionSmoothing,0),
      ...(erasures?{erasures}:{}),points: points.map(value => { const p = record(value); return { x: number(p.x), y: number(p.y), r: number(p.r, .001) }; }) };
  });
  const seen = new Set<string>(); unique(widgets, seen); unique(connectors, seen); unique(strokes, seen);
  const groupIds = new Set<string>();
  const groups: Array<[string, string[]]> = list(data.groups).map(value => {
    const pair = list(value, 2); if (pair.length !== 2) fail("Grupo inválido.");
    const groupId = id(pair[0]), members = list(pair[1]).map(id);
    if (groupIds.has(groupId) || new Set(members).size !== members.length) fail("Membros de grupo inválidos.");
    groupIds.add(groupId); return [groupId, members];
  });
  const groupMap=new Map(groups),parented=new Set<string>();
  for(const [gid,members] of groups){if(seen.has(gid))fail('Identificador de grupo repetido.');for(const member of members){if(!seen.has(member)&&!groupMap.has(member))fail('Membro de grupo ausente.');if(parented.has(member))fail('Objeto em múltiplos grupos.');parented.add(member);}}
  const visiting=new Set<string>(),visited=new Set<string>();const visit=(id:string)=>{if(visiting.has(id))fail('Grupo circular inválido.');if(visited.has(id))return;visiting.add(id);for(const member of groupMap.get(id)??[])if(groupMap.has(member))visit(member);visiting.delete(id);visited.add(id);};for(const id of groupMap.keys())visit(id);
  const camera = record(data.camera);
  const background=data.background===undefined?{...DEFAULT_BACKGROUND}:validateBoardBackground(data.background);
  if(!background)fail("Fundo do board inválido.");
  return { format: "local-board", version: 1,layerOrderVersion:1, title: str(data.title, 1000), widgets:data.layerOrderVersion===1?widgets:migrateFrameSnapshots(widgets), connectors, strokes, groups,
    background: background!,userFonts,
    order: order(data.order, widgets), connectorOrder: order(data.connectorOrder, connectors), strokeOrder: order(data.strokeOrder, strokes),
    camera: { x: number(camera.x), y: number(camera.y), scale: number(camera.scale, MIN_SCALE, MAX_SCALE) } };
}

export function installProjectFiles(api: { state: BoardState; bus: CommandBus; camera: Camera; sync(): void;getBoardKey?():string|null }) {
  const { state, bus, camera } = api;
  const container = document.createElement("div"); container.className = "chip";
  const status = document.createElement("span"); status.setAttribute("role", "status"); status.style.cssText = "font-size:12px;color:#73726c;max-width:200px";
  const saveButton = document.createElement("button"), openButton = document.createElement("button");
  saveButton.textContent = "Salvar arquivo"; openButton.textContent = "Abrir arquivo";
  for (const button of [saveButton, openButton]) { button.type = "button"; button.style.cssText = "width:auto;padding:0 8px;font:600 12px Segoe UI,sans-serif;white-space:nowrap"; }
  saveButton.title = "Salvar uma cópia completa e editável no computador";
  openButton.title = "Abrir um arquivo .board.json e substituir o board atual";
  container.append(saveButton, openButton, status); document.getElementById("topbar")?.append(container);
  const input = document.createElement("input"); input.type = "file"; input.accept = ".board.json,.json,application/json"; input.hidden = true; document.body.append(input);
  saveButton.onclick = () => {
    const data: BoardFile = { format: "local-board", version: 1,layerOrderVersion:1, title: document.getElementById("board-title")?.textContent ?? "Board",
      background:state.background??{...DEFAULT_BACKGROUND},userFonts:snapshotUserFonts([...state.widgets.values()].map(w=>w.style.fontFamily)),
      widgets: [...state.widgets.values()], order: [...state.order], connectors: [...state.connectors.values()], connectorOrder: [...state.connectorOrder],
      strokes: [...state.strokes.values()], strokeOrder: [...state.strokeOrder], groups: [...state.groups.entries()], camera: { x: camera.x, y: camera.y, scale: camera.scale } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${data.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Board"}.board.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = "Arquivo gerado";
  };
  let destinationKey:string|null|undefined;
  openButton.onclick = () => {destinationKey=api.getBoardKey?.();input.click();};
  input.onchange = async () => {
    const file = input.files?.[0],boardKey=destinationKey; input.value = ""; if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) fail("Escolha um projeto de até 100 MB.");
      const data = validateBoardFile(JSON.parse(await file.text()));
      if(api.getBoardKey&&boardKey!==api.getBoardKey()){status.textContent='O board mudou. Abra o arquivo novamente no destino desejado.';return;}
      await restoreUserFonts(data.userFonts);
      await Promise.all([...new Set(data.widgets.map(w=>w.style.fontFamily))].map(loadBoardFont));
      if(api.getBoardKey&&boardKey!==api.getBoardKey()){status.textContent='O board mudou. Abra o arquivo novamente no destino desejado.';return;}
      // Nothing changes until every field and reference has passed validation.
      const widgetById = new Map(data.widgets.map(w => [w.id, w]));
      const connectorById = new Map(data.connectors.map(c => [c.id, c]));
      const strokeById = new Map(data.strokes.map(s => [s.id, s]));
      const baseline: Command[] = [
        {op:"BACKGROUND_UPDATE",payload:data.background??{...DEFAULT_BACKGROUND}},
        ...data.order.map(id => ({ op: "WIDGET_CREATE" as const, payload: widgetById.get(id)! })),
        ...data.order.map(id => ({ op: "WIDGET_UPDATE" as const, payload: { id, patch: { z: widgetById.get(id)!.z } } })),
        ...data.connectorOrder.map(id => ({ op: "CONNECTOR_CREATE" as const, payload: connectorById.get(id)! })),
        ...data.strokeOrder.map(id => ({ op: "STROKE_CREATE" as const, payload: strokeById.get(id)! })),
        ...data.connectorOrder.map(id=>({op:'CONNECTOR_UPDATE' as const,payload:{id,patch:{z:connectorById.get(id)!.z}}})),
        ...data.strokeOrder.map(id=>({op:'STROKE_UPDATE' as const,payload:{id,patch:{z:strokeById.get(id)!.z}}})),
        ...data.groups.map(([id, items]) => ({ op: "GROUP_CREATE" as const, payload: { id, items } })),
      ];
      state.widgets = new Map(); state.order = []; state.connectors = new Map(); state.connectorOrder = [];
      state.strokes = new Map(); state.strokeOrder = []; state.groups = new Map(); state.selection = new Set();
      state.background={...DEFAULT_BACKGROUND};
      // Persist the validated snapshot as commands so reload reconstructs imported content.
      bus.restore(baseline, []);
      camera.x = data.camera.x; camera.y = data.camera.y; camera.scale = data.camera.scale;
      const title = document.getElementById("board-title"); if (title) title.textContent = data.title;
      api.sync(); status.textContent = "Projeto aberto";
    } catch (error) { status.textContent = "Falha ao abrir"; alert(`Não foi possível abrir o projeto. ${error instanceof Error ? error.message : "Arquivo inválido."}`); }
  };
  return { save: () => saveButton.click(), open: () => openButton.click() };
}
