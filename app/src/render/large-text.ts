import {CanvasSource,CanvasTextMetrics,Container,Sprite,Text,Texture,type TextStyle} from 'pixi.js';
import {worldToLocal,type Rect} from '../core/geometry';
import type {Widget} from '../core/model';

const MAX_EDGE=4096,MAX_PIXELS=4*1024*1024;
interface Tile{sprite:Sprite;canvas:HTMLCanvasElement;context:CanvasRenderingContext2D;key:string}
const genericFamilies=new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui']);
function fontString(style:TextStyle):string{
 const families=(Array.isArray(style.fontFamily)?style.fontFamily:style.fontFamily.split(',')).map(value=>{const family=value.trim();return genericFamilies.has(family)||/^['"]/.test(family)?family:`"${family.replace(/"/g,'\\"')}"`;});
 return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize}px ${families.join(',')}`;
}
export function needsLargeTextRaster(text:Text,zoom:number):boolean{
 return !!text.text.trim()&&(text.style.fontSize*Math.abs(text.scale.y)*zoom>1024||text.width*zoom>4096);
}

/** Only the visible portion of an oversized run is rasterized. The native canvas
 * paints its normalized font through a transform instead of magnifying a bitmap
 * of the entire word. Model, line layout, links and ordinary text stay unchanged. */
export class LargeTextRaster{
 readonly container=new Container();
 private tiles=new Map<number,Tile>();
 constructor(parent:Container){this.container.label='large-text-raster';this.container.eventMode='none';this.container.measurable=false;parent.addChild(this.container);}
 private discard(index:number):void{const tile=this.tiles.get(index);if(!tile)return;tile.sprite.destroy({texture:true,textureSource:true});tile.canvas.width=tile.canvas.height=1;this.tiles.delete(index);}
 update(widget:Widget,textContainer:Container,visible:Rect|undefined,zoom:number):void{
  const runs=textContainer.children.filter((child):child is Text=>child instanceof Text),active=new Set<number>();this.container.visible=textContainer.visible;
  const corners=visible?[{x:visible.minX,y:visible.minY},{x:visible.maxX,y:visible.minY},{x:visible.maxX,y:visible.maxY},{x:visible.minX,y:visible.maxY}].map(point=>worldToLocal(widget,point)):undefined;
  const margin=2/Math.max(.000001,zoom),minX=corners?Math.min(...corners.map(p=>p.x))-margin:0,maxX=corners?Math.max(...corners.map(p=>p.x))+margin:0,minY=corners?Math.min(...corners.map(p=>p.y))-margin:0,maxY=corners?Math.max(...corners.map(p=>p.y))+margin:0;
  for(let index=0;index<runs.length;index++){
   const text=runs[index]!;text.renderable=true;if(!visible||!needsLargeTextRaster(text,zoom))continue;text.renderable=false;
   const originX=textContainer.x+text.x,originY=textContainer.y+text.y,bounds=text.bounds,sx=text.scale.x,sy=text.scale.y;
   const left=Math.max(minX,originX+bounds.minX*sx),top=Math.max(minY,originY+bounds.minY*sy),right=Math.min(maxX,originX+bounds.maxX*sx),bottom=Math.min(maxY,originY+bounds.maxY*sy);
   if(right<=left||bottom<=top)continue;
   const width=right-left,height=bottom-top,dpr=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1));
   let density=Math.min(zoom*dpr,(MAX_EDGE-2)/width,(MAX_EDGE-2)/height,Math.sqrt((MAX_PIXELS-8192)/(width*height)));
   let pixelWidth=Math.max(1,Math.ceil(width*density)),pixelHeight=Math.max(1,Math.ceil(height*density));
   while(pixelWidth>MAX_EDGE||pixelHeight>MAX_EDGE||pixelWidth*pixelHeight>MAX_PIXELS){density/=Math.SQRT2;pixelWidth=Math.max(1,Math.ceil(width*density));pixelHeight=Math.max(1,Math.ceil(height*density));}
   let tile=this.tiles.get(index);if(!tile){const canvas=document.createElement('canvas'),context=canvas.getContext('2d')!;canvas.width=pixelWidth;canvas.height=pixelHeight;const texture=new Texture({source:new CanvasSource({resource:canvas,autoGenerateMipmaps:false,scaleMode:'linear'})}),sprite=new Sprite(texture);sprite.label=`large-text-run-${index}`;sprite.eventMode='none';this.container.addChild(sprite);tile={sprite,canvas,context,key:''};this.tiles.set(index,tile);}active.add(index);
   const key=JSON.stringify([text.text,text.style.styleKey,originX,originY,sx,sy,left,top,right,bottom,density,pixelWidth,pixelHeight]);
   if(tile.key!==key){
    tile.key=key;const {canvas,context}=tile;if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;tile.sprite.texture.source.resize(pixelWidth,pixelHeight);}
    context.resetTransform();context.clearRect(0,0,pixelWidth,pixelHeight);context.setTransform(density*sx,0,0,density*sy,(originX-left)*density,(originY-top)*density);
    context.font=fontString(text.style);context.textBaseline=text.style.textBaseline;context.fillStyle=typeof text.style.fill==='string'?text.style.fill:'#1a1a1a';
    const measured=CanvasTextMetrics.measureText(text.text,text.style),properties=measured.fontProperties,padding=text.style._getFinalPadding(),baseline=properties.ascent+Math.max(0,(measured.lineHeight-properties.fontSize)/2)+padding;
    context.fillText(text.text,padding,baseline);tile.sprite.texture.source.update();
   }
   tile.sprite.position.set(left,top);tile.sprite.width=pixelWidth/density;tile.sprite.height=pixelHeight/density;
  }
  for(const index of this.tiles.keys())if(!active.has(index))this.discard(index);
 }
 destroy():void{for(const index of this.tiles.keys())this.discard(index);this.container.destroy();}
}
