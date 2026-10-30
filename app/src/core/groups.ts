import type { BoardState, CommandBus, Command } from './commands';
import { nextId, type Widget, createWidget } from './model';
import { widgetAABB, unionRect, rotate, type Vec } from './geometry';
import { connectorBounds, connectorGeometry, resolveEndpoint, type Connector } from './connectors';
import { strokeBounds, type Stroke } from './strokes';

export function groupLeaves(s:BoardState,id:string,seen=new Set<string>()):string[] {
  if(seen.has(id))return [];seen.add(id);
  const members=s.groups.get(id);
  return members ? [...new Set(members.flatMap(m=>groupLeaves(s,m,seen)))] : s.widgets.has(id)||s.connectors.has(id)||s.strokes.has(id) ? [id] : [];
}
export function selectionRoots(s:BoardState,selection=s.selection):string[] {
  const candidates=[...s.groups.keys()].filter(id=>{const leaves=groupLeaves(s,id);return leaves.length>0&&leaves.every(m=>selection.has(m));});
  const nested=new Set(candidates.flatMap(id=>s.groups.get(id)!.filter(m=>s.groups.has(m))));
  const roots=candidates.filter(id=>!nested.has(id));
  const covered=new Set(roots.flatMap(id=>groupLeaves(s,id)));
  return [...roots,...selection].filter(id=>s.groups.has(id)||!covered.has(id));
}
export function memberSelection(s:BoardState,id:string,scope:string|null=null):string[] {
  const roots=scope ? s.groups.get(scope)??[] : [...s.groups.keys()].filter(g=>![...s.groups.values()].some(m=>m.includes(g)));
  const group=roots.find(g=>s.groups.has(g)&&groupLeaves(s,g).includes(id));
  return group ? groupLeaves(s,group) : [id];
}
export function enclosingGroup(s:BoardState,id:string,scope:string|null=null):string|null {
  const roots=scope ? s.groups.get(scope)??[] : [...s.groups.keys()].filter(g=>![...s.groups.values()].some(m=>m.includes(g)));
  return roots.find(g=>s.groups.has(g)&&groupLeaves(s,g).includes(id))??null;
}
export function groupSelection(s:BoardState,bus:CommandBus){const roots=selectionRoots(s);if(roots.length<2)return;bus.exec({op:'GROUP_CREATE',payload:{id:nextId('group'),items:roots}});}
export function ungroupSelection(s:BoardState,bus:CommandBus){bus.beginTransaction('Desagrupar');for(const id of selectionRoots(s))if(s.groups.has(id))bus.exec({op:'GROUP_REMOVE',payload:id});bus.endTransaction();}
export function itemLocked(s:BoardState,id:string):boolean {return !!(s.widgets.get(id)??s.connectors.get(id)??s.strokes.get(id))?.locked;}
export function entityRect(s:BoardState,id:string){const w=s.widgets.get(id);if(w)return widgetAABB(w);const c=s.connectors.get(id);if(c){const g=connectorGeometry(c,s.widgets);if(g)return connectorBounds(g);}const st=s.strokes.get(id);return st?strokeBounds(st):null;}
export function selectedBounds(s:BoardState,ids=[...s.selection]){return unionRect(ids.map(id=>entityRect(s,id)).filter((r):r is NonNullable<typeof r>=>!!r));}
export type EntitySnapshot={widgets:Widget[];connectors:Connector[];strokes:Stroke[];groups:Array<[string,string[]]>};
export function captureSelection(s:BoardState,ids=[...s.selection],includeInternal=true):EntitySnapshot {
  const set=new Set(ids),widgets=ids.map(id=>s.widgets.get(id)).filter((w):w is Widget=>!!w);
  const connectors=[...s.connectors.values()].filter(c=>set.has(c.id)||includeInternal&&c.start.kind==='anchor'&&c.end.kind==='anchor'&&set.has(c.start.widgetId)&&set.has(c.end.widgetId));
  const strokes=ids.map(id=>s.strokes.get(id)).filter((v):v is Stroke=>!!v);
  const groups=[...s.groups].filter(([id])=>groupLeaves(s,id).every(m=>set.has(m))&&groupLeaves(s,id).length>0);
  return structuredClone({widgets,connectors,strokes,groups});
}
export function transformSnapshot(s:BoardState,snapshot:EntitySnapshot,dx:number,dy:number,sx=1,sy=1,origin:Vec={x:0,y:0},angle=0):Command[] {
  const point=(p:Vec)=>{const v=rotate({x:(p.x-origin.x)*sx,y:(p.y-origin.y)*sy},angle);return {x:origin.x+v.x+dx,y:origin.y+v.y+dy};};
  const cmds:Command[]=[];
  for(const w of snapshot.widgets){if(w.locked)continue;const c=point({x:w.x+w.width/2,y:w.y+w.height/2}),width=w.width*sx,height=w.height*sy;cmds.push({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{x:c.x-width/2,y:c.y-height/2,width,height,rotation:w.rotation+angle}}});}
  for(const c of snapshot.connectors){if(c.locked)continue;const endpoint=(e:Connector['start'])=>e.kind==='anchor'?e:{...e,...point(e)};cmds.push({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{start:endpoint(c.start),end:endpoint(c.end),controlPoint:c.controlPoint?point(c.controlPoint):null,waypoints:c.waypoints?.map(point)??null}}});}
  for(const st of snapshot.strokes){if(st.locked)continue;cmds.push({op:'STROKE_UPDATE',payload:{id:st.id,patch:{points:st.points.map(p=>({...point(p),r:p.r*Math.sqrt(Math.abs(sx*sy))}))}}});}
  return cmds;
}
export function duplicateSnapshot(s:BoardState,bus:CommandBus,snapshot:EntitySnapshot,dx=24,dy=24){
  const map=new Map<string,string>();for(const item of [...snapshot.widgets,...snapshot.connectors,...snapshot.strokes])map.set(item.id,nextId(item.type));for(const [id] of snapshot.groups)map.set(id,nextId('group'));
  const point=(p:Vec)=>({x:p.x+dx,y:p.y+dy});const ids:string[]=[];bus.beginTransaction('Duplicar seleção');
  for(const w of snapshot.widgets){const id=map.get(w.id)!;bus.exec({op:'WIDGET_CREATE',payload:{...w,id,x:w.x+dx,y:w.y+dy,locked:false}});ids.push(id);}
  for(const c of snapshot.connectors){const endpoint=(e:Connector['start'])=>e.kind==='point'?{kind:'point',...point(e)}:map.has(e.widgetId)?{...e,widgetId:map.get(e.widgetId)!}:{kind:'point',...point(resolveEndpoint(e,s.widgets)!)};const id=map.get(c.id)!;bus.exec({op:'CONNECTOR_CREATE',payload:{...c,id,start:endpoint(c.start),end:endpoint(c.end),controlPoint:c.controlPoint?point(c.controlPoint):null,waypoints:c.waypoints?.map(point)??null,locked:false}});ids.push(id);}
  for(const st of snapshot.strokes){const id=map.get(st.id)!;bus.exec({op:'STROKE_CREATE',payload:{...st,id,locked:false,points:st.points.map(p=>({...p,...point(p)}))}});ids.push(id);}
  for(const [id,members] of snapshot.groups)bus.exec({op:'GROUP_CREATE',payload:{id:map.get(id)!,items:members.map(m=>map.get(m)).filter(Boolean)}});
  bus.exec({op:'SELECTION_SET',payload:ids});bus.endTransaction();
}
export function frameSelection(s:BoardState,bus:CommandBus){const r=selectedBounds(s);if(!r)return;bus.exec({op:'WIDGET_CREATE',payload:createWidget('frame',{x:r.minX-40,y:r.minY-50,width:r.maxX-r.minX+80,height:r.maxY-r.minY+90,content:'Quadro'})});}
