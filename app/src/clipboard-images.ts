/** Native paste keeps image data supplied by the browser ahead of HTML/URL fallbacks. */
export function isClipboardEditor(target:EventTarget|null):boolean{
  return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
}

const IMAGE_EXTENSION=/\.(png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#]|$)/i;
function imageFile(file:File):File|undefined{
  if(file.type.startsWith('image/'))return file;
  if(file.type)return;
  const extension=file.name.match(IMAGE_EXTENSION)?.[1]?.toLowerCase();
  if(!extension)return;
  const subtype=extension==='jpg'?'jpeg':extension==='svg'?'svg+xml':extension;
  return new File([file],file.name,{type:`image/${subtype}`,lastModified:file.lastModified});
}

function clipboardFiles(data:DataTransfer):File[]{
  const items=Array.from(data.items??[]).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>!!file).map(imageFile).filter((file):file is File=>!!file);
  return items.length?items:Array.from(data.files??[]).map(imageFile).filter((file):file is File=>!!file);
}

function clipboardSources(data:DataTransfer):string[]{
  const html=data.getData('text/html'),sources:string[]=[];
  if(html){
    const template=document.createElement('template');template.innerHTML=html;
    const base=template.content.querySelector('base[href]')?.getAttribute('href');
    for(const image of template.content.querySelectorAll('img[src]')){
      const raw=image.getAttribute('src')?.trim();if(!raw)continue;
      try{const url=new URL(raw,base||location.href);if(['https:','http:','blob:'].includes(url.protocol)||url.protocol==='data:'&&url.href.startsWith('data:image/'))sources.push(url.href);}catch{/* An incomplete clipboard URL is not an image source. */}
    }
  }
  if(!sources.length){const uri=data.getData('text/uri-list').split(/\r?\n/).find(line=>line&&!line.startsWith('#'))?.trim();if(uri&&IMAGE_EXTENSION.test(uri)){try{const url=new URL(uri);if(['https:','http:'].includes(url.protocol))sources.push(url.href);}catch{}}}
  return [...new Set(sources)];
}

export function installClipboardImages(api:{
  importFiles(files:File[],canInsert?:()=>boolean):Promise<unknown>;
  notice(message:string):void;
  blocked():boolean;
  getBoardKey?():string|null;
}){
  const insert=async(files:File[],canInsert:()=>boolean)=>{try{await api.importFiles(files,canInsert);}catch{api.notice('Não foi possível inserir a imagem no board. Tente novamente ou importe o arquivo pelo botão Imagem.');}};
  const paste=(event:ClipboardEvent)=>{
    if(event.defaultPrevented||api.blocked()||isClipboardEditor(event.target)||!event.clipboardData)return;
    const boardKey=api.getBoardKey?.(),canInsert=()=>!api.getBoardKey||api.getBoardKey()===boardKey;
    // Read all native clipboard representations synchronously: some browsers clear
    // the event's DataTransfer as soon as the paste listener returns.
    const files=clipboardFiles(event.clipboardData);
    if(files.length){event.preventDefault();void insert(files,canInsert);return;}
    const sources=clipboardSources(event.clipboardData);if(!sources.length)return;
    event.preventDefault();
    void (async()=>{
      const images:File[]=[];
      for(const [index,source]of sources.entries()){
        try{
          const response=await fetch(source,{mode:'cors',credentials:'omit'});
          if(!response.ok)throw new Error('HTTP '+response.status);
          const blob=await response.blob();
          const type=blob.type.split(';')[0]!.toLowerCase();
          if(!type.startsWith('image/'))throw new Error('A origem não forneceu uma imagem.');
          const extension=type.split('/')[1]?.replace('svg+xml','svg')||'png';
          images.push(new File([blob],`imagem-colada-${index+1}.${extension}`,{type}));
        }catch{
          api.notice('Não foi possível colar a imagem: o site de origem pode ter bloqueado o acesso. Use “Copiar imagem” no navegador ou baixe e arraste o arquivo para o board.');
        }
      }
      if(images.length)await insert(images,canInsert);
    })();
  };
  document.addEventListener('paste',paste);
  return {destroy:()=>document.removeEventListener('paste',paste)};
}
