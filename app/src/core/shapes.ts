import type { ShapeWidget } from "./model";

export function canonicalShape(shape: ShapeWidget["shape"]): ShapeWidget["shape"] {
  const aliases: Partial<Record<ShapeWidget["shape"], ShapeWidget["shape"]>> = {
    flow_process: "rectangle", flow_decision: "rhombus", flow_predefined: "predefined_process",
    flow_data: "parallelogram", flow_database: "cylinder", merge: "triangle", extract: "triangle",
    flow_connector: "circle", or_junction: "circle", summing_junction: "circle",
    magnetic_tape:"circle",double_circle:"circle",start_event:"circle",stop_event:"circle",junction:"circle",flow_trapezoid:"trapezoid",flow_cloud:"cloud",disk_storage:"cylinder",process_sharp:"rectangle",
  };
  return aliases[shape] ?? shape;
}

function arc(cx: number, cy: number, rx: number, ry: number, start: number, end: number, count = 32): number[] {
  const p: number[] = [];
  for (let i = 0; i <= count; i++) { const a = start + (end - start) * i / count; p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
  return p;
}

function cubicPath(start: number[], segments: number[][]): number[] {
  const points = [...start]; let x = start[0]!, y = start[1]!;
  for (const [x1, y1, x2, y2, x3, y3] of segments) {
    for (let i = 1; i <= 24; i++) {const t = i / 24, u = 1 - t;points.push(u*u*u*x+3*u*u*t*x1!+3*u*t*t*x2!+t*t*t*x3!,u*u*u*y+3*u*u*t*y1!+3*u*t*t*y2!+t*t*t*y3!);}
    x = x3!; y = y3!;
  }
  return points;
}

function waveBottom(top = 0, left = 0, right = 1, bottom = .9): number[] {
  const p = [left, top, right, top, right, bottom];
  for (let i = 1; i <= 40; i++) { const t = 1 - i / 40; p.push(left + t * (right - left), bottom + Math.sin(t * Math.PI * 2) * .075); }
  return p;
}

/** Polygon coordinates shared by rendering, hit testing and SVG export. */
export function shapePolygon(shape: ShapeWidget["shape"], width: number, height: number): number[] | null {
  if (shape === "merge") return [0, 0, width, 0, width / 2, height];
  shape = canonicalShape(shape);
  let points: number[];
  switch (shape) {
    case "triangle": points = [.5, 0, 1, 1, 0, 1]; break;
    case "rhombus": points = [.5, 0, 1, .5, .5, 1, 0, .5]; break;
    case "hexagon": points = [.25, 0, .75, 0, 1, .5, .75, 1, .25, 1, 0, .5]; break;
    case "parallelogram": points = [.2, 0, 1, 0, .8, 1, 0, 1]; break;
    case "trapezoid": points = [.2, 0, .8, 0, 1, 1, 0, 1]; break;
    case "pentagon": points = [.5, 0, 1, .38, .81, 1, .19, 1, 0, .38]; break;
    case "octagon": points = [.3, 0, .7, 0, 1, .3, 1, .7, .7, 1, .3, 1, 0, .7, 0, .3]; break;
    case "arrow_right": points = [0, .25, .6, .25, .6, 0, 1, .5, .6, 1, .6, .75, 0, .75]; break;
    case "arrow_left": points = [1, .25, .4, .25, .4, 0, 0, .5, .4, 1, .4, .75, 1, .75]; break;
    case "arrow_both": points = [0, .5, .25, 0, .25, .3, .75, .3, .75, 0, 1, .5, .75, 1, .75, .7, .25, .7, .25, 1]; break;
    case "speech_bubble": points = [0, 0, 1, 0, 1, .76, .4, .76, .16, 1, .2, .76, 0, .76]; break;
    case "cross": points = [.34, 0, .66, 0, .66, .34, 1, .34, 1, .66, .66, .66, .66, 1, .34, 1, .34, .66, 0, .66, 0, .34, .34, .34]; break;
    case "chevron": points = [0, 0, .68, 0, 1, .5, .68, 1, 0, 1, .32, .5]; break;
    case "notched_chevron": points = [0, .15, .68, .15, .68, 0, 1, .5, .68, 1, .68, .85, 0, .85, .22, .5]; break;
    case "brace_left":
    case "brace_right": {
      const curve = cubicPath([.8, .03], [[.46, .03, .44, .12, .44, .28], [.44, .43, .34, .48, .14, .5], [.34, .52, .44, .57, .44, .72], [.44, .88, .46, .97, .8, .97]]);
      const reverse: number[] = []; for (let i = curve.length - 2; i >= 0; i -= 2) reverse.push(curve[i]! + .07, curve[i + 1]!);
      points = [...curve, ...reverse];
      if (shape === "brace_right") points = points.map((p, i) => i % 2 ? p : 1 - p);
      break;
    }
    case "cloud": {
      points = cubicPath([.18, .78], [[-.03, .78, -.03, .43, .17, .4], [.13, .11, .45, .02, .59, .2], [.79, .02, 1.04, .27, .88, .45], [1.1, .55, 1.01, .88, .78, .83], [.73, 1.04, .42, 1.02, .36, .84], [.26, .99, .1, .93, .18, .78]]);
      const xs = points.filter((_, i) => i % 2 === 0), ys = points.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
      points = points.map((n, i) => i % 2 ? (n - minY) / (maxY - minY) : (n - minX) / (maxX - minX));
      break;
    }
    case "lined_shaded":case "divided_process":case "container":case "tagged_process":
    case "predefined_process":
    case "internal_storage":
    case "swimlane_horizontal":
    case "swimlane_vertical": points = [0, 0, 1, 0, 1, 1, 0, 1]; break;
    case "flow_terminator": points = [...arc(.25, .5, .25, .5, Math.PI / 2, Math.PI * 1.5), ...arc(.75, .5, .25, .5, -Math.PI / 2, Math.PI / 2)]; break;
    case "document": points = waveBottom(); break;
    case "multiple_documents": points = [.16, 0, 1, 0, 1, .76, .92, .76, .92, .86, .84, .86, .84, .9, ...waveBottom(.16, 0, .84, .9).slice(6), 0, .16, .08, .16, .08, .08, .16, .08]; break;
    case "multiple_processes":points=[.16,0,1,0,1,.84,.92,.84,.92,.92,.84,.92,.84,1,0,1,0,.16,.08,.16,.08,.08,.16,.08];break;
    case "lined_document":points=waveBottom();break;
    case "tagged_document":points=[0,.2,.2,0,1,0,1,.9,...waveBottom().slice(6)];break;
    case "asymmetric":points=[.18,0,1,0,1,1,.18,1,0,.5];break;
    case "lean_left":points=[0,0,.8,0,1,1,.2,1];break;
    case "loop_limit":points=[.16,0,.84,0,1,.28,1,1,0,1,0,.28];break;
    case "explosion":{points=[];for(let i=0;i<24;i++){const a=-Math.PI/2+i*Math.PI/12,r=i%2?.30:.5;points.push(.5+Math.cos(a)*r,.5+Math.sin(a)*r);}break;}
    case "manual_input": points = [0, .22, 1, 0, 1, 1, 0, 1]; break;
    case "preparation": points = [.18, 0, .82, 0, 1, .5, .82, 1, .18, 1, 0, .5]; break;
    case "manual_operation": points = [0, 0, 1, 0, .8, 1, .2, 1]; break;
    case "delay": points = [0, 0, .5, 0, ...arc(.5, .5, .5, .5, -Math.PI / 2, Math.PI / 2), 0, 1]; break;
    case "stored_data": points = [...arc(.18, .5, .18, .5, -Math.PI / 2, Math.PI / 2), ...arc(.82, .5, .18, .5, Math.PI / 2, -Math.PI / 2)]; break;
    case "hard_disk": points = [...arc(.2, .5, .2, .5, Math.PI / 2, Math.PI * 1.5), ...arc(.8, .5, .2, .5, -Math.PI / 2, Math.PI / 2)]; break;
    case "display": points = [0, .5, .2, 0, .68, 0, ...arc(.68, .5, .32, .5, -Math.PI / 2, Math.PI / 2), .2, 1]; break;
    case "off_page": points = [0, 0, 1, 0, 1, .6, .5, 1, 0, .6]; break;
    case "card": points = [.2, 0, 1, 0, 1, 1, 0, 1, 0, .25]; break;
    case "folder": points = [0, .08, .36, .08, .46, .24, 1, .24, 1, 1, 0, 1]; break;
    case "collate": points = [0, 0, 1, 0, .55, .5, 1, 1, 0, 1, .45, .5]; break;
    case "annotation": points = [.16, 0, 1, 0, 1, 1, .16, 1, .16, .54, 0, .5, .16, .46]; break;
    case "bucket": points = [0, 0, 1, 0, .83, .9, ...arc(.5, .9, .33, .1, 0, Math.PI), 0, 0]; break;
    case "lightning": points = [.6, 0, .12, .55, .43, .55, .31, 1, .92, .35, .58, .35]; break;
    case "star": {
      points = [];
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? .5 : .225;
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        points.push(.5 + Math.cos(angle) * radius, .5 + Math.sin(angle) * radius);
      }
      break;
    }
    default: return null;
  }
  return points.map((p, i) => p * (i % 2 === 0 ? width : height));
}

/** Open interior contours that distinguish flowchart symbols. */
export function shapeDetails(shape: ShapeWidget["shape"], width: number, height: number): number[][] {
  let paths: number[][] = [];
  const original = shape; shape = canonicalShape(shape);
  if (shape === "predefined_process") paths = [[.14, 0, .14, 1], [.86, 0, .86, 1]];
  if (shape === "internal_storage") paths = [[.16, 0, .16, 1], [0, .2, 1, .2]];
  if (shape === "swimlane_horizontal") paths = [[0, .2, 1, .2], [.18, 0, .18, 1]];
  if (shape === "swimlane_vertical") paths = [[.2, 0, .2, 1], [0, .18, 1, .18]];
  if (shape === "folder") paths = [[0, .24, .46, .24]];
  if (shape === "multiple_documents") paths = [[.08, .08, .92, .08, .92, .86], [0, .16, .84, .16, .84, .9]];
  if (shape === "hard_disk") paths = [arc(.2, .5, .2, .5, -Math.PI / 2, Math.PI / 2)];
  if (shape === "bucket") paths = [arc(.5, 0, .5, .1, 0, Math.PI)];
  if (original === "or_junction") paths = [[.15, .15, .85, .85], [.15, .85, .85, .15]];
  if (original === "summing_junction") paths = [[.5, 0, .5, 1], [0, .5, 1, .5]];
  if(original==='magnetic_tape')paths=[[.5,.98,1,.98]];
  if(original==='multiple_processes')paths=[[.08,.08,.92,.08,.92,.92],[0,.16,.84,.16,.84,1]];
  if(original==='lined_shaded')paths=[[.2,0,.2,1],...Array.from({length:7},(_,i)=>[0,i/8,.2,(i+1)/8])];
  if(original==='lined_document')paths=[[.15,.22,.85,.22],[.15,.38,.85,.38],[.15,.54,.85,.54]];
  if(original==='divided_process')paths=[[0,.5,1,.5]];
  if(original==='container')paths=[[0,.18,1,.18]];
  if(original==='tagged_process')paths=[[0,.22,.22,0]];
  if(original==='tagged_document')paths=[[0,.2,.2,.2,.2,0]];
  if(original==='double_circle')paths=[arc(.5,.5,.39,.39,0,Math.PI*2)];
  if(original==='stop_event')paths=[arc(.5,.5,.3,.3,0,Math.PI*2)];
  if(original==='disk_storage')paths=[arc(.5,.33,.5,.12,0,Math.PI),arc(.5,.55,.5,.12,0,Math.PI),arc(.5,.77,.5,.12,0,Math.PI)];
  if(original.startsWith('annotation_curly')){
    const brace=cubicPath([.16,.02],[[.04,.02,.05,.14,.05,.27],[.05,.43,.03,.48,0,.5],[.03,.52,.05,.57,.05,.73],[.05,.86,.04,.98,.16,.98]]);
    const right=brace.map((n,i)=>i%2?n:1-n);paths=original==='annotation_curly_left'?[brace]:original==='annotation_curly_right'?[right]:[brace,right];
  }
  return paths.map(p => p.map((v, i) => v * (i % 2 ? height : width)));
}

export function polygonContains(points: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const ax = points[i]!, ay = points[i + 1]!, bx = points[j]!, by = points[j + 1]!;
    // Include edges; this matters for snapping onto a pointed vertex.
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-7 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Flattened contours for patterned strokes. Every outer contour is closed. */
export function shapeContours(shape: ShapeWidget["shape"], width: number, height: number, zoom = 1, cornerRadius?: number): number[][] {
  const details = shapeDetails(shape, width, height);
  if(shape.startsWith("annotation_curly")||shape==="text_block")return details;
  const polygon = shapePolygon(shape, width, height);
  if (polygon) return [[...polygon, polygon[0]!, polygon[1]!], ...details];
  shape = canonicalShape(shape);
  if (shape === "rectangle" && (cornerRadius ?? 0) > 0) shape = "round_rectangle";
  const steps = Math.min(2048, Math.max(32, Math.ceil((width + height) * Math.max(1, zoom) / 3)));
  if (shape === "circle") {
    const p: number[] = [];
    for (let i = 0; i <= steps; i++) { const a = i * Math.PI * 2 / steps; p.push(width / 2 + Math.cos(a) * width / 2, height / 2 + Math.sin(a) * height / 2); }
    return [p, ...details];
  }
  if (shape === "round_rectangle") {
    const r = Math.max(0, Math.min(cornerRadius ?? 16, Math.min(width, height) / 2)), p: number[] = [];
    const corners = [[width - r, r, -Math.PI / 2], [width - r, height - r, 0], [r, height - r, Math.PI / 2], [r, r, Math.PI]];
    const n = Math.max(8, Math.ceil(steps / 4));
    for (const [cx, cy, start] of corners) for (let i = 0; i <= n; i++) { const a = start! + i / n * Math.PI / 2; p.push(cx! + Math.cos(a) * r, cy! + Math.sin(a) * r); }
    return [[...p, p[0]!, p[1]!], ...details];
  }
  if (shape === "cylinder") {
    const r = Math.min(height / 5, width / 6), outer = [0, r], inner = [0, r];
    const cubic = (target: number[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
      for (let i = 1; i <= steps / 2; i++) { const t = i / Math.floor(steps / 2), u = 1 - t; target.push(u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3, u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3); }
    };
    cubic(outer, 0, r, 0, -r / 3, width, -r / 3, width, r);
    outer.push(width, height - r);
    cubic(outer, width, height - r, width, height + r / 3, 0, height + r / 3, 0, height - r);
    outer.push(0, r);
    cubic(inner, 0, r, 0, r * 7 / 3, width, r * 7 / 3, width, r);
    return [outer, inner];
  }
  return [[0, 0, width, 0, width, height, 0, height, 0, 0]];
}

/** Uses the same outlines as the canvas, so library previews never substitute a rectangle. */
export function shapeIconSvg(shape: ShapeWidget["shape"]): string {
  if(shape==='start_event'||shape==='junction')return '<svg viewBox="-2 -2 38 32" fill="currentColor"><ellipse cx="17" cy="14" rx="16" ry="13"/></svg>';
  if(shape==='stop_event')return '<svg viewBox="-2 -2 38 32" stroke="currentColor" stroke-width="1.3" fill="none"><ellipse cx="17" cy="14" rx="16" ry="13"/><ellipse cx="17" cy="14" rx="10" ry="8" fill="currentColor"/></svg>';
  if(shape==="text_block")return '<svg viewBox="-2 -2 38 32" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 5H30M17 5V24M11 24H23"/></svg>';
  const contours = shapeContours(shape, 34, 28);
  return `<svg viewBox="-2 -2 38 32" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${contours.map(p => `<path d="${p.map((n, i) => `${i === 0 ? "M" : i % 2 === 0 ? "L" : ""}${Math.round(n * 100) / 100}`).join(" ")}"/>`).join("")}</svg>`;
}

export function borderPattern(width: number, style: "normal" | "dashed" | "dotted"): { dash: number; gap: number } | null {
  if (width <= 0 || style === "normal") return null;
  return style === "dotted" ? { dash: 0, gap: width * 3 } : { dash: width * 4, gap: width * 2 };
}

/** Splits by arc length, carrying the pattern across corners and curved samples. */
export function patternedContour(points: number[], dash: number, gap: number): number[][] {
  const output: number[][] = [];
  if (points.length < 4 || gap <= 0) return output;
  const period = dash + gap;
  let distance = 0;
  let current: number[] | null = null;
  let nextDot = 0;
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2]!, ay = points[i - 1]!, bx = points[i]!, by = points[i + 1]!;
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-9) continue;
    const at = (d: number): number[] => [ax + (bx - ax) * d / length, ay + (by - ay) * d / length];
    if (dash === 0) {
      while (nextDot < distance + length - 1e-7) {
        if (nextDot >= distance - 1e-7) output.push(at(nextDot - distance));
        nextDot += period;
      }
    } else {
      let consumed = 0;
      while (consumed < length - 1e-8) {
        const phase = (distance + consumed + 1e-8) % period;
        const drawing = phase < dash;
        const step = Math.min(length - consumed, (drawing ? dash : period) - phase);
        if (drawing) {
          if (!current) { current = at(consumed); output.push(current); }
          current.push(...at(consumed + step));
        } else current = null;
        consumed += Math.max(step, 1e-8);
      }
    }
    distance += length;
  }
  return output;
}

/** Observed Miro library item identities mapped to independently reconstructed local symbols. */
export const MIRO_SHAPE_MAP:Readonly<Record<string,ShapeWidget["shape"]>>={
  "shapeLibrary__item_basic-square": "rectangle",
  "shapeLibrary__item_basic-rounded": "round_rectangle",
  "shapeLibrary__item_basic-oval": "circle",
  "shapeLibrary__item_basic-triangle": "triangle",
  "shapeLibrary__item_basic-rhombus": "rhombus",
  "shapeLibrary__item_basic-babble": "speech_bubble",
  "shapeLibrary__item_basic-parall": "parallelogram",
  "shapeLibrary__item_basic-star": "star",
  "shapeLibrary__item_basic-arrow-right": "arrow_right",
  "shapeLibrary__item_basic-arrow-left": "arrow_left",
  "shapeLibrary__item_basic-arrow-left-right": "arrow_both",
  "shapeLibrary__item_basic-pentagon": "pentagon",
  "shapeLibrary__item_basic-octagon": "octagon",
  "shapeLibrary__item_basic-hexagon": "hexagon",
  "shapeLibrary__item_basic-predefined-process": "predefined_process",
  "shapeLibrary__item_basic-trapeze": "trapezoid",
  "shapeLibrary__item_basic-cloud": "cloud",
  "shapeLibrary__item_basic-cross": "cross",
  "shapeLibrary__item_basic-barrel": "cylinder",
  "shapeLibrary__item_basic-braceLeft": "brace_left",
  "shapeLibrary__item_basic-braceRight": "brace_right",
  "shapeLibrary__item_basic-chevron": "chevron",
  "shapeLibrary__item_basic-notched-chevron": "notched_chevron",
  "shapeLibrary__item_flowchart-process": "flow_process",
  "shapeLibrary__item_flowchart-decision": "flow_decision",
  "shapeLibrary__item_flowchart-terminator": "flow_terminator",
  "shapeLibrary__item_flowchart-predefined-process": "flow_predefined",
  "shapeLibrary__item_flowchart-document": "document",
  "shapeLibrary__item_flowchart-multiple-documents": "multiple_documents",
  "shapeLibrary__item_flowchart-manual-input": "manual_input",
  "shapeLibrary__item_flowchart-preparation": "preparation",
  "shapeLibrary__item_flowchart-data": "flow_data",
  "shapeLibrary__item_flowchart-database": "flow_database",
  "shapeLibrary__item_flowchart-hard-disk": "hard_disk",
  "shapeLibrary__item_flowchart-internal-storage": "internal_storage",
  "shapeLibrary__item_flowchart-manual-operation": "manual_operation",
  "shapeLibrary__item_flowchart-delay": "delay",
  "shapeLibrary__item_flowchart-stored-data": "stored_data",
  "shapeLibrary__item_flowchart-merge": "merge",
  "shapeLibrary__item_flowchart-connector": "flow_connector",
  "shapeLibrary__item_flowchart-or": "or_junction",
  "shapeLibrary__item_flowchart-summing-junction": "summing_junction",
  "shapeLibrary__item_flowchart-display": "display",
  "shapeLibrary__item_flowchart-off-page-link": "off_page",
  "shapeLibrary__item_flowchart-note-square": "annotation",
  "shapeLibrary__item_flowchart-swimlane-horizontal": "swimlane_horizontal",
  "shapeLibrary__item_flowchart-swimlane-vertical": "swimlane_vertical",
  "shapeLibrary__item_flowchart-extract": "extract",
  "shapeLibrary__item_flowchart-collate": "collate",
  "shapeLibrary__item_flowchart-card": "card",
  "shapeLibrary__item_flowchart-folder": "folder",
  "shapeLibrary__item_flowchart-bucket": "bucket",
  "shapeLibrary__item_flowchart-lightning-bolt": "lightning",
  "shapeLibrary__item_flowchart-note-curly-right": "annotation_curly_right",
  "shapeLibrary__item_flowchart-note-curly-left": "annotation_curly_left",
  "shapeLibrary__item_flowchart-magnetic-tape": "magnetic_tape",
  "shapeLibrary__item_flowchart-multiproc": "multiple_processes",
  "shapeLibrary__item_flowchart-lined-shaded": "lined_shaded",
  "shapeLibrary__item_flowchart-lined-document": "lined_document",
  "shapeLibrary__item_flowchart-divided": "divided_process",
  "shapeLibrary__item_flowchart-container": "container",
  "shapeLibrary__item_flowchart-process-sharp": "process_sharp",
  "shapeLibrary__item_flowchart-trapezoid": "flow_trapezoid",
  "shapeLibrary__item_flowchart-asymmetric": "asymmetric",
  "shapeLibrary__item_flowchart-lean-left": "lean_left",
  "shapeLibrary__item_flowchart-double-circle": "double_circle",
  "shapeLibrary__item_flowchart-start": "start_event",
  "shapeLibrary__item_flowchart-stop": "stop_event",
  "shapeLibrary__item_flowchart-junction": "junction",
  "shapeLibrary__item_flowchart-tagged-process": "tagged_process",
  "shapeLibrary__item_flowchart-loop-limit": "loop_limit",
  "shapeLibrary__item_flowchart-tagged-document": "tagged_document",
  "shapeLibrary__item_flowchart-disk-storage": "disk_storage",
  "shapeLibrary__item_flowchart-text-block": "text_block",
  "shapeLibrary__item_flowchart-note-curly-both": "annotation_curly_both",
  "shapeLibrary__item_flowchart-cloud": "flow_cloud",
  "shapeLibrary__item_flowchart-bang": "explosion"
};
