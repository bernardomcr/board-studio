import {icon} from './icons';

export const UI_COLORS=[
 ['transparent','Transparente'],['#fff9b1','Amarelo claro'],['#f5d128','Amarelo'],['#b88600','Amarelo escuro'],
 ['#ffffff','Branco'],['#ffd0aa','Laranja claro'],['#ff9d48','Laranja'],['#ad4d00','Laranja escuro'],
 ['#f1f1f1','Cinza claro'],['#ffc7d9','Rosa claro'],['#f66060','Vermelho'],['#c62828','Vermelho escuro'],
 ['#b3b3b3','Cinza'],['#d5f692','Verde claro'],['#93d275','Verde'],['#167d37','Verde escuro'],
 ['#595959','Cinza escuro'],['#a6ccf5','Azul claro'],['#4b83d1','Azul'],['#23569a','Azul escuro'],
 ['#1a1a1a','Preto'],['#d6b6ff','Lilás'],['#a77bd4','Roxo'],['#633299','Roxo escuro'],
 ['#ef73a1','Rosa'],['#6be5d0','Turquesa claro'],['#25b8a2','Turquesa'],['#795548','Marrom'],
] as const;
const attr=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function ink(color:string){if(color==='transparent')return '#343b46';const rgb=color.slice(1).match(/../g)!.map(n=>parseInt(n,16));return rgb[0]!*.299+rgb[1]!*.587+rgb[2]!*.114>145?'#343b46':'#fff';}

/** Identical color geometry across object and mind-topic menus. */
export function uiPalette(domain:string,field:string,label:string,value:string):string{
 const custom=/^#[a-f\d]{6}$/i.test(value)?value:field==='color'||field==='borderColor'||field==='strokeColor'?'#1a1a1a':'#ffffff';
 const selected=value.toLowerCase();
 return `<div class="color-grid" aria-label="${attr(label)}">${UI_COLORS.map(([color,name])=>`<button type="button" class="color-swatch${color==='transparent'?' transparent':''}" data-color-domain="${attr(domain)}" data-color-field="${attr(field)}" data-color="${color}" style="background:${color};color:${ink(color)}" title="${name}" aria-label="${attr(label)}: ${name.toLowerCase()}" aria-pressed="${color===selected}">${color===selected?icon('check',15):''}</button>`).join('')}<label class="custom-color" title="Cor personalizada">${icon('plus',20)}<input type="color" aria-label="${attr(label)}" data-${attr(domain)}="${attr(field)}" value="${custom}"></label></div>`;
}
