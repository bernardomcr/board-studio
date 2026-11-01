import {CanvasSource,Rectangle,Texture} from 'pixi.js';
import type {Camera} from '../core/camera';
import {rotate} from '../core/geometry';
import type {ImageWidget} from '../core/model';

const MAX_EDGE=4096,MAX_PIXELS=4*1024*1024;
export type ImageRasterGeometry=Pick<ImageWidget,'x'|'y'|'width'|'height'|'rotation'|'crop'|'flipX'|'flipY'>;
interface Region{x:number;y:number;width:number;height:number}
interface Plan{region:Region;width:number;height:number}

/** These are GPU working-set limits, never limits on the saved image or board. */
export function imageRasterLimit(renderer:unknown):number{
  const device=renderer as {gl?:WebGLRenderingContext;gpu?:{device?:{limits?:{maxTextureDimension2D?:number}}}};
  const value=device.gl?Number(device.gl.getParameter(device.gl.MAX_TEXTURE_SIZE)):device.gpu?.device?.limits?.maxTextureDimension2D;
  return Math.max(1,Math.floor(Math.min(MAX_EDGE,value&&Number.isFinite(value)?value:MAX_EDGE)));
}
export function needsViewportImage(texture:Texture,limit:number):boolean{
  const {pixelWidth:width,pixelHeight:height}=texture.source;
  return width>limit||height>limit||width*height>MAX_PIXELS;
}

function regionFor(widget:ImageRasterGeometry,camera:Camera,width:number,height:number,padding=0):Region|undefined{
  const crop=widget.crop??{x:0,y:0,width:1,height:1};
  const points=[[-padding,-padding],[camera.width+padding,-padding],[camera.width+padding,camera.height+padding],[-padding,camera.height+padding]].map(([x,y])=>{const point=camera.screenToWorld({x:x!,y:y!}),delta=rotate({x:point.x-widget.x-widget.width/2,y:point.y-widget.y-widget.height/2},-widget.rotation);return {x:delta.x+widget.width/2,y:delta.y+widget.height/2};});
  const left=Math.max(0,Math.min(...points.map(p=>p.x))),right=Math.min(widget.width,Math.max(...points.map(p=>p.x)));
  const top=Math.max(0,Math.min(...points.map(p=>p.y))),bottom=Math.min(widget.height,Math.max(...points.map(p=>p.y)));
  if(right<=left||bottom<=top)return;
  const sourceX=(local:number)=>(crop.x+crop.width*(widget.flipX?1-local/widget.width:local/widget.width))*width;
  const sourceY=(local:number)=>(crop.y+crop.height*(widget.flipY?1-local/widget.height:local/widget.height))*height;
  // Keep neighboring source texels for identical linear sampling at crop edges.
  const x=Math.max(0,Math.floor(Math.min(sourceX(left),sourceX(right)))-2),y=Math.max(0,Math.floor(Math.min(sourceY(top),sourceY(bottom)))-2);
  const endX=Math.min(width,Math.ceil(Math.max(sourceX(left),sourceX(right)))+2),endY=Math.min(height,Math.ceil(Math.max(sourceY(top),sourceY(bottom)))+2);
  return endX>x&&endY>y?{x,y,width:endX-x,height:endY-y}:undefined;
}
function planFor(widget:ImageRasterGeometry,camera:Camera,sourceWidth:number,sourceHeight:number,limit:number):Plan|undefined{
  const region=regionFor(widget,camera,sourceWidth,sourceHeight,96);if(!region)return;
  const crop=widget.crop??{x:0,y:0,width:1,height:1},dpr=Math.max(1,Math.min(3,globalThis.devicePixelRatio||1));
  const scaleX=Math.min(1,widget.width*camera.scale*dpr/(crop.width*sourceWidth)),scaleY=Math.min(1,widget.height*camera.scale*dpr/(crop.height*sourceHeight));
  let width=Math.max(1,Math.ceil(region.width*scaleX)),height=Math.max(1,Math.ceil(region.height*scaleY));
  const factor=Math.min(1,limit/width,limit/height,Math.sqrt(MAX_PIXELS/(width*height)));
  width=Math.max(1,Math.floor(width*factor));height=Math.max(1,Math.floor(height*factor));
  return {region,width,height};
}
const contains=(a:Region,b:Region)=>a.x<=b.x&&a.y<=b.y&&a.x+a.width>=b.x+b.width&&a.y+a.height>=b.y+b.height;

/** Rasterize only the currently useful source pixels. orig/trim preserve the
 * complete logical image, so crop geometry, flips and exports stay unchanged. */
export class ViewportImageRaster{
  private readonly canvas=document.createElement('canvas');
  private readonly context:CanvasRenderingContext2D;
  private readonly source:CanvasSource;
  private texture?:Texture;
  private plan?:Plan;
  constructor(private readonly original:Texture,private readonly limit:number){
    this.canvas.width=this.canvas.height=1;this.context=this.canvas.getContext('2d')!;
    this.source=new CanvasSource({resource:this.canvas,resolution:1,width:1,height:1,scaleMode:'linear',autoGenerateMipmaps:true,label:'viewport-image-raster'});
  }
  update(widget:ImageRasterGeometry,camera:Camera):Texture|undefined{
    const width=this.original.source.pixelWidth,height=this.original.source.pixelHeight;
    const required=regionFor(widget,camera,width,height),next=planFor(widget,camera,width,height,this.limit);
    if(!required||!next)return;
    if(this.plan&&this.texture&&contains(this.plan.region,required)){
      const a=this.plan,b=next;
      if(a.width/a.region.width>=b.width/b.region.width-1e-9&&a.height/a.region.height>=b.height/b.region.height-1e-9)return this.texture;
    }
    const previous=this.texture,{region}=next;
    this.source.resize(next.width,next.height,1);
    this.context.resetTransform();this.context.clearRect(0,0,next.width,next.height);
    this.context.imageSmoothingEnabled=true;this.context.imageSmoothingQuality='high';
    this.context.drawImage(this.original.source.resource as CanvasImageSource,region.x,region.y,region.width,region.height,0,0,next.width,next.height);
    this.source.update();
    const ratioX=width/this.original.orig.width,ratioY=height/this.original.orig.height;
    this.texture=new Texture({source:this.source,frame:new Rectangle(0,0,next.width,next.height),orig:this.original.orig.clone(),trim:new Rectangle(region.x/ratioX,region.y/ratioY,region.width/ratioX,region.height/ratioY),label:'viewport-image-texture'});
    this.plan=next;previous?.destroy();return this.texture;
  }
  destroy():void{this.texture?.destroy();this.texture=undefined;this.plan=undefined;this.source.destroy();this.canvas.width=this.canvas.height=1;}
}
