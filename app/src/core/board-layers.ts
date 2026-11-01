import type {BoardState} from './commands';
import type {BoardLayers,BoardLayer,LayerMembership} from './layer-model';
export type {BoardLayers,BoardLayer,LayerMembership} from './layer-model';
export const DEFAULT_LAYER_ID='board-layer-default';
export const LAYER_Z_STRIDE=2**20;
export const defaultBoardLayers=():BoardLayers=>({version:1,nodes:[{id:DEFAULT_LAYER_ID,kind:'layer',name:'Camada 1'}],activeId:DEFAULT_LAYER_ID});
const documentIndex=new WeakMap<BoardLayers,{byId:Map<string,BoardLayer>;children:Map<string|undefined,BoardLayer[]>;flags:Map<string,{hidden:boolean;locked:boolean}>}>();
function index(doc:BoardLayers){let cached=documentIndex.get(doc);if(!cached){const children=new Map<string|undefined,BoardLayer[]>();for(const n of doc.nodes){let siblings=children.get(n.parentId);if(!siblings){siblings=[];children.set(n.parentId,siblings);}siblings.push(n);}cached={byId:new Map(doc.nodes.map(n=>[n.id,n])),children,flags:new Map()};documentIndex.set(doc,cached);}return cached;}
export function validateBoardLayers(raw:unknown):BoardLayers{
 if(!raw||typeof raw!=='object')throw new Error('Camadas inválidas.');
 const doc=raw as BoardLayers;if(doc.version!==1||!Array.isArray(doc.nodes)||!doc.nodes.length||doc.nodes.length>20000)throw new Error('Camadas inválidas.');
 const ids=new Set<string>(),nodes:BoardLayer[]=doc.nodes.map(n=>{if(!n||typeof n.id!=='string'||!n.id||n.id.length>256||ids.has(n.id)||!['layer','group'].includes(n.kind)||typeof n.name!=='string'||!n.name.trim()||n.name.length>140||n.parentId!==undefined&&typeof n.parentId!=='string'||n.hidden!==undefined&&typeof n.hidden!=='boolean'||n.locked!==undefined&&typeof n.locked!=='boolean')throw new Error('Camada inválida.');ids.add(n.id);return {id:n.id,kind:n.kind,name:n.name,...(n.parentId?{parentId:n.parentId}:{}),...(n.hidden?{hidden:true}:{}),...(n.locked?{locked:true}:{})};});
 const byId=new Map(nodes.map(n=>[n.id,n]));for(const node of nodes){const seen=new Set([node.id]);let p=node.parentId;while(p){const parent=byId.get(p);if(!parent||parent.kind!=='group'||seen.has(p)||seen.size>128)throw new Error('Grupo de camadas inválido ou profundo demais.');seen.add(p);p=parent.parentId;}}
 if(byId.get(doc.activeId)?.kind!=='layer')throw new Error('Camada ativa inválida.');return {version:1,nodes,activeId:doc.activeId};
}
export function ensureBoardLayers(state:BoardState):BoardLayers {return state.layers??(state.layers=defaultBoardLayers());}
export function layerDescendants(doc:BoardLayers,id:string):string[]{const found:string[]=[],pending=[id],children=index(doc).children;while(pending.length){const key=pending.pop()!;found.push(key);for(const n of children.get(key)??[])pending.push(n.id);}return found;}
export function boardLayerOrder(doc:BoardLayers):string[]{const out:string[]=[],children=index(doc).children,pending=[...(children.get(undefined)??[])].reverse();while(pending.length){const n=pending.pop()!;if(n.kind==='layer')out.push(n.id);else pending.push(...(children.get(n.id)??[]).slice().reverse());}return out;}
export function boardLayerFlags(doc:BoardLayers,id:string):{hidden:boolean;locked:boolean}{const cached=index(doc),retained=cached.flags.get(id);if(retained)return retained;let node=cached.byId.get(id),hidden=false,locked=false;while(node){hidden||=!!node.hidden;locked||=!!node.locked;node=node.parentId?cached.byId.get(node.parentId):undefined;}const flags={hidden,locked};cached.flags.set(id,flags);return flags;}
export function ownLayerFlags<T extends LayerMembership&{hidden?:boolean;locked?:boolean}>(item:T):T{const own={...item,hidden:item.layerOwnHidden??!!item.hidden,locked:item.layerOwnLocked??!!item.locked};delete own.layerOwnHidden;delete own.layerOwnLocked;return own;}
export function projectLayerItem<T extends LayerMembership&{hidden?:boolean;locked?:boolean}>(state:BoardState,item:T):T{
 const doc=ensureBoardLayers(state),layerId=index(doc).byId.get(item.layerId??'')?.kind==='layer'?item.layerId!:doc.activeId,flags=boardLayerFlags(doc,layerId),ownHidden=item.layerOwnHidden??!!item.hidden,ownLocked=item.layerOwnLocked??!!item.locked,hidden=flags.hidden||ownHidden,locked=flags.locked||ownLocked;
 const layerOwnHidden=flags.hidden?ownHidden:undefined,layerOwnLocked=flags.locked?ownLocked:undefined;
 const hiddenCanonical=flags.hidden?item.layerOwnHidden===layerOwnHidden:!Object.prototype.hasOwnProperty.call(item,'layerOwnHidden'),lockedCanonical=flags.locked?item.layerOwnLocked===layerOwnLocked:!Object.prototype.hasOwnProperty.call(item,'layerOwnLocked');
 if(item.layerId===layerId&&item.hidden===hidden&&item.locked===locked&&hiddenCanonical&&lockedCanonical)return item;
 const projected={...item,layerId,hidden,locked};if(flags.hidden)projected.layerOwnHidden=layerOwnHidden;else delete projected.layerOwnHidden;if(flags.locked)projected.layerOwnLocked=layerOwnLocked;else delete projected.layerOwnLocked;return projected;
}
/** Project inherited flags and layer order into the existing renderer/input contract. */
export function syncBoardLayers(state:BoardState,forceRebalance=false):void {
 const doc=ensureBoardLayers(state),ranks=new Map(boardLayerOrder(doc).map((id,i)=>[id,i]));
 for(const map of [state.widgets,state.connectors,state.strokes])for(const [id,item]of map){const next=projectLayerItem(state,item);if(next!==item)(map as Map<string,typeof item>).set(id,next);}
 if(ranks.size<2&&!forceRebalance)return;
 const items=[...state.widgets.values(),...state.connectors.values(),...state.strokes.values()],order=items.slice().sort((a,b)=>(ranks.get(a.layerId!)??0)-(ranks.get(b.layerId!)??0)||a.z-b.z);
 // A valid existing order needs no renumbering: retain references while panning/editing.
 if(!forceRebalance&&order.every((item,i)=>i===0||item.z>order[i-1]!.z))return;
 const stride=Math.max(LAYER_Z_STRIDE,items.length*2+1),localCounts=new Map<string,number>();
 order.forEach(item=>{const layerId=item.layerId!,local=(localCounts.get(layerId)??0)+1;localCounts.set(layerId,local);const z=(ranks.get(layerId)??0)*stride+local;if(item.z===z)return;const map=state.widgets.has(item.id)?state.widgets:state.connectors.has(item.id)?state.connectors:state.strokes;(map as Map<string,typeof item>).set(item.id,{...item,z});});
}
export function restoreBoardLayers(state:BoardState,raw?:unknown):void {state.layers=raw===undefined?(state.layers??defaultBoardLayers()):validateBoardLayers(raw);syncBoardLayers(state);}
export function snapshotBoardLayers(state:BoardState):BoardLayers {return structuredClone(ensureBoardLayers(state));}
export function prepareLayerPatch<T extends LayerMembership&{hidden?:boolean;locked?:boolean}>(item:T,patch:Partial<T>):Partial<T>{return {...patch,...(Object.prototype.hasOwnProperty.call(patch,'hidden')&&item.layerOwnHidden!==undefined?{layerOwnHidden:!!patch.hidden}:{}),...(Object.prototype.hasOwnProperty.call(patch,'locked')&&item.layerOwnLocked!==undefined?{layerOwnLocked:!!patch.locked}:{})};}
