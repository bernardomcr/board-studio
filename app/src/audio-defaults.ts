import type {Style} from './core/model';

const KEY='board-studio-audio-style-v1';
const fields=['fillColor','fillOpacity','borderColor','borderWidth','borderScale','borderStyle','borderOpacity','cornerRadius','color'] as const;
let retained:Partial<Style>|undefined;
function sanitized(value:unknown):Partial<Style>{
 if(!value||typeof value!=='object')return {};const source=value as Record<string,unknown>,result:Record<string,unknown>={};
 for(const field of fields){const item=source[field];
  if(['fillColor','borderColor','color'].includes(field)){if(typeof item==='string'&&/^(#[\da-f]{3,8}|transparent|black|white|rgba?\([\d\s.,%]+\))$/i.test(item))result[field]=item;}
  else if(field==='borderStyle'){if(['normal','dashed','dotted'].includes(String(item)))result[field]=item;}
  else if(typeof item==='number'&&Number.isFinite(item)&&item>=0){result[field]=field==='fillOpacity'||field==='borderOpacity'?Math.min(1,item):item;}
 }
 return result as Partial<Style>;
}
/** Styling preferences apply to newly imported/recorded audio, independently of boards/history. */
export function audioDefaults():Partial<Style>{
 if(!retained){try{retained=sanitized(JSON.parse(localStorage.getItem(KEY)??'null'));}catch{retained={};}}
 return {...retained};
}
export function rememberAudioDefaults(patch:Partial<Style>):void{
 retained={...audioDefaults(),...sanitized(patch)};try{localStorage.setItem(KEY,JSON.stringify(retained));}catch{/* The player remains editable if storage is full. */}
}
