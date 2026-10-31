import type { Graphics } from 'pixi.js';
import { connectorCapSegment, connectorCaptionPoints, type Connector, type ConnectorGeometry } from '../core/connectors';
import { capGeometry, patternedLineSegments } from '../core/line-decoration';
import type { Vec } from '../core/geometry';

/** Shared canvas paint for line patterns and all terminal decorations. */
export function paintConnector(graphics:Graphics,connector:Connector,geometry:ConnectorGeometry,clear=true):void {
  if(clear)graphics.clear();
  const color=connector.style.strokeColor,width=connector.style.strokeWidth;
  const line=patternedLineSegments(geometry.points,connector.style.strokeStyle,width);
  const stroke={color,width,cap:'round' as const,join:'round' as const};
  const curves=geometry.cubics??(geometry.cubic?[geometry.cubic]:[]);
  if((!connector.style.strokeStyle||connector.style.strokeStyle==='normal')&&curves.length){
    graphics.moveTo(curves[0]!.p0.x,curves[0]!.p0.y);for(const c of curves)graphics.bezierCurveTo(c.p1.x,c.p1.y,c.p2.x,c.p2.y,c.p3.x,c.p3.y);graphics.stroke(stroke);
  }else for(const segment of line.segments){if(segment.length<2)continue;graphics.moveTo(segment[0]!.x,segment[0]!.y);for(const point of segment.slice(1))graphics.lineTo(point.x,point.y);graphics.stroke(stroke);}
  for(const dot of line.dots)graphics.circle(dot.x,dot.y,dot.radius).fill(color);
  for(const which of ['start','end'] as const){
    const tangent=connectorCapSegment(geometry,which),cap=capGeometry(connector.style[which==='start'?'startCap':'endCap'],tangent.from,tangent.to,width);
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
  const line=patternedLineSegments(geometry.points,connector.style.strokeStyle,width),pieces:string[]=[];
  if(!connector.style.strokeStyle||connector.style.strokeStyle==='normal') {
    const curves=geometry.cubics ?? (geometry.cubic?[geometry.cubic]:[]);
    if(curves.length){const first=curves[0]!;pieces.push(`<path d="M${n(first.p0.x)} ${n(first.p0.y)} ${curves.map(c=>`C${n(c.p1.x)} ${n(c.p1.y)} ${n(c.p2.x)} ${n(c.p2.y)} ${n(c.p3.x)} ${n(c.p3.y)}`).join(' ')}" ${stroke}/>`);}
    else for(const segment of line.segments)pieces.push(`<polyline points="${polyline(segment)}" ${stroke}/>`);
  }else{
    for(const segment of line.segments)pieces.push(`<polyline points="${polyline(segment)}" ${stroke}/>`);
    for(const dot of line.dots)pieces.push(`<circle cx="${n(dot.x)}" cy="${n(dot.y)}" r="${n(dot.radius)}" fill="${color}"/>`);
  }
  for(const which of ['start','end'] as const){const tangent=connectorCapSegment(geometry,which),cap=capGeometry(connector.style[which==='start'?'startCap':'endCap'],tangent.from,tangent.to,width);
    for(const polygon of cap.polygons)pieces.push(`<polygon points="${polygon.map(n).join(' ')}" fill="${color}"/>`);
    for(const segment of cap.lines)pieces.push(`<polyline points="${polyline(segment)}" ${stroke}/>`);
    for(const circle of cap.circles)pieces.push(`<circle cx="${n(circle.x)}" cy="${n(circle.y)}" r="${n(circle.radius)}" fill="${color}"/>`);
  }
  if(includeCaptions)for(const caption of connectorCaptionPoints(connector,geometry))if(caption.text)pieces.push(`<text x="${n(caption.position.x)}" y="${n(caption.position.y-10)}" text-anchor="middle" dominant-baseline="central" font-family="Arial,sans-serif" font-size="12" fill="#42413a">${escaped(caption.text)}</text>`);
  return pieces.join('');
}
