/**
 * Modelo de widgets — nomes, campos e defaults extraídos do bundle do Miro
 * (ver docs/01-modelo-de-dados.md).
 */

export type WidgetType = "sticky_note" | "shape" | "text" | "frame" | "image";

export interface Style {
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
  /** Outline thickness relative to the shorter dimension of this object. */
  borderScale?: number;
  borderStyle: "normal" | "dotted" | "dashed";
  borderOpacity?: number;
  /** Corner radius in board units; omitted retains each shape's default. */
  cornerRadius?: number;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  highlightColor?: string;
  textAlign: "left" | "center" | "right";
  textAlignVertical: "top" | "middle" | "bottom";
}

export interface BaseWidget {
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  link?: string;
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** ordem de empilhamento; maior = na frente */
  z: number;
  style: Style;
}

export interface StickyWidget extends BaseWidget {
  type: "sticky_note";
  content: string;
  shape: "square";
}

export interface ShapeWidget extends BaseWidget {
  type: "shape";
  content: string;
  shape: "rectangle" | "circle" | "triangle" | "rhombus" | "hexagon" | "star" | "round_rectangle" | "parallelogram" | "trapezoid" | "pentagon" | "octagon" | "arrow_right" | "cylinder"
    | "speech_bubble" | "arrow_left" | "arrow_both" | "predefined_process" | "cloud" | "cross" | "brace_left" | "brace_right" | "chevron" | "notched_chevron"
    | "flow_process" | "flow_decision" | "flow_terminator" | "flow_predefined" | "document" | "multiple_documents" | "manual_input" | "preparation" | "flow_data" | "flow_database" | "hard_disk" | "internal_storage" | "manual_operation" | "delay" | "stored_data" | "merge" | "flow_connector" | "or_junction" | "summing_junction" | "display" | "off_page" | "card" | "folder" | "swimlane_horizontal" | "swimlane_vertical" | "extract" | "collate" | "annotation" | "bucket" | "lightning" | "annotation_curly_right" | "annotation_curly_left" | "magnetic_tape" | "multiple_processes" | "lined_shaded" | "lined_document" | "divided_process" | "container" | "process_sharp" | "flow_trapezoid" | "asymmetric" | "lean_left" | "double_circle" | "start_event" | "stop_event" | "junction" | "tagged_process" | "loop_limit" | "tagged_document" | "disk_storage" | "text_block" | "annotation_curly_both" | "flow_cloud" | "explosion";
}

export const SHAPE_OPTIONS: ReadonlyArray<{ id: ShapeWidget["shape"]; label: string; category?: "basic" | "flowchart"; keywords?: string }> = [
  { id: "rectangle", label: "Retângulo" },
  { id: "round_rectangle", label: "Retângulo arredondado" },
  { id: "circle", label: "Elipse / círculo" },
  { id: "triangle", label: "Triângulo" },
  { id: "rhombus", label: "Losango" },
  { id: "hexagon", label: "Hexágono" },
  { id: "star", label: "Estrela" },
  { id: "parallelogram", label: "Paralelogramo" },
  { id: "trapezoid", label: "Trapézio" },
  { id: "pentagon", label: "Pentágono" },
  { id: "octagon", label: "Octógono" },
  { id: "arrow_right", label: "Seta" },
  { id: "cylinder", label: "Cilindro" },
  { id: "speech_bubble", label: "Balão de fala", category: "basic", keywords: "caixa chamada comentário" },
  { id: "arrow_left", label: "Seta à esquerda", category: "basic" },
  { id: "arrow_both", label: "Seta bidirecional", category: "basic" },
  { id: "predefined_process", label: "Processo predefinido", category: "basic", keywords: "subprocesso" },
  { id: "cloud", label: "Nuvem", category: "basic" },
  { id: "cross", label: "Cruz", category: "basic" },
  { id: "brace_left", label: "Chave esquerda", category: "basic" },
  { id: "brace_right", label: "Chave direita", category: "basic" },
  { id: "chevron", label: "Chevron", category: "basic" },
  { id: "notched_chevron", label: "Chevron recortado", category: "basic" },
  { id: "flow_process", label: "Processo", category: "flowchart" },
  { id: "flow_decision", label: "Decisão", category: "flowchart" },
  { id: "flow_terminator", label: "Início / fim", category: "flowchart", keywords: "terminador" },
  { id: "flow_predefined", label: "Subprocesso", category: "flowchart" },
  { id: "document", label: "Documento", category: "flowchart" },
  { id: "multiple_documents", label: "Documentos múltiplos", category: "flowchart" },
  { id: "manual_input", label: "Entrada manual", category: "flowchart" },
  { id: "preparation", label: "Preparação", category: "flowchart" },
  { id: "flow_data", label: "Dados / entrada e saída", category: "flowchart" },
  { id: "flow_database", label: "Banco de dados", category: "flowchart" },
  { id: "hard_disk", label: "Disco rígido", category: "flowchart" },
  { id: "internal_storage", label: "Armazenamento interno", category: "flowchart" },
  { id: "manual_operation", label: "Operação manual", category: "flowchart" },
  { id: "delay", label: "Atraso", category: "flowchart", keywords: "espera" },
  { id: "stored_data", label: "Dados armazenados", category: "flowchart" },
  { id: "merge", label: "Mesclar", category: "flowchart" },
  { id: "flow_connector", label: "Conector de página", category: "flowchart" },
  { id: "or_junction", label: "Junção OU", category: "flowchart" },
  { id: "summing_junction", label: "Junção de soma", category: "flowchart" },
  { id: "display", label: "Exibição", category: "flowchart" },
  { id: "off_page", label: "Conector fora da página", category: "flowchart" },
  { id: "card", label: "Cartão", category: "flowchart" },
  { id: "folder", label: "Pasta", category: "flowchart" },
  { id: "swimlane_horizontal", label: "Raia horizontal", category: "flowchart" },
  { id: "swimlane_vertical", label: "Raia vertical", category: "flowchart" },
  { id: "extract", label: "Extrair", category: "flowchart" },
  { id: "collate", label: "Intercalar", category: "flowchart" },
  { id: "annotation", label: "Anotação", category: "flowchart" },
  { id: "bucket", label: "Balde", category: "flowchart" },
  { id: "lightning", label: "Relâmpago", category: "flowchart" },
  { id: "annotation_curly_right", label: "Anotação — chave direita", category: "flowchart", keywords: "note curly right" },
  { id: "annotation_curly_left", label: "Anotação — chave esquerda", category: "flowchart", keywords: "note curly left" },
  { id: "magnetic_tape", label: "Fita magnética", category: "flowchart", keywords: "magnetic tape" },
  { id: "multiple_processes", label: "Processos múltiplos", category: "flowchart", keywords: "multiproc" },
  { id: "lined_shaded", label: "Processo sombreado", category: "flowchart", keywords: "lined shaded" },
  { id: "lined_document", label: "Documento com linhas", category: "flowchart", keywords: "lined document" },
  { id: "divided_process", label: "Processo dividido", category: "flowchart", keywords: "divided" },
  { id: "container", label: "Contêiner", category: "flowchart", keywords: "container" },
  { id: "process_sharp", label: "Processo — cantos retos", category: "flowchart", keywords: "process sharp" },
  { id: "flow_trapezoid", label: "Trapézio de fluxograma", category: "flowchart", keywords: "trapezoid" },
  { id: "asymmetric", label: "Processo assimétrico", category: "flowchart", keywords: "asymmetric" },
  { id: "lean_left", label: "Dados inclinados à esquerda", category: "flowchart", keywords: "lean left" },
  { id: "double_circle", label: "Círculo duplo", category: "flowchart", keywords: "double circle" },
  { id: "start_event", label: "Evento inicial", category: "flowchart", keywords: "start" },
  { id: "stop_event", label: "Evento final", category: "flowchart", keywords: "stop" },
  { id: "junction", label: "Junção", category: "flowchart", keywords: "junction" },
  { id: "tagged_process", label: "Processo marcado", category: "flowchart", keywords: "tagged process" },
  { id: "loop_limit", label: "Limite de repetição", category: "flowchart", keywords: "loop limit" },
  { id: "tagged_document", label: "Documento marcado", category: "flowchart", keywords: "tagged document" },
  { id: "disk_storage", label: "Armazenamento em disco", category: "flowchart", keywords: "disk storage" },
  { id: "text_block", label: "Bloco de texto", category: "flowchart", keywords: "text block" },
  { id: "annotation_curly_both", label: "Anotação — duas chaves", category: "flowchart", keywords: "note curly both" },
  { id: "flow_cloud", label: "Nuvem de fluxograma", category: "flowchart", keywords: "cloud" },
  { id: "explosion", label: "Explosão", category: "flowchart", keywords: "bang" },
];

export interface TextWidget extends BaseWidget {
  textSizing?: 'natural';
  type: "text";
  content: string;
}

/** Container com título; filhos são os objetos cujo centro cai dentro dele. */
export interface FrameWidget extends BaseWidget {
  type: "frame";
  title: string;
}

export interface ImageWidget extends BaseWidget {
  maskShape?: "rectangle" | "ellipse" | "round_rectangle";
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;
  type: "image";
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Normalized source rectangle, each component in [0, 1]. */
  crop?: { x: number; y: number; width: number; height: number };
  content: string;
}

export type Widget = StickyWidget | ShapeWidget | TextWidget | FrameWidget | ImageWidget;

/** Defaults literais do Miro (shape/stencil_shape no bundle). */
export const SHAPE_STYLE: Style = {
  fillColor: "#ffffff",
  fillOpacity: 1,
  borderColor: "#1a1a1a",
  borderWidth: 2,
  borderStyle: "normal",
  color: "#1a1a1a",
  fontFamily: "Noto Sans", // literal do Miro: fontFamily:"arial"
  fontSize: 14,
  textAlign: "center",
  textAlignVertical: "middle",
};

/** Sticky não tem borda por default; texto centralizado nos dois eixos. */
export const STICKY_STYLE: Style = {
  ...SHAPE_STYLE,
  fillColor: "#fff9b1",
  borderWidth: 0,
  textAlign: "center",
  textAlignVertical: "middle",
};

export const FRAME_STYLE: Style = {
  ...SHAPE_STYLE,
  fillColor: "#fbfaf7",
  borderColor: "#d5d5d2",
  borderWidth: 2,
  borderStyle: "normal",
  textAlign: "left",
  textAlignVertical: "top",
};

export const TEXT_STYLE: Style = {
  ...SHAPE_STYLE,
  fillColor: "transparent",
  borderWidth: 0,
  textAlign: "left",
  textAlignVertical: "top",
};

/** Paleta de sticky do Miro (nomes literais; hex aproximado). */
export const STICKY_COLORS: Record<string, string> = {
  gray: "#e5e5e5",
  light_yellow: "#fff9b1",
  yellow: "#f5d128",
  orange: "#ffb84d",
  light_green: "#d5f692",
  green: "#a8e05f",
  dark_green: "#56b365",
  cyan: "#8fd9e6",
  light_pink: "#ffc7d9",
  pink: "#ff9db6",
  violet: "#d6b6ff",
  red: "#ff8a8a",
  light_blue: "#a6c8ff",
  blue: "#5aa9ff",
  dark_blue: "#3d6dcc",
  black: "#2b2b2b",
};

let seq = 0;
export function nextId(prefix = "w"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

interface CreateOpts {
  x: number;
  y: number;
  width?: number;
  height?: number;
  z?: number;
  content?: string;
  fillColor?: string;
  shape?: ShapeWidget["shape"];
}

export function createWidget(type: WidgetType, opts: CreateOpts): Widget {
  const base: BaseWidget = {
    id: nextId(type),
    type,
    x: opts.x,
    y: opts.y,
    width: opts.width ?? 160,
    height: opts.height ?? 160,
    rotation: 0,
    z: opts.z ?? 0,
    style: { ...SHAPE_STYLE },
  };

  if (type === "sticky_note") {
    return {
      ...base,
      type,
      width: opts.width ?? 160,
      height: opts.height ?? 160,
      content: opts.content ?? "",
      shape: "square",
      style: { ...STICKY_STYLE, fillColor: opts.fillColor ?? STICKY_STYLE.fillColor },
    };
  }
  if (type === "shape") {
    return {
      ...base,
      type,
      width: opts.width ?? 180,
      height: opts.height ?? 110,
      content: opts.content ?? "",
      shape: opts.shape ?? "rectangle",
      style: { ...SHAPE_STYLE, fillColor: opts.fillColor ?? (["start_event","junction"].includes(opts.shape??"")?"#1a1a1a":opts.shape==="text_block"?"transparent":"#ffffff"),...(opts.shape==="text_block"?{borderWidth:0}: {}) },
    };
  }
  if (type === "frame") {
    return {
      ...base,
      type: "frame",
      width: opts.width ?? 640,
      height: opts.height ?? 420,
      title: opts.content ?? "Quadro",
      style: { ...FRAME_STYLE },
    };
  }

  if (type === "image") {
    return {
      ...base,
      type,
      src: "",
      naturalWidth: opts.width ?? 160,
      naturalHeight: opts.height ?? 160,
      content: "",
      style: { ...SHAPE_STYLE, borderWidth: 0 },
    };
  }

  return {
    ...base,
    type: "text",
    width: opts.width ?? 200,
    height: opts.height ?? 40,
    content: opts.content ?? "Texto",
    style: { ...TEXT_STYLE },
  };
}

/** Centro do widget em coordenadas de mundo. */
export function center(w: { x: number; y: number; width: number; height: number }) {
  return { x: w.x + w.width / 2, y: w.y + w.height / 2 };
}

export function hitTest(w: Widget, px: number, py: number): boolean {
  return px >= w.x && px <= w.x + w.width && py >= w.y && py <= w.y + w.height;
}
