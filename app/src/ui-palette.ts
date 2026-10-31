import {icon} from './icons';
import {getBrandColors,installBrandColors} from './brand-colors';

export const UI_COLORS=[
 ['transparent','Transparente'],['#fff9b1','Amarelo claro'],['#f5d128','Amarelo'],['#b88600','Amarelo escuro'],
 ['#ffffff','Branco'],['#ffd0aa','Laranja claro'],['#ff9d48','Laranja'],['#ad4d00','Laranja escuro'],
 ['#f1f1f1','Cinza claro'],['#ffc7d9','Rosa claro'],['#f66060','Vermelho'],['#c62828','Vermelho escuro'],
 ['#b3b3b3','Cinza'],['#d5f692','Verde claro'],['#93d275','Verde'],['#167d37','Verde escuro'],
 ['#595959','Cinza escuro'],['#a6ccf5','Azul claro'],['#4b83d1','Azul'],['#23569a','Azul escuro'],
 ['#1a1a1a','Preto'],['#d6b6ff','Lilás'],['#a77bd4','Roxo'],['#633299','Roxo escuro'],
 ['#ef73a1','Rosa'],['#6be5d0','Turquesa claro'],['#25b8a2','Turquesa'],['#795548','Marrom'],
] as const;
const PAINT_ORDER=['transparent','#fff9b1','#ffd0aa','#ffc7d9','#d5f692','#a6ccf5','#d6b6ff','#f5d128','#ff9d48','#f66060','#93d275','#4b83d1','#a77bd4','#b88600','#ad4d00','#c62828','#167d37','#23569a','#633299','#ffffff','#f1f1f1','#b3b3b3','#595959','#1a1a1a','#ef73a1','#6be5d0','#25b8a2','#795548'];
const TEXT_ORDER=['#fff9b1','#f5d128','#b88600','#ffffff','#ffd0aa','#ff9d48','#ad4d00','#f1f1f1','#ffc7d9','#f66060','#c62828','#b3b3b3','#d5f692','#93d275','#167d37','#595959','#a6ccf5','#4b83d1','#23569a','#1a1a1a','#d6b6ff','#a77bd4','#633299','#ef73a1','#6be5d0','#25b8a2','#795548','transparent'];
export function paletteColors(domain:string,field:string):ReadonlyArray<readonly[string,string]>{const order=field==='highlightColor'?undefined:field==='color'&&['field','mind-format'].includes(domain)?TEXT_ORDER:PAINT_ORDER;return order?order.map(color=>UI_COLORS.find(([value])=>value===color)!):UI_COLORS;}
const attr=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function ink(color:string){if(color==='transparent')return '#343b46';const rgb=color.slice(1).match(/../g)!.map(n=>parseInt(n,16));return rgb[0]!*.299+rgb[1]!*.587+rgb[2]!*.114>145?'#343b46':'#fff';}

/** Identical color geometry across object and mind-topic menus. */
export function uiPalette(domain:string,field:string,label:string,value:string):string{
 installBrandColors();
 const custom=/^#[a-f\d]{6}$/i.test(value)?value:field==='color'||field==='borderColor'||field==='strokeColor'?'#1a1a1a':'#ffffff';
 const selected=value.toLowerCase();
 const swatch=(color:string,name:string,brand=false)=>`<button type="button" class="color-swatch${color==='transparent'?' transparent':''}" data-color-domain="${attr(domain)}" data-color-field="${attr(field)}" data-color="${color}" style="background:${color};color:${ink(color)}" title="${attr(name)}" aria-label="${attr(label)}: ${brand?'marca ':''}${attr(name.toLowerCase())}" aria-pressed="${color===selected}"></button>`;
 const brands=getBrandColors();
 return `<section class="palette-section"><div class="palette-heading"><span>Cores da marca</span><button type="button" data-brand-manage aria-label="Gerenciar cores da marca" title="Gerenciar cores da marca">${icon('settings',15)}</button></div>${brands.length?`<div class="color-grid brand-color-grid" aria-label="Cores da marca: ${attr(label)}">${brands.map(item=>swatch(item.color,item.name,true)).join('')}</div>`:''}<button type="button" class="palette-add" data-brand-add aria-label="Adicionar cores da marca">+ Adicionar cores</button><div class="palette-heading">Todas as cores</div><div class="color-grid" aria-label="${attr(label)}">${paletteColors(domain,field).map(([color,name])=>swatch(color,name)).join('')}<label class="custom-color" title="Cor personalizada">${icon('plus',20)}<input type="color" aria-label="${attr(label)}" data-${attr(domain)}="${attr(field)}" value="${custom}"></label></div></section>`;
}
