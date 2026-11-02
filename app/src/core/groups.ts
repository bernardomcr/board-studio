import type { BoardState, CommandBus, Command } from './commands';
import { nextId, type Widget, createWidget } from './model';
import { widgetAABB, unionRect, rotate, type Vec } from './geometry';
import { connectorBounds, connectorGeometry, resolveEndpoint, type Connector } from './connectors';
import { strokeBounds, type Stroke } from './strokes';
import {scaledWidgetStyle} from './style-scale';
import {isFreeText,isBoxText} from './text-layout';
import {mindSubtree,mindNodeHidden,mindConnectorHidden} from './mindmap';

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
export function entityRect(s:BoardState,id:string){const item=s.widgets.get(id)??s.connectors.get(id)??s.strokes.get(id);if(item?.hidden)return null;const w=s.widgets.get(id);if(w)return mindNodeHidden(s,id)?null:widgetAABB(w);const c=s.connectors.get(id);if(c){if(mindConnectorHidden(s,c))return null;const g=connectorGeometry(c,s.widgets);if(g)return connectorBounds(g);}const st=s.strokes.get(id);return st?strokeBounds(st):null;}
export function selectedBounds(s:BoardState,ids=[...s.selection]){return unionRect(ids.map(id=>entityRect(s,id)).filter((r):r is NonNullable<typeof r>=>!!r));}
export type EntitySnapshot={widgets:Widget[];connectors:Connector[];strokes:Stroke[];groups:Array<[string,string[]]>;endpointPositions?:Record<string,{start:Vec|null;end:Vec|null}>};
export function captureSelection(s:BoardState,ids=[...s.selection],includeInternal=true):EntitySnapshot {
  ids=[...new Set(ids.flatMap(id=>s.widgets.get(id)?.mind?mindSubtree(s,id):[id]))];
  const set=new Set(ids),widgets=ids.map(id=>s.widgets.get(id)).filter((w):w is Widget=>!!w);
  const connectors=[...s.connectors.values()].filter(c=>set.has(c.id)||includeInternal&&c.start.kind==='anchor'&&c.end.kind==='anchor'&&set.has(c.start.widgetId)&&set.has(c.end.widgetId));
  const strokes=ids.map(id=>s.strokes.get(id)).filter((v):v is Stroke=>!!v);
  const groups=[...s.groups].filter(([id])=>groupLeaves(s,id).every(m=>set.has(m))&&groupLeaves(s,id).length>0);
  // Keep anchor references for transforms and their copy-time positions for paste.
  const endpointPositions=Object.fromEntries(connectors.map(c=>[c.id,{start:resolveEndpoint(c.start,s.widgets),end:resolveEndpoint(c.end,s.widgets)}]));
  return structuredClone({widgets,connectors,strokes,groups,endpointPositions});
}
export function transformSnapshot(s:BoardState,snapshot:EntitySnapshot,dx:number,dy:number,sx=1,sy=1,origin:Vec={x:0,y:0},angle=0):Command[] {
  const point=(p:Vec)=>{const v=rotate({x:(p.x-origin.x)*sx,y:(p.y-origin.y)*sy},angle);return {x:origin.x+v.x+dx,y:origin.y+v.y+dy};};
  const cmds:Command[]=[];
  // Moving does not change typography, border proportions or local geometry.
  // Sending a complete style/size patch here used to invalidate every text-fit
  // cache and repeat natural-text measurement on each pointer frame.
  const translating=sx===1&&sy===1&&angle===0;
  const resizing=sx!==1||sy!==1,snapshotWidgets=resizing?new Map(snapshot.widgets.map(w=>[w.id,w])):undefined;
  const captured=resizing?new Set(snapshot.widgets.filter(w=>!w.locked).map(w=>w.id)):undefined;
  const scaledMaps=new Set(resizing?snapshot.widgets.filter(w=>w.mind?.parentId===null&&mindSubtree(s,w.id).every(id=>captured!.has(id))).map(w=>w.id):[]);
  for(const w of snapshot.widgets){
    if(w.locked)continue;
    if(translating){cmds.push({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{x:w.x+dx,y:w.y+dy}}});continue;}
    const c=point({x:w.x+w.width/2,y:w.y+w.height/2}),uniform=Math.sqrt(Math.abs(sx*sy)),square=w.type==='sticky_note'&&(sx!==1||sy!==1),width=square?Math.sqrt(w.width*w.height)*uniform:w.width*(isFreeText(w)?uniform:sx),height=square?width:w.height*(isFreeText(w)?uniform:sy),wholeMap=!!w.mind&&scaledMaps.has(w.mind.rootId);
    const mind=wholeMap?{...w.mind!,layoutScale:(w.mind!.layoutScale??snapshotWidgets!.get(w.mind!.rootId)?.mind?.layoutScale??1)*uniform}:undefined;
    cmds.push({op:'WIDGET_UPDATE',payload:{id:w.id,patch:{x:c.x-width/2,y:c.y-height/2,width,height,rotation:w.rotation+angle,style:{...scaledWidgetStyle(w,square?width/w.width:sx,square?height/w.height:sy),...(isBoxText(w)&&!wholeMap?{fontSize:w.style.fontSize}:{})},...(mind?{mind}:{}),...(isFreeText(w)?{textSizing:'natural'}:{})}}});
  }
  for(const c of snapshot.connectors){if(c.locked)continue;const endpoint=(e:Connector['start'])=>e.kind==='anchor'?e:{...e,...point(e)},scale=Math.sqrt(Math.abs(sx*sy)),wholeMap=!!c.mindBranch&&scaledMaps.has(s.widgets.get(c.mindBranch)?.mind?.rootId??'');cmds.push({op:'CONNECTOR_UPDATE',payload:{id:c.id,patch:{start:endpoint(c.start),end:endpoint(c.end),controlPoint:c.controlPoint?point(c.controlPoint):null,waypoints:c.waypoints?.map(point)??null,...(wholeMap&&scale!==1?{style:{...c.style,strokeWidth:c.style.strokeWidth*scale}}:{}),...(scale!==1&&c.captions?.length?{captionStyles:c.captions.map((_,i)=>({...c.captionStyles?.[i],fontSize:(c.captionStyles?.[i]?.fontSize??14)*scale}))}:{})}}});}
  for(const st of snapshot.strokes){if(st.locked)continue;const scale=Math.sqrt(Math.abs(sx*sy));cmds.push({op:'STROKE_UPDATE',payload:{id:st.id,patch:{points:st.points.map(p=>({...point(p),r:p.r*scale})),...(st.precisionSmoothing===undefined?{}:{precisionSmoothing:st.precisionSmoothing*scale}),...(st.erasures?{erasures:st.erasures.map(e=>({radius:e.radius*scale,points:e.points.map(point)}))}:{})}}});}
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
  const copiedWidgets=new Map(snapshot.widgets.map(w=>[w.id,w]));
  const copiedMind=(w:Widget)=>{
    if(!w.mind)return undefined;
    let root=w;const seen=new Set<string>([w.id]);
    while(root.mind?.parentId&&copiedWidgets.has(root.mind.parentId)&&!seen.has(root.mind.parentId)){seen.add(root.mind.parentId);root=copiedWidgets.get(root.mind.parentId)!;}
    const parentId=w.mind.parentId&&map.has(w.mind.parentId)?map.get(w.mind.parentId)!:null;
    return {...w.mind,rootId:map.get(root.id)!,parentId,...(parentId?{}:{order:0,layout:w.mind.layout??w.mind.side})};
  };
  const point=(p:Vec)=>({x:p.x+dx,y:p.y+dy});
  // Resolve before publishing so an invalid legacy snapshot cannot leave a
  // partially duplicated selection or an unfinished history entry.
  const copiedConnectors=snapshot.connectors.map(c=>{
    const endpoint=(field:'start'|'end'):Connector['start']=>{
      const e=c[field];if(e.kind==='point')return {kind:'point',...point(e)};
      if(map.has(e.widgetId))return {...e,widgetId:map.get(e.widgetId)!};
      const resolved=snapshot.endpointPositions?.[c.id]?.[field]??resolveEndpoint(e,s.widgets);
      if(!resolved)throw new Error('A conexão copiada não possui uma posição válida para a ponta.');
      return {kind:'point',...point(resolved)};
    };
    const mindBranch=c.mindBranch&&map.has(c.mindBranch)&&c.start.kind==='anchor'&&c.end.kind==='anchor'&&map.has(c.start.widgetId)&&map.has(c.end.widgetId)?map.get(c.mindBranch):undefined;
    return {...c,id:map.get(c.id)!,mindBranch,start:endpoint('start'),end:endpoint('end'),controlPoint:c.controlPoint?point(c.controlPoint):null,waypoints:c.waypoints?.map(point)??null,locked:false,layerOwnLocked:undefined};
  });
  const ids:string[]=[],commands:Command[]=[];
  for(const w of snapshot.widgets){const id=map.get(w.id)!;commands.push({op:'WIDGET_CREATE',payload:{...w,id,mind:copiedMind(w),x:w.x+dx,y:w.y+dy,locked:false,layerOwnLocked:undefined}});ids.push(id);}
  for(const c of copiedConnectors){commands.push({op:'CONNECTOR_CREATE',payload:c});ids.push(c.id);}
  for(const st of snapshot.strokes){const id=map.get(st.id)!;commands.push({op:'STROKE_CREATE',payload:{...st,id,locked:false,layerOwnLocked:undefined,points:st.points.map(p=>({...p,...point(p)})),...(st.erasures?{erasures:st.erasures.map(e=>({...e,points:e.points.map(point)}))}:{})}});ids.push(id);}
  for(const [id,members] of snapshot.groups)commands.push({op:'GROUP_CREATE',payload:{id:map.get(id)!,items:members.map(m=>map.get(m)).filter(Boolean)}});
  commands.push({op:'SELECTION_SET',payload:ids});
  bus.exec({op:'BATCH',payload:{label:'Duplicar seleção',commands}});
}
export function frameSelection(s:BoardState,bus:CommandBus){const r=selectedBounds(s);if(!r)return;bus.exec({op:'WIDGET_CREATE',payload:createWidget('frame',{x:r.minX-40,y:r.minY-50,width:r.maxX-r.minX+80,height:r.maxY-r.minY+90,content:'Quadro'})});}
