/**
 * Command bus + histórico.
 *
 * Padrão extraído do Miro: nenhuma mutação acontece fora de um comando.
 *   commander.exec("WIDGET_CREATE" | "WIDGET_UPDATE" | "WIDGET_REMOVE" | ...)
 * Cada comando devolve o seu inverso, e o undo é só executar inversos.
 */

import type { TextWidget,Widget } from "./model";
import {
  resolveEndpoint,
  type Connector,
  type Endpoint,
} from "./connectors";
import {inheritStrokeFittingCache,type Stroke} from "./strokes";
import { DEFAULT_BACKGROUND, validateBoardBackground, copyBoardBackground, type BoardBackground, type BackgroundPatch } from "./background";
import { isFreeText,naturalText } from './text-layout';
import { relativeBorderScale } from './style-scale';
import { canDeleteMindSubtree, mindLayoutCommands, mindSubtree } from './mindmap';
import {ensureBoardLayers,projectLayerItem,prepareLayerPatch,syncBoardLayers,validateBoardLayers,ownLayerFlags,boardLayerFlags,boardLayerOrder,layerDescendants,LAYER_Z_STRIDE,type BoardLayers} from './board-layers';

export type CommandOp =
  | "BATCH"
  | "LAYERS_SET"
  | "LAYERS_ACTIVE"
  | "LAYERS_LOCK"
  | "BACKGROUND_UPDATE"
  | "WIDGET_CREATE"
  | "WIDGET_UPDATE"
  | "WIDGET_REMOVE"
  | "WIDGET_TRANSLATE"
  | "WIDGET_REORDER"
  | "WIDGET_ALIGN"
  | "WIDGET_DISTRIBUTE"
  | "CONNECTOR_CREATE"
  | "CONNECTOR_UPDATE"
  | "CONNECTOR_REMOVE"
  | "STROKE_CREATE"
  | "STROKE_REMOVE"
  | "STROKE_UPDATE"
  | "GROUP_CREATE"
  | "GROUP_REMOVE"
  | "ENTITY_LOCK"
  | "SELECTION_SET";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "x" | "y";

export interface BoardState {
  layers?:BoardLayers;
  /** Optional for projects saved before background controls existed. */
  background?: BoardBackground;
  widgets: Map<string, Widget>;
  order: string[];
  connectors: Map<string, Connector>;
  connectorOrder: string[];
  strokes: Map<string, Stroke>;
  strokeOrder: string[];
  /** grupos lógicos: id do grupo → ids dos membros */
  groups: Map<string, string[]>;
  selection: Set<string>;
}

export interface Command<Payload = unknown> {
  op: CommandOp;
  payload: Payload;
}

export interface ExecutedCommand {
  label: string;
  command: Command;
  redo: () => void;
  undo: () => void;
}

/** Absolute updates in one pointer gesture supersede the preceding frame.
 * Preserve normalized patches for journal replay, the first inverse, and the
 * last complete redo. Creates, selections and additive moves are barriers. */
function mergeAbsoluteUpdates(before:Command,after:Command):Command|null {
  if(before.op!==after.op)return null;
  if(after.op==='BACKGROUND_UPDATE')return {op:'BACKGROUND_UPDATE',payload:{...(before.payload as BackgroundPatch),...(after.payload as BackgroundPatch)}};
  if(after.op==='BATCH'){
    const a=before.payload as {label?:string;commands:Command[]},b=after.payload as {label?:string;commands:Command[]};
    if(a.commands.length!==b.commands.length||!b.commands.length)return null;
    const commands:Command[]=[];
    for(let i=0;i<b.commands.length;i++){const merged=mergeAbsoluteUpdates(a.commands[i]!,b.commands[i]!);if(!merged)return null;commands.push(merged);}
    return {op:'BATCH',payload:{label:b.label??a.label,commands}};
  }
  if(!['WIDGET_UPDATE','CONNECTOR_UPDATE','STROKE_UPDATE'].includes(after.op))return null;
  const a=before.payload as {id:string;patch:Record<string,unknown>;mindLayoutScale?:number},b=after.payload as {id:string;patch:Record<string,unknown>;mindLayoutScale?:number};
  if(a.id!==b.id)return null;
  const mindLayoutScale=after.op==='WIDGET_UPDATE'?(b.mindLayoutScale??('mind' in b.patch?undefined:a.mindLayoutScale)):undefined;
  return {op:after.op,payload:{id:b.id,patch:{...a.patch,...b.patch},...(mindLayoutScale===undefined?{}:{mindLayoutScale})}};
}

function retainGestureEntry(entries:ExecutedCommand[],entry:ExecutedCommand):void {
  const previous=entries.at(-1),merged=previous&&mergeAbsoluteUpdates(previous.command,entry.command);
  if(previous&&merged)entries[entries.length-1]={label:entry.label,command:merged,undo:previous.undo,redo:entry.redo};
  else entries.push(entry);
}

function inheritDrawingCaches(source:Command,target:Command):void {
  if(source.op==='STROKE_CREATE'&&target.op==='STROKE_CREATE')inheritStrokeFittingCache(source.payload as Stroke,target.payload as Stroke);
  else if(source.op==='BATCH'&&target.op==='BATCH'){
    const a=(source.payload as {commands:Command[]}).commands,b=(target.payload as {commands:Command[]}).commands;
    for(let i=0;i<a.length;i++)inheritDrawingCaches(a[i]!,b[i]!);
  }
}

function removeGroupMember(state:BoardState,id:string):void {
  let gone=[id];while(gone.length){const next:string[]=[];for(const [gid,members] of state.groups){const remaining=members.filter(m=>!gone.includes(m));if(!remaining.length){state.groups.delete(gid);next.push(gid);}else if(remaining.length!==members.length)state.groups.set(gid,remaining);}gone=next;}
}
function affectsLayerOrder(c:Command):boolean {if(c.op==='BATCH')return (c.payload as {commands:Command[]}).commands.some(affectsLayerOrder);if(['WIDGET_CREATE','STROKE_CREATE','CONNECTOR_CREATE','WIDGET_REORDER','LAYERS_SET'].includes(c.op))return true;if(['WIDGET_UPDATE','CONNECTOR_UPDATE','STROKE_UPDATE'].includes(c.op)){const p=(c.payload as {patch:Record<string,unknown>}).patch;return 'z'in p||'layerId'in p;}return false;}
export class CommandBus {
  readonly undoStack: ExecutedCommand[] = [];
  readonly redoStack: ExecutedCommand[] = [];
  private prefixApplied: Command[] = [];
  private transaction: { label: string; entries: ExecutedCommand[] } | null = null;

  constructor(
    private readonly state: BoardState,
    private readonly onChange: () => void,
    private readonly limit = 500,
    private readonly canMutate = () => true,
  ) {}

  private topZ(): number {
    let max = 0;
    for (const id of this.state.order) {
      const w = this.state.widgets.get(id);
      if (w) max = Math.max(max, w.z);
    }
    for(const item of [...this.state.connectors.values(),...this.state.strokes.values()])max=Math.max(max,item.z);
    return max;
  }
  private placementZ(layerId:string|undefined,bottom=false):number {
    const s=this.state,order=boardLayerOrder(ensureBoardLayers(s));if(order.length<2)return bottom?Math.min(0,...[...s.widgets.values(),...s.connectors.values(),...s.strokes.values()].map(item=>item.z))-1:this.topZ()+1;
    const rank=new Map(order.map((id,i)=>[id,i])),at=rank.get(layerId??'')??0;let low=-Infinity,high=Infinity,hasOwn=false;
    for(const item of [...s.widgets.values(),...s.connectors.values(),...s.strokes.values()]){const index=rank.get(item.layerId??'')??0;if(index===at)hasOwn=true;if(index<at||index===at&&!bottom)low=Math.max(low,item.z);else high=Math.min(high,item.z);}
    if(!Number.isFinite(low))return Number.isFinite(high)?high-(hasOwn?1:LAYER_Z_STRIDE):1;if(!Number.isFinite(high))return low+(hasOwn?1:LAYER_Z_STRIDE);
    // Insert between neighboring layers without changing every existing record
    // (important when adding many brush strokes below a large image layer).
    const z=hasOwn?(bottom?high-1:low+1):low+(high-low)/2;return z>low&&z<high?z:NaN;
  }
  private rebalanceCreation(command:Command):ExecutedCommand|null {
    const create={...command};command.op='BATCH';command.payload={label:'Inserir na camada',commands:[{op:'LAYERS_SET',payload:{document:ensureBoardLayers(this.state),rebalance:true}},create]};return this.execute(command);
  }

  exec(command: Command): void {
    if(!this.canMutate())return;
    const source=command;command=structuredClone(command);inheritDrawingCaches(source,command);
    // Every interactive creation belongs to the active layer, including paste,
    // imports and duplicates. Journal replay uses its recorded membership.
    let creationDocument=ensureBoardLayers(this.state),blockedCreation=false;
    const assign=(c:Command)=>{if(c.op==='BATCH')for(const child of (c.payload as {commands:Command[]}).commands)assign(child);else if(c.op==='LAYERS_SET')creationDocument=validateBoardLayers((c.payload as {document:BoardLayers}).document);else if(c.op==='LAYERS_ACTIVE')creationDocument={...creationDocument,activeId:c.payload as string};else if(c.op==='LAYERS_LOCK'){const {ids,locked}=c.payload as {ids:string[];locked:boolean};creationDocument={...creationDocument,nodes:creationDocument.nodes.map(node=>ids.includes(node.id)?{...node,locked}:node)};}else if(['WIDGET_CREATE','CONNECTOR_CREATE','STROKE_CREATE'].includes(c.op)){const flags=boardLayerFlags(creationDocument,creationDocument.activeId);blockedCreation||=flags.hidden||flags.locked;const own=ownLayerFlags(c.payload as Widget);c.payload={...own,layerId:creationDocument.activeId};}};assign(command);if(blockedCreation)return;
    const executed = this.execute(command,true);
    if (!executed) return;
    executed.redo();
    if(command.op==='BATCH'&&!(command.payload as {commands:Command[]}).commands.length)return;
    if(affectsLayerOrder(command))syncBoardLayers(this.state);
    // Choosing an object must neither consume Undo nor discard content Redo.
    // Selection inside a content BATCH is still restored with that operation.
    if((command.op==='SELECTION_SET'||command.op==='LAYERS_ACTIVE')&&!this.transaction){this.onChange();return;}
    if (this.transaction) {
      retainGestureEntry(this.transaction.entries,{ ...executed, command });
    }
    else this.pushUndo({ ...executed, command });
    if(command.op!=='SELECTION_SET'&&command.op!=='LAYERS_ACTIVE')this.redoStack.length = 0;
    this.onChange();
  }

  private pushUndo(entry: ExecutedCommand): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.prefixApplied.push(this.undoStack.shift()!.command);
  }

  /** Groups a pointer gesture into one undo step while preserving live previews. */
  beginTransaction(label = "edit"): void {
    this.endTransaction();
    this.transaction = { label, entries: [] };
  }

  endTransaction(): void {
    const pending = this.transaction;
    this.transaction = null;
    if (!pending?.entries.length||pending.entries.every(entry=>entry.command.op==='SELECTION_SET'||entry.command.op==='LAYERS_ACTIVE')) return;
    const entries = pending.entries;
    this.pushUndo({
      label: pending.label,
      command: { op: "BATCH", payload: { label: pending.label, commands: entries.map(entry => entry.command) } },
      redo: () => { for (const entry of entries) entry.redo(); },
      undo: () => { for (const entry of [...entries].reverse()) entry.undo(); },
    });
    this.onChange();
  }

  /** Constrói o par redo/undo sem mutar o estado. Quem aplica é o chamador. */
  private execute(command: Command,respectLocks=false): ExecutedCommand | null {
    const s = this.state;
    // Input/UI checks are not an authorization boundary: delayed editors,
    // clipboard handlers and composite actions must respect the current lock.
    // Journal replay and Undo/Redo use their recorded inverse without this
    // interactive guard, preserving older files and exact history semantics.
    const entity=(id:string)=>s.widgets.get(id)??s.connectors.get(id)??s.strokes.get(id);
    const lockedTree=(id:string,seen=new Set<string>()):boolean=>{if(seen.has(id))return false;seen.add(id);return !!entity(id)?.locked||(s.groups.get(id)??[]).some(member=>lockedTree(member,seen));};
    if(respectLocks){
      if(['WIDGET_CREATE','CONNECTOR_CREATE','STROKE_CREATE','GROUP_CREATE'].includes(command.op)&&lockedTree((command.payload as {id:string}).id))return null;
      if(['WIDGET_CREATE','CONNECTOR_CREATE','STROKE_CREATE'].includes(command.op)){const doc=ensureBoardLayers(s),flags=boardLayerFlags(doc,(command.payload as {layerId?:string}).layerId??doc.activeId);if(flags.hidden||flags.locked)return null;}
      if(['WIDGET_UPDATE','CONNECTOR_UPDATE','STROKE_UPDATE'].includes(command.op)){
        const {id,patch,mindLayoutScale}=command.payload as {id:string;patch:Record<string,unknown>;mindLayoutScale?:number};
        // Visibility is a view control, available from the layers panel. A
        // locked object's content, geometry, style and lock cannot be patched.
        if(lockedTree(id)&&(mindLayoutScale!==undefined||!Object.keys(patch).every(key=>key==='hidden')))return null;
      }
      if(['WIDGET_REMOVE','CONNECTOR_REMOVE','STROKE_REMOVE','GROUP_REMOVE'].includes(command.op)&&lockedTree(command.payload as string))return null;
      if(['WIDGET_TRANSLATE','WIDGET_REORDER','WIDGET_ALIGN','WIDGET_DISTRIBUTE'].includes(command.op)&&(command.payload as {ids:string[]}).ids.some(id=>lockedTree(id)))return null;
      if(command.op==='GROUP_CREATE'&&(command.payload as {items:string[]}).items.some(id=>lockedTree(id)))return null;
      if(command.op==='LAYERS_SET'){
        const payload=command.payload as {document:BoardLayers;assignments?:Array<[string,string]>;moving?:string[]};
        if(payload.assignments?.some(([id])=>lockedTree(id)))return null;
        const before=ensureBoardLayers(s),after=validateBoardLayers(payload.document),retained=new Set(after.nodes.map(node=>node.id));
        if([...s.widgets.values(),...s.connectors.values(),...s.strokes.values()].some(item=>item.locked&&item.layerId&&!retained.has(item.layerId)))return null;
        const protectedNodes=before.nodes.filter(node=>boardLayerFlags(before,node.id).locked);
        if(protectedNodes.length){
          const oldById=new Map(before.nodes.map(node=>[node.id,node])),newById=new Map(after.nodes.map(node=>[node.id,node]));
          const ancestry=(map:typeof oldById,id:string)=>{const ids:string[]=[];let node=map.get(id);while(node?.parentId){ids.push(node.parentId);node=map.get(node.parentId);}return ids;};
          for(const node of protectedNodes){const next=newById.get(node.id);if(!next||next.kind!==node.kind||next.name!==node.name||next.locked!==node.locked||JSON.stringify(ancestry(oldById,node.id))!==JSON.stringify(ancestry(newById,node.id)))return null;}
          // A locked group's descendants cannot escape by reparenting an
          // ancestor or dissolving/reordering its document layer. Explicit
          // ordering identifies editable subtrees; unchanged peers are bookkeeping.
          const moving=new Set<string>();for(const id of payload.moving??[]){if(!oldById.has(id))return null;const descendants=layerDescendants(before,id);if(descendants.some(key=>boardLayerFlags(before,key).locked))return null;for(const key of descendants)moving.add(key);}
          const stable=(ids:string[])=>ids.filter(id=>oldById.has(id)&&newById.has(id)&&!moving.has(id));
          if(JSON.stringify(stable(before.nodes.map(node=>node.id)))!==JSON.stringify(stable(after.nodes.map(node=>node.id)))||JSON.stringify(stable(boardLayerOrder(before)))!==JSON.stringify(stable(boardLayerOrder(after))))return null;
        }
      }
    }

    switch (command.op) {
      case 'LAYERS_ACTIVE': {
        const id=command.payload as string,doc=ensureBoardLayers(s);if(!doc.nodes.some(n=>n.id===id&&n.kind==='layer'))return null;const before=doc.activeId;
        return {command,label:'Ativar camada',redo:()=>{s.layers={...ensureBoardLayers(s),activeId:id};},undo:()=>{s.layers={...ensureBoardLayers(s),activeId:before};}};
      }
      case 'LAYERS_LOCK': {
        const {ids,locked}=command.payload as {ids:string[];locked:boolean};if(!Array.isArray(ids)||typeof locked!=='boolean')return null;
        const document=structuredClone(ensureBoardLayers(s)),selected=new Set(ids);let changed=false;
        for(const node of document.nodes){if(!selected.has(node.id)||!!node.locked===locked)continue;let ancestor=node.parentId,blocked=false;while(ancestor){const parent=document.nodes.find(item=>item.id===ancestor);if(!parent)break;if(parent.locked&&!selected.has(parent.id))blocked=true;ancestor=parent.parentId;}if(!locked&&blocked)continue;node.locked=locked;changed=true;}
        if(!changed)return null;const entry=this.execute({op:'LAYERS_SET',payload:{document}})!;
        return {...entry,command,label:locked?'Bloquear camadas':'Desbloquear camadas'};
      }
      case 'ENTITY_LOCK': {
        const {ids,locked}=command.payload as {ids:string[];locked:boolean};
        if(typeof locked!=='boolean'||!Array.isArray(ids))return null;
        const snapshots=[...new Set(ids)].flatMap(id=>{const before=entity(id);if(!before)return [];const layerLocked=boardLayerFlags(ensureBoardLayers(s),before.layerId??ensureBoardLayers(s).activeId).locked;if(!locked&&layerLocked)return [];const after=projectLayerItem(s,{...before,...prepareLayerPatch(before,{locked} as Partial<typeof before>)} as typeof before);return before.locked===after.locked&&before.layerOwnLocked===after.layerOwnLocked?[]:[{id,before,after}];});
        if(!snapshots.length)return null;
        const apply=(key:'before'|'after')=>{for(const snapshot of snapshots){const map=s.widgets.has(snapshot.id)?s.widgets:s.connectors.has(snapshot.id)?s.connectors:s.strokes;(map as Map<string,typeof snapshot.before>).set(snapshot.id,snapshot[key]);}};
        return {command,label:locked?'Bloquear objetos':'Desbloquear objetos',redo:()=>apply('after'),undo:()=>apply('before')};
      }
      case 'LAYERS_SET': {
        const payload=command.payload as {document:BoardLayers;assignments?:Array<[string,string]>;rebalance?:boolean},after=validateBoardLayers(payload.document),before=structuredClone(ensureBoardLayers(s));
        const entities=()=>[...s.widgets.values(),...s.connectors.values(),...s.strokes.values()],membership=entities().map(item=>[item.id,item.layerId] as const),zBefore=entities().map(item=>[item.id,item.z] as const);
        const assign=(values:ReadonlyArray<readonly [string,string|undefined]>)=>{for(const [id,layerId]of values){const map=s.widgets.has(id)?s.widgets:s.connectors.has(id)?s.connectors:s.strokes,item=map.get(id);if(item)(map as Map<string,typeof item>).set(id,{...item,layerId});}};
        return {command,label:'Editar camadas',redo:()=>{s.layers=structuredClone(after);assign(payload.assignments??[]);syncBoardLayers(s,!!payload.rebalance);},undo:()=>{s.layers=structuredClone(before);assign(membership);syncBoardLayers(s);for(const [id,z]of zBefore){const map=s.widgets.has(id)?s.widgets:s.connectors.has(id)?s.connectors:s.strokes,item=map.get(id);if(item&&item.z!==z)(map as Map<string,typeof item>).set(id,{...item,z});}}};
      }
      case "BACKGROUND_UPDATE": {
        const before = s.background ? copyBoardBackground(s.background) : undefined;
        const base=s.background??DEFAULT_BACKGROUND,patch=command.payload as BackgroundPatch;
        // A color/grid gesture keeps the already validated picture. Rechecking
        // its entire embedded source for every slider sample is unnecessary.
        const sameImage=patch?.image===undefined;
        const after = validateBoardBackground({ ...base, ...patch,...(sameImage?{image:undefined}:{}) });
        if (!after) return null;
        if(sameImage&&base.image)after.image={...base.image};
        return { command, label: "Alterar fundo", redo: () => { s.background = copyBoardBackground(after); }, undo: () => { if (before) s.background = copyBoardBackground(before); else delete s.background; } };
      }
      case "BATCH": {
        const { label } = command.payload as { label?: string; commands: Command[] };
        let commands=(command.payload as {commands:Command[]}).commands;
        let entries: ExecutedCommand[] | null = null;
        return {
          command,
          label: label ?? "edit",
          redo: () => {
            if (entries) {
              for (const entry of entries) entry.redo();
            } else {
              entries = [];
              for (const child of commands) {
                const entry = this.execute(child,respectLocks);
                if (entry) { entry.redo(); retainGestureEntry(entries,entry); }
              }
              // Legacy journals contain one complete update per pointer frame.
              // Normalize by executing them first (font/size patches can have
              // implicit effects), then retain only the equivalent compact form.
              // External Undo boundaries and non-update barriers stay intact.
              command.payload={label,commands:entries.map(entry=>entry.command)};
              commands=[];
            }
          },
          undo: () => { for (const entry of [...(entries ?? [])].reverse()) entry.undo(); },
        };
      }
      case "WIDGET_CREATE": {
        let widget = command.payload as Widget;
        if(isFreeText(widget))widget=naturalText(widget);
        command.payload=widget;
        const z=this.placementZ(widget.layerId,widget.type==='frame');if(!Number.isFinite(z))return this.rebalanceCreation(command);
        const placed: Widget = projectLayerItem(s,{ ...widget, z });
        const index = s.order.length;
        return {
          command,
          label: `create ${placed.type}`,
          redo: () => {
            s.widgets.set(placed.id, placed);
            if (!s.order.includes(placed.id)) s.order.push(placed.id);
          },
          undo: () => {
            s.widgets.delete(placed.id);
            s.order = s.order.filter((id) => id !== placed.id);
            s.selection.delete(placed.id);
          },
        };
      }

      case "WIDGET_REMOVE": {
        const id = command.payload as string;
        const widget = s.widgets.get(id);
        if (!widget) return null;
        if(widget.mind){
          const ids=mindSubtree(s,id),removed=new Set(ids);
          const wholeMap=widget.mind.parentId===null&&widget.mind.rootId===id;
          if(respectLocks&&!canDeleteMindSubtree(s,id))return null;
          const branches=[...s.connectors.values()].filter(connector=>connector.mindBranch&&removed.has(connector.mindBranch));
          if(ids.length>1||branches.length){
            const copy={...s,widgets:new Map(s.widgets),order:s.order.filter(nodeId=>!removed.has(nodeId)),connectors:new Map(s.connectors)};
            for(const nodeId of ids)copy.widgets.delete(nodeId);
            for(const branch of branches)copy.connectors.delete(branch.id);
            const commands:Command[]=[
              ...branches.map(branch=>({op:'CONNECTOR_REMOVE' as const,payload:branch.id})),
              // BATCH constructs each inverse after the preceding child runs.
              // The final retry has no descendants or branch connectors left.
              ...[...ids].reverse().map(nodeId=>({op:'WIDGET_REMOVE' as const,payload:nodeId})),
              ...mindLayoutCommands(copy,widget.mind.rootId),
            ];
            // The unlocked centre authorizes exactly this generated deletion
            // batch. Descendant locks stay untouched and all unrelated command
            // paths retain their ordinary interactive guards.
            const selectionBefore=[...s.selection],entry=this.execute({op:'BATCH',payload:{label:wholeMap?'Excluir mapa mental':'Excluir ramo',commands}},respectLocks&&!wholeMap)!;
            return {...entry,command,undo:()=>{entry.undo();s.selection=new Set(selectionBefore);}};
          }
        }
        const groupsBefore=[...s.groups].map(([gid,members])=>[gid,[...members]] as [string,string[]]);
        const index = s.order.indexOf(id);

        // conectores presos a este objeto viram pontas soltas (não somem)
        const detached: Array<{id:string;before:{start:Endpoint;end:Endpoint};after:{start:Endpoint;end:Endpoint}}> = [];
        for (const connector of s.connectors.values()) {
          const detach=(endpoint:Endpoint):Endpoint=>{
            if (endpoint.kind === "anchor" && endpoint.widgetId === id) {
              const resolved = resolveEndpoint(endpoint, s.widgets);
              if (resolved)return {kind:'point',x:resolved.x,y:resolved.y};
            }
            return endpoint;
          };
          const start=detach(connector.start),end=detach(connector.end);
          if(start!==connector.start||end!==connector.end)detached.push({id:connector.id,before:{start:connector.start,end:connector.end},after:{start,end}});
        }

        return {
          command,
          label: `remove ${widget.type}`,
          redo: () => {
            for (const snapshot of detached) {
              const current = s.connectors.get(snapshot.id);
              if (!current) continue;
              s.connectors.set(snapshot.id, { ...current, ...snapshot.after });
            }
            s.widgets.delete(id);
            s.order = s.order.filter((x) => x !== id);
            s.selection.delete(id);removeGroupMember(s,id);
          },
          undo: () => {
            s.groups=new Map(groupsBefore.map(([gid,members])=>[gid,[...members]]));
            s.widgets.set(id, widget);
            s.order.splice(Math.max(0, index), 0, id);
            for (const snapshot of detached) {
              const current = s.connectors.get(snapshot.id);
              if (!current) continue;
              s.connectors.set(snapshot.id, { ...current, ...snapshot.before });
            }
          },
        };
      }

      case "CONNECTOR_CREATE": {
        const connector = command.payload as Connector;
        const z = this.placementZ(connector.layerId);
        if(!Number.isFinite(z))return this.rebalanceCreation(command);
        const placed: Connector = projectLayerItem(s,{ ...connector, z });
        return {
          command,
          label: "create connector",
          redo: () => {
            s.connectors.set(placed.id, placed);
            if (!s.connectorOrder.includes(placed.id)) s.connectorOrder.push(placed.id);
          },
          undo: () => {
            s.connectors.delete(placed.id);
            s.connectorOrder = s.connectorOrder.filter((id) => id !== placed.id);
            s.selection.delete(placed.id);
          },
        };
      }

      case "CONNECTOR_UPDATE": {
        const { id, patch } = command.payload as { id: string; patch: Partial<Connector> };
        const connector = s.connectors.get(id);
        if (!connector) return null;
        const before = { ...connector };
        const after = projectLayerItem(s,{ ...connector, ...prepareLayerPatch(connector,patch) });
        return {
          command,
          label: "update connector",
          redo: () => void s.connectors.set(id, { ...after }),
          undo: () => void s.connectors.set(id, { ...before }),
        };
      }

      case "GROUP_CREATE": {
        const { id, items } = command.payload as { id: string; items: string[] };
        const before=s.groups.get(id);
        return {
          command,
          label: `group ${items.length}`,
          redo: () => void s.groups.set(id, [...items]),
          undo: () => {if(before)s.groups.set(id,[...before]);else s.groups.delete(id);},
        };
      }

      case "GROUP_REMOVE": {
        const id = command.payload as string;
        const items = s.groups.get(id);
        if (!items) return null;
        const parents=[...s.groups].filter(([,members])=>members.includes(id)).map(([gid,members])=>[gid,[...members]] as const);
        return {
          command,
          label: "ungroup",
          redo: () => {s.groups.delete(id);for(const [gid,members] of parents)s.groups.set(gid,[...new Set(members.flatMap(m=>m===id?items:[m]))]);},
          undo: () => {s.groups.set(id,[...items]);for(const [gid,members] of parents)s.groups.set(gid,[...members]);},
        };
      }

      case "STROKE_UPDATE": {
        const {id,patch}=command.payload as {id:string;patch:Partial<Stroke>};const before=s.strokes.get(id);if(!before)return null;const after=projectLayerItem(s,{...before,...prepareLayerPatch(before,patch)});
        return {command,label:'update stroke',redo:()=>void s.strokes.set(id,after),undo:()=>void s.strokes.set(id,before)};
      }
      case "STROKE_CREATE": {
        const stroke = command.payload as Stroke;
        const z=this.placementZ(stroke.layerId);if(!Number.isFinite(z))return this.rebalanceCreation(command);
        const placed: Stroke = projectLayerItem(s,{ ...stroke, z });
        return {
          command,
          label: "create stroke",
          redo: () => {
            s.strokes.set(placed.id, placed);
            if (!s.strokeOrder.includes(placed.id)) s.strokeOrder.push(placed.id);
          },
          undo: () => {
            s.strokes.delete(placed.id);
            s.strokeOrder = s.strokeOrder.filter((id) => id !== placed.id);
            s.selection.delete(placed.id);
          },
        };
      }

      case "STROKE_REMOVE": {
        const id = command.payload as string;
        const groupsBefore=[...s.groups].map(([gid,members])=>[gid,[...members]] as [string,string[]]);
        const stroke = s.strokes.get(id);
        if (!stroke) return null;
        const index = s.strokeOrder.indexOf(id);
        return {
          command,
          label: "remove stroke",
          redo: () => {
            s.strokes.delete(id);
            s.strokeOrder = s.strokeOrder.filter((x) => x !== id);
            s.selection.delete(id);removeGroupMember(s,id);
          },
          undo: () => {
            s.groups=new Map(groupsBefore.map(([gid,members])=>[gid,[...members]]));
            s.strokes.set(id, stroke);
            s.strokeOrder.splice(Math.max(0, index), 0, id);
          },
        };
      }

      case "CONNECTOR_REMOVE": {
        const id = command.payload as string;
        const groupsBefore=[...s.groups].map(([gid,members])=>[gid,[...members]] as [string,string[]]);
        const connector = s.connectors.get(id);
        if (!connector) return null;
        const index = s.connectorOrder.indexOf(id);
        return {
          command,
          label: "remove connector",
          redo: () => {
            s.connectors.delete(id);
            s.connectorOrder = s.connectorOrder.filter((x) => x !== id);
            s.selection.delete(id);removeGroupMember(s,id);
          },
          undo: () => {
            s.groups=new Map(groupsBefore.map(([gid,members])=>[gid,[...members]]));
            s.connectors.set(id, connector);
            s.connectorOrder.splice(Math.max(0, index), 0, id);
          },
        };
      }

      case "WIDGET_UPDATE": {
        const { id, patch:incoming,mindLayoutScale } = command.payload as { id: string; patch: Partial<Widget>&{textSizing?:'natural'};mindLayoutScale?:number };
        const widget = s.widgets.get(id);
        if (!widget) return null;
        let patch={...incoming};
        // Keep immutable attachment bytes out of every pointer-frame command.
        // The journal records this scalar; replay derives the same metadata.
        if(mindLayoutScale!==undefined){
          const mind='mind' in incoming?incoming.mind:widget.mind;
          if(!mind||!Number.isFinite(mindLayoutScale)||mindLayoutScale<=0)return null;
          patch.mind={...mind,layoutScale:mindLayoutScale};
        }
        if(incoming.style)patch.style={...widget.style,...incoming.style};
        const sized=incoming.width!==undefined||incoming.height!==undefined;
        if(sized){
          const style={...(patch.style??widget.style)};
          if(incoming.style?.borderScale===undefined&&incoming.style?.borderWidth===undefined)style.borderScale=relativeBorderScale(widget);
          if(style.borderScale!==undefined)style.borderWidth=style.borderScale*Math.min(patch.width??widget.width,patch.height??widget.height);
          patch.style=style;
        }
        const textLayoutChanged=sized||incoming.style!==undefined||incoming.type!==undefined||'content' in incoming||incoming.textSizing!==undefined;
        if(textLayoutChanged&&isFreeText({...widget,...patch} as Widget)){
          const style={...(patch.style??widget.style)};
          if(sized&&incoming.style?.fontSize===undefined){const ratio=incoming.width!==undefined?incoming.width/widget.width:(incoming.height??widget.height)/widget.height;const fontSize=widget.style.fontSize*ratio;if(Number.isFinite(fontSize))style.fontSize=Math.max(.1,fontSize);}
          const text=naturalText({...widget,...patch,style} as TextWidget);
          patch={...patch,style,width:text.width,height:text.height,textSizing:'natural'};
        }
        const recordedPatch={...patch};if(mindLayoutScale!==undefined&&!('mind' in incoming))delete recordedPatch.mind;
        command.payload={id,patch:recordedPatch,...(mindLayoutScale===undefined?{}:{mindLayoutScale})};
        const before = { ...widget } as Widget;
        const after = projectLayerItem(s,{ ...widget, ...prepareLayerPatch(widget,patch) } as Widget);
        return {
          command,
          label: `update ${widget.type}`,
          redo: () => void s.widgets.set(id, { ...after }),
          undo: () => void s.widgets.set(id, { ...before }),
        };
      }

      case "WIDGET_TRANSLATE": {
        const { ids, dx, dy } = command.payload as { ids: string[]; dx: number; dy: number };
        return {
          command,
          label: `move ${ids.length}`,
          redo: () => {
            for (const id of ids) {
              const w = s.widgets.get(id);
              if (w) s.widgets.set(id, { ...w, x: w.x + dx, y: w.y + dy });
            }
          },
          undo: () => {
            for (const id of ids) {
              const w = s.widgets.get(id);
              if (w) s.widgets.set(id, { ...w, x: w.x - dx, y: w.y - dy });
            }
          },
        };
      }

      case "WIDGET_REORDER": {
        const { ids, direction, order:requestedOrder } = command.payload as {
          ids: string[];
          direction?: "front" | "back" | "forward" | "backward";
          order?:string[];
        };
        const before = [...s.widgets.values(),...s.connectors.values(),...s.strokes.values()].sort((a,b)=>a.z-b.z).map(item=>item.id);
        if(requestedOrder&&(requestedOrder.length!==before.length||new Set(requestedOrder).size!==before.length||requestedOrder.some(id=>!before.includes(id))))return null;
        const after = requestedOrder??reorder(before, ids, direction??'front');
        const entity=(id:string)=>s.widgets.get(id)??s.connectors.get(id)??s.strokes.get(id);
        const beforeZ = new Map(before.map(id => [id, entity(id)?.z ?? 0]));
        const apply = (order: string[], restoreZ = false): void => {
          s.order = order.filter(id=>s.widgets.has(id));
          order.forEach((id, index) => {
            const item=entity(id);if(item)item.z=restoreZ?beforeZ.get(id)!:index+1;
          });
        };
        return {
          command,
          label: `reorder ${direction}`,
          redo: () => {
            apply(after);
          },
          undo: () => {
            apply(before, true);
          },
        };
      }

      case "WIDGET_ALIGN": {
        const { ids, mode } = command.payload as { ids: string[]; mode: AlignMode };
        const widgets = ids.map((id) => s.widgets.get(id)).filter((w): w is Widget => Boolean(w));
        if (widgets.length < 2) return null;

        const minX = Math.min(...widgets.map((w) => w.x));
        const maxX = Math.max(...widgets.map((w) => w.x + w.width));
        const minY = Math.min(...widgets.map((w) => w.y));
        const maxY = Math.max(...widgets.map((w) => w.y + w.height));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const before = widgets.map((w) => ({ id: w.id, x: w.x, y: w.y }));
        const after = widgets.map((w) => {
          switch (mode) {
            case "left":
              return { id: w.id, x: minX, y: w.y };
            case "right":
              return { id: w.id, x: maxX - w.width, y: w.y };
            case "hcenter":
              return { id: w.id, x: centerX - w.width / 2, y: w.y };
            case "top":
              return { id: w.id, x: w.x, y: minY };
            case "bottom":
              return { id: w.id, x: w.x, y: maxY - w.height };
            case "vcenter":
              return { id: w.id, x: w.x, y: centerY - w.height / 2 };
            default:
              return { id: w.id, x: w.x, y: w.y };
          }
        });

        const apply = (positions: Array<{ id: string; x: number; y: number }>) => {
          for (const p of positions) {
            const w = s.widgets.get(p.id);
            if (w) s.widgets.set(p.id, { ...w, x: p.x, y: p.y });
          }
        };

        return {
          command,
          label: `align ${mode}`,
          redo: () => apply(after),
          undo: () => apply(before),
        };
      }

      case "WIDGET_DISTRIBUTE": {
        const { ids, axis } = command.payload as { ids: string[]; axis: DistributeAxis };
        const widgets = ids.map((id) => s.widgets.get(id)).filter((w): w is Widget => Boolean(w));
        if (widgets.length < 3) return null;

        const key = axis === "x" ? "x" : "y";
        const size = axis === "x" ? "width" : "height";
        const sorted = [...widgets].sort((a, b) => a[key] - b[key]);
        const first = sorted[0]!;
        const last = sorted[sorted.length - 1]!;

        const span = last[key] + last[size] - first[key];
        const totalSize = sorted.reduce((acc, w) => acc + w[size], 0);
        const gap = (span - totalSize) / (sorted.length - 1);

        const before = widgets.map((w) => ({ id: w.id, x: w.x, y: w.y }));
        let cursor = first[key];
        const after = sorted.map((w) => {
          const position = cursor;
          cursor += w[size] + gap;
          return axis === "x"
            ? { id: w.id, x: position, y: w.y }
            : { id: w.id, x: w.x, y: position };
        });

        const apply = (positions: Array<{ id: string; x: number; y: number }>) => {
          for (const p of positions) {
            const w = s.widgets.get(p.id);
            if (w) s.widgets.set(p.id, { ...w, x: p.x, y: p.y });
          }
        };

        return {
          command,
          label: `distribute ${axis}`,
          redo: () => apply(after),
          undo: () => apply(before),
        };
      }

      case "SELECTION_SET": {
        const next = command.payload as string[];
        const before = [...s.selection];
        if(next.length===before.length&&next.every((id,index)=>id===before[index]))return null;
        return {
          command,
          label: "selection",
          redo: () => {
            s.selection = new Set(next);
          },
          undo: () => {
            s.selection = new Set(before);
          },
        };
      }

      default:
        return null;
    }
  }

  undo(): void {
    if(!this.canMutate())return;
    this.endTransaction();
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    syncBoardLayers(this.state);
    this.redoStack.push(cmd);
    this.onChange();
  }

  redo(): void {
    if(!this.canMutate())return;
    this.endTransaction();
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    syncBoardLayers(this.state);
    this.undoStack.push(cmd);
    this.onChange();
  }

  /** Journal serializável: o que foi aplicado e o que foi desfeito. */
  snapshot(): { applied: Command[]; undone: Command[] } {
    return {
      // seleção não é conteúdo: não polui o journal persistido
      applied: [
        ...this.prefixApplied,
        ...this.undoStack.map((entry) => entry.command),
        ...(this.transaction?.entries.length ? [{ op: "BATCH" as const, payload: { label: this.transaction.label, commands: this.transaction.entries.map(entry => entry.command) } }] : []),
      ].filter((c) => c.op !== "SELECTION_SET"&&c.op!=='LAYERS_ACTIVE'),
      undone: this.redoStack.map((entry) => entry.command).filter((c) => c.op !== "SELECTION_SET"&&c.op!=='LAYERS_ACTIVE'),
    };
  }

  /** Reconstrói estado e pilhas executando o journal do zero. */
  restore(applied: Command[], undone: Command[]): void {
    this.transaction = null;
    this.prefixApplied = [];
    this.undoStack.length = 0;
    this.redoStack.length = 0;

    for (const command of applied) {
      const executed = this.execute(command);
      if (!executed) continue;
      executed.redo();
      if(affectsLayerOrder(command))syncBoardLayers(this.state);
      this.pushUndo({ ...executed, command });
    }

    const replayed: ExecutedCommand[] = [];
    // The end of the redo stack is the next command, so replay in reverse order
    // to reconstruct every inverse against its actual preceding state.
    for (const command of [...undone].reverse()) {
      const executed = this.execute(command);
      if (!executed) continue;
      executed.redo();
      if(affectsLayerOrder(command))syncBoardLayers(this.state);
      replayed.push({ ...executed, command });
    }
    for (const executed of [...replayed].reverse()) executed.undo();
    this.redoStack.push(...replayed.reverse());
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

/** Reordena o array de z-order mantendo os não selecionados no lugar. */
export function reorder(
  order: string[],
  ids: string[],
  direction: "front" | "back" | "forward" | "backward",
): string[] {
  const moving = new Set(ids.filter((id) => order.includes(id)));
  if (moving.size === 0) return order;

  if (direction === "front" || direction === "back") {
    const rest = order.filter((id) => !moving.has(id));
    const picked = order.filter((id) => moving.has(id));
    return direction === "front" ? [...rest, ...picked] : [...picked, ...rest];
  }

  const out = [...order];
  if (direction === "forward") {
    for (let i = out.length - 2; i >= 0; i--) {
      if (moving.has(out[i]!) && !moving.has(out[i + 1]!)) {
        [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
      }
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (moving.has(out[i]!) && !moving.has(out[i - 1]!)) {
        [out[i], out[i - 1]] = [out[i - 1]!, out[i]!];
      }
    }
  }
  return out;
}
