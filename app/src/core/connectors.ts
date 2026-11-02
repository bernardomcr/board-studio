import type {LayerMembership} from './layer-model';
/** Connector geometry reconstructed for the local editor; no cloud dependency. */
import { rotate, widgetCenter, widgetAABB, worldToLocal, type Vec, type Rect } from "./geometry";
import { shapeContours,canonicalShape } from "./shapes";
import type { Widget } from "./model";
import {capGeometry,type CapGeometry} from './line-decoration';
import {borderWidthFor} from './style-scale';
export type Endpoint = { kind: "anchor"; widgetId: string; x: number; y: number } | { kind: "point"; x: number; y: number };
export type ConnectorShape = "straight" | "elbowed" | "curved";
export type CapStyle = "none" | "arrow" | "triangle" | "circle" | "diamond" | "bar";
export interface ConnectorCaptionStyle {
  fontSize?:number; fontFamily?:string; color?:string;
  /** Follow the local tangent while keeping letters upright. */
  followPath?:boolean;
  side?:'above'|'center'|'below';
}
export interface Connector extends LayerMembership {
  /** Child topic owning an automatically routed mind-map branch. */
  mindBranch?:string;
  id: string; type: "connector"; start: Endpoint; end: Endpoint; shape: ConnectorShape;
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  /** A world-space bend point. Curves pass through it at t=.5. */
  controlPoint?: Vec | null;
  /** Ordered user-editable bends in world coordinates. Null restores automatic routing. */
  waypoints?: Vec[] | null;
  style: { strokeColor: string; strokeWidth: number; startCap?: CapStyle; endCap?: CapStyle; strokeStyle?: "normal" | "dashed" | "dotted" };
  captions?: string[];
  /** Fractions of path length; omitted positions are distributed evenly. */
  captionPositions?: number[];
  captionStyles?: ConnectorCaptionStyle[];
  z: number;
}
export interface ConnectorCubic { p0: Vec; p1: Vec; p2: Vec; p3: Vec }
export interface ConnectorBoundary {point:Vec;normal:Vec}
export interface ConnectorGeometry { points: Vec[]; cubic?: ConnectorCubic; cubics?: ConnectorCubic[]; boundaries?:{start?:ConnectorBoundary;end?:ConnectorBoundary} }
const geometryCache=new WeakMap<Connector,{start?:Widget;end?:Widget;shape:ConnectorShape;mindBranch?:string;startEndpoint:Endpoint;endEndpoint:Endpoint;control?:Vec|null;waypoints?:Vec[]|null;geometry:ConnectorGeometry|null}>();
const EPS = 1e-8;
const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const length = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (v: Vec): Vec => { const size = Math.hypot(v.x, v.y); return size > EPS ? { x: v.x / size, y: v.y / size } : { x: 0, y: 0 }; };
const outlineCache=new Map<string,Vec[]>();
const elliptical=(w:Widget)=>w.type==='shape'&&canonicalShape(w.shape)==='circle'||w.type==='image'&&w.maskShape==='ellipse';
function roundedRadius(w:Widget):number{
  const shape=w.type==='shape'?canonicalShape(w.shape):undefined;
  const rounded=w.type==='image'?w.maskShape==='round_rectangle':shape==='round_rectangle'||shape==='rectangle'&&(w.style.cornerRadius??0)>0;
  return rounded?Math.max(0,Math.min(w.style.cornerRadius??(w.type==='image'?Math.min(w.width,w.height)*.12:16),Math.min(w.width,w.height)/2)):0;
}
function outline(w: Widget): Vec[] {
  const key=`${w.type}:${w.type==='shape'?w.shape:w.type==='image'?w.maskShape:''}:${w.width}:${w.height}:${w.style.cornerRadius??''}`;
  const retained=outlineCache.get(key);if(retained)return retained;
  const coords = w.type === "shape" ? shapeContours(w.shape, w.width, w.height, .3, w.style.cornerRadius)[0]
    : w.type === "image" && w.maskShape && w.maskShape !== "rectangle" ? shapeContours(w.maskShape === "ellipse" ? "circle" : "round_rectangle",w.width,w.height,.3,roundedRadius(w))[0] : null;
  if (!coords) return [{ x: 0, y: 0 }, { x: w.width, y: 0 }, { x: w.width, y: w.height }, { x: 0, y: w.height }];
  const points: Vec[] = []; for (let i = 0; i < coords.length; i += 2) points.push({ x: coords[i]!, y: coords[i + 1]! });
  if(points.length>1&&length(points[0]!,points.at(-1)!)<EPS)points.pop();
  if(outlineCache.size>512)outlineCache.delete(outlineCache.keys().next().value!);outlineCache.set(key,points);return points;
}
function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b.x - a.x, dy = b.y - a.y, size = dx * dx + dy * dy;
  const t = size < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / size));
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function anchorWorld(widget: Widget, x: number, y: number): Vec {
  const c = widgetCenter(widget), d = rotate({ x: (x - .5) * widget.width, y: (y - .5) * widget.height }, widget.rotation);
  return { x: c.x + d.x, y: c.y + d.y };
}
export function resolveEndpoint(ep: Endpoint, widgets: Map<string, Widget>): Vec | null {
  if (ep.kind === "point") return { x: ep.x, y: ep.y };
  const widget = widgets.get(ep.widgetId); return widget ? anchorWorld(widget, ep.x, ep.y) : null;
}
/** Surface normal includes elliptical and polygonal sides, in world space. */
export function anchorNormal(ep: Endpoint, widgets: Map<string, Widget>): Vec {
  if (ep.kind === "point") return { x: 0, y: 0 };
  const w = widgets.get(ep.widgetId); if (!w) return { x: 0, y: 0 };
  if (elliptical(w)) return rotate(unit({ x: (ep.x - .5) / w.width, y: (ep.y - .5) / w.height }), w.rotation);
  const radius=roundedRadius(w);
  if(radius){const p={x:ep.x*w.width,y:ep.y*w.height},center={x:Math.max(radius,Math.min(w.width-radius,p.x)),y:Math.max(radius,Math.min(w.height-radius,p.y))};return rotate(unit({x:p.x-center.x,y:p.y-center.y}),w.rotation);}
  const p = { x: ep.x * w.width, y: ep.y * w.height }, poly = outline(w);
  let distance = Infinity, normal: Vec = { x: 1, y: 0 };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, projected = closestOnSegment(p, a, b), d = length(projected, p);
    if (d < distance) { distance = d; normal = unit({ x: b.y - a.y, y: a.x - b.x }); }
  }
  return rotate(normal, w.rotation);
}
export function nearestAnchor(w: Widget, world: Vec): Vec {
  const p = worldToLocal(w, world);
  const radius=roundedRadius(w);
  if(radius){
    const candidates=[closestOnSegment(p,{x:radius,y:0},{x:w.width-radius,y:0}),closestOnSegment(p,{x:w.width,y:radius},{x:w.width,y:w.height-radius}),closestOnSegment(p,{x:w.width-radius,y:w.height},{x:radius,y:w.height}),closestOnSegment(p,{x:0,y:w.height-radius},{x:0,y:radius})];
    for(const [cx,cy,sx,sy] of [[radius,radius,-1,-1],[w.width-radius,radius,1,-1],[w.width-radius,w.height-radius,1,1],[radius,w.height-radius,-1,1]]){
      const dx=p.x-cx!,dy=p.y-cy!;
      if(dx*sx!>=0&&dy*sy!>=0){const normal=unit({x:dx,y:dy});candidates.push({x:cx!+normal.x*radius,y:cy!+normal.y*radius});}
      else candidates.push({x:cx!+sx!*radius,y:cy!},{x:cx!,y:cy!+sy!*radius});
    }
    let point=candidates[0]!,distance=Infinity;for(const candidate of candidates){const size=length(p,candidate);if(size<distance){distance=size;point=candidate;}}
    return {x:point.x/w.width,y:point.y/w.height};
  }
  if (elliptical(w)) {
    // Find the nearest point on the ellipse, rather than its enclosing box.
    const rx = w.width / 2, ry = w.height / 2;
    const at = (t: number): Vec => ({ x: rx + rx * Math.cos(t), y: ry + ry * Math.sin(t) });
    let angle = 0, best = Infinity;
    for (let i = 0; i < 64; i++) { const t = i * Math.PI / 32, d = length(at(t), p); if (d < best) { best = d; angle = t; } }
    let low = angle - Math.PI / 32, high = angle + Math.PI / 32;
    for (let i = 0; i < 24; i++) { const a = low + (high - low) / 3, b = high - (high - low) / 3; if (length(at(a), p) < length(at(b), p)) high = b; else low = a; }
    const result = at((low + high) / 2); return { x: result.x / w.width, y: result.y / w.height };
  }
  const poly = outline(w); let best = Infinity, result = poly[0]!;
  for (let i = 0; i < poly.length; i++) { const candidate = closestOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!), d = length(p, candidate); if (d < best) { best = d; result = candidate; } }
  return { x: result.x / w.width, y: result.y / w.height };
}
/** Ray intersection with the actual shape boundary, including rotated shapes. */
export function facingAnchor(w: Widget, towards: Vec): Vec {
  const p = worldToLocal(w, towards), c = { x: w.width / 2, y: w.height / 2 }, d = { x: p.x - c.x, y: p.y - c.y };
  if (Math.hypot(d.x, d.y) < EPS) return { x: 1, y: .5 };
  if (elliptical(w)) {
    const t = 1 / Math.hypot(d.x / c.x, d.y / c.y); return { x: .5 + d.x * t / w.width, y: .5 + d.y * t / w.height };
  }
  const radius=roundedRadius(w);
  if(radius){
    let low=0,high=Math.min(Math.abs(d.x)>EPS?c.x/Math.abs(d.x):Infinity,Math.abs(d.y)>EPS?c.y/Math.abs(d.y):Infinity);
    for(let i=0;i<56;i++){const t=(low+high)/2,qx=Math.abs(d.x*t)-(c.x-radius),qy=Math.abs(d.y*t)-(c.y-radius),outside=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius;if(outside>0)high=t;else low=t;}
    const t=(low+high)/2;return {x:.5+d.x*t/w.width,y:.5+d.y*t/w.height};
  }
  const poly = outline(w); let nearest = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, edge = { x: b.x - a.x, y: b.y - a.y }, diff = { x: a.x - c.x, y: a.y - c.y };
    const cross = d.x * edge.y - d.y * edge.x; if (Math.abs(cross) < EPS) continue;
    const t = (diff.x * edge.y - diff.y * edge.x) / cross, u = (diff.x * d.y - diff.y * d.x) / cross;
    if (t >= 0 && u >= -EPS && u <= 1 + EPS) nearest = Math.min(nearest, t);
  }
  return Number.isFinite(nearest) ? { x: .5 + d.x * nearest / w.width, y: .5 + d.y * nearest / w.height } : nearestAnchor(w, towards);
}
function clean(points: Vec[]): Vec[] {
  const unique = points.filter((p, i) => i === 0 || length(p, points[i - 1]!) > EPS);
  const result: Vec[] = [];
  for (const point of unique) {
    while (result.length > 1) { const a = result[result.length - 2]!, b = result[result.length - 1]!;
      const cross = (b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x);
      const dot = (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y);
      if (Math.abs(cross) > EPS || dot < 0) break; result.pop(); }
    result.push(point);
  }
  return result.length > 1 ? result : [points[0]!, points[points.length - 1]!];
}
function sampleCubic(p0: Vec, p1: Vec, p2: Vec, p3: Vec): Vec[] {
  const points: Vec[] = [p0];
  const walk = (a: Vec, b: Vec, c: Vec, d: Vec, depth: number) => {
    if (depth >= 12 || Math.max(distanceToSegment(b, a, d), distanceToSegment(c, a, d)) <= .12) { points.push(d); return; }
    const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd);
    walk(a, ab, abc, center, depth + 1); walk(center, bcd, cd, d, depth + 1);
  }; walk(p0, p1, p2, p3, 0); return points;
}
/** Curvature follows the attached edges and remains proportional to the chord.
 * Mind branches use the axis distance and a small world-space minimum instead.
 * Their model has no separate widget-scale component, so that minimum is 20. */
function curveReach(connector:Connector,a:Vec,b:Vec):number{
  if(!connector.mindBranch)return length(a,b)*.4;
  const vertical=connector.start.kind==='anchor'&&connector.end.kind==='anchor'&&connector.start.x===.5&&connector.end.x===.5;
  return Math.max(Math.abs(vertical?b.y-a.y:b.x-a.x)*.4,20);
}
function splineCubics(connector:Connector,knots:Vec[],widgets:Map<string,Widget>,startNormal?:Vec,endNormal?:Vec):ConnectorCubic[]{
  const spans=knots.slice(1).map((end,index)=>curveReach(connector,knots[index]!,end));
  const directions:Vec[]=knots.map((point,index)=>{
    if(index===0)return startNormal??(connector.start.kind==='anchor'?anchorNormal(connector.start,widgets):{x:0,y:0});
    if(index===knots.length-1){const normal=endNormal??(connector.end.kind==='anchor'?anchorNormal(connector.end,widgets):{x:0,y:0});return {x:-normal.x,y:-normal.y};}
    const incoming=unit({x:point.x-knots[index-1]!.x,y:point.y-knots[index-1]!.y}),outgoing=unit({x:knots[index+1]!.x-point.x,y:knots[index+1]!.y-point.y});
    return unit({x:incoming.x+outgoing.x,y:incoming.y+outgoing.y});
  });
  const handles=spans.map((span,index)=>({start:spans[index-1]&&spans[index-1]!<span?(spans[index-1]!+span)/2:span,end:spans[index+1]&&spans[index+1]!<span?(span+spans[index+1]!)/2:span}));
  const curves=spans.map((_,index)=>{const p0=knots[index]!,p3=knots[index+1]!,start=directions[index]!,end=directions[index+1]!,sizes=handles[index]!;return {p0,p1:{x:p0.x+start.x*sizes.start,y:p0.y+start.y*sizes.start},p2:{x:p3.x-end.x*sizes.end,y:p3.y-end.y*sizes.end},p3};});
  // Compute every join against the initial handles. Updating in place would make
  // later joins depend on traversal order and disturb the following tangent.
  const joins=curves.slice(1).map((next,index)=>{
    const previous=curves[index]!,join=next.p0,incoming=unit({x:join.x-previous.p1.x,y:join.y-previous.p1.y}),outgoing=unit({x:next.p2.x-join.x,y:next.p2.y-join.y});
    let direction=unit({x:incoming.x+outgoing.x,y:incoming.y+outgoing.y});
    if(!direction.x&&!direction.y)direction=unit({x:next.p3.x-previous.p0.x,y:next.p3.y-previous.p0.y});
    if(direction.x*(next.p1.x-previous.p2.x)+direction.y*(next.p1.y-previous.p2.y)<0)direction={x:-direction.x,y:-direction.y};
    const before=handles[index]!.end,after=handles[index+1]!.start;
    return {previous:{x:join.x-direction.x*before,y:join.y-direction.y*before},next:{x:join.x+direction.x*after,y:join.y+direction.y*after}};
  });
  joins.forEach((join,index)=>{curves[index]!.p2=join.previous;curves[index+1]!.p1=join.next;});
  return curves;
}
function sampledSpline(curves:ConnectorCubic[]):ConnectorGeometry{
  const points:Vec[]=[];curves.forEach((curve,index)=>points.push(...sampleCubic(curve.p0,curve.p1,curve.p2,curve.p3).slice(index?1:0)));return {points,cubics:curves};
}
export function connectorGeometry(connector: Connector, widgets: Map<string, Widget>): ConnectorGeometry | null {
  const start=connector.start.kind==='anchor'?widgets.get(connector.start.widgetId):undefined,end=connector.end.kind==='anchor'?widgets.get(connector.end.widgetId):undefined,cached=geometryCache.get(connector);
  if(cached&&cached.start===start&&cached.end===end&&cached.shape===connector.shape&&cached.mindBranch===connector.mindBranch&&cached.startEndpoint===connector.start&&cached.endEndpoint===connector.end&&cached.control===connector.controlPoint&&cached.waypoints===connector.waypoints)return cached.geometry;
  const geometry=buildConnectorGeometry(connector,widgets);geometryCache.set(connector,{start,end,shape:connector.shape,mindBranch:connector.mindBranch,startEndpoint:connector.start,endEndpoint:connector.end,control:connector.controlPoint,waypoints:connector.waypoints,geometry});return geometry;
}
/** Render against the visible outer edge, while preserving the stored anchor.
 * Old rectangular anchors on a masked/circular object are projected onto its
 * real outline. The widget's centered border is part of its visible surface. */
function endpointBoundary(ep:Endpoint,widgets:Map<string,Widget>):ConnectorBoundary|undefined{
  if(ep.kind!=='anchor')return undefined;
  const widget=widgets.get(ep.widgetId);if(!widget)return undefined;
  const original=anchorWorld(widget,ep.x,ep.y),projected=nearestAnchor(widget,original),surface={...ep,...projected},normal=anchorNormal(surface,widgets),point=anchorWorld(widget,projected.x,projected.y);
  const border=widget.style.borderColor==='transparent'||widget.style.borderOpacity===0?0:Math.max(0,borderWidthFor(widget))/2;
  return {point:{x:point.x+normal.x*border,y:point.y+normal.y*border},normal};
}
function buildConnectorGeometry(connector:Connector,widgets:Map<string,Widget>):ConnectorGeometry|null{
  const startBoundary=endpointBoundary(connector.start,widgets),endBoundary=endpointBoundary(connector.end,widgets);
  const a = startBoundary?.point??resolveEndpoint(connector.start, widgets), b = endBoundary?.point??resolveEndpoint(connector.end, widgets); if (!a || !b) return null;
  const result=buildPath(connector,widgets,a,b,startBoundary?.normal,endBoundary?.normal);
  if(startBoundary||endBoundary)result.boundaries={start:startBoundary,end:endBoundary};
  return result;
}
function buildPath(connector:Connector,widgets:Map<string,Widget>,a:Vec,b:Vec,startNormal?:Vec,endNormal?:Vec):ConnectorGeometry{
  const waypoints = connector.waypoints?.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (waypoints?.length) {
    const knots = [a, ...waypoints, b];
    if (connector.shape === "straight") return { points: clean(knots) };
    if (connector.shape === "elbowed") {
      const path: Vec[] = [a];
      let horizontal = Math.abs(b.x-a.x) >= Math.abs(b.y-a.y);
      if (connector.start.kind === "anchor") { const normal=anchorNormal(connector.start,widgets); horizontal=Math.abs(normal.x)>=Math.abs(normal.y); }
      for (let i=1;i<knots.length;i++) {
        const prev=knots[i-1]!, next=knots[i]!;
        path.push(horizontal?{x:next.x,y:prev.y}:{x:prev.x,y:next.y},next);
        // Keep the outgoing leg perpendicular to the last leg at a waypoint.
        horizontal=!horizontal;
      }
      return {points:clean(path)};
    }
    return sampledSpline(splineCubics(connector,knots,widgets,startNormal,endNormal));
  }
  const control = connector.controlPoint;
  if (connector.shape === "straight") return { points: clean(control ? [a, control, b] : [a, b]) };
  let n1 = startNormal??anchorNormal(connector.start, widgets), n2 = endNormal??anchorNormal(connector.end, widgets);
  const fallback = unit({ x: b.x - a.x, y: b.y - a.y });
  if (Math.hypot(n1.x, n1.y) < EPS) n1 = fallback;
  if (Math.hypot(n2.x, n2.y) < EPS) n2 = { x: -fallback.x, y: -fallback.y };
  if (connector.shape === "elbowed") {
    // Free endpoints use cardinal directions, avoiding accidental diagonal elbows.
    if (connector.start.kind === "point") n1 = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: Math.sign(b.x - a.x) || 1, y: 0 } : { x: 0, y: Math.sign(b.y - a.y) || 1 };
    if (connector.end.kind === "point") n2 = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: -Math.sign(b.x - a.x) || -1, y: 0 } : { x: 0, y: -Math.sign(b.y - a.y) || -1 };
    const offset = Math.min(24, length(a, b) / 4);
    const o1 = { x: a.x + n1.x * offset, y: a.y + n1.y * offset }, o2 = { x: b.x + n2.x * offset, y: b.y + n2.y * offset };
    const hs = Math.abs(n1.x) >= Math.abs(n1.y), he = Math.abs(n2.x) >= Math.abs(n2.y);
    if (control) {
      const interior = hs && he ? [{ x: control.x, y: o1.y }, { x: control.x, y: o2.y }]
        : !hs && !he ? [{ x: o1.x, y: control.y }, { x: o2.x, y: control.y }]
        : hs ? [{ x: control.x, y: o1.y }, control, { x: o2.x, y: control.y }]
        : [{ x: o1.x, y: control.y }, control, { x: control.x, y: o2.y }];
      return { points: clean([a, o1, ...interior, o2, b]) };
    }
    const obstacles = [connector.start, connector.end].flatMap(ep => {
      if (ep.kind !== "anchor") return []; const w = widgets.get(ep.widgetId); return w && Math.abs(w.rotation) < EPS ? [widgetAABB(w)] : [];
    });
    const xs = [(o1.x + o2.x) / 2, Math.min(a.x, b.x, ...obstacles.map(r => r.minX)) - 32, Math.max(a.x, b.x, ...obstacles.map(r => r.maxX)) + 32];
    const ys = [(o1.y + o2.y) / 2, Math.min(a.y, b.y, ...obstacles.map(r => r.minY)) - 32, Math.max(a.y, b.y, ...obstacles.map(r => r.maxY)) + 32];
    const candidates: Vec[][] = [];
    for (const x of xs) candidates.push([o1, { x, y: o1.y }, { x, y: o2.y }, o2]);
    for (const y of ys) candidates.push([o1, { x: o1.x, y }, { x: o2.x, y }, o2]);
    candidates.push([o1, { x: o2.x, y: o1.y }, o2], [o1, { x: o1.x, y: o2.y }, o2]);
    const penalty = (path: Vec[]) => {
      let score = 0;
      for (let i = 1; i < path.length; i++) { const p = path[i - 1]!, q = path[i]!; score += length(p, q);
        for (const r of obstacles) {
          if (Math.abs(p.y - q.y) < EPS && p.y > r.minY + EPS && p.y < r.maxY - EPS && Math.max(p.x, q.x) > r.minX + EPS && Math.min(p.x, q.x) < r.maxX - EPS) score += 1e7;
          if (Math.abs(p.x - q.x) < EPS && p.x > r.minX + EPS && p.x < r.maxX - EPS && Math.max(p.y, q.y) > r.minY + EPS && Math.min(p.y, q.y) < r.maxY - EPS) score += 1e7;
        }
      }
      // Favor routes which continue along the exit/entry directions.
      const first = path[1]!, last = path[path.length - 2]!;
      if ((first.x - o1.x) * n1.x + (first.y - o1.y) * n1.y < -EPS) score += 1e5;
      if ((last.x - o2.x) * n2.x + (last.y - o2.y) * n2.y < -EPS) score += 1e5;
      return score;
    };
    candidates.sort((p, q) => penalty(p) - penalty(q)); return { points: clean([a, ...candidates[0]!, b]) };
  }
  // Regular cubic connectors use the observed 0.4 chord-length tangent. Keeping
  // it proportional also preserves the same bend on macro-scale layouts.
  const curve=splineCubics(connector,[a,b],widgets,startNormal,endNormal)[0]!;
  let {p1,p2}=curve;
  if(connector.start.kind==='point'&&connector.end.kind==='point'){
    // A deliberately curved free line should retain a visible, gentle bow.
    const d={x:b.x-a.x,y:b.y-a.y},normal={x:-fallback.y,y:fallback.x},bow=Math.min(120,length(a,b)*.18);
    p1={x:a.x+d.x/3+normal.x*bow,y:a.y+d.y/3+normal.y*bow};
    p2={x:a.x+d.x*2/3+normal.x*bow,y:a.y+d.y*2/3+normal.y*bow};
  }
  if(control){
    // Split the automatic curve, then displace its centre and the adjacent
    // controls together. This preserves both endpoint tangents and C1 continuity.
    // Starting a drag at the existing handle therefore does not change the path.
    const ab=mid(a,p1),bc=mid(p1,p2),cd=mid(p2,b),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
    const d={x:control.x-center.x,y:control.y-center.y};
    const left={p0:a,p1:ab,p2:{x:abc.x+d.x,y:abc.y+d.y},p3:control};
    const right={p0:control,p1:{x:bcd.x+d.x,y:bcd.y+d.y},p2:cd,p3:b};
    return {points:[...sampleCubic(left.p0,left.p1,left.p2,left.p3),...sampleCubic(right.p0,right.p1,right.p2,right.p3).slice(1)],cubics:[left,right]};
  }
  return { points: sampleCubic(a, p1, p2, b), cubic: { p0: a, p1, p2, p3: b } };
}
export function distanceToSegment(p: Vec, a: Vec, b: Vec): number { return length(p, closestOnSegment(p, a, b)); }
export function distanceToConnector(p: Vec, geometry: ConnectorGeometry): number {
  let best = Infinity; for (let i = 1; i < geometry.points.length; i++) best = Math.min(best, distanceToSegment(p, geometry.points[i - 1]!, geometry.points[i]!)); return best;
}
const pathMetricsCache=new WeakMap<ConnectorGeometry,{lengths:number[];total:number}>();
function pathMetrics(geometry:ConnectorGeometry){
  const cached=pathMetricsCache.get(geometry);if(cached)return cached;
  const lengths:number[]=[];let total=0;
  for(let i=1;i<geometry.points.length;i++){const size=length(geometry.points[i-1]!,geometry.points[i]!);lengths.push(size);total+=size;}
  const metrics={lengths,total};pathMetricsCache.set(geometry,metrics);return metrics;
}
export const connectorPathLength=(geometry:ConnectorGeometry):number=>pathMetrics(geometry).total;
/** Point at a fraction of actual path length, for centered captions and handles. */
export function connectorPointAt(geometry: ConnectorGeometry, fraction = .5): Vec {
  const points = geometry.points; if (!points.length) return { x: 0, y: 0 };
  const {lengths,total}=pathMetrics(geometry);
  let remaining = total * Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < lengths.length; i++) { const size = lengths[i]!; if (remaining <= size && size > EPS) { const t = remaining / size, a = points[i]!, b = points[i + 1]!; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; } remaining -= size; }
  return { ...points[points.length - 1]! };
}
export const connectorMidpoint = (geometry: ConnectorGeometry): Vec => connectorPointAt(geometry, .5);
export function connectorCaptionPoints(connector:Connector,geometry:ConnectorGeometry):Array<{text:string;position:Vec;fraction:number}> {
  const captions=connector.captions ?? [];
  return captions.map((text,index)=>{const fraction=Math.max(0,Math.min(1,connector.captionPositions?.[index] ?? (index+1)/(captions.length+1)));return {text,position:connectorPointAt(geometry,fraction),fraction};});
}
/** Path-length fraction nearest a point, used to place and drag captions. */
export function connectorClosestFraction(geometry:ConnectorGeometry,p:Vec):number {
  const {lengths:segments,total}=pathMetrics(geometry);if(total<EPS)return .5;
  let before=0,best=Infinity,result=0;
  for(let i=0;i<segments.length;i++) {const a=geometry.points[i]!,b=geometry.points[i+1]!,q=closestOnSegment(p,a,b),d=length(q,p);if(d<best){best=d;result=(before+length(a,q))/total;}before+=segments[i]!;}
  return Math.max(0,Math.min(1,result));
}
/** Stable editing handles; assigning these to waypoints preserves user edits. */
export function connectorEditPoints(connector:Connector,geometry:ConnectorGeometry):Vec[] {
  if(connector.waypoints?.length)return connector.waypoints.map(p=>({...p}));
  if(connector.controlPoint)return [{...connector.controlPoint}];
  if(connector.shape==='elbowed')return geometry.points.slice(1,-1).map(p=>({...p}));
  if(connector.shape==='curved'&&geometry.cubic){const c=geometry.cubic;return [{x:(c.p0.x+3*c.p1.x+3*c.p2.x+c.p3.x)/8,y:(c.p0.y+3*c.p1.y+3*c.p2.y+c.p3.y)/8}];}
  return connector.shape==='curved'?[connectorMidpoint(geometry)]:[];
}
/** Insert a manual point in path order without mutating the existing connector. */
export function connectorInsertWaypoint(connector:Connector,geometry:ConnectorGeometry,p:Vec):Vec[] {
  const points=connectorEditPoints(connector,geometry);
  const fraction=connectorClosestFraction(geometry,p);
  const index=points.findIndex(point=>connectorClosestFraction(geometry,point)>fraction);
  points.splice(index<0?points.length:index,0,{...p});return points;
}
/** Exact endpoint tangents for arrowheads; skips degenerate segments. */
export function connectorCapSegment(geometry: ConnectorGeometry, which: "start" | "end"): { from: Vec; to: Vec } {
  const points = geometry.points, to = which === "start" ? points[0]! : points[points.length - 1]!;
  const curve=geometry.cubic ?? (which==='start'?geometry.cubics?.[0]:geometry.cubics?.at(-1));
  if (curve) {const controls=which==='start'?[curve.p1,curve.p2,curve.p3]:[curve.p2,curve.p1,curve.p0];const control=controls.find(point=>length(point,to)>EPS);if(control)return {from:control,to};}
  const rest = which === "start" ? points.slice(1) : points.slice(0, -1).reverse();
  return { from: rest.find(p => length(p, to) > EPS) ?? { x: to.x - 1, y: to.y }, to };
}
/** A stroked open arrow/bar has a round cap extending past its model tip.
 * At an attachment, move that decoration back by its actual support against
 * the surface normal. Filled tips already terminate exactly at the edge. */
export function connectorDecorationInset(connector:Connector,geometry:ConnectorGeometry,which:'start'|'end'):number{
  const boundary=geometry.boundaries?.[which];if(!boundary)return 0;
  const tangent=connectorCapSegment(geometry,which),direction=unit({x:tangent.to.x-tangent.from.x,y:tangent.to.y-tangent.from.y}),approach=-(direction.x*boundary.normal.x+direction.y*boundary.normal.y);
  if(approach<=EPS)return 0;
  const cap=capGeometry(connector.style[which==='start'?'startCap':'endCap'],tangent.from,tangent.to,connector.style.strokeWidth),radius=connector.style.strokeWidth/2;
  const outward=(p:Vec)=>(p.x-boundary.point.x)*boundary.normal.x+(p.y-boundary.point.y)*boundary.normal.y;
  let support=0;
  for(const polygon of cap.polygons)for(let i=0;i<polygon.length;i+=2)support=Math.min(support,outward({x:polygon[i]!,y:polygon[i+1]!}));
  for(const line of cap.lines)for(const point of line)support=Math.min(support,outward(point)-radius);
  for(const circle of cap.circles)support=Math.min(support,outward(circle)-circle.radius);
  return Math.max(0,-support/approach);
}
export function connectorDecorationSegment(connector:Connector,geometry:ConnectorGeometry,which:'start'|'end'):{from:Vec;to:Vec}{
  const tangent=connectorCapSegment(geometry,which),inset=connectorDecorationInset(connector,geometry,which);if(!inset)return tangent;
  const direction=unit({x:tangent.to.x-tangent.from.x,y:tangent.to.y-tangent.from.y}),move=(p:Vec)=>({x:p.x-direction.x*inset,y:p.y-direction.y*inset});
  return {from:move(tangent.from),to:move(tangent.to)};
}
/** Rounded shaft endpoints also stop outside the attached object's surface. */
export function connectorShaftBoundaryInset(connector:Connector,geometry:ConnectorGeometry,which:'start'|'end'):number{
  const boundary=geometry.boundaries?.[which];if(!boundary)return 0;
  const tangent=connectorCapSegment(geometry,which),direction=unit({x:tangent.to.x-tangent.from.x,y:tangent.to.y-tangent.from.y}),approach=-(direction.x*boundary.normal.x+direction.y*boundary.normal.y);
  return approach>EPS?connector.style.strokeWidth/2/approach:0;
}
const boundsCache=new WeakMap<ConnectorGeometry,{minX:number;minY:number;maxX:number;maxY:number}>();
export function connectorBounds(geometry: ConnectorGeometry) {
  const cached=boundsCache.get(geometry);if(cached)return cached;
  const points = [...geometry.points];
  for (const curve of geometry.cubics ?? (geometry.cubic?[geometry.cubic]:[])) {
    const { p0, p1, p2, p3 } = curve;
    const at = (t: number): Vec => { const m = 1 - t; return { x: m ** 3 * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t ** 3 * p3.x, y: m ** 3 * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t ** 3 * p3.y }; };
    for (const axis of ["x", "y"] as const) {
      const a = -p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis], b = 2 * (p0[axis] - 2 * p1[axis] + p2[axis]), c = p1[axis] - p0[axis];
      const disc = b * b - 4 * a * c;
      const roots = Math.abs(a) < EPS ? Math.abs(b) < EPS ? [] : [-c / b] : disc < 0 ? [] : [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)];
      for (const t of roots) if (t > 0 && t < 1) points.push(at(t));
    }
  }
  const xs = points.map(p => p.x), ys = points.map(p => p.y),bounds={ minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };boundsCache.set(geometry,bounds);return bounds;
}
const visualCache=new WeakMap<Connector,{geometry:ConnectorGeometry;style:Connector['style'];bounds:{minX:number;minY:number;maxX:number;maxY:number};caps:CapGeometry[]}>();
function connectorVisual(connector:Connector,geometry:ConnectorGeometry){
  const cached=visualCache.get(connector);if(cached&&cached.geometry===geometry&&cached.style===connector.style)return cached;
  const base=connectorBounds(geometry),radius=connector.style.strokeWidth/2,bounds={minX:base.minX-radius,minY:base.minY-radius,maxX:base.maxX+radius,maxY:base.maxY+radius};
  const add=(x:number,y:number,padding=0)=>{bounds.minX=Math.min(bounds.minX,x-padding);bounds.minY=Math.min(bounds.minY,y-padding);bounds.maxX=Math.max(bounds.maxX,x+padding);bounds.maxY=Math.max(bounds.maxY,y+padding);};
  const caps=(['start','end'] as const).map(which=>{const tangent=connectorDecorationSegment(connector,geometry,which);return capGeometry(connector.style[which==='start'?'startCap':'endCap'],tangent.from,tangent.to,connector.style.strokeWidth);});
  for(const cap of caps){for(const polygon of cap.polygons)for(let i=0;i<polygon.length;i+=2)add(polygon[i]!,polygon[i+1]!);for(const line of cap.lines)for(const point of line)add(point.x,point.y,radius);for(const circle of cap.circles)add(circle.x,circle.y,circle.radius);}
  const result={geometry,style:connector.style,bounds,caps};visualCache.set(connector,result);return result;
}
/** Includes the actual painted stroke and endpoint decorations, not only its axis. */
export const connectorVisualBounds=(connector:Connector,geometry:ConnectorGeometry)=>connectorVisual(connector,geometry).bounds;
/** Broad phase is cached with the immutable geometry before testing any segment. */
export function connectorContainsPoint(connector:Connector,geometry:ConnectorGeometry,point:Vec,tolerance=0):boolean{
  const {bounds,caps}=connectorVisual(connector,geometry);
  if(point.x<bounds.minX-tolerance||point.x>bounds.maxX+tolerance||point.y<bounds.minY-tolerance||point.y>bounds.maxY+tolerance)return false;
  if(distanceToConnector(point,geometry)<=connector.style.strokeWidth/2+tolerance)return true;
  for(const cap of caps){
    for(const circle of cap.circles)if(Math.hypot(point.x-circle.x,point.y-circle.y)<=circle.radius+tolerance)return true;
    for(const line of cap.lines)for(let i=1;i<line.length;i++)if(distanceToSegment(point,line[i-1]!,line[i]!)<=connector.style.strokeWidth/2+tolerance)return true;
    for(const polygon of cap.polygons){let inside=false;for(let i=0,j=polygon.length-2;i<polygon.length;j=i,i+=2){const a={x:polygon[i]!,y:polygon[i+1]!},b={x:polygon[j]!,y:polygon[j+1]!};if(distanceToSegment(point,a,b)<=tolerance)return true;if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}if(inside)return true;}
  }
  return false;
}
const pointInRect=(point:Vec,rect:Rect)=>point.x>=rect.minX&&point.x<=rect.maxX&&point.y>=rect.minY&&point.y<=rect.maxY;
function segmentCrossesRect(a:Vec,b:Vec,rect:Rect):boolean{
  let low=0,high=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-rect.minX],[dx,rect.maxX-a.x],[-dy,a.y-rect.minY],[dy,rect.maxY-a.y]]){
    if(Math.abs(p!)<EPS){if(q!<0)return false;continue;}
    const t=q!/p!;if(p!<0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high)return false;
  }
  return true;
}
function thickSegmentCrossesRect(a:Vec,b:Vec,rect:Rect,radius:number):boolean{
  if(segmentCrossesRect(a,b,rect))return true;
  const nearest=(p:Vec)=>Math.hypot(p.x-Math.max(rect.minX,Math.min(rect.maxX,p.x)),p.y-Math.max(rect.minY,Math.min(rect.maxY,p.y)));
  if(Math.min(nearest(a),nearest(b))<=radius)return true;
  for(const p of [{x:rect.minX,y:rect.minY},{x:rect.maxX,y:rect.minY},{x:rect.maxX,y:rect.maxY},{x:rect.minX,y:rect.maxY}])if(distanceToSegment(p,a,b)<=radius)return true;
  return false;
}
/** Narrow phase for area selection: an empty part of a curved connector's
 * enclosing rectangle is never treated as ink. Captions are separate objects
 * for hit testing and should be checked by the caller through their layout. */
export function connectorIntersectsRect(connector:Connector,geometry:ConnectorGeometry,rect:Rect,tolerance=0):boolean{
  const {bounds,caps}=connectorVisual(connector,geometry),padding=Math.max(0,tolerance),radius=connector.style.strokeWidth/2+padding;
  if(rect.maxX<bounds.minX-padding||rect.minX>bounds.maxX+padding||rect.maxY<bounds.minY-padding||rect.minY>bounds.maxY+padding)return false;
  for(let i=1;i<geometry.points.length;i++)if(thickSegmentCrossesRect(geometry.points[i-1]!,geometry.points[i]!,rect,radius))return true;
  const corners=[{x:rect.minX,y:rect.minY},{x:rect.maxX,y:rect.minY},{x:rect.maxX,y:rect.maxY},{x:rect.minX,y:rect.maxY}];
  for(const cap of caps){
    for(const circle of cap.circles){const p={x:Math.max(rect.minX,Math.min(rect.maxX,circle.x)),y:Math.max(rect.minY,Math.min(rect.maxY,circle.y))};if(Math.hypot(p.x-circle.x,p.y-circle.y)<=circle.radius+padding)return true;}
    for(const line of cap.lines)for(let i=1;i<line.length;i++)if(thickSegmentCrossesRect(line[i-1]!,line[i]!,rect,radius))return true;
    for(const polygon of cap.polygons){
      const vertices:Vec[]=[];for(let i=0;i<polygon.length;i+=2)vertices.push({x:polygon[i]!,y:polygon[i+1]!});
      for(let i=0;i<vertices.length;i++)if(pointInRect(vertices[i]!,rect)||thickSegmentCrossesRect(vertices[i]!,vertices[(i+1)%vertices.length]!,rect,padding))return true;
      for(const corner of corners){let inside=false;for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){const a=vertices[i]!,b=vertices[j]!;if((a.y>corner.y)!==(b.y>corner.y)&&corner.x<(b.x-a.x)*(corner.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}if(inside)return true;}
    }
  }
  return false;
}
export function widgetBounds(w: Widget) { return widgetAABB(w); }
