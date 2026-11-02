import {CanvasTextMetrics,TextStyle,type Text,type TextStyleOptions} from 'pixi.js';

/** Text is rerasterized from the font; mipmaps provide filtered zoom-out levels. */
export const TEXT_SAMPLING = {autoGenerateMipmaps:true,textureStyle:{scaleMode:'linear' as const}};
const MAX_TEXTURE_EDGE=4096,MAX_TEXTURE_TEXELS=4*1024*1024;
const nextPowerOfTwo=(n:number)=>2**Math.ceil(Math.log2(Math.max(1,n)));
const styles=new Map<string,TextStyle>();
/** Treat these styles as immutable; identical runs then share one GPU texture. */
export function sharedTextStyle(options:TextStyleOptions):TextStyle{
  const key=JSON.stringify(options),retained=styles.get(key);if(retained)return retained;
  const style=new TextStyle(options);styles.set(key,style);if(styles.size>512)styles.delete(styles.keys().next().value!);return style;
}
const resolutions=new WeakMap<Text,{requested:number;styleKey:string;text:string;value:number}>();
const inkReady=new WeakMap<Text,{style:TextStyle;styleKey:string;text:string}>();
const paddedStyles=new Map<string,TextStyle>();
let inkContext:CanvasRenderingContext2D|undefined;

/** Font advances and ink bounds differ, especially for handwriting and italics.
 * Reserve transparent raster bleed without changing layout, anchors or font size.
 * Never mutate a shared style: another word may need different ink margins. */
function ensureInkPadding(text:Text):void{
  const style=text.style,ready=inkReady.get(text);
  if(ready?.style===style&&ready.styleKey===style.styleKey&&ready.text===text.text)return;
  inkContext??=document.createElement('canvas').getContext('2d')!;
  const measured=CanvasTextMetrics.measureText(text.text||' ',style),properties=measured.fontProperties;
  inkContext.font=style._fontString;inkContext.textBaseline=style.textBaseline;
  let overflow=0;
  for(let i=0;i<measured.lines.length;i++){
    const metrics=inkContext.measureText(measured.lines[i]!),lineWidth=measured.lineWidths[i]??0;
    const x=style.align==='right'?measured.maxLineWidth-lineWidth:style.align==='center'?(measured.maxLineWidth-lineWidth)/2:0;
    const baseline=i*measured.lineHeight+properties.ascent+Math.max(0,(measured.lineHeight-properties.fontSize)/2);
    overflow=Math.max(overflow,(metrics.actualBoundingBoxLeft||0)-x,x+(metrics.actualBoundingBoxRight||0)-measured.width,(metrics.actualBoundingBoxAscent||0)-baseline,baseline+(metrics.actualBoundingBoxDescent||0)-measured.height);
  }
  const padding=Math.max(style._getFinalPadding(),Math.ceil(overflow)+Math.max(1,style.fontSize/1024));
  if(padding>style._getFinalPadding()){
    const key=style.styleKey+'|ink:'+padding;let padded=paddedStyles.get(key);
    if(!padded){padded=style.clone();padded.fill=style.fill;padded.padding=padding;paddedStyles.set(key,padded);if(paddedStyles.size>512)paddedStyles.delete(paddedStyles.keys().next().value!);}
    text.style=padded;
  }
  inkReady.set(text,{style:text.style,styleKey:text.style.styleKey,text:text.text});
}

/** Half-octave buckets avoid rebuilding font textures on every wheel sample. */
export function textRasterDensity(zoom:number,dpr=globalThis.devicePixelRatio||1):number{
  const requested=Math.max(.02,Math.min(128,Math.max(.02,zoom)*Math.max(1,Math.min(3,dpr))*1.5));
  return 2**(Math.ceil(Math.log2(requested)*2)/2);
}

/** Bound the actual pooled texture allocation, including power-of-two padding. */
export function fitTextResolution(text:Text,requested:number):number{
  ensureInkPadding(text);
  const styleKey=text.style.styleKey,cached=resolutions.get(text);if(cached&&cached.requested===requested&&cached.styleKey===styleKey&&cached.text===text.text)return cached.value;
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
  // A lower density floor would undo the allocation budget for large logical fonts.
  const value=density;resolutions.set(text,{requested,styleKey,text:text.text,value});return value;
}
