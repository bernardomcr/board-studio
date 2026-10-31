/**
 * Render do board: sincroniza o modelo com o grafo de cena do PixiJS.
 *
 * A ordem global de camadas vale para objetos, traços e conectores.
 * Quadros são containers mascarados: filhos são reparentados e cortados na borda.
 * Texto é renderizado como texto rico (runs de negrito/itálico/riscado/link).
 */

import { Container, Graphics, Text } from "pixi.js";
import type { BoardState } from "../core/commands";
import { widgetAABB, rectsIntersect, pointInWidget, widgetCorners, type Rect } from "../core/geometry";
import { connectorGeometry, connectorBounds, connectorCaptionPoints } from "../core/connectors";
import { strokeBounds, type StrokePoint } from "../core/strokes";
import {paintStroke,strokeRenderKey} from './stroke-paint';
import { parseRich, type Run } from "../core/richtext";
import { paintConnector } from "./connector-paint";
import type { Widget } from "../core/model";
import { borderPattern, canonicalShape, patternedContour, shapeContours, shapePolygon, shapeDetails } from "../core/shapes";
import {resolvedWidgetStyle} from '../core/style-scale';
import {fitTextResolution,textRasterDensity,TEXT_SAMPLING} from './text-quality';
import {mindNodeHidden,mindConnectorHidden,mindTopicText} from '../core/mindmap';
import {audioSignature,paintAudioCard,paintAudioLabels} from './audio-paint';
import {renderStructuredText} from './structured-text';

interface Node {
  container: Container;
  graphics: Graphics;
  /** container com os pedaços de texto (runs) */
  text: Container;
  type: Widget["type"];
  /** assinatura do último layout, evita reconstruir a cada frame */
  sig: string;
  backgroundSig: string;
}

export class BoardScene {
  /** quadros ficam abaixo de traços/conectores/objetos */
  readonly frameLayer = new Container();
  readonly strokeLayer = new Container();
  readonly connectorLayer = new Container();
  readonly layer = new Container();
  private nodes = new Map<string, Node>();
  private connectorNodes = new Map<string, Graphics>();
  private connectorLabels = new Map<string, Text[]>();
  private strokeNodes = new Map<string, Graphics>();
  private strokePaintKeys=new Map<string,{points:StrokePoint[];length:number;lastX:number;lastY:number;lastR:number;color:string;tool:string;opacity?:number;precision?:boolean;precisionSmoothing?:number;displayKey:string}>();
  private clipContainers = new Map<string, { container: Container; mask: Graphics; sig:string }>();
  /** retângulos clicáveis de link, em coordenadas locais do objeto */
  private links = new Map<string, Array<{ x: number; y: number; w: number; h: number; url: string }>>();
  private textResolution = 2;
  private zoom = 1;

  constructor(stage: Container) {
    this.frameLayer.sortableChildren = true;
    this.strokeLayer.sortableChildren = true;
    this.connectorLayer.sortableChildren = true;
    this.layer.sortableChildren = true;
    stage.addChild(this.frameLayer, this.strokeLayer, this.connectorLayer, this.layer);
  }

  // ------------------------------------------------------------- traços

  private syncStrokes(state: BoardState, visible?: Rect): void {
    for (const [id, node] of this.strokeNodes) {
      if (!state.strokes.has(id)) {
        node.destroy();
        this.strokeNodes.delete(id);
        this.strokePaintKeys.delete(id);
      }
    }

    for (const id of state.strokeOrder) {
      const stroke = state.strokes.get(id);
      if (!stroke || stroke.points.length === 0) continue;

      let node = this.strokeNodes.get(id);
      if (!node) {
        node = new Graphics();
        this.strokeNodes.set(id, node);
        node.label=id;this.layer.addChild(node);
      }
      const last=stroke.points[stroke.points.length-1]!,key=this.strokePaintKeys.get(id),displayKey=strokeRenderKey(stroke,this.zoom);
      if(!key||key.points!==stroke.points||key.length!==stroke.points.length||key.lastX!==last.x||key.lastY!==last.y||key.lastR!==last.r||key.color!==stroke.color||key.tool!==stroke.tool||key.opacity!==stroke.opacity||key.precision!==stroke.precision||key.precisionSmoothing!==stroke.precisionSmoothing||key.displayKey!==displayKey){
        paintStroke(node,stroke,{zoom:this.zoom});this.strokePaintKeys.set(id,{points:stroke.points,length:stroke.points.length,lastX:last.x,lastY:last.y,lastR:last.r,color:stroke.color,tool:stroke.tool,opacity:stroke.opacity,precision:stroke.precision,precisionSmoothing:stroke.precisionSmoothing,displayKey});
      }

      node.visible=!stroke.hidden&&(!visible||rectsIntersect(visible,strokeBounds(stroke)));
      node.zIndex = stroke.z;
    }
  }

  // --------------------------------------------------------- conectores

  private syncConnectors(state: BoardState, visible?: Rect): void {
    for (const [id, node] of this.connectorNodes) {
      if (!state.connectors.has(id)) {
        node.destroy();
        this.connectorNodes.delete(id);
        for (const label of this.connectorLabels.get(id) ?? []) label.destroy();
        this.connectorLabels.delete(id);
      }
    }

    for (const id of state.connectorOrder) {
      const connector = state.connectors.get(id);
      if (!connector) continue;
      const geometry = connectorGeometry(connector, state.widgets);
      if (!geometry) continue;

      let node = this.connectorNodes.get(id);
      if (!node) {
        node = new Graphics();
        this.connectorNodes.set(id, node);
        node.label=id;this.layer.addChild(node);
      }
      paintConnector(node, connector, geometry);

      node.visible=!connector.hidden&&!mindConnectorHidden(state,connector)&&(!visible||rectsIntersect(visible,connectorBounds(geometry)));
      node.zIndex = connector.z;

      const captions = connectorCaptionPoints(connector, geometry);
      const labels = this.connectorLabels.get(id) ?? [];
      while (labels.length > captions.length) labels.pop()!.destroy();
      for (let i = 0; i < captions.length; i++) {
        const caption = captions[i]!;
        let label = labels[i];
        if (!label) {
          label = new Text({
            ...TEXT_SAMPLING,
            text: "",
            resolution: this.textResolution,
            style: { fontFamily: "Arial, sans-serif", fontSize: 12, fill: "#42413a" },
          });
          label.anchor.set(0.5);
          labels.push(label);
          this.layer.addChild(label);
        }
        label.text = caption.text;
        const resolution=fitTextResolution(label,this.textResolution);
        if (label.resolution !== resolution) label.resolution = resolution;
        label.position.set(caption.position.x, caption.position.y - 10);
        label.zIndex = connector.z + .5;
        label.visible = node.visible && !!caption.text;
      }
      this.connectorLabels.set(id, labels);
    }
  }

  /** Retângulos de link do objeto, em coordenadas locais (para testes/depuração). */
  linksFor(widgetId: string): Array<{ x: number; y: number; w: number; h: number; url: string }> {
    const offset = this.nodes.get(widgetId)?.text.position;
    return (this.links.get(widgetId) ?? []).map(hit => ({ ...hit, x: hit.x + (offset?.x ?? 0), y: hit.y + (offset?.y ?? 0) }));
  }

  /** URL do link sob um ponto em coordenadas LOCAIS do objeto. */
  linkAt(widgetId: string, localX: number, localY: number): string | null {
    const hits = this.linksFor(widgetId);
    for (const hit of hits) {
      if (localX >= hit.x && localX <= hit.x + hit.w && localY >= hit.y && localY <= hit.y + hit.h) return hit.url;
    }
    return null;
  }

  /** Usado pelo editor inline. */
  setTextVisible(id: string, visible: boolean): void {
    const node = this.nodes.get(id);
    if (node) node.text.visible = visible;
  }

  // -------------------------------------------------------------- clip

  private frameOf(state: BoardState, w: Widget): Widget | undefined {
    let best: Widget | undefined;
    let bestArea = Infinity;
    for (const frame of state.widgets.values()) {
      if (frame.type !== "frame" || frame.id === w.id || frame.hidden) continue;
      const cx = w.x + w.width / 2;
      const cy = w.y + w.height / 2;
      if (pointInWidget(frame,{x:cx,y:cy})) {
        const area = frame.width * frame.height;
        if (area < bestArea) {
          bestArea = area;
          best = frame;
        }
      }
    }
    return best;
  }

  private clipFor(frame: Widget): { container: Container; mask: Graphics; sig:string } {
    let entry = this.clipContainers.get(frame.id);
    if (!entry) {
      const container = new Container();
      const mask = new Graphics();
      container.addChild(mask);
      container.mask = mask;
      this.layer.addChild(container);
      entry = { container, mask, sig:'' };
      this.clipContainers.set(frame.id, entry);
    }
    const { container, mask } = entry;
    const sig=[frame.x,frame.y,frame.width,frame.height,frame.rotation].join('|');
    if(entry.sig!==sig){entry.sig=sig;mask.clear();mask.poly(widgetCorners(frame).flatMap(p=>[p.x,p.y])).fill({ color: 0xffffff });}
    container.zIndex = -1000 + frame.z;
    container.visible = true;
    return entry;
  }

  // -------------------------------------------------------------- sync

  sync(state: BoardState, visible?: Rect, zoom = 1): void {
    this.zoom = zoom;
    this.textResolution = textRasterDensity(zoom);
    this.syncStrokes(state, visible);
    this.syncConnectors(state, visible);

    for (const [id, entry] of this.clipContainers) {
      if (!state.widgets.has(id)) {
        // devolve os filhos à camada principal ANTES de destruir o container,
        // senão o destroy com children apagaria os objetos que estavam dentro
        for (const child of [...entry.container.children]) {
          if (child !== entry.mask && !child.destroyed) this.layer.addChild(child);
        }
        entry.mask.destroy();
        entry.container.destroy({ children: false });
        this.clipContainers.delete(id);
      }
    }

    for (const [id, node] of this.nodes) {
      if (!state.widgets.has(id)) {
        node.container.destroy({ children: true });
        this.nodes.delete(id);
      }
    }

    for (const id of state.order) {
      const widget = state.widgets.get(id);
      if (!widget) continue;

      let node = this.nodes.get(id);
      if (!node) {
        node = this.createNode(widget);
        this.nodes.set(id, node);
        this.layer.addChild(node.container);
      }
      this.paint(node, widget);

      node.container.zIndex = widget.z;

      const frame = widget.type === "frame" ? undefined : this.frameOf(state, widget);
      const target = this.layer;
      if (node.container.parent !== target) target.addChild(node.container);
      node.container.mask=frame?this.clipFor(frame).mask:null;

      node.container.visible = !widget.hidden&&!mindNodeHidden(state,widget.id)&&(!visible||rectsIntersect(visible,widgetAABB(widget)));
    }
  }

  /** Container do objeto (usado para mover visualmente durante o arraste). */
  nodeAt(id: string): Container | undefined {
    return this.nodes.get(id)?.container;
  }

  private createNode(widget: Widget): Node {
    const container = new Container();
    container.label=widget.id;
    const graphics = new Graphics();
    const text = new Container();
    container.addChild(graphics, text);
    return { container, graphics, text, type: widget.type, sig: "", backgroundSig:'' };
  }

  private paint(node: Node, w: Widget): void {
    const { container, graphics, text } = node;

    container.pivot.set(w.width / 2, w.height / 2);
    container.position.set(w.x + w.width / 2, w.y + w.height / 2);
    container.rotation = w.rotation;

    const style=w.style;
    const backgroundSig=[w.type,w.width,w.height,w.type==='shape'?w.shape:'',style.fillColor,style.fillOpacity,style.borderColor,style.borderWidth,style.borderScale,style.borderStyle,style.borderOpacity,style.cornerRadius,audioSignature(w),Math.round(Math.log2(Math.max(.02,this.zoom))*2)].join('|');
    if(node.backgroundSig!==backgroundSig){node.backgroundSig=backgroundSig;graphics.clear();drawBackground(graphics,w,this.zoom);}

    this.layoutText(node, w);
    void text;
  }

  // -------------------------------------------------------------- texto

  private layoutText(node: Node, w: Widget): void {
    if (w.type === "image") return;
    if(w.audio){node.sig='';paintAudioLabels(node.text,w,this.textResolution);return;}
    if(renderStructuredText(node.text,w,this.textResolution)){node.sig='';return;}
    for (const child of node.text.children) if (child instanceof Text){const resolution=fitTextResolution(child,this.textResolution);if(child.resolution!==resolution)child.resolution=resolution;}
    const pad = w.type==='text'?0:10;
    const maxWidth = Math.max(1, w.width - pad * 2);
    const content = w.type === "frame" ? w.title : mindTopicText(w);

    const sig = [
      content,
      w.style.fontFamily,
      w.style.fontSize,
      w.style.fontWeight,
      w.style.fontStyle,
      w.style.textDecoration,
      w.style.highlightColor,
      w.style.color,
      w.style.textAlign,
      w.style.textAlignVertical,
      w.type==='text'?w.width:Math.round(maxWidth),
      w.type,
    ].join("|");

    if (node.sig !== sig) {
      node.sig = sig;
      for (const child of node.text.removeChildren()) child.destroy({ children: true });

      if (w.type === "frame") {
        const title = new Text({
          ...TEXT_SAMPLING,
          text: content || "Quadro",
          resolution: this.textResolution,
          style: {
            fontFamily: w.style.fontFamily,
            fontSize: 13,
            fontWeight: "600",
            fill: "#55544e",
          },
        });
        title.resolution=fitTextResolution(title,this.textResolution);
        title.position.set(2, -24);
        node.text.addChild(title);
        node.text.position.set(0, 0);
        return;
      }

      const collected: Array<{ x: number; y: number; w: number; h: number; url: string }> = [];
      this.buildRich(node.text, content, w, maxWidth, collected);
      this.links.set(w.id, collected);
    }

    if (w.type === "frame") { node.text.position.set(0, 0); return; }

    // alinhamento vertical do bloco
    const blockHeight = node.text.height;
    if (w.style.textAlignVertical === "middle") {
      node.text.position.y = Math.max(pad, (w.height - blockHeight) / 2);
    } else if (w.style.textAlignVertical === "bottom") {
      node.text.position.y = Math.max(pad, w.height - blockHeight - pad);
    } else {
      node.text.position.y = pad;
    }
    node.text.position.x = pad;

  }

  private buildRich(
    target: Container,
    content: string,
    w: Widget,
    maxWidth: number,
    collected: Array<{ x: number; y: number; w: number; h: number; url: string }>,
  ): void {
    const lines = parseRich(content);
    const lineHeight = w.style.fontSize * 1.35;
    const align = w.style.textAlign;

    type Item = { node: Text; width: number; strike: boolean; underline:boolean; highlight?:string; link?: string };
    let y = 0;

    for (const runs of lines) {
      let items: Item[] = [];
      let lineWidth = 0;

      const flush = (): void => {
        for (const placed of placeLine(target, items, lineWidth, maxWidth, align, y)) {
          if (placed.link) collected.push({ x: placed.x, y: placed.y, w: placed.w, h: placed.h, url: placed.link });
        }
        items = [];
        lineWidth = 0;
        y += lineHeight;
      };

      for (const run of runs) {
        for (const token of splitWords(run)) {
          const node = makeRunText(token, run, w, this.textResolution);
          const width = node.width;

          if (w.type!=='text' && lineWidth > 0 && lineWidth + width > maxWidth && token.trim() !== "") flush();

          items.push({ node, width, strike: Boolean(run.strike)||w.style.textDecoration==='line-through',underline:Boolean(run.underline)||w.style.textDecoration==='underline',highlight:w.style.highlightColor, link: run.link });
          lineWidth += width;
        }
      }

      flush();
    }
  }
}

function splitWords(run: Run): string[] {
  return run.text.split(/(\s+)/).filter((t) => t !== "");
}

function makeRunText(token: string, run: Run, w: Widget, resolution: number): Text {
  const isLink = Boolean(run.link);
  const node=new Text({
    ...TEXT_SAMPLING,
    text: token,
    resolution,
    style: {
      fontFamily: w.style.fontFamily,
      fontSize: w.style.fontSize,
      fill: isLink ? "#3859ff" : w.style.color,
      fontWeight: run.bold || w.style.fontWeight==='bold' ? "700" : "400",
      fontStyle: run.italic || w.style.fontStyle==='italic' ? "italic" : "normal",
      lineHeight: w.style.fontSize * 1.35,
    },
  });
  node.resolution=fitTextResolution(node,resolution);
  return node;
}

function placeLine(
  target: Container,
  items: Array<{ node: Text; width: number; strike: boolean; underline:boolean; highlight?:string; link?: string }>,
  lineWidth: number,
  maxWidth: number,
  align: string,
  y: number,
): Array<{ x: number; y: number; w: number; h: number; link?: string }> {
  const placed: Array<{ x: number; y: number; w: number; h: number; link?: string }> = [];
  if (items.length === 0) return placed;
  let x =
    align === "center"
      ? Math.max(0, (maxWidth - lineWidth) / 2)
      : align === "right"
        ? Math.max(0, maxWidth - lineWidth)
        : 0;

  for (const item of items) {
    item.node.position.set(x, y);
    if(item.highlight&&item.highlight!=='transparent'){
      const highlight=new Graphics();highlight.rect(x,y+item.node.height*.08,item.width,item.node.height*.92).fill(item.highlight);target.addChild(highlight);
    }
    target.addChild(item.node);

    if (item.strike) {
      const strike = new Graphics();
      strike
        .moveTo(x, y + item.node.height * 0.55)
        .lineTo(x + item.width, y + item.node.height * 0.55)
        .stroke({ width: Math.max(.8,item.node.style.fontSize/18), color: item.node.style.fill as string, alpha: 0.9 });
      target.addChild(strike);
    }
    if(item.underline){const underline=new Graphics();underline.moveTo(x,y+item.node.height*.91).lineTo(x+item.width,y+item.node.height*.91).stroke({width:Math.max(.8,item.node.style.fontSize/18),color:item.node.style.fill as string});target.addChild(underline);}

    placed.push({ x, y, w: item.width, h: item.node.height, link: item.link });
    x += item.width;
  }

  return placed;
}

function drawBackground(g: Graphics, w: Widget, zoom: number): void {
  if(w.audio){paintAudioCard(g,w,zoom);return;}
  w={...w,style:resolvedWidgetStyle(w)};
  const { style } = w;

  if (w.type === "image") return;

  if (w.type === "frame") {
    g.rect(0, 0, w.width, w.height).fill({ color: style.fillColor, alpha: style.fillOpacity });
    if (style.borderWidth > 0) {
      if (borderPattern(style.borderWidth, style.borderStyle)) drawPatternedBorder(g, w, "rectangle", zoom);
      else g.stroke({ width: style.borderWidth, color: style.borderColor, alpha: style.borderOpacity ?? 1 });
    }
    return;
  }

  if (w.type === "sticky_note") {
    g.roundRect(1, 2, w.width, w.height, 2).fill({ color: 0x000000, alpha: 0.08 });
    g.roundRect(0, 0, w.width, w.height, 2).fill({ color: style.fillColor, alpha: style.fillOpacity });
    return;
  }

  if (w.type === "text") return;

  const originalShape = w.type === "shape" ? w.shape : "rectangle";
  const shape = canonicalShape(originalShape);
  const fill = { color: style.fillColor, alpha: style.fillOpacity };
  const stroke =
    style.borderWidth > 0
      ? { width: style.borderWidth, color: style.borderColor, alpha: style.borderOpacity ?? 1, alignment: 0.5 }
      : null;

  if(originalShape==='text_block')return;
  if(originalShape.startsWith('annotation_curly')){
    if(stroke&&borderPattern(style.borderWidth,style.borderStyle))drawPatternedBorder(g,w,originalShape,zoom);
    else if(stroke)for(const line of shapeDetails(originalShape,w.width,w.height)){g.moveTo(line[0]!,line[1]!);for(let i=2;i<line.length;i+=2)g.lineTo(line[i]!,line[i+1]!);g.stroke(stroke);}
    return;
  }

  const polygon = shapePolygon(originalShape, w.width, w.height);
  if (polygon) {
    g.poly(polygon);
  } else switch (shape) {
    case "circle":
      g.ellipse(w.width / 2, w.height / 2, w.width / 2, w.height / 2);
      break;
    case "round_rectangle":
      g.roundRect(0, 0, w.width, w.height, Math.max(0, Math.min(style.cornerRadius ?? 16, Math.min(w.width, w.height) / 2)));
      break;
    case "cylinder": {
      const r = Math.min(w.height / 5, w.width / 6);
      g.moveTo(0, r)
        .bezierCurveTo(0, -r / 3, w.width, -r / 3, w.width, r)
        .lineTo(w.width, w.height - r)
        .bezierCurveTo(w.width, w.height + r / 3, 0, w.height + r / 3, 0, w.height - r)
        .closePath();
      break;
    }
    default:
      g.roundRect(0, 0, w.width, w.height, Math.max(0, Math.min(style.cornerRadius ?? 0, Math.min(w.width, w.height) / 2)));
  }

  const pattern = borderPattern(style.borderWidth, style.borderStyle);
  if (stroke && !pattern) g.fill(fill).stroke(stroke);
  else g.fill(fill);
  if (stroke && pattern) drawPatternedBorder(g, w, originalShape, zoom);
  if (stroke && !pattern) for (const line of shapeDetails(originalShape, w.width, w.height)) {
    g.moveTo(line[0]!, line[1]!);
    for (let i = 2; i < line.length; i += 2) g.lineTo(line[i]!, line[i + 1]!);
    g.stroke(stroke);
  }
  if(originalShape==='stop_event')g.ellipse(w.width/2,w.height/2,w.width*.3,w.height*.3).fill(style.borderColor);
  if (shape === "cylinder" && stroke && !pattern) {
    const r = Math.min(w.height / 5, w.width / 6);
    g.moveTo(0, r).bezierCurveTo(0, r * 7 / 3, w.width, r * 7 / 3, w.width, r).stroke(stroke);
  }
}

function drawPatternedBorder(g: Graphics, w: Widget, shape: Parameters<typeof shapeContours>[0], zoom: number): void {
  const pattern = borderPattern(w.style.borderWidth, w.style.borderStyle);
  if (!pattern) return;
  for (const contour of shapeContours(shape, w.width, w.height, zoom, w.style.cornerRadius)) {
    const pieces = patternedContour(contour, pattern.dash, pattern.gap);
    if (pattern.dash === 0) {
      for (const p of pieces) g.circle(p[0]!, p[1]!, w.style.borderWidth / 2);
      g.fill({ color: w.style.borderColor, alpha: w.style.borderOpacity ?? 1 });
    } else {
      for (const p of pieces) {
        g.moveTo(p[0]!, p[1]!);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!);
      }
      g.stroke({ color: w.style.borderColor, alpha: w.style.borderOpacity ?? 1, width: w.style.borderWidth, cap: "butt", join: "round" });
    }
  }
}
