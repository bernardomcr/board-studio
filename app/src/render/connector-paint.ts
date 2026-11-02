import type { Graphics } from 'pixi.js';
import { connectorDecorationSegment, type Connector, type ConnectorGeometry } from '../core/connectors';
import {connectorCaptionLayout,captionCutCubics,captionCutSegments,captionDotVisible} from '../core/connector-captions';
import { capGeometry, patternedLineSegments } from '../core/line-decoration';
import type { Vec } from '../core/geometry';
import {screenStroke,screenDot} from './screen-coverage';
import {connectorShaftGeometry} from './connector-shaft';

/** Shared canvas paint for line patterns and all terminal decorations. */
export function paintConnector(graphics:Graphics,connector:Connector,geometry:ConnectorGeometry,clear=true,zoom=1):void {
  if(clear)graphics.clear();
  const color=connector.style.strokeColor,width=connector.style.strokeWidth;
  const shaft=connectorShaftGeometry(connector,geometry),line=patternedLineSegments(shaft.points,connector.style.strokeStyle,width);
  const captions=connectorCaptionLayout(connector,geometry);
  const coverage=screenStroke(width,zoom),stroke={color,...coverage,cap:'round' as const,join:'round' as const};
  const curves=shaft.cubics??(shaft.cubic?[shaft.cubic]:[]);
  if((!connector.style.strokeStyle||connector.style.strokeStyle==='normal')&&curves.length){
    for(const c of captionCutCubics(curves,captions)){graphics.moveTo(c.p0.x,c.p0.y);graphics.bezierCurveTo(c.p1.x,c.p1.y,c.p2.x,c.p2.y,c.p3.x,c.p3.y);graphics.stroke(stroke);}
  }else for(const source of line.segments)for(const segment of captionCutSegments(source,captions)){if(segment.length<2)continue;graphics.moveTo(segment[0]!.x,segment[0]!.y);for(const point of segment.slice(1))graphics.lineTo(point.x,point.y);graphics.stroke(stroke);}
  for(const dot of line.dots)if(captionDotVisible(dot,dot.radius,captions)){const coverage=screenDot(dot.radius,zoom);graphics.circle(dot.x,dot.y,coverage.radius).fill({color,alpha:coverage.alpha});}
  for(const which of ['start','end'] as const){
    const tangent=connectorDecorationSegment(connector,geometry,which),cap=capGeometry(connector.style[which==='start'?'startCap':'endCap'],tangent.from,tangent.to,width);
    for(const polygon of cap.polygons)graphics.poly(polygon).fill(color);
    for(const segment of cap.lines){graphics.moveTo(segment[0]!.x,segment[0]!.y);for(const point of segment.slice(1))graphics.lineTo(point.x,point.y);graphics.stroke(stroke);}
    for(const circle of cap.circles)graphics.circle(circle.x,circle.y,circle.radius).fill(color);
  }
}

const escaped=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const n=(value:number)=>String(Math.round(value*10000)/10000);
const polyline=(points:Vec[])=>points.map(p=>`${n(p.x)},${n(p.y)}`).join(' ');

/** Self-contained SVG children, with the same sampled patterns and caps as Pixi. */
export function connectorSvgContent(connector:Connector,geometry:ConnectorGeometry,includeCaptions=true):string {
  const color=escaped(connector.style.strokeColor),width=connector.style.strokeWidth;
  const stroke=`fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"`;
  const shaft=connectorShaftGeometry(connector,geometry),line=patternedLineSegments(shaft.points,connector.style.strokeStyle,width),pieces:string[]=[];
  const captions=connectorCaptionLayout(connector,geometry);
  if(!connector.style.strokeStyle||connector.style.strokeStyle==='normal') {
    const curves=shaft.cubics ?? (shaft.cubic?[shaft.cubic]:[]);
    if(curves.length)for(const c of captionCutCubics(curves,captions))pieces.push(`<path d="M${n(c.p0.x)} ${n(c.p0.y)} C${n(c.p1.x)} ${n(c.p1.y)} ${n(c.p2.x)} ${n(c.p2.y)} ${n(c.p3.x)} ${n(c.p3.y)}" ${stroke}/>`);
    else for(const source of line.segments)for(const segment of captionCutSegments(source,captions))pieces.push(`<polyline points="${polyline(segment)}" ${stroke}/>`);
  }else{
    for(const source of line.segments)for(const segment of captionCutSegments(source,captions))pieces.push(`<polyline points="${polyline(segment)}" ${stroke}/>`);
    for(const dot of line.dots)if(captionDotVisible(dot,dot.radius,captions))pieces.push(`<circle cx="${n(dot.x)}" cy="${n(dot.y)}" r="${n(dot.radius)}" fill="${color}"/>`);
  }
  for(const which of ['start','end'] as const){const tangent=connectorDecorationSegment(connector,geometry,which),cap=capGeometry(connector.style[which==='start'?'startCap':'endCap'],tangent.from,tangent.to,width);
    for(const polygon of cap.polygons)pieces.push(`<polygon points="${polygon.map(n).join(' ')}" fill="${color}"/>`);
    for(const segment of cap.lines)pieces.push(`<polyline points="${polyline(segment)}" ${stroke}/>`);
    for(const circle of cap.circles)pieces.push(`<circle cx="${n(circle.x)}" cy="${n(circle.y)}" r="${n(circle.radius)}" fill="${color}"/>`);
  }
  if(includeCaptions)for(const caption of captions)if(caption.text)pieces.push(`<text transform="translate(${n(caption.position.x)} ${n(caption.position.y)}) rotate(${n(caption.angle*180/Math.PI)})" text-anchor="middle" dominant-baseline="central" font-family="${escaped(caption.fontFamily)}" font-size="${n(caption.fontSize)}" fill="${escaped(caption.color)}">${escaped(caption.text)}</text>`);
  return pieces.join('');
}
