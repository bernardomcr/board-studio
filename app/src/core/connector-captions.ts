import {connectorCaptionPoints,connectorPointAt,connectorPathLength,type Connector,type ConnectorCaptionStyle,type ConnectorCubic,type ConnectorGeometry} from './connectors';
import type {Vec,Rect} from './geometry';
import {measureTextRun} from './text-layout';
import type {Style} from './model';

export interface CaptionLayout {
  text:string;fraction:number;position:Vec;anchor:Vec;angle:number;width:number;height:number;
  fontSize:number;fontFamily:string;color:string;followPath:boolean;side:'above'|'center'|'below';
  strokeRadius:number;
}
const cache=new WeakMap<Connector,{geometry:ConnectorGeometry;captions:Connector['captions'];positions:Connector['captionPositions'];styles:Connector['captionStyles'];lineStyle:Connector['style'];layout:CaptionLayout[]}>();
const boundsCache=new WeakMap<CaptionLayout[],Rect|null>();
const DEFAULTS_KEY='board-studio-connector-caption-v1';
let preferred:ConnectorCaptionStyle|undefined;
export function captionDefaults():ConnectorCaptionStyle{
  if(!preferred){try{const data=JSON.parse(localStorage.getItem(DEFAULTS_KEY)??'null');preferred=validStyle(data);}catch{preferred={};}}
  return {...preferred};
}
function validStyle(value:unknown):ConnectorCaptionStyle{
  if(!value||typeof value!=='object')return {};
  const v=value as ConnectorCaptionStyle;
  return {fontSize:Number.isFinite(v.fontSize)&&v.fontSize!>0?v.fontSize:14,fontFamily:typeof v.fontFamily==='string'?v.fontFamily:'Arial, sans-serif',color:typeof v.color==='string'&&/^(#[\da-f]{3,8}|transparent|black|white|rgba?\([\d\s.,%]+\))$/i.test(v.color)?v.color:undefined,followPath:!!v.followPath,side:['above','center','below'].includes(v.side??'')?v.side:'center'};
}
export function rememberCaptionDefaults(patch:ConnectorCaptionStyle):void{
  preferred=validStyle({...captionDefaults(),...patch});
  try{localStorage.setItem(DEFAULTS_KEY,JSON.stringify(preferred));}catch{}
}
/** New captions occupy the largest free longitudinal interval. Equal gaps use the last. */
export function nextCaptionFraction(connector:Connector):number{
  const fractions=(connector.captions??[]).map((_,i)=>Math.max(0,Math.min(1,connector.captionPositions?.[i]??(i+1)/((connector.captions?.length??0)+1)))).sort((a,b)=>a-b);
  let before=0,best=-1,result=.5;
  for(const after of [...fractions,1]){if(after-before>=best){best=after-before;result=(before+after)/2;}before=after;}
  return result;
}
export function appendConnectorCaption(connector:Connector,text='Rótulo'):Pick<Connector,'captions'|'captionPositions'|'captionStyles'>{
  const captions=connector.captions??[],positions=captions.map((_,i)=>connector.captionPositions?.[i]??(i+1)/(captions.length+1));
  const styles=captions.map((_,i)=>({...connector.captionStyles?.[i]}));
  return {captions:[...captions,text],captionPositions:[...positions,nextCaptionFraction(connector)],captionStyles:[...styles,{fontSize:14,fontFamily:'Arial, sans-serif',side:'center',followPath:false,...captionDefaults(),color:captionDefaults().color??connector.style.strokeColor}]};
}
export function connectorCaptionLayout(connector:Connector,geometry:ConnectorGeometry):CaptionLayout[]{
  const old=cache.get(connector);if(old&&old.geometry===geometry&&old.captions===connector.captions&&old.positions===connector.captionPositions&&old.styles===connector.captionStyles&&old.lineStyle===connector.style)return old.layout;
  const total=connectorPathLength(geometry),layout=connectorCaptionPoints(connector,geometry).map((caption,i)=>{
    const style=validStyle(connector.captionStyles?.[i]),fontSize=style.fontSize??14,fontFamily=style.fontFamily??'Arial, sans-serif',followPath=style.followPath??false,side=style.side??'center';
    const span=total>0?Math.min(.01,Math.max(1e-7,fontSize*.1/total)):0;
    const a=connectorPointAt(geometry,Math.max(0,caption.fraction-span)),b=connectorPointAt(geometry,Math.min(1,caption.fraction+span));
    let angle=followPath?Math.atan2(b.y-a.y,b.x-a.x):0;
    if(angle>Math.PI/2)angle-=Math.PI;else if(angle< -Math.PI/2)angle+=Math.PI;
    const height=fontSize*1.2,width=measureTextRun(caption.text,{fontFamily,fontSize} as Style),offset=side==='center'?0:(side==='above'?-1:1)*(height/2+connector.style.strokeWidth/2+4);
    const position={x:caption.position.x-Math.sin(angle)*offset,y:caption.position.y+Math.cos(angle)*offset};
    return {...caption,anchor:caption.position,position,angle,width,height,fontSize,fontFamily,color:style.color??connector.style.strokeColor,followPath,side,strokeRadius:connector.style.strokeWidth/2};
  });
  cache.set(connector,{geometry,captions:connector.captions,positions:connector.captionPositions,styles:connector.captionStyles,lineStyle:connector.style,layout});return layout;
}
function local(point:Vec,label:CaptionLayout):Vec{const dx=point.x-label.position.x,dy=point.y-label.position.y,c=Math.cos(label.angle),s=Math.sin(label.angle);return {x:dx*c+dy*s,y:-dx*s+dy*c};}
function inside(point:Vec,label:CaptionLayout){const p=local(point,label);return Math.abs(p.x)<label.width/2+4+label.strokeRadius&&Math.abs(p.y)<label.height/2+2+label.strokeRadius;}
export function connectorCaptionAt(connector:Connector,geometry:ConnectorGeometry,p:Vec,padding=0):number{
  return connectorCaptionLayout(connector,geometry).findIndex(label=>{const point=local(p,label);return !!label.text&&Math.abs(point.x)<=label.width/2+padding&&Math.abs(point.y)<=label.height/2+padding;});
}
export function connectorCaptionBounds(labels:CaptionLayout[]):Rect|null{
  if(boundsCache.has(labels))return boundsCache.get(labels)!;
  let bounds:Rect|null=null;
  for(const label of labels){if(!label.text)continue;const c=Math.abs(Math.cos(label.angle)),s=Math.abs(Math.sin(label.angle)),x=(label.width*c+label.height*s)/2,y=(label.width*s+label.height*c)/2,r={minX:label.position.x-x,minY:label.position.y-y,maxX:label.position.x+x,maxY:label.position.y+y};bounds=bounds?{minX:Math.min(bounds.minX,r.minX),minY:Math.min(bounds.minY,r.minY),maxX:Math.max(bounds.maxX,r.maxX),maxY:Math.max(bounds.maxY,r.maxY)}:r;}
  boundsCache.set(labels,bounds);return bounds;
}
export function captionDotVisible(point:Vec,radius:number,labels:CaptionLayout[]):boolean{
  return !labels.some(label=>{if(!label.text||label.side!=='center')return false;const p=local(point,label);return Math.abs(p.x)<label.width/2+4+radius&&Math.abs(p.y)<label.height/2+2+radius;});
}
function segmentInterval(a:Vec,b:Vec,label:CaptionLayout):[number,number]|null{
  const p=local(a,label),q=local(b,label),dx=q.x-p.x,dy=q.y-p.y;let low=0,high=1;
  for(const [start,delta,half]of[[p.x,dx,label.width/2+4+label.strokeRadius],[p.y,dy,label.height/2+2+label.strokeRadius]]){
    if(Math.abs(delta!)<1e-12){if(Math.abs(start!)>half!)return null;continue;}
    const t0=(-half!-start!)/delta!,t1=(half!-start!)/delta!;low=Math.max(low,Math.min(t0,t1));high=Math.min(high,Math.max(t0,t1));if(low>=high)return null;
  }return [low,high];
}
export function captionCutSegments(points:Vec[],labels:CaptionLayout[]):Vec[][]{
  const holes=labels.filter(label=>label.text&&label.side==='center');if(!holes.length)return [points];
  const result:Vec[][]=[];let run:Vec[]=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,cuts=holes.map(label=>segmentInterval(a,b,label)).filter((cut):cut is[number,number]=>!!cut).sort((a,b)=>a[0]-b[0]);
    const merged:Array<[number,number]>=[];for(const cut of cuts){const previous=merged.at(-1);if(previous&&cut[0]<=previous[1])previous[1]=Math.max(previous[1],cut[1]);else merged.push([...cut]);}
    const point=(t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});let previous=0;
    for(const cut of [...merged,[1,1] as[number,number]]){
      if(cut[0]>previous){const start=point(previous),end=point(cut[0]);if(!run.length)run.push(start);run.push(end);}
      if(cut[1]>cut[0]&&run.length){result.push(run);run=[];}previous=cut[1];
    }
  }
  if(run.length)result.push(run);return result;
}
function cubicAt(c:ConnectorCubic,t:number):Vec{const u=1-t;return {x:u*u*u*c.p0.x+3*u*u*t*c.p1.x+3*u*t*t*c.p2.x+t*t*t*c.p3.x,y:u*u*u*c.p0.y+3*u*u*t*c.p1.y+3*u*t*t*c.p2.y+t*t*t*c.p3.y};}
function split(c:ConnectorCubic,t:number):[ConnectorCubic,ConnectorCubic]{const lerp=(a:Vec,b:Vec)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),a=lerp(c.p0,c.p1),b=lerp(c.p1,c.p2),d=lerp(c.p2,c.p3),e=lerp(a,b),f=lerp(b,d),m=lerp(e,f);return [{p0:c.p0,p1:a,p2:e,p3:m},{p0:m,p1:f,p2:d,p3:c.p3}];}
function cubicPart(c:ConnectorCubic,from:number,to:number):ConnectorCubic{const first=to<1?split(c,to)[0]:c;return from>0?split(first,from/to)[1]:first;}
/** Roots of a cubic Bezier component crossing a rectangle edge, isolated at derivative extrema. */
function componentRoots(values:number[],edge:number):number[]{
  const [p0,p1,p2,p3]=values as[number,number,number,number],a=-p0+3*p1-3*p2+p3,b=3*p0-6*p1+3*p2,c=-3*p0+3*p1,d=p0-edge;
  const value=(t:number)=>((a*t+b)*t+c)*t+d,points=[0,1],A=3*a,B=2*b,C=c;
  if(Math.abs(A)<1e-12){if(Math.abs(B)>1e-12){const t=-C/B;if(t>0&&t<1)points.push(t);}}
  else{const discriminant=B*B-4*A*C;if(discriminant>=0)for(const t of[(-B-Math.sqrt(discriminant))/(2*A),(-B+Math.sqrt(discriminant))/(2*A)])if(t>0&&t<1)points.push(t);}
  points.sort((a,b)=>a-b);const roots:number[]=[];
  for(let i=1;i<points.length;i++){let low=points[i-1]!,high=points[i]!,left=value(low),right=value(high);if(Math.abs(left)<1e-9)roots.push(low);if(Math.abs(right)<1e-9)roots.push(high);if(left*right>=0)continue;for(let k=0;k<45;k++){const middle=(low+high)/2,v=value(middle);if(left*v<=0)high=middle;else{low=middle;left=v;}}roots.push((low+high)/2);}
  return roots;
}
export function captionCutCubics(curves:ConnectorCubic[],labels:CaptionLayout[]):ConnectorCubic[]{
  const holes=labels.filter(label=>label.text&&label.side==='center');if(!holes.length)return curves;
  const result:ConnectorCubic[]=[];
  for(const curve of curves){const roots=[0,1];for(const label of holes){const points=[curve.p0,curve.p1,curve.p2,curve.p3].map(point=>local(point,label));for(const edge of[-label.width/2-4-label.strokeRadius,label.width/2+4+label.strokeRadius])roots.push(...componentRoots(points.map(p=>p.x),edge));for(const edge of[-label.height/2-2-label.strokeRadius,label.height/2+2+label.strokeRadius])roots.push(...componentRoots(points.map(p=>p.y),edge));}
    const unique=[...new Set(roots)].sort((a,b)=>a-b);for(let i=1;i<unique.length;i++){const from=unique[i-1]!,to=unique[i]!;if(to-from>1e-10&&!holes.some(label=>inside(cubicAt(curve,(from+to)/2),label)))result.push(cubicPart(curve,from,to));}
  }return result;
}
