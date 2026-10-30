import type { Vec } from "./geometry";
import type { Stroke, StrokePoint } from "./strokes";

const EPS = 1e-9;
const copy = (point: StrokePoint): StrokePoint => ({ ...point });
const at = (a: StrokePoint, b: StrokePoint, t: number): StrokePoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t });
const same = (a: StrokePoint, b: StrokePoint): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.r - b.r) < EPS;

/**
 * Removes a circular brush from the path, including intersections between sparse
 * samples. Each surviving array is a separate stroke; renderer supplies round caps.
 * Stroke radius is interpolated along each segment rather than assumed constant.
 */
export function eraseStrokePoints(stroke: Stroke, center: Vec, radius: number): StrokePoint[][] {
  const points = stroke.points;
  if (!points.length) return [];
  if (![center.x, center.y, radius].every(Number.isFinite)) return [points.map(copy)];
  radius = Math.max(0, radius);
  if (points.length === 1) {
    const p = points[0]!;
    return Math.hypot(p.x - center.x, p.y - center.y) <= radius + p.r ? [] : [[copy(p)]];
  }
  const parts: StrokePoint[][] = [];
  let current: StrokePoint[] | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dy = b.y - a.y, dr = b.r - a.r;
    const x = a.x - center.x, y = a.y - center.y, reach = radius + a.r;
    // |a + t(b-a) - center|² - (radius + r(t))² = A t²+B t+C.
    const A = dx * dx + dy * dy - dr * dr;
    const B = 2 * (x * dx + y * dy - reach * dr);
    const C = x * x + y * y - reach * reach;
    const cuts = [0, 1];
    if (Math.abs(A) <= EPS) {
      if (Math.abs(B) > EPS) { const t = -C / B; if (t > EPS && t < 1 - EPS) cuts.push(t); }
    } else {
      const discriminant = B * B - 4 * A * C;
      if (discriminant >= -EPS) {
        const root = Math.sqrt(Math.max(0, discriminant));
        // Stable quadratic formula avoids cancellation for distant sparse samples.
        const q = -.5 * (B + (B >= 0 ? root : -root));
        for (const t of Math.abs(q) > EPS ? [q / A, C / q] : [-B / (2 * A)]) if (t > EPS && t < 1 - EPS) cuts.push(t);
      }
    }
    cuts.sort((left, right) => left - right);
    for (let j = 1; j < cuts.length; j++) {
      const lo = cuts[j - 1]!, hi = cuts[j]!;
      if (hi - lo <= EPS) continue;
      const middle = (lo + hi) / 2;
      if ((A * middle + B) * middle + C <= 0) { current = null; continue; }
      const start = at(a, b, lo), end = at(a, b, hi);
      if (!current || !same(current[current.length - 1]!, start)) { current = [start]; parts.push(current); }
      if (!same(current[current.length - 1]!, end)) current.push(end);
    }
  }
  return parts;
}
