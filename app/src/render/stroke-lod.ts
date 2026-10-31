import type {Stroke,StrokeCubic,StrokeGeometry,StrokePoint} from '../core/strokes';

const retained=new WeakMap<StrokeGeometry,Map<number,StrokePoint[]>>();
const screenDensity=(zoom:number,dpr=globalThis.devicePixelRatio||1)=>Math.max(1e-9,Math.abs(zoom)*Math.max(.001,Math.min(3,dpr)));
export const strokeQualityBucket=(zoom:number,dpr=globalThis.devicePixelRatio||1)=>Math.floor(Math.log2(screenDensity(zoom,dpr))*4);
export function strokeRenderKey(stroke:Stroke,zoom:number,dpr=globalThis.devicePixelRatio||1):string{
  const density=screenDensity(zoom,dpr),width=(stroke.points[0]?.r??0)*2*density;
  return `${strokeQualityBucket(zoom,dpr)}:${width<1?density:1}`;
}
export function strokeScreenCoverage(width:number,zoom:number,dpr=globalThis.devicePixelRatio||1):number{return Math.min(1,Math.max(0,width*screenDensity(zoom,dpr)));}
export function strokeMinimumWidth(zoom:number,dpr=globalThis.devicePixelRatio||1):number{return 1/screenDensity(zoom,dpr);}

const midpoint=(a:{x:number;y:number},b:{x:number;y:number})=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function chordDistance(point:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}):number{const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);}
function pointError(point:StrokePoint,a:StrokePoint,b:StrokePoint):number{
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return Math.max((point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2,(point.r-a.r-(b.r-a.r)*t)**2);
}
function flatten(curve:StrokeCubic,error:number,output:StrokePoint[]):void{
  const pending=[{curve,depth:0}];
  while(pending.length){
    const {curve:c,depth}=pending.pop()!,a=chordDistance(c.p1,c.p0,c.p3),b=chordDistance(c.p2,c.p0,c.p3);
    if(Math.max(a,b)<=error||depth>=12){output.push(c.p3);continue;}
    const ab=midpoint(c.p0,c.p1),bc=midpoint(c.p1,c.p2),cd=midpoint(c.p2,c.p3),abc=midpoint(ab,bc),bcd=midpoint(bc,cd),center={...midpoint(abc,bcd),r:(c.p0.r+c.p3.r)/2};
    pending.push({curve:{p0:center,p1:bcd,p2:cd,p3:c.p3},depth:depth+1},{curve:{p0:c.p0,p1:ab,p2:abc,p3:center},depth:depth+1});
  }
}

/** Display approximation only: the stored vector path and SVG remain intact. */
export function strokeRenderPoints(geometry:StrokeGeometry,zoom:number,dpr=globalThis.devicePixelRatio||1):StrokePoint[]{
  const bucket=strokeQualityBucket(zoom,dpr);let cache=retained.get(geometry);if(!cache){cache=new Map();retained.set(geometry,cache);}const existing=cache.get(bucket);if(existing)return existing;
  // Use the upper edge of each bucket so its worst screen-space error stays low.
  const density=2**((bucket+1)/4),flattenError=.08/density,tolerance=.1/density;
  const source:StrokePoint[]=[];
  if(geometry.curves.length){source.push(geometry.curves[0]!.p0);for(const curve of geometry.curves)flatten(curve,flattenError,source);}else for(const point of geometry.knots)source.push(point);
  let result=source;
  if(source.length>2){
    const threshold=tolerance*tolerance,radial:StrokePoint[]=[source[0]!];let previous=source[0]!;
    for(let i=1;i<source.length-1;i++){const point=source[i]!;if((point.x-previous.x)**2+(point.y-previous.y)**2>threshold*.25||(point.r-previous.r)**2>threshold*.25){radial.push(point);previous=point;}}
    radial.push(source.at(-1)!);
    const keep=new Uint8Array(radial.length);keep[0]=1;keep[radial.length-1]=1;const pending=[0,radial.length-1];
    while(pending.length){const last=pending.pop()!,first=pending.pop()!;let worst=threshold,index=-1;for(let i=first+1;i<last;i++){const error=pointError(radial[i]!,radial[first]!,radial[last]!);if(error>worst){worst=error;index=i;}}if(index>=0){keep[index]=1;pending.push(first,index,index,last);}}
    result=radial.filter((_,i)=>keep[i]===1);
  }
  cache.set(bucket,result);if(cache.size>4)cache.delete(cache.keys().next().value!);return result;
}
