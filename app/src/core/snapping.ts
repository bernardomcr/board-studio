/**
 * Snap entre objetos e guias de alinhamento.
 *
 * Regra do Miro (observada no grid): a tolerância é espacial, derivada do zoom —
 * ou seja, constante em PIXELS de tela, não em unidades de mundo.
 *
 * Função pura para poder ser testada sem render.
 */

import type { Rect } from "./geometry";

export type GuideOrientation = "vertical" | "horizontal";

export interface Guide {
  orientation: GuideOrientation;
  /** coordenada de mundo onde a guia fica (x para vertical, y para horizontal) */
  position: number;
  /** extensão da linha, em mundo, para cobrir os dois objetos */
  from: number;
  to: number;
  /** alinhamento que gerou a guia */
  kind: "edge" | "center";
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
  snappedX: boolean;
  snappedY: boolean;
}

function edgesX(r: Rect): number[] {
  return [r.minX, (r.minX + r.maxX) / 2, r.maxX];
}

function edgesY(r: Rect): number[] {
  return [r.minY, (r.minY + r.maxY) / 2, r.maxY];
}

const KINDS: Array<"edge" | "center"> = ["edge", "center", "edge"];

/**
 * Snap do retângulo em movimento contra os retângulos estáticos.
 *
 * @param moving       bounds atuais da seleção (antes do deslocamento)
 * @param targets      bounds dos outros objetos
 * @param proposed     deslocamento bruto do arraste, em mundo
 * @param tolerance    tolerância em MUNDO (convertida de pixels pela câmera)
 * @param gridStep     passo do grid (fallback quando não há objeto próximo)
 */
export function snapMove(
  moving: Rect,
  targets: Rect[],
  proposed: { dx: number; dy: number },
  tolerance: number,
  gridStep?: number,
): SnapResult {
  const moved: Rect = {
    minX: moving.minX + proposed.dx,
    minY: moving.minY + proposed.dy,
    maxX: moving.maxX + proposed.dx,
    maxY: moving.maxY + proposed.dy,
  };

  let bestX: { delta: number; position: number; kind: "edge" | "center" } | null = null;
  let bestY: { delta: number; position: number; kind: "edge" | "center" } | null = null;

  for (const target of targets) {
    const tx = edgesX(target);
    const ty = edgesY(target);
    const myX = edgesX(moved);
    const myY = edgesY(moved);

    for (let i = 0; i < myX.length; i++) {
      for (let j = 0; j < tx.length; j++) {
        const delta = tx[j]! - myX[i]!;
        if (Math.abs(delta) <= tolerance) {
          if (bestX === null || Math.abs(delta) < Math.abs(bestX.delta)) {
            bestX = { delta, position: tx[j]!, kind: KINDS[j] ?? "edge" };
          }
        }
      }
    }

    for (let i = 0; i < myY.length; i++) {
      for (let j = 0; j < ty.length; j++) {
        const delta = ty[j]! - myY[i]!;
        if (Math.abs(delta) <= tolerance) {
          if (bestY === null || Math.abs(delta) < Math.abs(bestY.delta)) {
            bestY = { delta, position: ty[j]!, kind: KINDS[j] ?? "edge" };
          }
        }
      }
    }
  }

  let dx = proposed.dx;
  let dy = proposed.dy;
  let snappedX = false;
  let snappedY = false;

  if (bestX) {
    dx += bestX.delta;
    snappedX = true;
  } else if (gridStep) {
    const target = Math.round(moved.minX / gridStep) * gridStep;
    if (Math.abs(target - moved.minX) <= tolerance) {
      dx += target - moved.minX;
      snappedX = true;
    }
  }

  if (bestY) {
    dy += bestY.delta;
    snappedY = true;
  } else if (gridStep) {
    const target = Math.round(moved.minY / gridStep) * gridStep;
    if (Math.abs(target - moved.minY) <= tolerance) {
      dy += target - moved.minY;
      snappedY = true;
    }
  }

  const final: Rect = {
    minX: moving.minX + dx,
    minY: moving.minY + dy,
    maxX: moving.maxX + dx,
    maxY: moving.maxY + dy,
  };

  const guides: Guide[] = [];

  if (bestX) {
    const others = targets.filter((t) => {
      const values = edgesX(t);
      return values.some((v) => Math.abs(v - bestX!.position) < 0.01);
    });
    const ys = [final, ...others].flatMap((r) => [r.minY, r.maxY]);
    guides.push({
      orientation: "vertical",
      position: bestX.position,
      from: Math.min(...ys),
      to: Math.max(...ys),
      kind: bestX.kind,
    });
  }

  if (bestY) {
    const others = targets.filter((t) => {
      const values = edgesY(t);
      return values.some((v) => Math.abs(v - bestY!.position) < 0.01);
    });
    const xs = [final, ...others].flatMap((r) => [r.minX, r.maxX]);
    guides.push({
      orientation: "horizontal",
      position: bestY.position,
      from: Math.min(...xs),
      to: Math.max(...xs),
      kind: bestY.kind,
    });
  }

  return { dx, dy, guides, snappedX, snappedY };
}
