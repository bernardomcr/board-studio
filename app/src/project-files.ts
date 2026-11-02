import type { BoardState, CommandBus, Command } from "./core/commands";
import type { Camera } from "./core/camera";
import { MIN_SCALE, MAX_SCALE } from "./core/camera";
import { SHAPE_OPTIONS, type Widget } from "./core/model";
import type { Connector, Endpoint } from "./core/connectors";
import type { Stroke } from "./core/strokes";
import { DEFAULT_BACKGROUND, validateBoardBackground, type BoardBackground } from "./core/background";
import {loadBoardFont,boardFontFamilies,fontFamilyName} from './fonts';
import {validateUserFonts,snapshotUserFonts,restoreUserFonts,type UserFont} from './user-fonts';
import {migrateFrameSnapshots} from './core/layer-migration';
import {validateMindMetadata,validateMindMapGraph} from './core/mindmap';
import {validateMindAttachmentBoardBudget} from './core/mind-attachments';
import {validateAudioMetadata} from './core/audio';
import {validateStructuredMetadataFields} from './core/structured-text';
import {validateBoardLayers,snapshotBoardLayers,restoreBoardLayers,boardLayerFlags,type BoardLayers,type LayerMembership} from './core/board-layers';

interface BoardFile {
  layers?:BoardLayers;
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
  const layers=data.layers===undefined?undefined:validateBoardLayers(data.layers),layerIds=layers?new Set(layers.nodes.filter(n=>n.kind==='layer').map(n=>n.id)):undefined;
  const membership=(raw:Record<string,unknown>):LayerMembership=>{if(!layers)return {};const layerId=id(raw.layerId);if(!layerIds!.has(layerId))fail('Objeto aponta para camada ausente.');for(const field of ['layerOwnHidden','layerOwnLocked'])if(raw[field]!==undefined&&typeof raw[field]!=='boolean')fail('Estado próprio de camada inválido.');const flags=boardLayerFlags(layers,layerId);if(flags.hidden?(raw.hidden!==true||typeof raw.layerOwnHidden!=='boolean'):raw.layerOwnHidden!==undefined)fail('Visibilidade própria de camada inconsistente.');if(flags.locked?(raw.locked!==true||typeof raw.layerOwnLocked!=='boolean'):raw.layerOwnLocked!==undefined)fail('Bloqueio próprio de camada inconsistente.');return {layerId,...(raw.layerOwnHidden===undefined?{}:{layerOwnHidden:raw.layerOwnHidden as boolean}),...(raw.layerOwnLocked===undefined?{}:{layerOwnLocked:raw.layerOwnLocked as boolean})};};
  const widgets = list(data.widgets).map(raw => {
    const w = record(raw), style = record(w.style);
    const type = one(w.type, ["shape", "sticky_note", "text", "frame", "image"] as const);
    if(w.audio!==undefined&&(type!=='shape'||w.checklist!==undefined||w.table!==undefined))fail('Cartão de áudio incompatível com este objeto.');
    if((w.checklist!==undefined||w.table!==undefined)&&type!=='shape'&&type!=='text')fail('Conteúdo estruturado incompatível com este objeto.');
    const base = {
      ...membership(w),
      mind:w.mind===undefined?undefined:validateMindMetadata(w.mind),
      audio:w.audio===undefined?undefined:validateAudioMetadata(w.audio),...validateStructuredMetadataFields(w),
      id: id(w.id), type, name:w.name===undefined?undefined:str(w.name,1000),hidden:!!w.hidden, locked:w.locked===undefined?undefined:!!w.locked, link:w.link===undefined?undefined:str(w.link,4000), x: number(w.x), y: number(w.y), width: number(w.width, .001), height: number(w.height, .001),
      rotation: number(w.rotation), z: number(w.z),
      style: {
        fillColor: color(style.fillColor), fillOpacity: number(style.fillOpacity, 0, 1), borderColor: color(style.borderColor),
        borderOpacity:style.borderOpacity===undefined?undefined:number(style.borderOpacity,0,1),cornerRadius:style.cornerRadius===undefined?undefined:number(style.cornerRadius,0),
        borderScale:style.borderScale===undefined?undefined:number(style.borderScale,0),borderWidth: number(style.borderWidth, 0), borderStyle: one(style.borderStyle, ["normal", "dotted", "dashed"] as const),
        fontWeight:style.fontWeight===undefined?undefined:one(style.fontWeight,["normal","bold"] as const),fontStyle:style.fontStyle===undefined?undefined:one(style.fontStyle,["normal","italic"] as const),textDecoration:style.textDecoration===undefined?undefined:one(style.textDecoration,["none","underline","line-through"] as const),highlightColor:style.highlightColor===undefined?undefined:color(style.highlightColor),
        color: color(style.color), fontFamily: str(style.fontFamily, 256), fontSize: number(style.fontSize, Number.MIN_VALUE),
        textAlign: one(style.textAlign, ["left", "center", "right"] as const), textAlignVertical: one(style.textAlignVertical, ["top", "middle", "bottom"] as const),
      },
    };
    if (type === "frame") return { ...base, type, title: str(w.title) };
    const content = str(w.content);
    if (type === "shape") return { ...base, type, content, shape: one(w.shape, SHAPE_OPTIONS.map(option => option.id)) };
    if (type === "sticky_note") return { ...base, type, content, shape: one(w.shape, ["square"] as const),...(w.stickyPad===undefined?{}:{stickyPad:!!w.stickyPad}) };
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
  const widgetIds = new Set(widgets.map(widget => widget.id));
  const endpoint = (value: unknown): Endpoint => {
    const ep = record(value), kind = one(ep.kind, ["point", "anchor"] as const);
    if (kind === "point") return { kind, x: number(ep.x), y: number(ep.y) };
    const widgetId = id(ep.widgetId); if (!widgetIds.has(widgetId)) fail("Conector aponta para objeto ausente.");
    return { kind, widgetId, x: number(ep.x, 0, 1), y: number(ep.y, 0, 1) };
  };
  const connectors: Connector[] = list(data.connectors).map(raw => {
    const c = record(raw), style = record(c.style);
    return { ...membership(c),id: id(c.id),mindBranch:c.mindBranch===undefined?undefined:id(c.mindBranch),name:c.name===undefined?undefined:str(c.name,1000),hidden:!!c.hidden,locked:!!c.locked,waypoints:c.waypoints==null?c.waypoints as null|undefined:list(c.waypoints,1000).map(v=>{const p=record(v);return {x:number(p.x),y:number(p.y)}}),captionPositions:c.captionPositions===undefined?undefined:list(c.captionPositions,100).map(v=>number(v,0,1)), type: one(c.type, ["connector"] as const), start: endpoint(c.start), end: endpoint(c.end),
      shape: one(c.shape, ["straight", "elbowed", "curved"] as const), z: number(c.z),
      controlPoint: c.controlPoint == null ? c.controlPoint as null | undefined : (() => { const p = record(c.controlPoint); return { x: number(p.x), y: number(p.y) }; })(),
      style: { strokeStyle:style.strokeStyle===undefined?undefined:one(style.strokeStyle,["normal","dashed","dotted"] as const),strokeColor: color(style.strokeColor), strokeWidth: number(style.strokeWidth, .01),
        startCap: style.startCap === undefined ? undefined : one(style.startCap, ["none", "arrow","triangle","circle","diamond","bar"] as const),
        endCap: style.endCap === undefined ? undefined : one(style.endCap, ["none", "arrow","triangle","circle","diamond","bar"] as const) },
      captions: c.captions === undefined ? undefined : list(c.captions, 100).map(value => str(value)),
      captionStyles:c.captionStyles===undefined?undefined:list(c.captionStyles,100).map(value=>{const s=record(value);return {fontSize:s.fontSize===undefined?undefined:number(s.fontSize,.000001),fontFamily:s.fontFamily===undefined?undefined:str(s.fontFamily,1000),color:s.color===undefined?undefined:color(s.color),followPath:s.followPath===undefined?undefined:!!s.followPath,side:s.side===undefined?undefined:one(s.side,['above','center','below'] as const)};}),
    };
  });
  for(const family of boardFontFamilies(widgets,connectors)){const name=fontFamilyName(family);if(name.startsWith('BoardCustom-')&&!embeddedFamilies.has(name))fail('O arquivo não inclui os dados de uma fonte personalizada usada no board.');}
  validateMindMapGraph(widgets,connectors);
  let totalPoints = 0;
  const strokes: Stroke[] = list(data.strokes).map(raw => {
    const s = record(raw), points = list(s.points, 200000); totalPoints += points.length;
    const erasures=s.erasures===undefined?undefined:list(s.erasures,200000).map(value=>{const e=record(value),cutPoints=list(e.points,200000);if(!cutPoints.length)fail('Área apagada inválida.');totalPoints+=cutPoints.length;return {radius:number(e.radius,.000001),points:cutPoints.map(value=>{const p=record(value);return {x:number(p.x),y:number(p.y)};})};});
    if (totalPoints > 1000000) fail("O arquivo contém pontos de desenho demais.");
    return { ...membership(s),id: id(s.id),name:s.name===undefined?undefined:str(s.name,1000),hidden:!!s.hidden,locked:!!s.locked,type: one(s.type, ["stroke"] as const), tool: one(s.tool, ["brush", "pen", "highlighter"] as const), color: color(s.color), z: number(s.z),
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
  if(layers)for(const node of layers.nodes)if(seen.has(node.id)||groupIds.has(node.id))fail('Identificador de camada repetido em um objeto ou grupo.');
  for(const [gid,members] of groups){if(seen.has(gid))fail('Identificador de grupo repetido.');for(const member of members){if(!seen.has(member)&&!groupMap.has(member))fail('Membro de grupo ausente.');if(parented.has(member))fail('Objeto em múltiplos grupos.');parented.add(member);}}
  const visiting=new Set<string>(),visited=new Set<string>();const visit=(id:string)=>{if(visiting.has(id))fail('Grupo circular inválido.');if(visited.has(id))return;visiting.add(id);for(const member of groupMap.get(id)??[])if(groupMap.has(member))visit(member);visiting.delete(id);visited.add(id);};for(const id of groupMap.keys())visit(id);
  const camera = record(data.camera);
  const background=data.background===undefined?{...DEFAULT_BACKGROUND}:validateBoardBackground(data.background);
  if(!background)fail("Fundo do board inválido.");
  return { format: "local-board", version: 1,layerOrderVersion:1, title: str(data.title, 1000), widgets:data.layerOrderVersion===1?widgets:migrateFrameSnapshots(widgets), connectors, strokes, groups,
    background: background!,userFonts,layers,
    order: order(data.order, widgets), connectorOrder: order(data.connectorOrder, connectors), strokeOrder: order(data.strokeOrder, strokes),
    camera: { x: number(camera.x), y: number(camera.y), scale: number(camera.scale, MIN_SCALE, MAX_SCALE) } };
}

export function installProjectFiles(api: { state: BoardState; bus: CommandBus; camera: Camera; sync(): void;getBoardKey?():string|null;beforeOperation?():void }) {
  const { state, bus, camera } = api;
  if(!document.getElementById('project-file-feedback-styles')){const css=document.createElement('style');css.id='project-file-feedback-styles';css.textContent=`#project-file-error{position:fixed;z-index:120;left:50%;bottom:72px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;box-sizing:border-box;width:max-content;max-width:min(560px,calc(100vw - 24px));padding:13px 12px 13px 16px;border:1px solid var(--studio-accent,#8050ba);border-radius:12px;background:var(--studio-surface,#fbfaff);color:var(--studio-ink,#292331);box-shadow:var(--studio-shadow,0 6px 28px #28163722);font:13px/1.5 Inter,'Segoe UI',sans-serif}#project-file-error>span{min-width:0;overflow-wrap:anywhere}#project-file-error>button{display:grid;place-items:center;flex:none;width:30px;height:30px;padding:0;border:0;border-radius:7px;background:transparent;color:inherit;font:23px/1 Inter,'Segoe UI',sans-serif;cursor:pointer}#project-file-error>button:hover{background:var(--studio-soft,#eee9f6);color:var(--studio-accent,#8050ba)}#project-file-error>button:focus-visible{outline:2px solid var(--studio-accent,#8050ba);outline-offset:2px}`;document.head.append(css);}
  const clearError=()=>document.getElementById('project-file-error')?.remove();
  function exportError(message:string){clearError();const alert=document.createElement('div');alert.id='project-file-error';alert.setAttribute('role','alert');alert.setAttribute('aria-label','Falha ao salvar arquivo');alert.setAttribute('aria-atomic','true');const text=document.createElement('span');text.textContent=message;const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Fechar aviso de arquivo');close.title='Fechar aviso';close.textContent='×';close.addEventListener('click',()=>alert.remove());alert.append(text,close);document.body.append(alert);}
  const container = document.createElement("div"); container.className = "chip";container.id='project-file-controls';
  const status=document.createElement('div');status.id='project-file-status';status.setAttribute('role','status');status.hidden=true;
  const statusText=document.createElement('span'),dismissStatus=document.createElement('button');dismissStatus.type='button';dismissStatus.setAttribute('aria-label','Fechar mensagem de arquivo');dismissStatus.textContent='×';status.append(statusText,dismissStatus);document.body.append(status);
  let statusTimer=0;
  const clearStatus=()=>{clearTimeout(statusTimer);status.hidden=true;statusText.textContent='';};
  const reportStatus=(message:string,persistent=false)=>{clearStatus();statusText.textContent=message;status.hidden=false;if(!persistent)statusTimer=window.setTimeout(clearStatus,4000);};
  dismissStatus.onclick=clearStatus;
  if(!document.getElementById('project-file-status-styles')){const css=document.createElement('style');css.id='project-file-status-styles';css.textContent=`#project-file-status{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:110;display:flex;align-items:center;gap:12px;width:max-content;max-width:min(560px,calc(100vw - 24px));box-sizing:border-box;padding:10px 10px 10px 14px;border:1px solid var(--studio-line,#ded7e8);border-radius:12px;background:var(--studio-surface,#fbfaff);color:var(--studio-ink,#292331);box-shadow:var(--studio-shadow);font:12px/1.5 Inter,'Segoe UI',sans-serif}#project-file-status[hidden]{display:none!important}#project-file-status>span{min-width:0;overflow-wrap:anywhere}#project-file-status>button{flex:none;display:grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:inherit;font:21px/1 Inter,sans-serif;cursor:pointer}#project-file-status>button:hover{background:var(--studio-soft,#eee9f6)}#project-file-status>button:focus-visible{outline:2px solid var(--studio-accent,#8050ba);outline-offset:2px}`;document.head.append(css);}
  const saveButton = document.createElement("button"), openButton = document.createElement("button");
  saveButton.textContent = "Salvar arquivo"; openButton.textContent = "Abrir arquivo";
  for (const button of [saveButton, openButton]) { button.type = "button"; button.style.cssText = "width:auto;padding:0 8px;font:600 12px Segoe UI,sans-serif;white-space:nowrap"; }
  saveButton.title = "Salvar uma cópia completa e editável no computador";
  openButton.title = "Abrir um arquivo .board.json e substituir o board atual";
  container.append(saveButton, openButton); document.getElementById("topbar")?.append(container);
  const input = document.createElement("input"); input.type = "file"; input.accept = ".board.json,.json,application/json"; input.hidden = true; document.body.append(input);
  saveButton.onclick = () => {
    clearError();clearStatus();
    api.beforeOperation?.();
    const data: BoardFile = { format: "local-board", version: 1,layerOrderVersion:1, title: document.getElementById("board-title")?.textContent ?? "Board",
      layers:snapshotBoardLayers(state),
      background:state.background??{...DEFAULT_BACKGROUND},userFonts:snapshotUserFonts(boardFontFamilies(state.widgets.values(),state.connectors.values())),
      widgets: [...state.widgets.values()], order: [...state.order], connectors: [...state.connectors.values()], connectorOrder: [...state.connectorOrder],
      strokes: [...state.strokes.values()], strokeOrder: [...state.strokeOrder], groups: [...state.groups.entries()], camera: { x: camera.x, y: camera.y, scale: camera.scale } };
    let blob:Blob;try{validateMindAttachmentBoardBudget(data.widgets);blob=new Blob([JSON.stringify(data)],{type:'application/json'});if(blob.size>100*1024*1024)throw new Error('O projeto completo excede 100 MiB. Remova alguma mídia antes de salvar o arquivo.');}catch(error){clearStatus();exportError(error instanceof Error?error.message:'Não foi possível salvar o arquivo.');return;}
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${data.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Board"}.board.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); reportStatus('Arquivo gerado');
  };
  let destinationKey:string|null|undefined;
  openButton.onclick = () => {clearStatus();api.beforeOperation?.();destinationKey=api.getBoardKey?.();input.click();};
  input.onchange = async () => {
    const file = input.files?.[0],boardKey=destinationKey; input.value = ""; if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) fail("Escolha um projeto de até 100 MB.");
      const data = validateBoardFile(JSON.parse(await file.text()));
      if(api.getBoardKey&&boardKey!==api.getBoardKey()){reportStatus('O board mudou. Abra o arquivo novamente no destino desejado.',true);return;}
      await restoreUserFonts(data.userFonts);
      await Promise.all(boardFontFamilies(data.widgets,data.connectors).map(loadBoardFont));
      if(api.getBoardKey&&boardKey!==api.getBoardKey()){reportStatus('O board mudou. Abra o arquivo novamente no destino desejado.',true);return;}
      // Nothing changes until every field and reference has passed validation.
      api.beforeOperation?.();
      const widgetById = new Map(data.widgets.map(w => [w.id, w]));
      const connectorById = new Map(data.connectors.map(c => [c.id, c]));
      const strokeById = new Map(data.strokes.map(s => [s.id, s]));
      const baseline: Command[] = [
        ...(data.layers?[{op:'LAYERS_SET' as const,payload:{document:data.layers}}]:[]),
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
      delete state.layers;
      // Persist the validated snapshot as commands so reload reconstructs imported content.
      bus.restore(baseline, []);
      restoreBoardLayers(state,data.layers);
      camera.x = data.camera.x; camera.y = data.camera.y; camera.scale = data.camera.scale;
      const title = document.getElementById("board-title"); if (title) title.textContent = data.title;
      api.sync(); reportStatus('Projeto aberto');
    } catch (error) { reportStatus('Falha ao abrir',true); alert(`Não foi possível abrir o projeto. ${error instanceof Error ? error.message : "Arquivo inválido."}`); }
  };
  return { save: () => saveButton.click(), open: () => openButton.click() };
}
