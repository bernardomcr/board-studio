import type { BoardState, CommandBus, Command } from './commands';
import { nextId, type Widget, createWidget } from './model';
import { widgetAABB, unionRect, rotate, type Vec } from './geometry';
import { connectorBounds, connectorGeometry, resolveEndpoint, type Connector } from './connectors';
import { strokeBounds, type Stroke } from './strokes';
import {scaledWidgetStyle} from './style-scale';

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
export function entityRect(s:BoardState,id:string){const item=s.widgets.get(id)??s.connectors.get(id)??s.strokes.get(id);if(item?.hidden)return null;const w=s.widgets.get(id);if(w)return widgetAABB(w);const c=s.connectors.get(id);if(c){const g=connectorGeometry(c,s.widgets);if(g)return connectorBounds(g);}const st=s.strokes.get(id);return st?strokeBounds(st):null;}
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
  for(const w of snapshot.widgets){if(w.locked)continue;const c=point({x:w.x+w.width/2,y:w.y+w.height/2}),uniform=Math.sqrt(Math.abs(sx*sy)),width=w.width*(w.type==='text'?uniform:sx),height=w.height*(w.type==='text'?uniform:sy);cmds.push({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{x:c.x-width/2,y:c.y-height/2,width,height,rotation:w.rotation+angle,style:scaledWidgetStyle(w,sx,sy),...(w.type==='text'?{textSizing:'natural'}:{})}}});}
  for(const c of snapshot.connectors){if(c.locked)continue;const endpoint=(e:Connector['start'])=>e.kind==='anchor'?e:{...e,...point(e)};cmds.push({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{start:endpoint(c.start),end:endpoint(c.end),controlPoint:c.controlPoint?point(c.controlPoint):null,waypoints:c.waypoints?.map(point)??null}}});}
  for(const st of snapshot.strokes){if(st.locked)continue;cmds.push({op:'STROKE_UPDATE',payload:{id:st.id,patch:{points:st.points.map(p=>({...point(p),r:p.r*Math.sqrt(Math.abs(sx*sy))}))}}});}
  return cmds;
}

export type ArrangeMode='left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'|'dist-x'|'dist-y';

/** An isolated group exposes its children as roots, while nested groups stay intact. */
export function arrangementRoots(s:BoardState,scope:string|null=null):string[] {
  if(!scope||!s.groups.has(scope))return selectionRoots(s);
  const visit=(id:string):string[]=>{
    const leaves=groupLeaves(s,id),chosen=leaves.filter(leaf=>s.selection.has(leaf));
    if(!chosen.length)return [];
    if(chosen.length===leaves.length)return [id];
    return s.groups.has(id)?s.groups.get(id)!.flatMap(visit):chosen;
  };
  return s.groups.get(scope)!.flatMap(visit);
}

/** Align complete selection roots using their visible geometry and one undo step. */
export function arrangeSelection(s:BoardState,bus:CommandBus,mode:ArrangeMode,scope:string|null=null):boolean {
  const roots=arrangementRoots(s,scope).map(id=>{
    const leaves=groupLeaves(s,id),bounds=selectedBounds(s,leaves);
    return bounds?{id,leaves,bounds,snapshot:captureSelection(s,leaves)}:null;
  }).filter((root):root is NonNullable<typeof root>=>!!root);
  const distribute=mode==='dist-x'||mode==='dist-y';
  if(roots.length<(distribute?3:2)||roots.some(root=>root.leaves.some(id=>itemLocked(s,id))))return false;
  const minX=Math.min(...roots.map(r=>r.bounds.minX)),maxX=Math.max(...roots.map(r=>r.bounds.maxX));
  const minY=Math.min(...roots.map(r=>r.bounds.minY)),maxY=Math.max(...roots.map(r=>r.bounds.maxY));
  const translations=new Map<string,Vec>();
  if(distribute){
    const horizontal=mode==='dist-x',start=horizontal?'minX':'minY',end=horizontal?'maxX':'maxY';
    const sorted=[...roots].sort((a,b)=>a.bounds[start]-b.bounds[start]);
    const span=sorted.at(-1)!.bounds[end]-sorted[0]!.bounds[start];
    const gap=(span-sorted.reduce((sum,root)=>sum+root.bounds[end]-root.bounds[start],0))/(sorted.length-1);
    let cursor=sorted[0]!.bounds[start];
    for(const root of sorted){const delta=cursor-root.bounds[start];translations.set(root.id,horizontal?{x:delta,y:0}:{x:0,y:delta});cursor+=root.bounds[end]-root.bounds[start]+gap;}
  }else for(const root of roots){
    const b=root.bounds;
    const dx=mode==='left'?minX-b.minX:mode==='right'?maxX-b.maxX:mode==='hcenter'?(minX+maxX-b.minX-b.maxX)/2:0;
    const dy=mode==='top'?minY-b.minY:mode==='bottom'?maxY-b.maxY:mode==='vcenter'?(minY+maxY-b.minY-b.maxY)/2:0;
    translations.set(root.id,{x:dx,y:dy});
  }
  const commands:Command[]=[];
  for(const root of roots){
    const delta=translations.get(root.id)!;if(Math.abs(delta.x)+Math.abs(delta.y)<1e-8)continue;
    // A separately selected connector is its own root, even when both anchors are selected.
    root.snapshot.connectors=root.snapshot.connectors.filter(c=>!s.selection.has(c.id)||root.leaves.includes(c.id));
    commands.push(...transformSnapshot(s,root.snapshot,delta.x,delta.y));
  }
  if(!commands.length)return false;
  bus.exec({op:'BATCH',payload:{label:distribute?'Distribuir seleção':'Alinhar seleção',commands}});return true;
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
