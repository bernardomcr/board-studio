import type { BoardState } from "./commands";
import { connectorGeometry } from "./connectors";
import { rotate, widgetAABB, widgetCenter, type Vec } from "./geometry";
import type { Widget } from "./model";
import { shapeContours } from "./shapes";

const EPS = 1e-8;
function pointSegmentDistance(point: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length > EPS ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}
function cross(a: Vec, b: Vec, c: Vec): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) && ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return true;
  return Math.abs(abC) <= EPS && pointSegmentDistance(c, a, b) <= EPS || Math.abs(abD) <= EPS && pointSegmentDistance(d, a, b) <= EPS || Math.abs(cdA) <= EPS && pointSegmentDistance(a, c, d) <= EPS || Math.abs(cdB) <= EPS && pointSegmentDistance(b, c, d) <= EPS;
}

/** Odd/even containment works for convex and concave lassos; boundaries count. */
export function lassoContains(points: Vec[], point: Vec): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!, b = points[i]!;
    if (pointSegmentDistance(point, a, b) <= EPS) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pathHits(path: Vec[], polygon: Vec[], radius = 0): boolean {
  if (path.some(point => lassoContains(polygon, point))) return true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    for (let j = 1; j < path.length; j++) {
      const c = path[j - 1]!, d = path[j]!;
      if (segmentsIntersect(a, b, c, d)) return true;
      if (radius > 0 && Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)) <= radius) return true;
    }
    if (path.length === 1 && pointSegmentDistance(path[0]!, a, b) <= radius) return true;
  }
  return false;
}
function widgetContour(widget: Widget): Vec[] {
  let coords: number[];
  if (widget.type === "shape") coords = shapeContours(widget.shape, widget.width, widget.height, .1, widget.style.cornerRadius)[0]!;
  else if (widget.type === "image" && widget.maskShape === "ellipse") coords = shapeContours("circle", widget.width, widget.height, .1)[0]!;
  else if (widget.type === "image" && widget.maskShape === "round_rectangle") coords = shapeContours("round_rectangle", widget.width, widget.height, .1, Math.min(widget.width, widget.height) * .12)[0]!;
  else coords = [0, 0, widget.width, 0, widget.width, widget.height, 0, widget.height, 0, 0];
  const center = widgetCenter(widget), points: Vec[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    const p = rotate({ x: coords[i]! - widget.width / 2, y: coords[i + 1]! - widget.height / 2 }, widget.rotation);
    points.push({ x: center.x + p.x, y: center.y + p.y });
  }
  return points;
}

/** Selects intersecting widgets, lines and strokes, including sparse crossings. */
export function lassoHits(state: BoardState, polygon: Vec[]): string[] {
  if (polygon.length < 3) return [];
  const bounds = { minX: Math.min(...polygon.map(p => p.x)), minY: Math.min(...polygon.map(p => p.y)), maxX: Math.max(...polygon.map(p => p.x)), maxY: Math.max(...polygon.map(p => p.y)) };
  const ids: string[] = [];
  for (const id of state.order) {
    const widget = state.widgets.get(id); if (!widget||widget.hidden) continue;
    const box = widgetAABB(widget);
    if (box.maxX < bounds.minX || box.maxY < bounds.minY || box.minX > bounds.maxX || box.minY > bounds.maxY) continue;
    const contour = widgetContour(widget);
    // A lasso inside a frame selects its contents, not the enclosing background.
    if (pathHits(contour, polygon) || widget.type !== "frame" && polygon.some(p => lassoContains(contour, p))) ids.push(id);
  }
  for (const id of state.connectorOrder) {
    const connector = state.connectors.get(id); if (!connector||connector.hidden) continue;
    const geometry = connectorGeometry(connector, state.widgets);
    if (geometry && pathHits(geometry.points, polygon, connector.style.strokeWidth / 2)) ids.push(id);
  }
  for (const id of state.strokeOrder) {
    const stroke = state.strokes.get(id); if (!stroke||stroke.hidden) continue;
    if (pathHits(stroke.points, polygon, Math.max(0, ...stroke.points.map(p => p.r)))) ids.push(id);
  }
  return [...new Set(ids)];
}
