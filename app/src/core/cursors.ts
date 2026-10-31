import type {HandleId} from './geometry';
const angles:Record<HandleId,number>={e:0,se:Math.PI/4,s:Math.PI/2,sw:3*Math.PI/4,w:Math.PI,nw:5*Math.PI/4,n:3*Math.PI/2,ne:7*Math.PI/4};
/** Native resize arrows follow the visible edge after object rotation. */
export function resizeCursor(handle:HandleId,rotation=0):string{
  const index=((Math.round((angles[handle]+rotation)/(Math.PI/4))%4)+4)%4;
  return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][index]!;
}
const rotateSvg='<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path d="M5 15a9 9 0 0 1 15-8M20 3v5h-5M21 12a9 9 0 0 1-15 7M6 23v-5h5" fill="none" stroke="white" stroke-width="4" stroke-linejoin="round"/><path d="M5 15a9 9 0 0 1 15-8M20 3v5h-5M21 12a9 9 0 0 1-15 7M6 23v-5h5" fill="none" stroke="#20232b" stroke-width="1.7" stroke-linejoin="round"/></svg>';
export const ROTATE_CURSOR=`url("data:image/svg+xml,${encodeURIComponent(rotateSvg)}") 13 13, grab`;
