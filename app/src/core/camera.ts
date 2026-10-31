/**
 * Câmera = viewport do board.
 *
 * Regra central (extraída do Miro): os objetos vivem em coordenadas de MUNDO
 * estáveis; o zoom é propriedade da câmera, nunca do objeto.
 */

export interface Point {
  x: number;
  y: number;
}

/** Miro's current live zoom controls: 2% through 2,000% (October 2026). */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 20;

export class Camera {
  /** Posição do centro da tela, em coordenadas de mundo. */
  x = 0;
  y = 0;
  /** pixels de tela por unidade de mundo. */
  scale = 1;

  /** Tamanho da viewport em pixels de tela. */
  width = 0;
  height = 0;

  worldToScreen(p: Point): Point {
    return {
      x: (p.x - this.x) * this.scale + this.width / 2,
      y: (p.y - this.y) * this.scale + this.height / 2,
    };
  }

  screenToWorld(p: Point): Point {
    return {
      x: (p.x - this.width / 2) / this.scale + this.x,
      y: (p.y - this.height / 2) / this.scale + this.y,
    };
  }

  /** Pan em pixels de tela (usado pelo arraste). */
  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.scale;
    this.y -= dy / this.scale;
  }

  /**
   * Zoom ancorado num ponto de tela — o ponto sob o cursor não se move.
   * É o comportamento que o Miro tem e o que a maioria das implementações erra.
   */
  zoomAt(screen: Point, factor: number): void {
    const before = this.screenToWorld(screen);
    this.scale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    const after = this.screenToWorld(screen);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Encaixa um retângulo de mundo na tela com margem. */
  fit(bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding = 64): void {
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const sx = (this.width - padding * 2) / w;
    const sy = (this.height - padding * 2) / h;
    this.scale = clamp(Math.min(sx, sy), MIN_SCALE, MAX_SCALE);
    this.x = (bounds.minX + bounds.maxX) / 2;
    this.y = (bounds.minY + bounds.maxY) / 2;
  }

  /** Retângulo visível em coordenadas de mundo (para culling). */
  visibleWorldRect(): { minX: number; minY: number; maxX: number; maxY: number } {
    const a = this.screenToWorld({ x: 0, y: 0 });
    const b = this.screenToWorld({ x: this.width, y: this.height });
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
