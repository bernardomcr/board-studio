import {CanvasTextMetrics,type Text} from 'pixi.js';

/** Text is rerasterized from the font; mipmaps provide filtered zoom-out levels. */
export const TEXT_SAMPLING = {autoGenerateMipmaps:true,textureStyle:{scaleMode:'linear' as const}};
const MAX_TEXTURE_EDGE=4096,MAX_TEXTURE_TEXELS=4*1024*1024;
const nextPowerOfTwo=(n:number)=>2**Math.ceil(Math.log2(Math.max(1,n)));

/** Half-octave buckets avoid rebuilding font textures on every wheel sample. */
export function textRasterDensity(zoom:number,dpr=globalThis.devicePixelRatio||1):number{
  const requested=Math.max(2,Math.min(128,Math.max(.02,zoom)*Math.max(1,Math.min(3,dpr))*1.5));
  return 2**(Math.ceil(Math.log2(requested)*2)/2);
}

/** Bound the actual pooled texture allocation, including power-of-two padding. */
export function fitTextResolution(text:Text,requested:number):number{
  const measured=CanvasTextMetrics.measureText(text.text||' ',text.style),padding=text.style._getFinalPadding();
  // CanvasTextGenerator rounds the logical bounds before multiplying by density.
  // Using fractional display bounds here can turn a 4096px budget into a 4097px
  // request and make the canvas/texture pools allocate an 8192px backing store.
  const width=Math.ceil(Math.max(1,measured.width)+padding*2),height=Math.ceil(Math.max(1,measured.height)+padding*2);
  let density=Math.min(requested,MAX_TEXTURE_EDGE/width,MAX_TEXTURE_EDGE/height);
  while(true){
    const pixelWidth=nextPowerOfTwo(Math.ceil(width*density)),pixelHeight=nextPowerOfTwo(Math.ceil(height*density));
    if(pixelWidth<=MAX_TEXTURE_EDGE&&pixelHeight<=MAX_TEXTURE_EDGE&&pixelWidth*pixelHeight<=MAX_TEXTURE_TEXELS)break;
    density/=Math.SQRT2;
  }
  return Math.max(1e-6,density);
}
