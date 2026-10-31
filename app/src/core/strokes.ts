/**
 * Traço livre (F7).
 *
 * O chunk do Miro que implementa isso (c_ComputeCurveWidget) só carrega sob uso da
 * caneta; por isso esta implementação é uma RECONSTRUÇÃO a partir do comportamento
 * observável, não uma cópia de fórmula. Marcada como [derivado] na documentação.
 *
 * Modelo: lista de pontos com raio variável + geração de contorno (outline),
 * que é como traços com pressão são preenchidos em canvas.
 */

import type { Vec } from "./geometry";

export interface StrokePoint {
  x: number;
  y: number;
  /** raio em unidades de mundo */
  r: number;
}

export type StrokeTool = "pen" | "highlighter" | "eraser";

export interface Stroke {
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  id: string;
  type: "stroke";
  tool: Exclude<StrokeTool, "eraser">;
  color: string;
  points: StrokePoint[];
  z: number;
}

/** Interpolate the sampled path while keeping the original endpoints fixed. */
function smoothPoints(points: StrokePoint[]): StrokePoint[] {
  if (points.length < 3) return points;
  const out: StrokePoint[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)]!, b = points[i]!, c = points[i + 1]!, d = points[Math.min(points.length - 1, i + 2)]!;
    const count = Math.max(2, Math.min(16, Math.ceil(Math.hypot(c.x - b.x, c.y - b.y) / Math.max(.5, Math.min(b.r, c.r)))));
    for (let k = 1; k <= count; k++) {
      const t = k / count, t2 = t * t, t3 = t2 * t;
      const curve = (v0: number, v1: number, v2: number, v3: number) => .5 * ((2*v1) + (-v0+v2)*t + (2*v0-5*v1+4*v2-v3)*t2 + (-v0+3*v1-3*v2+v3)*t3);
      out.push({x:curve(a.x,b.x,c.x,d.x),y:curve(a.y,b.y,c.y,d.y),r:b.r+(c.r-b.r)*t});
    }
  }
  return out;
}

/** Distância ponto→segmento (usada na simplificação e no hit-test). */
function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker sobre os pontos (mantendo o raio médio do trecho). */
export function simplify(points: StrokePoint[], tolerance = 1.2): StrokePoint[] {
  if (points.length <= 2) return points;

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointSegmentDistance(points[i]!, points[first]!, points[last]!);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/** Contorno fechado do traço, para preencher com fill. */
export function strokeOutline(points: StrokePoint[]): number[] {
  points = smoothPoints(points);
  if (points.length === 0) return [];
  if (points.length === 1) {
    const p = points[0]!;
    const out: number[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      out.push(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r);
    }
    return out;
  }

  const left: number[] = [];
  const right: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const p = points[i]!;
    left.push(p.x + nx * p.r, p.y + ny * p.r);
    right.push(p.x - nx * p.r, p.y - ny * p.r);
  }

  // Round end caps share the exact same outline in the live preview and saved path.
  const end = points[points.length - 1]!, before = points[points.length - 2]!;
  const endAngle = Math.atan2(end.y-before.y,end.x-before.x) + Math.PI/2;
  for (let i=1;i<=12;i++) { const a=endAngle-i*Math.PI/12; left.push(end.x+Math.cos(a)*end.r,end.y+Math.sin(a)*end.r); }
  // direita ao contrário fecha o polígono
  for (let i = points.length - 1; i >= 0; i--) {
    left.push(right[i * 2]!, right[i * 2 + 1]!);
  }
  const start=points[0]!, after=points[1]!;
  const startAngle=Math.atan2(after.y-start.y,after.x-start.x)-Math.PI/2;
  for (let i=1;i<=12;i++) {const a=startAngle-i*Math.PI/12;left.push(start.x+Math.cos(a)*start.r,start.y+Math.sin(a)*start.r);}
  return left;
}

export function strokeBounds(stroke: Stroke) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of stroke.points) {
    minX = Math.min(minX, p.x - p.r);
    minY = Math.min(minY, p.y - p.r);
    maxX = Math.max(maxX, p.x + p.r);
    maxY = Math.max(maxY, p.y + p.r);
  }
  return { minX, minY, maxX, maxY };
}

export function distanceToStroke(p: Vec, stroke: Stroke): number {
  let best = Infinity;
  for (let i = 1; i < stroke.points.length; i++) {
    best = Math.min(best, pointSegmentDistance(p, stroke.points[i - 1]!, stroke.points[i]!));
  }
  if (stroke.points.length === 1) {
    best = Math.hypot(p.x - stroke.points[0]!.x, p.y - stroke.points[0]!.y);
  }
  const width = stroke.points[0]?.r ?? 0;
  return Math.max(0, best - width);
}
