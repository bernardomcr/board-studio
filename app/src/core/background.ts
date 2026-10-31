/** Board scenery lives outside the selectable object graph. */
export interface BackgroundImage {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface BoardBackground {
  color: string;
  grid: boolean;
  /** Omitted retains the original dotted grid. grid=false hides every pattern. */
  gridStyle?:'dots'|'lines'|'crosses';
  image?: BackgroundImage;
}

/** null explicitly removes the picture and survives a serialized command journal. */
export interface BackgroundPatch {
  color?: string;
  grid?: boolean;
  /** null restores the legacy dotted default without adding a stored property. */
  gridStyle?:'dots'|'lines'|'crosses'|null;
  image?: BackgroundImage | null;
}

export const DEFAULT_BACKGROUND: Readonly<BoardBackground> = Object.freeze({ color: '#fbfaf7', grid: true });
export const BACKGROUND_MAX_BYTES = 25 * 1024 * 1024;

/** Accept only bounded local raster data; SVG and network URLs are never scenery. */
export function validateBoardBackground(value: unknown): BoardBackground | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const background = value as Record<string, unknown>;
  if (typeof background.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(background.color) || typeof background.grid !== 'boolean') return null;
  const result: BoardBackground = { color: background.color.toLowerCase(), grid: background.grid };
  if(background.gridStyle!==undefined&&background.gridStyle!==null){if(!['dots','lines','crosses'].includes(background.gridStyle as string))return null;result.gridStyle=background.gridStyle as BoardBackground['gridStyle'];}
  if (background.image === undefined || background.image === null) return result;
  if (typeof background.image !== 'object' || Array.isArray(background.image)) return null;
  const image = background.image as Record<string, unknown>;
  if (typeof image.src !== 'string' || image.src.length > Math.ceil(BACKGROUND_MAX_BYTES / 3) * 4 + 64 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.src)) return null;
  const encoded = image.src.slice(image.src.indexOf(',') + 1);
  if (encoded.length % 4 || encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0) > BACKGROUND_MAX_BYTES) return null;
  for (const field of ['x', 'y', 'width', 'height', 'opacity']) if (typeof image[field] !== 'number' || !Number.isFinite(image[field])) return null;
  if ((image.width as number) < 1 || (image.height as number) < 1 || (image.opacity as number) < 0 || (image.opacity as number) > 1) return null;
  result.image = { src: image.src, x: image.x as number, y: image.y as number, width: image.width as number, height: image.height as number, opacity: image.opacity as number };
  return result;
}
