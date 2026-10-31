/** User-provided fonts stay local and travel with editable boards that use them. */
export interface UserFont {family:string;label:string;format:'woff2'|'woff'|'truetype'|'opentype';src:string}
const DATABASE='board-app-fonts',STORE='fonts',MAX_FONT_BYTES=25*1024*1024,MAX_EMBEDDED_BYTES=64*1024*1024;
const fonts=new Map<string,UserFont>(),faces=new Map<string,Promise<void>>();
let database:Promise<IDBDatabase>|undefined,initialized:Promise<void>|undefined;
const change=()=>window.dispatchEvent(new CustomEvent('board-fonts-changed'));
function openDatabase():Promise<IDBDatabase>{
 return database??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'family'});};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=undefined;};resolve(db);};request.onerror=()=>reject(request.error??new Error('Não foi possível abrir as fontes salvas.'));}).catch(error=>{database=undefined;throw error;});
}
async function persist(items:UserFont[]):Promise<void>{const db=await openDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');for(const font of items)tx.objectStore(STORE).put(font);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error??new Error('Não foi possível salvar a fonte neste navegador.'));});}
export function initializeUserFonts():Promise<void>{return initialized??=(async()=>{const db=await openDatabase(),items=await new Promise<unknown[]>((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});for(const item of items){try{for(const font of validateUserFonts([item]))fonts.set(font.family,font);}catch{/* A damaged entry must not prevent opening unrelated boards. */}}})();}
export const userFontOptions=()=>[...fonts.values()].map(font=>({...font}));
export const userFont=(family:string)=>fonts.get(family);
export function snapshotUserFonts(families?:Iterable<string>):UserFont[]{const wanted=families?new Set([...families].map(f=>f.split(',')[0]!.trim().replace(/^['"]|['"]$/g,''))):undefined;return [...fonts.values()].filter(font=>!wanted||wanted.has(font.family)).map(font=>({...font}));}
export function validateUserFonts(value:unknown):UserFont[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>512)throw new Error('Coleção de fontes inválida.');
 const seen=new Set<string>();let bytes=0;
 return value.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Fonte incorporada inválida.');const f=item as Record<string,unknown>;
  if(typeof f.family!=='string'||!/^BoardCustom-[a-f0-9]{24}$/.test(f.family)||seen.has(f.family))throw new Error('Identificador de fonte inválido.');seen.add(f.family);
  if(typeof f.label!=='string'||!f.label.trim()||f.label.length>160)throw new Error('Nome de fonte inválido.');
  if(!['woff2','woff','truetype','opentype'].includes(f.format as string)||typeof f.src!=='string')throw new Error('Formato de fonte inválido.');
  const match=f.src.match(/^data:font\/(woff2|woff|ttf|otf);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[2]!.length%4!==0)throw new Error('A fonte deve estar incorporada no arquivo.');
  const count=match[2]!.length/4*3-(match[2]!.endsWith('==')?2:match[2]!.endsWith('=')?1:0);bytes+=count;if(count>MAX_FONT_BYTES||bytes>MAX_EMBEDDED_BYTES)throw new Error('As fontes incorporadas excedem o armazenamento permitido.');
  return {family:f.family,label:f.label.trim(),format:f.format as UserFont['format'],src:f.src};
 });
}
function decode(src:string):Uint8Array{return Uint8Array.from(atob(src.slice(src.indexOf(',')+1)),c=>c.charCodeAt(0));}
async function familyOf(bytes:Uint8Array):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>);return 'BoardCustom-'+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);}
export function loadUserFont(family:string):Promise<void>{const font=fonts.get(family);if(!font)return Promise.resolve();return register(font);}
function register(font:UserFont):Promise<void>{let task=faces.get(font.family);if(task)return task;task=(async()=>{const face=new FontFace(font.family,`url("${font.src}") format("${font.format}")`);await face.load();document.fonts.add(face);})();faces.set(font.family,task);task.catch(()=>faces.delete(font.family));return task;}
export async function restoreUserFonts(value:unknown):Promise<void>{
 const items=validateUserFonts(value);if(!items.length)return;await initializeUserFonts();
 for(const font of items)if(await familyOf(decode(font.src))!==font.family)throw new Error('Os dados da fonte não correspondem ao arquivo salvo.');
 await Promise.all(items.map(register));await persist(items);for(const font of items)fonts.set(font.family,font);change();
}
/** Read the preferred family name from an uncompressed sfnt name table. */
function sfntName(bytes:Uint8Array):string|undefined{
 try{const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getUint16(4),tableCount=Math.min(count,256);let offset=0,length=0;for(let i=0;i<tableCount;i++){const p=12+i*16;if(p+16>bytes.length)return;const tag=String.fromCharCode(...bytes.subarray(p,p+4));if(tag==='name'){offset=view.getUint32(p+8);length=view.getUint32(p+12);break;}}
  if(!offset||offset+length>bytes.length||length<6)return;const records=view.getUint16(offset+2),storage=offset+view.getUint16(offset+4),names:Array<{score:number;text:string}>=[];
  for(let i=0;i<Math.min(records,1024);i++){const p=offset+6+i*12;if(p+12>offset+length)break;const platform=view.getUint16(p),language=view.getUint16(p+4),id=view.getUint16(p+6),size=view.getUint16(p+8),start=storage+view.getUint16(p+10);if(![1,16].includes(id)||start+size>offset+length)continue;const data=bytes.subarray(start,start+size);let text='';if(platform===0||platform===3){for(let n=0;n+1<data.length;n+=2)text+=String.fromCharCode(data[n]!*256+data[n+1]!);}else text=new TextDecoder('macintosh').decode(data);text=text.replace(/[\u0000-\u001f]/g,'').trim();if(text)names.push({score:(id===16?8:0)+(language===0x409?4:0)+(platform===3?2:0),text});}
  return names.sort((a,b)=>b.score-a.score)[0]?.text.slice(0,160);
 }catch{return;}
}
export async function importUserFont(file:File):Promise<UserFont>{
 if(!/\.(woff2?|ttf|otf)$/i.test(file.name))throw new Error('Escolha uma fonte TTF, OTF, WOFF ou WOFF2.');if(!file.size||file.size>MAX_FONT_BYTES)throw new Error('Escolha uma fonte de até 25 MB.');
 await initializeUserFonts();const bytes=new Uint8Array(await file.arrayBuffer()),signature=String.fromCharCode(...bytes.subarray(0,4));
 const format:UserFont['format']=signature==='wOF2'?'woff2':signature==='wOFF'?'woff':signature==='OTTO'?'opentype':bytes[0]===0&&bytes[1]===1&&bytes[2]===0&&bytes[3]===0||signature==='true'?'truetype':(()=>{throw new Error('O arquivo não contém uma fonte compatível.');})();
 const family=await familyOf(bytes),retained=fonts.get(family);if(retained){await register(retained);return {...retained};}
 const fallback=file.name.replace(/\.(woff2?|ttf|otf)$/i,'').replace(/[_-]+/g,' ').replace(/[\u0000-\u001f]/g,'').trim().slice(0,160)||'Minha fonte';
 const mime=({woff2:'woff2',woff:'woff',truetype:'ttf',opentype:'otf'} as const)[format],src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Não foi possível ler a fonte.'));reader.readAsDataURL(new Blob([bytes],{type:'font/'+mime}));});
 const font:UserFont={family,label:format==='truetype'||format==='opentype'?sfntName(bytes)??fallback:fallback,format,src};
 try{await register(font);}catch{throw new Error('O navegador não conseguiu abrir esta fonte. Verifique se o arquivo é válido.');}
 await persist([font]);fonts.set(family,font);change();return {...font};
}
