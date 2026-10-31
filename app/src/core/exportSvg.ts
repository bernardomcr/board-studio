/**
 * Export SVG: serializa o MODELO (não o canvas), então o resultado é vetorial e editável.
 *
 * Texto é aproximado: quebra por largura estimada (0,55 × fontSize por caractere),
 * com runs aplicados via <tspan>.
 */

import { connectorSvgContent } from "../render/connector-paint";
import type { BoardState } from "./commands";
import {
  connectorBounds,
  connectorGeometry,
  type Connector,
} from "./connectors";
import { unionRect, widgetAABB, pointInWidget, widgetCorners, type Rect } from "./geometry";
import type { Style, Widget } from "./model";
import { parseRich } from "./richtext";
import { strokeBounds, type Stroke } from "./strokes";
import {strokeSvgContent} from '../render/stroke-paint';
import { borderPattern, canonicalShape, shapeDetails, shapePolygon } from "./shapes";
import { DEFAULT_BACKGROUND } from "./background";
import {resolvedWidgetStyle} from './style-scale';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Options {
  padding?: number;
  /** none omits all scenery; an explicit color replaces both board color and image. */
  background?: string;
}

export function boardToSvg(state: BoardState, options: Options = {}): string {
  const padding = options.padding ?? 80;
  const rects: Rect[] = [];
  const background = state.background ?? DEFAULT_BACKGROUND;
  const scenery = options.background === undefined ? background.image : undefined;
  if (scenery) rects.push({ minX: scenery.x, minY: scenery.y, maxX: scenery.x + scenery.width, maxY: scenery.y + scenery.height });

  for (const w of state.widgets.values()) if(!w.hidden){const r=widgetAABB(w),pad=resolvedWidgetStyle(w).borderWidth/2;rects.push({minX:r.minX-pad,minY:r.minY-pad,maxX:r.maxX+pad,maxY:r.maxY+pad});}
  for (const c of state.connectors.values()) {
    if(c.hidden)continue;
    const geometry = connectorGeometry(c, state.widgets);
    if (geometry) rects.push(connectorBounds(geometry));
  }
  for (const s of state.strokes.values()) if(!s.hidden)rects.push(strokeBounds(s));

  const bounds = unionRect(rects) ?? { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const width = Math.max(1, bounds.maxX - bounds.minX + padding * 2);
  const height = Math.max(1, bounds.maxY - bounds.minY + padding * 2);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" ` +
      `viewBox="${minX} ${minY} ${width} ${height}">`,
  );
  if (options.background !== "none") {
    parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${escapeXml(options.background ?? background.color)}"/>`);
    if (scenery) parts.push(`<image data-board-background="true" href="${escapeXml(scenery.src)}" x="${scenery.x}" y="${scenery.y}" width="${scenery.width}" height="${scenery.height}" opacity="${scenery.opacity}" preserveAspectRatio="none"/>`);
  }

  const frames=[...state.widgets.values()].filter(w=>w.type==='frame'&&!w.hidden);
  const ordered=[...state.widgets.values(),...state.connectors.values(),...state.strokes.values()].filter(w=>!w.hidden).sort((a,b)=>a.z-b.z);

  for (const widget of ordered) {
    if(widget.type==='connector'){parts.push(connectorSvg(widget,state));continue;}
    if(widget.type==='stroke'){parts.push(strokeSvg(widget));continue;}
    const cx=widget.x+widget.width/2,cy=widget.y+widget.height/2;
    const frame=widget.type==='frame'?undefined:frames.filter(f=>pointInWidget(f,{x:cx,y:cy})).sort((a,b)=>a.width*a.height-b.width*b.height)[0];
    if(frame){const clip='frame-clip-'+widget.id.replace(/[^a-zA-Z0-9_-]/g,'');parts.push(`<defs><clipPath id="${clip}"><polygon points="${widgetCorners(frame).map(p=>`${p.x},${p.y}`).join(' ')}"/></clipPath></defs><g clip-path="url(#${clip})">${widgetSvg(widget)}</g>`);}else parts.push(widgetSvg(widget));
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function widgetSvg(w: Widget): string {
  w={...w,style:resolvedWidgetStyle(w)};
  const transform = `translate(${round(w.x)},${round(w.y)}) rotate(${round((w.rotation * 180) / Math.PI)},${round(w.width / 2)},${round(w.height / 2)})`;

  if (w.type === "image") {
    const crop = w.crop ?? { x: 0, y: 0, width: 1, height: 1 };
    const width = w.width / Math.max(.0001, crop.width);
    const height = w.height / Math.max(.0001, crop.height);
    // Clip the photograph, then draw its independently styled outline above it.
    const clipId='image-mask-'+w.id.replace(/[^a-zA-Z0-9_-]/g,'');
    const radius=Math.max(0,Math.min(w.style.cornerRadius??Math.min(w.width,w.height)*.12,Math.min(w.width,w.height)/2));
    const mask=w.maskShape==='ellipse'?`<ellipse cx="${w.width/2}" cy="${w.height/2}" rx="${w.width/2}" ry="${w.height/2}"/>`:`<rect width="${w.width}" height="${w.height}" rx="${w.maskShape==='round_rectangle'?radius:0}"/>`;
    const flip=`translate(${w.flipX?w.width:0},${w.flipY?w.height:0}) scale(${w.flipX?-1:1},${w.flipY?-1:1})`;
    const outline = w.style.borderWidth > 0 ? mask.replace(/\/>$/, ` fill="none"${borderSvg(w.style)}/>` ) : '';
    return `<g transform="${transform}"><defs><clipPath id="${clipId}">${mask}</clipPath></defs><g clip-path="url(#${clipId})" opacity="${Math.max(0,Math.min(1,w.opacity??1))}"><g transform="${flip}"><image href="${escapeXml(w.src)}" x="${-crop.x * width}" y="${-crop.y * height}" width="${width}" height="${height}" preserveAspectRatio="none"/></g></g>${outline}</g>`;
  }

  if (w.type === "frame") {
    return [
      `<g transform="${transform}">`,
      `<rect width="${round(w.width)}" height="${round(w.height)}" fill="${w.style.fillColor}"${borderSvg(w.style)}/>` ,
      `<text x="2" y="-8" font-family="${escapeXml(w.style.fontFamily)}" font-size="13" font-weight="600" fill="#554e4a">${escapeXml(w.title)}</text>`,
      "</g>",
    ].join("\n");
  }

  const body = backgroundSvg(w);
  const text = textSvg(w);
  return `<g transform="${transform}">${body}${text}</g>`;
}

function backgroundSvg(w: Widget): string {
  const outer = backgroundOuterSvg(w);
  if (w.type !== "shape") return outer;
  const details = shapeDetails(w.shape, w.width, w.height).map(p => `<path d="${p.map((n, i) => `${i === 0 ? "M" : i % 2 === 0 ? "L" : ""}${round(n)}`).join(" ")}" fill="none"${borderSvg(w.style)}/>`).join("");
  const marker=w.shape==='stop_event'?`<ellipse cx="${w.width/2}" cy="${w.height/2}" rx="${w.width*.3}" ry="${w.height*.3}" fill="${escapeXml(w.style.borderColor)}"/>`:'';
  return outer + details + marker;
}

function backgroundOuterSvg(w: Widget): string {
  const { style } = w;
  const fill = style.fillOpacity === 1 ? style.fillColor : style.fillColor;
  const stroke = borderSvg(style);
  const cx = w.width / 2;
  const cy = w.height / 2;

  if (w.type === "text") return "";

  if (w.type === "sticky_note") {
    return `<rect width="${round(w.width)}" height="${round(w.height)}" rx="2" fill="${fill}" fill-opacity="${style.fillOpacity}"/>`;
  }

  const originalShape = w.type === "shape" ? w.shape : "rectangle";
  if(originalShape==='text_block'||originalShape.startsWith('annotation_curly'))return '';
  const shape = canonicalShape(originalShape);
  const polygon = shapePolygon(originalShape, w.width, w.height);
  if (polygon) {
    const points: string[] = [];
    for (let i = 0; i < polygon.length; i += 2) points.push(`${round(polygon[i]!)},${round(polygon[i + 1]!)}`);
    return `<polygon points="${points.join(" ")}" fill="${fill}"${stroke} fill-opacity="${style.fillOpacity}"/>`;
  }
  switch (shape) {
    case "circle":
      return `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(cx)}" ry="${round(cy)}" fill="${fill}"${stroke} fill-opacity="${style.fillOpacity}"/>`;
    case "round_rectangle":
      return `<rect width="${round(w.width)}" height="${round(w.height)}" rx="${round(Math.max(0, Math.min(style.cornerRadius ?? 16, Math.min(w.width, w.height) / 2)))}" fill="${fill}"${stroke} fill-opacity="${style.fillOpacity}"/>`;
    case "cylinder": {
      const r = Math.min(w.height / 5, w.width / 6);
      const width = w.width, height = w.height;
      const d = `M 0 ${r} C 0 ${-r / 3} ${width} ${-r / 3} ${width} ${r} L ${width} ${height - r} C ${width} ${height + r / 3} 0 ${height + r / 3} 0 ${height - r} Z`;
      return `<path d="${d}" fill="${fill}"${stroke} fill-opacity="${style.fillOpacity}"/><path d="M 0 ${r} C 0 ${r * 7 / 3} ${width} ${r * 7 / 3} ${width} ${r}" fill="none"${stroke}/>`;
    }
    default:
      return `<rect width="${round(w.width)}" height="${round(w.height)}" rx="${round(Math.max(0, Math.min(style.cornerRadius ?? 0, Math.min(w.width, w.height) / 2)))}" fill="${fill}"${stroke} fill-opacity="${style.fillOpacity}"/>`;
  }
}

function borderSvg(style: Style): string {
  if (style.borderWidth <= 0) return ' stroke="none"';
  const pattern = borderPattern(style.borderWidth, style.borderStyle);
  return ` stroke="${escapeXml(style.borderColor)}" stroke-width="${style.borderWidth}" stroke-opacity="${style.borderOpacity ?? 1}" stroke-linejoin="round"` +
    (pattern ? ` stroke-dasharray="${pattern.dash} ${pattern.gap}" stroke-linecap="${pattern.dash === 0 ? "round" : "butt"}"` : "");
}

function textSvg(w: Widget): string {
  const content=w.type==='frame'?'':w.content;if(!content.trim())return '';
  const pad=w.type==='text'?0:10,maxWidth=w.type==='text'?Infinity:Math.max(10,w.width-pad*2),lineHeight=w.style.fontSize*1.35;
  const anchor=w.style.textAlign==='center'?'middle':w.style.textAlign==='right'?'end':'start';
  const x=w.style.textAlign==='center'?w.width/2:w.style.textAlign==='right'?w.width-pad:pad;
  const lines=wrapRich(content,maxWidth,w.style),blockHeight=lines.length*lineHeight;
  let firstY=pad+w.style.fontSize;if(w.style.textAlignVertical==='middle')firstY=Math.max(pad,(w.height-blockHeight)/2)+w.style.fontSize;else if(w.style.textAlignVertical==='bottom')firstY=Math.max(pad,w.height-blockHeight-pad)+w.style.fontSize;
  const highlights:string[]=[],tspans:string[]=[];
  lines.forEach((line,index)=>{
    const y=firstY+index*lineHeight,width=line.reduce((sum,run)=>sum+measureRichToken(run.text,run,w.style),0);
    if(w.style.highlightColor&&w.style.highlightColor!=='transparent'){
      const left=anchor==='middle'?x-width/2:anchor==='end'?x-width:x;
      highlights.push('<rect x="'+round(left)+'" y="'+round(y-w.style.fontSize)+'" width="'+round(width)+'" height="'+round(lineHeight)+'" fill="'+escapeXml(w.style.highlightColor)+'"/>');
    }
    const inner=line.map(run=>{
      const decorations=[run.underline||w.style.textDecoration==='underline'?'underline':'',run.strike||w.style.textDecoration==='line-through'?'line-through':''].filter(Boolean).join(' ');
      const attrs=[run.bold?'font-weight="700"':'',run.italic?'font-style="italic"':'',decorations?'text-decoration="'+decorations+'"':'',run.link?'fill="#3859ff"':''].filter(Boolean).join(' ');
      const span='<tspan'+(attrs?' '+attrs:'')+'>'+escapeXml(run.text)+'</tspan>';
      return run.link?'<a href="'+escapeXml(run.link)+'">'+span+'</a>':span;
    }).join('');
    tspans.push('<tspan x="'+round(x)+'" y="'+round(y)+'">'+inner+'</tspan>');
  });
  return highlights.join('')+'<text font-family="'+escapeXml(w.style.fontFamily)+'" font-size="'+w.style.fontSize+'" font-weight="'+(w.style.fontWeight==='bold'?'700':'400')+'" font-style="'+(w.style.fontStyle??'normal')+'" fill="'+escapeXml(w.style.color)+'" text-anchor="'+anchor+'">'+tspans.join('')+'</text>';
}

let measurementContext:CanvasRenderingContext2D|null|undefined;
function measureRichToken(token:string,run:ReturnType<typeof parseRich>[number][number],style:Style):number {
  if(measurementContext===undefined)measurementContext=typeof document!=='undefined'?document.createElement('canvas').getContext('2d'):null;
  if(!measurementContext)return Array.from(token).length*style.fontSize*.55;
  measurementContext.font=(run.italic||style.fontStyle==='italic'?'italic ':'')+(run.bold||style.fontWeight==='bold'?'700 ':'400 ')+style.fontSize+'px '+style.fontFamily;
  return measurementContext.measureText(token).width;
}
function wrapRich(content:string,maxWidth:number,style:Style){
  return parseRich(content).flatMap(runs=>{
    const lines:Array<typeof runs>=[];let current:typeof runs=[],width=0;
    for(const run of runs)for(const token of run.text.split(/(\s+)/).filter(Boolean)){
      const tokenWidth=measureRichToken(token,run,style);if(width+tokenWidth>maxWidth&&width>0&&token.trim()!==''){lines.push(current);current=[];width=0;}
      current.push({...run,text:token});width+=tokenWidth;
    }
    lines.push(current);return lines;
  });
}

function connectorSvg(connector: Connector, state: BoardState): string {
  const geometry=connectorGeometry(connector,state.widgets);
  return geometry ? connectorSvgContent(connector,geometry) : "";
}

function strokeSvg(stroke: Stroke): string {
  return strokeSvgContent(stroke);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
