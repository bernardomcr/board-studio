/** Lucide's ISC-licensed icon family; explicit imports keep the editor bundle small. */
import {
  MousePointer2, Hand, StickyNote, Shapes, Spline, Type, Pencil, Highlighter, Eraser,
  LassoSelect, Frame, Image, Undo2, Redo2, House, Search, LayoutGrid, List,
  Star, Ellipsis, X, Copy, Trash2, Folder, ArrowDownWideNarrow, ArrowLeft,
  ArrowRight, ArrowUp, ArrowDown, Download, Upload, CircleHelp, LockKeyhole,
  LockKeyholeOpen, Plus, Minus, Maximize, SquarePen, Clock3, Settings2, Check,
  ChevronDown, ChevronRight, PaintBucket, SquareDashed, Blend, Crop, Circle,
  Bold, Italic, Underline, Baseline, AlignLeft, AlignStartVertical, Group,
  Ungroup, Layers, BringToFront, SendToBack, MoveDiagonal2, Link, Tag,
  Route, ArrowLeftRight, FlipHorizontal2, Eye, EyeOff, PanelRight, SlidersHorizontal,
  AlignEndVertical, AlignCenterVertical, AlignStartHorizontal, AlignEndHorizontal,
  AlignCenterHorizontal, AlignHorizontalSpaceBetween, AlignVerticalSpaceBetween,
  RotateCw, Move, RectangleHorizontal, SquareRoundCorner, FileImage, FileCode2, type IconNode,
} from 'lucide';

const symbols:Record<string,IconNode>={
  select:MousePointer2,hand:Hand,sticky:StickyNote,sticky_note:StickyNote,shape:Shapes,
  connector:Spline,text:Type,pen:Pencil,highlighter:Highlighter,eraser:Eraser,
  lasso:LassoSelect,frame:Frame,image:Image,undo:Undo2,redo:Redo2,home:House,
  search:Search,grid:LayoutGrid,list:List,star:Star,more:Ellipsis,close:X,
  duplicate:Copy,trash:Trash2,folder:Folder,sort:ArrowDownWideNarrow,
  'arrow-left':ArrowLeft,'arrow-right':ArrowRight,'arrow-up':ArrowUp,'arrow-down':ArrowDown,
  export:Upload,download:Download,help:CircleHelp,lock:LockKeyhole,unlock:LockKeyholeOpen,
  plus:Plus,minus:Minus,fit:Maximize,rename:SquarePen,clock:Clock3,recent:Clock3,
  settings:Settings2,check:Check,'chevron-down':ChevronDown,'chevron-right':ChevronRight,
  fill:PaintBucket,stroke:SquareDashed,opacity:Blend,crop:Crop,'crop-circle':Circle,
  bold:Bold,italic:Italic,underline:Underline,'text-color':Baseline,'align-left':AlignLeft,
  align:AlignStartVertical,group:Group,ungroup:Ungroup,arrange:Layers,layers:Layers,
  front:BringToFront,back:SendToBack,size:MoveDiagonal2,link:Link,label:Tag,route:Route,
  'cap-start':ArrowLeft,'cap-end':ArrowRight,swap:ArrowLeftRight,flip:FlipHorizontal2,
  board:PanelRight,eye:Eye,'eye-off':EyeOff,panel:PanelRight,sliders:SlidersHorizontal,
  'align-left-edge':AlignStartVertical,'align-right-edge':AlignEndVertical,
  'align-center-x':AlignCenterVertical,'align-top':AlignStartHorizontal,
  'align-bottom':AlignEndHorizontal,'align-center-y':AlignCenterHorizontal,
  'distribute-x':AlignHorizontalSpaceBetween,'distribute-y':AlignVerticalSpaceBetween,
  rotation:RotateCw,position:Move,rectangle:RectangleHorizontal,'corner-radius':SquareRoundCorner,
  'file-image':FileImage,'file-code':FileCode2,
};
const cache=new Map<string,string>(),missing=new Set<string>();
const escapeAttr=(value:unknown)=>String(value).replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]!));

/** Stable 24-unit geometry, common optical size and stroke weight everywhere. */
export function icon(name:string,size=20):string {
  const key=`${name}:${size}`;const retained=cache.get(key);if(retained)return retained;
  const node=symbols[name];
  if(!node&&!missing.has(name)){missing.add(name);console.warn(`Unmapped editor icon: ${name}`);}
  const body=(node??CircleHelp).map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([key,value])=>`${key}="${escapeAttr(value)}"`).join(' ')}/>`).join('');
  const svg=`<svg class="ui-icon" data-icon="${escapeAttr(name)}"${node?'':' data-missing-icon="true"'} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  cache.set(key,svg);return svg;
}

/** Keep the existing buttons and accessible names; replace their symbols consistently. */
export function installIcons(root:ParentNode=document):void {
  for(const button of root.querySelectorAll<HTMLElement>('[data-tool]')){
    const name=button.dataset.tool!;if(!symbols[name])continue;
    const template=document.createElement('template');template.innerHTML=icon(name,22);
    const existing=button.querySelector('svg');if(existing)existing.replaceWith(template.content.firstElementChild!);else button.prepend(template.content.firstElementChild!);
  }
  const controls:Record<string,string>={undo:'undo',redo:'redo',export:'file-image','export-svg':'file-code',help:'help'};
  for(const [id,name] of Object.entries(controls)){
    const button=root.querySelector<HTMLElement>('#'+id);if(!button)continue;
    const template=document.createElement('template');template.innerHTML=icon(name,19);
    const existing=button.querySelector('svg');if(existing)existing.replaceWith(template.content.firstElementChild!);else button.prepend(template.content.firstElementChild!);
  }
  for(const [action,name] of [['out','minus'],['in','plus'],['fit','fit']]){
    const button=root.querySelector<HTMLElement>(`[data-zoom="${action}"]`);if(button)button.innerHTML=icon(name!,18);
  }
}
