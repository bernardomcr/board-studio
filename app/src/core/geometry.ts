/**
 * Geometria do board. Isolada para poder ser testada sem render.
 *
 * Convenção: o widget guarda x/y do canto superior esquerdo em coordenadas de
 * mundo e roda em torno do próprio CENTRO (rotação não altera x/y).
 */

import type { Widget } from "./model";
import { polygonContains, shapePolygon,canonicalShape } from "./shapes";

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rotate(v: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function widgetCenter(w: Widget): Vec {
  return { x: w.x + w.width / 2, y: w.y + w.height / 2 };
}

/** Converte um ponto de mundo para o espaço local do widget (origem no canto). */
export function worldToLocal(w: Widget, p: Vec): Vec {
  const c = widgetCenter(w);
  const d = rotate({ x: p.x - c.x, y: p.y - c.y }, -w.rotation);
  return { x: d.x + w.width / 2, y: d.y + w.height / 2 };
}

/** Os 4 cantos em coordenadas de mundo, já rotacionados. */
export function widgetCorners(w: Widget): Vec[] {
  const c = widgetCenter(w);
  const hw = w.width / 2;
  const hh = w.height / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => {
    const r = rotate(p, w.rotation);
    return { x: c.x + r.x, y: c.y + r.y };
  });
}

export function widgetAABB(w: Widget): Rect {
  const pts = widgetCorners(w);
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    minY: Math.min(...rects.map((r) => r.minY)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    maxY: Math.max(...rects.map((r) => r.maxY)),
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Hit-test exato: leva o ponto para o espaço local e testa o retângulo. */
export function pointInWidget(w: Widget, p: Vec): boolean {
  const local = worldToLocal(w, p);
  if (local.x < 0 || local.x > w.width || local.y < 0 || local.y > w.height) return false;
  if(w.type==='image'&&w.maskShape==='ellipse')return ((local.x-w.width/2)/(w.width/2))**2+((local.y-w.height/2)/(w.height/2))**2<=1;
  if(w.type==='image'&&w.maskShape==='round_rectangle'){const r=Math.max(0,Math.min(w.style.cornerRadius??Math.min(w.width,w.height)*.12,Math.min(w.width,w.height)/2)),cx=Math.max(r,Math.min(w.width-r,local.x)),cy=Math.max(r,Math.min(w.height-r,local.y));return (local.x-cx)**2+(local.y-cy)**2<=r*r;}
  if (w.type !== "shape") return true;
  const polygon = shapePolygon(w.shape, w.width, w.height);
  if (polygon) return polygonContains(polygon, local.x, local.y);
  const shape=canonicalShape(w.shape);
  if (shape === "circle") return ((local.x - w.width / 2) / (w.width / 2)) ** 2 + ((local.y - w.height / 2) / (w.height / 2)) ** 2 <= 1;
  if (shape === "round_rectangle"||(shape==='rectangle'&&(w.style.cornerRadius??0)>0)) {
    const r = Math.max(0,Math.min(w.style.cornerRadius??16,Math.min(w.width,w.height)/2));
    const cx = Math.max(r, Math.min(w.width - r, local.x));
    const cy = Math.max(r, Math.min(w.height - r, local.y));
    return (local.x - cx) ** 2 + (local.y - cy) ** 2 <= r ** 2;
  }
  if (shape === "cylinder") {
    const r = Math.min(w.height / 5, w.width / 6);
    const cy = local.y < r ? r : local.y > w.height - r ? w.height - r : local.y;
    return ((local.x - w.width / 2) / (w.width / 2)) ** 2 + ((local.y - cy) / r) ** 2 <= 1;
  }
  return true;
}

export function rectIntersectsWidget(rect: Rect, w: Widget): boolean {
  return rectsIntersect(rect, widgetAABB(w));
}

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Posição do handle no espaço local (canto/aresta), antes da rotação. */
export function handleLocal(w: Widget, id: HandleId): Vec {
  const x = id.includes("w") ? 0 : id.includes("e") ? w.width : w.width / 2;
  const y = id.includes("n") ? 0 : id.includes("s") ? w.height : w.height / 2;
  return { x, y };
}

/** Handle em coordenadas de mundo. */
export function handleWorld(w: Widget, id: HandleId): Vec {
  const c = widgetCenter(w);
  const local = handleLocal(w, id);
  const r = rotate({ x: local.x - w.width / 2, y: local.y - w.height / 2 }, w.rotation);
  return { x: c.x + r.x, y: c.y + r.y };
}

/**
 * Redimensiona mantendo fixa a âncora oposta ao handle.
 * `pointerWorld` é a posição atual do cursor; `start` é o widget no início do gesto.
 */
export function resizeWidget(
  start: Widget,
  handle: HandleId,
  pointerWorld: Vec,
  keepAspect: boolean,
  minSize = 24,
): Pick<Widget, "x" | "y" | "width" | "height"> {
  if(start.type==='sticky_note')minSize=Math.min(minSize,.001);
  const c = widgetCenter(start);
  const local = worldToLocal(start, pointerWorld);

  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;

  let width = start.width;
  let height = start.height;

  if (sx !== 0) width = Math.max(minSize, sx > 0 ? local.x : start.width - local.x);
  if (sy !== 0) height = Math.max(minSize, sy > 0 ? local.y : start.height - local.y);

  if(start.type==='sticky_note'){
    if(start.stickyPad){const factor=sx===0?height/start.height:sy===0?width/start.width:Math.max(width/start.width,height/start.height);width=start.width*factor;height=start.height*factor;}
    else{const side=sx===0?height:sy===0?width:Math.max(width,height);width=side;height=side;}
  }else if(start.audio){
    const factor=sx===0?height/start.height:sy===0?width/start.width:Math.max(width/start.width,height/start.height);
    width=start.width*factor;height=start.height*factor;
  }else if (keepAspect && sx !== 0 && sy !== 0) {
    const ratio = start.width / start.height;
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }

  // âncora local (relativa ao centro) do lado oposto
  const anchorLocal = { x: (-sx * start.width) / 2, y: (-sy * start.height) / 2 };
  const anchorWorld = {
    x: c.x + rotate(anchorLocal, start.rotation).x,
    y: c.y + rotate(anchorLocal, start.rotation).y,
  };

  const newAnchorLocal = { x: (-sx * width) / 2, y: (-sy * height) / 2 };
  const newAnchorWorld = rotate(newAnchorLocal, start.rotation);

  const newCenter = {
    x: anchorWorld.x - newAnchorWorld.x,
    y: anchorWorld.y - newAnchorWorld.y,
  };

  return {
    x: newCenter.x - width / 2,
    y: newCenter.y - height / 2,
    width,
    height,
  };
}
