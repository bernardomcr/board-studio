import type {BoardState,CommandBus} from './core/commands';
import {nextId,type MindAttachment} from './core/model';
import {addMindAttachments,removeMindAttachment} from './core/mindmap';
import {attachmentMime,MAX_MIND_ATTACHMENT_BYTES,MAX_MIND_ATTACHMENT_TOTAL_BYTES,MAX_MIND_ATTACHMENTS} from './core/mind-attachments';
import {snapshotUserFonts} from './user-fonts';
import {boardFontFamilies} from './fonts';

const MAX_PROJECT_BYTES=100*1024*1024;
interface Target {id:string;rootId:string;boardKey:string|null|undefined;generation:number}
interface MindAttachmentAPI {state:BoardState;bus:CommandBus;getBoardKey?():string|null;onChange?():void}
/** Local files are embedded, read sequentially and never sent to another service. */
export function installMindAttachments(api:MindAttachmentAPI){
  const input=document.createElement('input');input.type='file';input.multiple=true;input.hidden=true;input.dataset.mindAttachmentPicker='';document.body.append(input);
  let target:Target|undefined,generation=0,boardEpoch=0;const readers=new Set<FileReader>();
  const key=()=>api.getBoardKey?api.getBoardKey():`${location.hash}:${boardEpoch}`;
  const capture=(id:string):Target|undefined=>{const node=api.state.widgets.get(id),boardKey=key();return boardKey!==null&&node?.mind&&!node.locked&&!document.body.classList.contains('home-visible')?{id,rootId:node.mind.rootId,boardKey,generation:++generation}:undefined;};
  const valid=(destination:Target)=>{const node=api.state.widgets.get(destination.id);return destination.generation===generation&&destination.boardKey===key()&&!!node?.mind&&node.mind.rootId===destination.rootId&&!node.locked&&!document.body.classList.contains('home-visible');};
  function notice(message:string){const toast=document.createElement('div');toast.setAttribute('role','status');toast.textContent=message;toast.style.cssText='position:fixed;left:50%;bottom:66px;transform:translateX(-50%);max-width:min(600px,90vw);padding:12px 16px;border-radius:9px;background:var(--studio-ink,#292331);color:var(--studio-surface,#fff);font:13px Inter,Segoe UI,sans-serif;z-index:110';document.body.append(toast);setTimeout(()=>toast.remove(),6500);}
  function projectBytes(files:MindAttachment[]=[],id?:string){const s=api.state,widgets=[...s.widgets.values()].map(widget=>id===widget.id&&widget.mind?{...widget,mind:{...widget.mind,attachments:[...(widget.mind.attachments??[]),...files]}}:widget);return new Blob([JSON.stringify({format:'local-board',version:1,layerOrderVersion:1,title:document.getElementById('board-title')?.textContent??'Board',layers:s.layers,background:s.background,userFonts:snapshotUserFonts(boardFontFamilies(widgets,s.connectors.values())),widgets,order:s.order,connectors:[...s.connectors.values()],connectorOrder:s.connectorOrder,strokes:[...s.strokes.values()],strokeOrder:s.strokeOrder,groups:[...s.groups],camera:{x:0,y:0,scale:1}})]).size;}
  const sourceData=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();readers.add(reader);const finish=()=>readers.delete(reader);reader.onload=()=>{finish();resolve(String(reader.result));};reader.onerror=()=>{finish();reject(new Error('Não foi possível ler este anexo.'));};reader.onabort=()=>{finish();reject(new Error('Leitura de anexo cancelada.'));};reader.readAsDataURL(file.slice(0,file.size,attachmentMime(file.type)));});
  async function insert(destination:Target,files:File[]):Promise<boolean>{
    if(!files.length)return false;
    try{
      if(!valid(destination))throw new Error('O tópico ou o board mudou. Escolha o arquivo novamente.');
      const current=api.state.widgets.get(destination.id)!;
      if(files.length+(current.mind?.attachments?.length??0)>MAX_MIND_ATTACHMENTS)throw new Error('Um tópico pode guardar até 64 anexos.');
      if(files.some(file=>file.size>MAX_MIND_ATTACHMENT_BYTES))throw new Error('Cada anexo deve ter até 32 MiB.');
      const total=[...api.state.widgets.values()].reduce((sum,widget)=>sum+(widget.mind?.attachments??[]).reduce((sum,file)=>sum+file.size,0),0)+files.reduce((sum,file)=>sum+file.size,0);
      if(total>MAX_MIND_ATTACHMENT_TOTAL_BYTES)throw new Error('Os anexos deste board devem somar até 64 MiB.');
      if(projectBytes()+files.reduce((sum,file)=>sum+Math.ceil(file.size/3)*4,0)>MAX_PROJECT_BYTES-4096)throw new Error('O projeto completo excederia 100 MiB. Remova alguma mídia antes de anexar este arquivo.');
      const attachments:MindAttachment[]=[];
      for(const file of files){if(!valid(destination))throw new Error('O tópico ou o board mudou. Escolha o arquivo novamente.');attachments.push({id:nextId('attachment'),name:file.name.trim().slice(0,1000)||'Arquivo',mimeType:attachmentMime(file.type),src:await sourceData(file),size:file.size});}
      if(!valid(destination))throw new Error('O tópico ou o board mudou. Escolha o arquivo novamente.');
      if(projectBytes(attachments,destination.id)>MAX_PROJECT_BYTES-4096)throw new Error('O projeto completo excederia 100 MiB. Remova alguma mídia antes de anexar este arquivo.');
      const changed=addMindAttachments(api.state,api.bus,destination.id,attachments);if(changed)api.onChange?.();return changed;
    }catch(error){notice(error instanceof Error?error.message:'Não foi possível anexar o arquivo.');return false;}
  }
  function open(id:string){target=capture(id);if(target){input.value='';input.click();}}
  input.addEventListener('change',()=>{const destination=target,files=Array.from(input.files??[]);target=undefined;input.value='';if(destination)void insert(destination,files);});
  input.addEventListener('cancel',()=>{target=undefined;});
  function download(id:string,fileId:string){const file=api.state.widgets.get(id)?.mind?.attachments?.find(file=>file.id===fileId);if(!file)return;const encoded=file.src.slice(file.src.indexOf(',')+1),decoded=atob(encoded),bytes=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType})),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const navigation=()=>{boardEpoch++;generation++;target=undefined;for(const reader of readers)reader.abort();};window.addEventListener('hashchange',navigation);
  return {open,download,async importFiles(id:string,files:File[]){const destination=capture(id);return destination?insert(destination,files):false;},remove(id:string,fileId:string){const changed=removeMindAttachment(api.state,api.bus,id,fileId);if(changed)api.onChange?.();return changed;},destroy(){navigation();input.remove();window.removeEventListener('hashchange',navigation);}};
}
