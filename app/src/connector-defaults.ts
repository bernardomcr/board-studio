import type { CapStyle, Connector, ConnectorShape } from './core/connectors';

export interface ConnectorDefaults { shape: ConnectorShape; style: Connector['style'] }
const KEY='board-studio-connector-defaults-v1';
const initial=():ConnectorDefaults=>({shape:'curved',style:{strokeColor:'#1a1a1a',strokeWidth:2,startCap:'none',endCap:'none',strokeStyle:'normal'}});
const caps:CapStyle[]=['none','arrow','triangle','circle','diamond','bar'];
function normalized(value:unknown,base=initial()):ConnectorDefaults{
  if(!value||typeof value!=='object')return base;
  const raw=value as Partial<ConnectorDefaults>,style=raw.style;
  return {shape:['straight','elbowed','curved'].includes(raw.shape??'')?raw.shape!:base.shape,style:{
    strokeColor:style&&typeof style.strokeColor==='string'&&/^(#[\da-f]{3,8}|transparent|black|white|rgba?\([\d\s.,%]+\))$/i.test(style.strokeColor)?style.strokeColor:base.style.strokeColor,
    strokeWidth:style&&Number.isFinite(style.strokeWidth)&&style.strokeWidth>0?style.strokeWidth:base.style.strokeWidth,
    startCap:style&&caps.includes(style.startCap!)?style.startCap:base.style.startCap,
    endCap:style&&caps.includes(style.endCap!)?style.endCap:base.style.endCap,
    strokeStyle:style&&['normal','dashed','dotted'].includes(style.strokeStyle??'')?style.strokeStyle:base.style.strokeStyle,
  }};
}
let retained:ConnectorDefaults|undefined;
/** User preferences are independent of board selection and undo history. */
export function connectorDefaults():ConnectorDefaults{
  if(!retained){try{retained=normalized(JSON.parse(localStorage.getItem(KEY)??'null'));}catch{retained=initial();}}
  return {shape:retained.shape,style:{...retained.style}};
}
export function rememberConnectorDefaults(patch:{shape?:ConnectorShape;style?:Partial<Connector['style']>}):void{
  const before=connectorDefaults();
  retained=normalized({shape:patch.shape??before.shape,style:{...before.style,...patch.style}},before);
  try{localStorage.setItem(KEY,JSON.stringify(retained));}catch{/* Editing remains available when local storage is full. */}
}
