import type { Vec } from './geometry';
import type { CapStyle } from './connectors';

export interface CapGeometry { polygons:number[][]; lines:Vec[][]; circles:Array<{x:number;y:number;radius:number}> }

/** Endpoint points to the tip; from lies along the actual incoming tangent. */
export function capGeometry(cap:CapStyle|undefined,from:Vec,to:Vec,width:number):CapGeometry {
  const result:CapGeometry={polygons:[],lines:[],circles:[]};
  if(!cap||cap==='none')return result;
  const size=Math.max(8,width*4),distance=Math.hypot(to.x-from.x,to.y-from.y)||1;
  const u={x:(to.x-from.x)/distance,y:(to.y-from.y)/distance},n={x:-u.y,y:u.x};
  const at=(back:number,side:number):Vec=>({x:to.x-u.x*back+n.x*side,y:to.y-u.y*back+n.y*side});
  const a=at(size,size*.45),b=at(size,-size*.45);
  if(cap==='arrow')result.lines.push([a,to,b]);
  if(cap==='triangle')result.polygons.push([to.x,to.y,a.x,a.y,b.x,b.y]);
  if(cap==='circle') {const c=at(size*.4,0);result.circles.push({x:c.x,y:c.y,radius:size*.4});}
  if(cap==='diamond') {const c=at(size,0),left=at(size*.5,size*.35),right=at(size*.5,-size*.35);result.polygons.push([to.x,to.y,left.x,left.y,c.x,c.y,right.x,right.y]);}
  if(cap==='bar')result.lines.push([at(0,size*.5),at(0,-size*.5)]);
  return result;
}

export interface PatternedLine { segments:Vec[][]; dots:Array<{x:number;y:number;radius:number}> }
/** Continuous dash phase across bends; circles provide genuinely round dots. */
export function patternedLineSegments(points:Vec[],style:'normal'|'dashed'|'dotted'|undefined,width:number):PatternedLine {
  const result:PatternedLine={segments:[],dots:[]};if(points.length<2)return result;
  if(!style||style==='normal'){result.segments.push(points);return result;}
  const dash=Math.max(width*4,6),gap=Math.max(width*2,4),period=style==='dotted'?Math.max(width*3,5):dash+gap;
  let accumulated=0,nextDot=0;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-8)continue;
    const at=(d:number):Vec=>({x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length});
    if(style==='dotted') {
      while(nextDot<=accumulated+length+1e-8){if(nextDot>=accumulated-1e-8){const p=at(Math.max(0,nextDot-accumulated));result.dots.push({...p,radius:width/2});}nextDot+=period;}
    } else {
      let position=0;
      while(position<length-1e-8){const phase=(accumulated+position)%period,on=phase<dash,remaining=on?dash-phase:period-phase,amount=Math.min(remaining,length-position);if(on&&amount>1e-8)result.segments.push([at(position),at(position+amount)]);position+=Math.max(amount,1e-7);}
    }
    accumulated+=length;
  }
  return result;
}
