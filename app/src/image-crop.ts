import type { Camera } from './core/camera';
import type { Widget } from './core/model';
import { rotate, worldToLocal, widgetAABB, type Vec } from './core/geometry';
import {workspaceTop} from './context-position';

export type ImageCrop = {x:number;y:number;width:number;height:number};
export type ImageMask = 'rectangle'|'ellipse'|'round_rectangle';
type Frame = Pick<Widget,'x'|'y'|'width'|'height'|'rotation'>;
export interface CroppableImage extends Frame {
  src:string;naturalWidth:number;naturalHeight:number;crop?:ImageCrop;maskShape?:ImageMask;
  flipX?:boolean;flipY?:boolean;opacity?:number;style:Widget['style'];
}
export type CropPatch=Frame&{crop:ImageCrop;maskShape:ImageMask};
const FULL:ImageCrop={x:0,y:0,width:1,height:1};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const displayCrop=(crop:ImageCrop,image:CroppableImage):ImageCrop=>({...crop,x:image.flipX?1-crop.x-crop.width:crop.x,y:image.flipY?1-crop.y-crop.height:crop.y});
const sourceCrop=(crop:ImageCrop,image:CroppableImage):ImageCrop=>displayCrop(crop,image);

/** Crop editing is a draft over the actual board. No model mutation happens
 * until confirmation, and moving the picture keeps its frame fixed. */
export function openImageCrop(options:{
  image:CroppableImage;camera:Camera;canvas:HTMLCanvasElement;initialMask?:ImageMask;
  valid():boolean;apply(patch:CropPatch):void;closed():void;
}){
  const {image,camera,canvas}=options,previousFocus=document.activeElement as HTMLElement|null;
  let frame:Frame={x:image.x,y:image.y,width:image.width,height:image.height,rotation:image.rotation};
  let crop={...(image.crop??FULL)},mask:ImageMask=options.initialMask??image.maskShape??'rectangle',ratio=mask==='ellipse'?1:0;
  let active=true,animation=0,lastProjection='';
  const editor=document.createElement('div');editor.className='image-crop-editor';editor.id='image-crop-editor';editor.setAttribute('role','region');editor.setAttribute('aria-label','Recortar imagem no quadro');
  editor.innerHTML=`<style>
  .image-crop-editor{position:fixed;inset:0;z-index:70;pointer-events:none;font:13px var(--font-ui,"Segoe UI",sans-serif);color:var(--ink,#25272b)}
  body.image-cropping #selection-properties{visibility:hidden}
  .image-crop-frame{position:absolute;transform-origin:center;pointer-events:auto;touch-action:none;cursor:move;outline:2px solid var(--accent,#4262ff);user-select:none}
  .image-crop-ghost,.image-crop-picture{position:absolute;max-width:none;max-height:none;pointer-events:none;user-select:none;transform-origin:center}
  .image-crop-ghost{opacity:.3}.image-crop-window{position:absolute;inset:0;overflow:hidden;pointer-events:none}
  .image-crop-frame:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(to right,transparent calc(33.333% - .5px),#ffffff70 33.333%,transparent calc(33.333% + .5px),transparent calc(66.666% - .5px),#ffffff70 66.666%,transparent calc(66.666% + .5px)),linear-gradient(to bottom,transparent calc(33.333% - .5px),#ffffff70 33.333%,transparent calc(33.333% + .5px),transparent calc(66.666% - .5px),#ffffff70 66.666%,transparent calc(66.666% + .5px))}
  .image-crop-handle{position:absolute;width:12px;height:12px;box-sizing:border-box;background:var(--panel,#fff);border:2px solid var(--accent,#4262ff);border-radius:2px;transform:translate(-50%,-50%);z-index:2}
  .image-crop-toolbar{position:absolute;display:flex;align-items:center;gap:6px;pointer-events:auto;background:var(--panel,#fff);border:1px solid var(--line,#dfe1e6);border-radius:12px;padding:7px;box-shadow:0 6px 24px #0002;white-space:nowrap}
  .image-crop-toolbar select,.image-crop-toolbar button{font:inherit;color:inherit;border:0;background:transparent;border-radius:7px;min-height:34px;cursor:pointer}
  .image-crop-toolbar select{padding:0 24px 0 10px;max-width:190px;background:var(--panel,#fff)}
  .image-crop-toolbar button{display:grid;place-items:center;width:34px;font-size:19px}.image-crop-toolbar button:hover{background:var(--cloud-100,#eef0f5)}
  .image-crop-toolbar button[data-crop-apply]{background:var(--accent,#4262ff);color:#fff}.image-crop-toolbar [data-crop-hint]{padding:0 8px;color:var(--muted,#737680);font-size:11px}
  @media(max-width:600px){.image-crop-toolbar [data-crop-hint]{display:none}.image-crop-toolbar select{max-width:150px}}
  </style><div class="image-crop-frame" data-image-crop-frame><img class="image-crop-ghost" draggable="false" alt=""><div class="image-crop-window"><img class="image-crop-picture" draggable="false" alt=""></div></div><div class="image-crop-toolbar" role="toolbar" aria-label="Opções de recorte"><select aria-label="Formato do recorte"><option value="free">Personalizado</option><option value="original">Original</option><option value="circle">Círculo</option><option value="square">Quadrado · 1:1</option><option value="portrait">Retrato · 3:4</option><option value="landscape">Paisagem · 4:3</option><option value="wide">Widescreen · 16:9</option><option value="rounded">Cantos arredondados</option></select><span data-crop-hint>Arraste a imagem · Enter confirma</span><button type="button" data-crop-cancel aria-label="Cancelar recorte" title="Cancelar (Esc)">×</button><button type="button" data-crop-apply aria-label="Aplicar recorte" title="Aplicar (Enter)">✓</button></div>`;
  const element=editor.querySelector<HTMLElement>('[data-image-crop-frame]')!,windowElement=editor.querySelector<HTMLElement>('.image-crop-window')!,toolbar=editor.querySelector<HTMLElement>('.image-crop-toolbar')!,select=editor.querySelector<HTMLSelectElement>('select')!;
  const pictures=[...editor.querySelectorAll<HTMLImageElement>('img')];for(const picture of pictures)picture.src=image.src;
  select.value=mask==='ellipse'?'circle':mask==='round_rectangle'?'rounded':'free';
  for(const handle of ['nw','n','ne','e','se','s','sw','w']){
    const grip=document.createElement('span');grip.className='image-crop-handle';grip.dataset.cropHandle=handle;grip.setAttribute('aria-label',`Redimensionar recorte ${handle}`);
    grip.style.left=handle.includes('w')?'0':handle.includes('e')?'100%':'50%';grip.style.top=handle.includes('n')?'0':handle.includes('s')?'100%':'50%';element.append(grip);
  }
  const point=(event:PointerEvent):Vec=>{const rect=canvas.getBoundingClientRect();return camera.screenToWorld({x:event.clientX-rect.left,y:event.clientY-rect.top});};
  function moveFrame(left:number,top:number,width:number,height:number){
    const center=rotate({x:left+(width-frame.width)/2,y:top+(height-frame.height)/2},frame.rotation);
    frame={...frame,x:frame.x+frame.width/2+center.x-width/2,y:frame.y+frame.height/2+center.y-height/2,width,height};
  }
  /** Change the viewport while keeping the source image fixed on the board. */
  function viewport(next:ImageCrop){
    const old=displayCrop(crop,image),display=displayCrop(next,image),sourceWidth=frame.width/crop.width,sourceHeight=frame.height/crop.height;
    moveFrame((display.x-old.x)*sourceWidth,(display.y-old.y)*sourceHeight,next.width*sourceWidth,next.height*sourceHeight);crop={...next};
  }
  function preset(value:string){
    if(value==='original'){mask='rectangle';ratio=0;viewport({...FULL});}
    else if(value==='free'||value==='rounded'){mask=value==='rounded'?'round_rectangle':'rectangle';ratio=0;}
    else{
      mask=value==='circle'?'ellipse':'rectangle';ratio=value==='portrait'?3/4:value==='landscape'?4/3:value==='wide'?16/9:1;
      const sourceWidth=frame.width/crop.width,sourceHeight=frame.height/crop.height,normalized=ratio*sourceHeight/sourceWidth;
      const width=Math.min(1,normalized),height=width/normalized;
      viewport({x:clamp(crop.x+crop.width/2-width/2,0,1-width),y:clamp(crop.y+crop.height/2-height/2,0,1-height),width,height});
    }
    paint();
  }
  function paint(){
    if(!active)return;
    const origin=canvas.getBoundingClientRect(),center=camera.worldToScreen({x:frame.x+frame.width/2,y:frame.y+frame.height/2}),width=frame.width*camera.scale,height=frame.height*camera.scale,display=displayCrop(crop,image),sourceWidth=width/crop.width,sourceHeight=height/crop.height;
    Object.assign(element.style,{left:`${origin.left+center.x}px`,top:`${origin.top+center.y}px`,width:`${width}px`,height:`${height}px`,transform:`translate(-50%,-50%) rotate(${frame.rotation}rad)`,borderRadius:mask==='ellipse'?'50%':mask==='round_rectangle'?'8px':'0'});
    const radius=Math.min(image.style.cornerRadius??Math.min(frame.width,frame.height)*.12,Math.min(frame.width,frame.height)/2)*camera.scale;
    windowElement.style.borderRadius=mask==='ellipse'?'50%':mask==='round_rectangle'?`${radius}px`:'0';
    for(const picture of pictures)Object.assign(picture.style,{width:`${sourceWidth}px`,height:`${sourceHeight}px`,left:`${-display.x*sourceWidth}px`,top:`${-display.y*sourceHeight}px`,transform:`scale(${image.flipX?-1:1},${image.flipY?-1:1})`});
    pictures[1]!.style.opacity=String(image.opacity??1);
    for(const handle of element.querySelectorAll<HTMLElement>('[data-crop-handle]')){
      const id=handle.dataset.cropHandle!,directions=['e','se','s','sw','w','nw','n','ne'];
      const base=id==='e'?0:id==='se'?1:id==='s'?2:id==='sw'?3:id==='w'?4:id==='nw'?5:id==='n'?6:7;
      handle.style.cursor=`${directions[((base+Math.round(frame.rotation/(Math.PI/4)))%8+8)%8]}-resize`;
    }
    const bounds=widgetAABB(frame as Widget),top=camera.worldToScreen({x:bounds.minX,y:bounds.minY}).y+origin.top,bottom=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY}).y+origin.top;
    const safeTop=workspaceTop();editor.style.clipPath=`inset(${Math.max(0,safeTop-10)}px 0 0 0)`;
    const bar=toolbar.getBoundingClientRect(),left=clamp(center.x+origin.left-bar.width/2,8,Math.max(8,innerWidth-bar.width-8));
    Object.assign(toolbar.style,{left:`${left}px`,top:`${clamp(top-bar.height-22>=safeTop?top-bar.height-22:bottom+22,safeTop,Math.max(safeTop,innerHeight-bar.height-16))}px`});
    element.dataset.crop=JSON.stringify(crop);element.dataset.frame=JSON.stringify(frame);element.dataset.mask=mask;
  }
  type Drag={pointer:number;start:Vec;frame:Frame;crop:ImageCrop;mode:string};let drag:Drag|null=null;
  element.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();
    drag={pointer:event.pointerId,start:point(event),frame:{...frame},crop:{...crop},mode:(event.target as HTMLElement).dataset.cropHandle??'pan'};element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove',event=>{
    if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();
    const old=drag.frame,origin=worldToLocal(old as Widget,drag.start),now=worldToLocal(old as Widget,point(event)),dx=now.x-origin.x,dy=now.y-origin.y;
    const display=displayCrop(drag.crop,image),sourceWidth=old.width/drag.crop.width,sourceHeight=old.height/drag.crop.height;
    frame={...old};crop={...drag.crop};
    if(drag.mode==='pan'){
      crop=sourceCrop({...display,x:clamp(display.x-dx/sourceWidth,0,1-display.width),y:clamp(display.y-dy/sourceHeight,0,1-display.height)},image);paint();return;
    }
    const minW=sourceWidth/image.naturalWidth,minH=sourceHeight/image.naturalHeight;
    const sourceLeft=-display.x*sourceWidth,sourceTop=-display.y*sourceHeight,sourceRight=sourceLeft+sourceWidth,sourceBottom=sourceTop+sourceHeight;
    let left=0,top=0,right=old.width,bottom=old.height;
    if(drag.mode.includes('w'))left=clamp(dx,sourceLeft,right-minW);if(drag.mode.includes('e'))right=clamp(old.width+dx,left+minW,sourceRight);
    if(drag.mode.includes('n'))top=clamp(dy,sourceTop,bottom-minH);if(drag.mode.includes('s'))bottom=clamp(old.height+dy,top+minH,sourceBottom);
    let width=right-left,height=bottom-top;
    if(ratio){
      if(drag.mode==='n'||drag.mode==='s'){width=height*ratio;left=(old.width-width)/2;}
      else if(drag.mode.length===2&&Math.abs(dy/old.height)>Math.abs(dx/old.width)){width=height*ratio;if(drag.mode.includes('w'))left=right-width;}
      else{height=width/ratio;if(drag.mode.includes('n'))top=bottom-height;else if(drag.mode==='e'||drag.mode==='w')top=(old.height-height)/2;}
      const scale=Math.min(1,sourceWidth/width,sourceHeight/height);width*=scale;height*=scale;
      if(drag.mode.includes('w'))left=right-width;if(drag.mode.includes('n'))top=bottom-height;
      left=clamp(left,sourceLeft,sourceRight-width);top=clamp(top,sourceTop,sourceBottom-height);
    }
    const next=sourceCrop({x:clamp(display.x+left/sourceWidth,0,1),y:clamp(display.y+top/sourceHeight,0,1),width:width/sourceWidth,height:height/sourceHeight},image);
    moveFrame(left,top,width,height);crop=next;paint();
  });
  const stopDrag=(event:PointerEvent)=>{if(drag?.pointer===event.pointerId){drag=null;if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);}};
  element.addEventListener('pointerup',stopDrag);element.addEventListener('pointercancel',stopDrag);element.addEventListener('lostpointercapture',()=>{drag=null;});
  // Reuse the application's wheel navigation, including its modifier semantics.
  element.addEventListener('wheel',event=>{event.preventDefault();canvas.dispatchEvent(new WheelEvent('wheel',{clientX:event.clientX,clientY:event.clientY,deltaX:event.deltaX,deltaY:event.deltaY,deltaZ:event.deltaZ,deltaMode:event.deltaMode,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey,bubbles:true,cancelable:true}));},{passive:false});
  function close(commit:boolean,restoreFocus=true){
    if(!active)return;active=false;cancelAnimationFrame(animation);document.removeEventListener('keydown',keyboard,true);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',focusOutside,true);editor.remove();document.body.classList.remove('image-cropping');
    if(commit&&options.valid())options.apply({...frame,crop:{...crop},maskShape:mask});options.closed();
    if(restoreFocus)queueMicrotask(()=>{const focus=previousFocus?.isConnected?previousFocus:document.querySelector<HTMLElement>('#selection-properties [data-action="crop"]');focus?.focus({preventScroll:true});});
  }
  function keyboard(event:KeyboardEvent){
    event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close(false);}else if(event.key==='Enter'){event.preventDefault();close(true);}
  }
  function outside(event:PointerEvent){if(!editor.contains(event.target as Node))close(false,false);}
  function focusOutside(event:FocusEvent){if(!editor.contains(event.target as Node))close(false,false);}
  // A native pointer focus sequence briefly exposes body between blur/focus.
  // Wait for the complete sequence before deciding that focus left the editor.
  editor.addEventListener('focusout',()=>setTimeout(()=>{if(active&&!editor.contains(document.activeElement))close(false,false);},0));
  select.addEventListener('change',()=>preset(select.value));editor.querySelector('[data-crop-apply]')!.addEventListener('click',()=>close(true));editor.querySelector('[data-crop-cancel]')!.addEventListener('click',()=>close(false));
  document.addEventListener('keydown',keyboard,true);document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',focusOutside,true);document.body.append(editor);document.body.classList.add('image-cropping');
  if(mask==='ellipse')preset('circle');else paint();
  const tick=()=>{if(!active)return;if(!options.valid()){close(false,false);return;}const rect=canvas.getBoundingClientRect(),signature=[camera.x,camera.y,camera.scale,camera.width,camera.height,rect.left,rect.top,innerWidth,innerHeight].join('|');if(signature!==lastProjection){lastProjection=signature;paint();}animation=requestAnimationFrame(tick);};animation=requestAnimationFrame(tick);
  select.focus({preventScroll:true});return {close:()=>close(false,false)};
}
