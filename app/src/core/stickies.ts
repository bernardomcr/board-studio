import type {StickyWidget} from './model';

export const STICKY_PAD_WIDTH=245;
export const STICKY_PAD_HEIGHT=355;
/** The source is a card, not a note. Legacy bounds stay intact; fit the same
 * reference card inside them, while detached sheets always remain square. */
export function stickyPadLayout(widget:Pick<StickyWidget,'width'|'height'>){
  const unit=Math.min(widget.width/STICKY_PAD_WIDTH,widget.height/STICKY_PAD_HEIGHT);
  const card={x:(widget.width-STICKY_PAD_WIDTH*unit)/2,y:(widget.height-STICKY_PAD_HEIGHT*unit)/2,width:STICKY_PAD_WIDTH*unit,height:STICKY_PAD_HEIGHT*unit};
  return {unit,card,paper:{x:card.x+26*unit,y:card.y+113*unit,width:193*unit,height:193*unit},title:{x:card.x+25*unit,y:card.y+23*unit},depth:23*unit,radius:12*unit};
}
export function stickyPadPaper(widget:Pick<StickyWidget,'width'|'height'>){return stickyPadLayout(widget).paper;}
export interface StickyPaperCurve {left:number;right:number;control1:number;control2:number;tipX:number}
/** Normalized front edge from the observed Miro stack: a quiet curl at rest,
 * lifting farther on hover. A moving sheet settles back to a square. */
export function stickyPaperCurve(lift=0):StickyPaperCurve{
  const t=Math.max(0,Math.min(1,lift));return {left:1-.09*t,right:.90-.185*t,control1:.995-.085*t,control2:.98-.14*t,tipX:-.026*t};
}
export function stickyFoldPath(x:number,y:number,side:number,lift=0):string{
  const t=Math.max(0,Math.min(1,lift)),n=(v:number)=>String(Number(v.toFixed(5))),point=(px:number,py:number)=>`${n(x+side*px)} ${n(y+side*py)}`;
  return `M${point(.79-.06*t,.835-.015*t)}Q${point(.86-.05*t,.79-.07*t)} ${point(.935-.015*t,.75-.155*t)}L${point(1+.01*t,.90-.185*t)}Q${point(.88-.02*t,.87-.10*t)} ${point(.79-.06*t,.835-.015*t)}Z`;
}
export function stickyPaperPath(x:number,y:number,side:number,lift=0):string{
  const p=stickyPaperCurve(lift),n=(v:number)=>String(Number(v.toFixed(5)));
  return `M${n(x)} ${n(y)}H${n(x+side)}V${n(y+side*p.right)}C${n(x+side*.72)} ${n(y+side*p.control2)} ${n(x+side*.28)} ${n(y+side*p.control1)} ${n(x+side*p.tipX)} ${n(y+side*p.left)}Z`;
}
const xml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Shared vector card for the picker and exports. IDs are scoped per object. */
export function stickyPadSvg(widget:Pick<StickyWidget,'width'|'height'>,color:string,opacity=1,id='sticky-pad',ui=false):string{
  const {unit:u,card:c,paper:p,depth,radius}=stickyPadLayout(widget),key=id.replace(/[^a-zA-Z0-9_-]/g,'')||'sticky-pad',front=stickyPaperPath(p.x,p.y,p.width),hover=stickyPaperPath(p.x,p.y,p.width,1),fold=stickyFoldPath(p.x,p.y,p.width),foldHover=stickyFoldPath(p.x,p.y,p.width,1),surface=ui?'var(--studio-surface,#ffffff)':'#ffffff',ink=ui?'var(--studio-ink,#24252b)':'#24252b';
  return `<g data-sticky-pad="true"><defs><linearGradient id="${key}-paper" x1="0" y1="0" x2=".12" y2="1"><stop stop-color="${xml(color)}"/><stop offset=".58" stop-color="${xml(color)}"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient><linearGradient id="${key}-shadow" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect x="${c.x}" y="${c.y+u*2}" width="${c.width}" height="${c.height}" rx="${radius}" fill="#000" fill-opacity=".07"/><rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="${radius}" fill="${surface}" stroke="${ui?'var(--studio-line,#dedfe3)':'#dedfe3'}" stroke-width="${u}"/><text x="${c.x+25*u}" y="${c.y+49*u}" font-family="Noto Sans, sans-serif" font-size="${25*u}" font-weight="500" fill="${ink}"><tspan x="${c.x+25*u}">Bloco de notas</tspan><tspan x="${c.x+25*u}" dy="${31*u}">adesivas</tspan></text><g opacity="${opacity}"><rect x="${p.x-9*u}" y="${p.y+p.height-7*u}" width="${p.width+18*u}" height="${depth+18*u}" rx="${10*u}" fill="url(#${key}-shadow)"/><rect x="${p.x}" y="${p.y+depth}" width="${p.width}" height="${p.height}" fill="${xml(color)}"/><rect x="${p.x}" y="${p.y+p.height}" width="${p.width}" height="${depth}" fill="#000" fill-opacity=".18"/><rect x="${p.x}" y="${p.y+depth*.35}" width="${p.width}" height="${p.height}" fill="${xml(color)}"/><rect x="${p.x}" y="${p.y+p.height}" width="${p.width}" height="${depth*.35}" fill="#fff" fill-opacity=".16"/><path class="sticky-card-leaf-shadow" data-rest="${xml(front)}" data-lift="${xml(hover)}" d="${front}" fill="#000" fill-opacity=".11" transform="translate(0 ${4*u})"/><path class="sticky-card-leaf" data-rest="${xml(front)}" data-lift="${xml(hover)}" d="${front}" fill="url(#${key}-paper)"/><path class="sticky-card-fold" data-rest="${xml(fold)}" data-lift="${xml(foldHover)}" d="${fold}" fill="${xml(color)}"/><path class="sticky-card-fold-light" data-rest="${xml(fold)}" data-lift="${xml(foldHover)}" d="${fold}" fill="#fff" fill-opacity=".22"/></g></g>`;
}
