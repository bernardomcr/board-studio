/**
 * Grid + snap com as tabelas literais extraídas de:
 *   c_Board_canvasCommandCanvas…c8d2460d…js  (classe de grid)
 *
 * Fórmulas originais:
 *   snapCellSize  = getCurrentSize(snapModuleConfig,   scale)
 *   snapThreshold = snapCellSize / 2 / scale
 *   visualCell    = getCurrentSize(visualModuleConfig, scale)
 *   visualSizePx  = visualCell * scale
 */

export const MODULE_SIZE = 20;

/** Chaves = zoom; valores = célula em unidades de mundo. Ordem crescente de zoom. */
const SNAP_MODULE_CONFIG: ReadonlyArray<readonly [number, number]> = [
  [1 / 1024, 10240],
  [1 / 512, 5120],
  [1 / 256, 2560],
  [1 / 128, 1280],
  [1 / 64, 640],
  [1 / 32, 320],
  [1 / 16, 160],
  [1 / 8, 80],
  [0.25, 40],
  [0.5, 20],
  [2, 10],
  [4, 5],
  [20, 1],
];

const VISUAL_MODULE_CONFIG: ReadonlyArray<readonly [number, number]> = [
  [1 / 1024, 20480],
  [1 / 512, 10240],
  [1 / 256, 5120],
  [1 / 128, 2560],
  [1 / 64, 1280],
  [1 / 32, 640],
  [1 / 16, 320],
  [1 / 8, 160],
  [0.25, 80],
  [0.5, 40],
  [1, 20],
];

/** Réplica de getCurrentSize do Miro. */
export function currentSize(
  config: ReadonlyArray<readonly [number, number]>,
  scale: number,
): number {
  if (config.length === 0) return MODULE_SIZE;
  const first = config[0]!;
  const last = config[config.length - 1]!;
  const clamped = Math.min(Math.max(scale, first[0]), last[0]);
  const idx = config.findIndex(([key]) => key >= clamped);
  if (idx < 0) return MODULE_SIZE;
  return config[idx]![1];
}

export interface GridState {
  /** passo da grade desenhada, em unidades de mundo */
  visualCell: number;
  /** passo de snap, em unidades de mundo */
  snapCell: number;
  /** tolerância de snap, em unidades de mundo */
  snapThreshold: number;
}

export function gridStateAt(scale: number): GridState {
  const snapCell = currentSize(SNAP_MODULE_CONFIG, scale);
  return {
    snapCell,
    snapThreshold: snapCell / 2 / scale,
    visualCell: currentSize(VISUAL_MODULE_CONFIG, scale),
  };
}

/** Encaixa um valor de mundo no grid, se estiver dentro do limiar. */
export function snapValue(value: number, state: GridState): { value: number; snapped: boolean } {
  const candidate = Math.round(value / state.snapCell) * state.snapCell;
  return Math.abs(value - candidate) <= state.snapThreshold
    ? { value: candidate, snapped: true }
    : { value, snapped: false };
}

export function snapPoint(
  p: { x: number; y: number },
  state: GridState,
): { x: number; y: number; snapped: boolean } {
  const sx = snapValue(p.x, state);
  const sy = snapValue(p.y, state);
  return { x: sx.value, y: sy.value, snapped: sx.snapped || sy.snapped };
}
