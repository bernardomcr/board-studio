import type {MindAttachment,Widget} from './model';

export const MAX_MIND_ATTACHMENT_BYTES=32*1024*1024;
export const MAX_MIND_ATTACHMENT_TOTAL_BYTES=64*1024*1024;
export const MAX_MIND_ATTACHMENTS=64;
const MIME=/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
export const attachmentMime=(value:string)=>MIME.test(value)&&value.length<=160?value.toLowerCase():'application/octet-stream';

/** Accept embedded bytes only; filenames and content never become executable markup. */
export function validateMindAttachments(value:unknown):MindAttachment[]{
  if(!Array.isArray(value)||value.length>MAX_MIND_ATTACHMENTS)throw new Error('Lista de anexos inválida.');
  const ids=new Set<string>();
  return value.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Anexo inválido.');
    const item=raw as Record<string,unknown>;
    if(typeof item.id!=='string'||!item.id||item.id.length>256||ids.has(item.id))throw new Error('Identificador de anexo inválido.');ids.add(item.id);
    if(typeof item.name!=='string'||!item.name.trim()||item.name.length>1000)throw new Error('Nome de anexo inválido.');
    if(typeof item.mimeType!=='string'||item.mimeType.length>160||!MIME.test(item.mimeType))throw new Error('Formato de anexo inválido.');
    if(typeof item.size!=='number'||!Number.isSafeInteger(item.size)||item.size<0||item.size>MAX_MIND_ATTACHMENT_BYTES)throw new Error('Cada anexo deve ter até 32 MiB.');
    if(typeof item.src!=='string'||item.src.length>Math.ceil(MAX_MIND_ATTACHMENT_BYTES/3)*4+200)throw new Error('Anexo incorporado inválido.');
    const prefix=`data:${item.mimeType};base64,`;if(!item.src.startsWith(prefix))throw new Error('O anexo deve estar incorporado no board.');
    const encoded=item.src.slice(prefix.length);if(encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('Conteúdo de anexo inválido.');
    const size=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);if(size!==item.size)throw new Error('Tamanho de anexo inconsistente.');
    return {id:item.id,name:item.name,mimeType:item.mimeType,src:item.src,size};
  });
}
export function validateMindAttachmentBoardBudget(widgets:Iterable<Widget>):void{
  let bytes=0;for(const widget of widgets)for(const file of widget.mind?.attachments??[]){bytes+=file.size;if(bytes>MAX_MIND_ATTACHMENT_TOTAL_BYTES)throw new Error('Os anexos deste board devem somar até 64 MiB.');}
}
