import { Assets, Container, Graphics, Sprite, Texture, type Application } from "pixi.js";
import type { BoardState, CommandBus } from "./core/commands";
import type { Camera } from "./core/camera";
import { SHAPE_STYLE, nextId, type Widget } from "./core/model";
import type { Vec } from "./core/geometry";
import { borderPattern, patternedContour, shapeContours } from "./core/shapes";
import {resolvedWidgetStyle} from './core/style-scale';
import {configureRasterSampling} from './render/raster-quality';
import {installClipboardImages} from './clipboard-images';

type Crop = { x: number; y: number; width: number; height: number };
type MaskShape = "rectangle" | "ellipse" | "round_rectangle";
type ImageItem = Omit<Widget, "type"> & { type: "image"; src: string; naturalWidth: number; naturalHeight: number; crop?: Crop; content: string; maskShape?: MaskShape; flipX?: boolean; flipY?: boolean; opacity?: number };
interface ImageAPI {
  state: BoardState; bus: CommandBus; camera: Camera; app: Application;
  world: Container; nodeAt?: (id: string) => Container | undefined; onChange?: () => void;
  getBoardKey?(): string | null;
}
export interface ImageImportOptions{point?:Vec;label?:string;afterCreate?(ids:string[]):void;canInsert?():boolean}
const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };
const asImage = (w: Widget | undefined): ImageItem | undefined => (w as unknown as ImageItem)?.type === "image" ? w as unknown as ImageItem : undefined;

/** Cropping keeps the retained source pixels fixed on the board, even after rotation/flips. */
function cropGeometry(image: ImageItem, crop: Crop) {
  const old=image.crop??FULL,width=image.width*crop.width/old.width,height=image.height*crop.height/old.height;
  let dx=((crop.x+crop.width/2)-(old.x+old.width/2))*image.width/old.width;
  let dy=((crop.y+crop.height/2)-(old.y+old.height/2))*image.height/old.height;
  if(image.flipX)dx=-dx;if(image.flipY)dy=-dy;
  const c=Math.cos(image.rotation),s=Math.sin(image.rotation);
  return {crop,width,height,x:image.x+image.width/2+dx*c-dy*s-width/2,y:image.y+image.height/2+dx*s+dy*c-height/2};
}

/** Local images use the same command history, geometry and storage as other widgets. */
export function installImages(api: ImageAPI) {
  const { state, bus, camera, world } = api;
  const layer = new Container();
  layer.sortableChildren = true;
  if (!api.nodeAt) world.addChild(layer);
  const nodes = new Map<string, { container: Container; sprite: Sprite; mask: Graphics; border: Graphics; src: string; sig:string }>();
  const textures = new Map<string, Promise<Texture>>();
  let modal: HTMLElement | null = null;
  const selected = () => state.selection.size === 1 ? asImage(state.widgets.get([...state.selection][0]!)) : undefined;
  const changed = () => { sync(); api.onChange?.(); };
  const sameBoard = (key: string | null | undefined) => !api.getBoardKey || api.getBoardKey() === key;

  function notice(message: string) {
    const toast = document.createElement("div");
    toast.setAttribute('role','status');
    toast.textContent = message;
    toast.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#191812;color:white;border-radius:8px;padding:12px 18px;z-index:100;font:14px Segoe UI,sans-serif;max-width:90vw";
    document.body.append(toast); setTimeout(() => toast.remove(), 5000);
  }

  function sync() {
    for (const [id, node] of nodes) {
      if (!asImage(state.widgets.get(id)) || node.container.destroyed) { if (!node.container.destroyed) node.container.destroy({ children: true }); nodes.delete(id); }
    }
    for (const item of state.widgets.values()) {
      const w = asImage(item); if (!w) continue;
      const parent = api.nodeAt?.(w.id) ?? layer;
      let node = nodes.get(w.id);
      if (!node) {
        const container = new Container();
        const sprite = new Sprite(Texture.WHITE);
        sprite.tint = 0xe7e7e5;
        const mask = new Graphics();
        const border = new Graphics();
        container.addChild(sprite, mask, border); sprite.mask = mask;
        parent.addChild(container);
        node = { container, sprite, mask, border, src: "", sig:'' }; nodes.set(w.id, node);
      }
      if (node.container.parent !== parent) parent.addChild(node.container);
      if (!api.nodeAt) {
        node.container.pivot.set(w.width / 2, w.height / 2);
        node.container.position.set(w.x + w.width / 2, w.y + w.height / 2);
        node.container.rotation = w.rotation;
        node.container.zIndex = w.z;
      }
      const crop = w.crop ?? FULL;
      if(node.src!==w.src)node.sig='';
      const sig=[w.width,w.height,crop.x,crop.y,crop.width,crop.height,w.maskShape,w.flipX,w.flipY,w.opacity,w.style.borderWidth,w.style.borderScale,w.style.borderColor,w.style.borderStyle,w.style.borderOpacity,w.style.cornerRadius,Math.round(Math.log2(Math.max(.02,camera.scale))*2)].join('|');
      if(node.sig!==sig){
      node.sig=sig;
      // The picture and its outline have independent opacity controls.
      node.container.alpha = 1;
      node.sprite.alpha = Math.max(0, Math.min(1, w.opacity ?? 1));
      const cornerRadius=Math.max(0,Math.min(w.style.cornerRadius??Math.min(w.width,w.height)*.12,Math.min(w.width,w.height)/2));
      node.mask.clear();
      if (w.maskShape === "ellipse") node.mask.ellipse(w.width/2, w.height/2, w.width/2, w.height/2);
      else if (w.maskShape === "round_rectangle") node.mask.roundRect(0, 0, w.width, w.height, cornerRadius);
      else node.mask.rect(0, 0, w.width, w.height);
      node.mask.fill(0xffffff);
      node.border.clear();
      const { borderWidth, borderColor, borderStyle, borderOpacity = 1 } = resolvedWidgetStyle(w);
      if (borderWidth > 0 && borderColor !== "transparent" && borderOpacity > 0) {
        const shape = w.maskShape === "ellipse" ? "circle" : w.maskShape ?? "rectangle";
        const radius = cornerRadius;
        const pattern = borderPattern(borderWidth, borderStyle);
        if (pattern) {
          for (const contour of shapeContours(shape, w.width, w.height, camera.scale, radius)) {
            const pieces = patternedContour(contour, pattern.dash, pattern.gap);
            if (pattern.dash === 0) {
              for (const p of pieces) node.border.circle(p[0]!, p[1]!, borderWidth / 2);
              node.border.fill({ color: borderColor, alpha: borderOpacity });
            } else {
              for (const p of pieces) {
                node.border.moveTo(p[0]!, p[1]!);
                for (let i = 2; i < p.length; i += 2) node.border.lineTo(p[i]!, p[i + 1]!);
              }
              node.border.stroke({ color: borderColor, alpha: borderOpacity, width: borderWidth, cap: "butt", join: "round" });
            }
          }
        } else {
          if (w.maskShape === "ellipse") node.border.ellipse(w.width/2, w.height/2, w.width/2, w.height/2);
          else if (w.maskShape === "round_rectangle") node.border.roundRect(0, 0, w.width, w.height, radius);
          else node.border.rect(0, 0, w.width, w.height);
          node.border.stroke({ color: borderColor, alpha: borderOpacity, width: borderWidth, join: "round" });
        }
      }
      const imageWidth = w.width / Math.max(.001, crop.width), imageHeight = w.height / Math.max(.001, crop.height);
      node.sprite.width = imageWidth; node.sprite.height = imageHeight;
      node.sprite.scale.x = Math.abs(node.sprite.scale.x) * (w.flipX ? -1 : 1);
      node.sprite.scale.y = Math.abs(node.sprite.scale.y) * (w.flipY ? -1 : 1);
      node.sprite.position.set(w.flipX ? w.width + crop.x*imageWidth : -crop.x*imageWidth, w.flipY ? w.height + crop.y*imageHeight : -crop.y*imageHeight);
      }
      if (node.src !== w.src) {
        node.src = w.src;
        let pending = textures.get(w.src);
        if (!pending) { pending = Assets.load<Texture>(w.src); textures.set(w.src, pending); }
        const current = node, source = w.src;
        pending.then(texture => {
          if (current.container.destroyed || nodes.get(w.id) !== current || current.src !== source) return;
          configureRasterSampling(texture);
          current.sprite.texture = texture; current.sprite.tint = 0xffffff; current.sig='';
          sync(); api.onChange?.();
        }).catch(() => notice("Não foi possível abrir esta imagem."));
      }
    }
  }

  async function readImage(file: File): Promise<{src:string;naturalWidth:number;naturalHeight:number}> {
    if(file.size>25*1024*1024) throw new Error("Escolha uma imagem de até 25 MB.");
    if(!/^image\/(png|jpe?g|webp|gif|avif|bmp|x-ms-bmp|svg\+xml)$/i.test(file.type)) throw new Error("Use PNG, JPEG, WebP, GIF, AVIF, BMP ou SVG.");
    let blob:Blob=file;const svg=file.type==="image/svg+xml";
    if(svg){
      const doc=new DOMParser().parseFromString(await file.text(),"image/svg+xml");
      if(doc.querySelector("parsererror")||doc.documentElement.localName!=="svg")throw new Error("SVG inválido.");
      for(const element of [...doc.querySelectorAll("script,foreignObject,iframe,object,embed,style,animate,animateMotion,animateTransform,set")])element.remove();
      for(const element of [...doc.querySelectorAll("*")])for(const attribute of [...element.attributes]){
        const name=attribute.name.toLowerCase(),value=attribute.value.trim();
        if(name.startsWith("on")||name==="style"||((name==="href"||name==="xlink:href")&&!value.startsWith("#"))||(/url\(/i.test(value)&&!/^url\(\s*#[\w-]+\s*\)$/i.test(value)))element.removeAttribute(attribute.name);
      }
      blob=new Blob([new XMLSerializer().serializeToString(doc)],{type:"image/svg+xml"});
    }
    const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("Falha ao ler o arquivo."));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(blob);});
    const image=new Image();image.src=src;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>16384||image.naturalHeight>16384||image.naturalWidth*image.naturalHeight>64_000_000)throw new Error("A imagem excede 64 megapixels ou 16384 pixels por lado.");
    if(!svg)return {src,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};
    const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext("2d")!.drawImage(image,0,0);
    return {src:canvas.toDataURL("image/png"),naturalWidth:canvas.width,naturalHeight:canvas.height};
  }

  async function importFiles(files: FileList | File[], pointOrOptions?:Vec|ImageImportOptions) {
    const boardKey = api.getBoardKey?.();
    const options:ImageImportOptions=pointOrOptions&&'x'in pointOrOptions?{point:pointOrOptions}:pointOrOptions??{};
    const decoded:Array<{src:string;naturalWidth:number;naturalHeight:number}>=[],center=options.point??{x:camera.x,y:camera.y};
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 25 * 1024 * 1024) { notice("Escolha uma imagem de até 25 MB."); continue; }
      try {
        decoded.push(await readImage(file));
      } catch(error) { notice(`${file.name}: ${error instanceof Error?error.message:"Não foi possível importar a imagem."}`); }
    }
    const ids:string[]=[];
    if(!sameBoard(boardKey)||options.canInsert&&!options.canInsert()){notice('O tópico ou o board mudou. Escolha a imagem novamente no destino desejado.');return ids;}
    if(decoded.length){bus.beginTransaction(options.label??'Inserir imagens');try{
      for(const source of decoded){
        const scale = Math.min(1, 520 / source.naturalWidth, 420 / source.naturalHeight);
        const width = source.naturalWidth * scale, height = source.naturalHeight * scale;
        const image: ImageItem = {
          id: nextId("image"), type: "image", ...source,
          x: center.x - width / 2 + ids.length * 24, y: center.y - height / 2 + ids.length * 24,
          width, height, rotation: 0, z: 0, content: "", style: { ...SHAPE_STYLE, borderWidth: 0, fillColor: "transparent" },
        };
        bus.exec({ op: "WIDGET_CREATE", payload: image }); ids.push(image.id);
      }
      options.afterCreate?.(ids);
      bus.exec({ op: "SELECTION_SET", payload: ids });
    }finally{bus.endTransaction();}
    }
    sync(); api.onChange?.();
    return ids;
  }

  function replaceSelected() {
    const original=selected();if(!original||original.locked)return;
    const boardKey=api.getBoardKey?.();
    const input=document.createElement("input");input.type="file";input.accept="image/*";
    input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{
      const source=await readImage(file),current=asImage(state.widgets.get(original.id));if(!sameBoard(boardKey)||!current||current.locked||current.src!==original.src)return;
      bus.exec({op:"WIDGET_UPDATE",payload:{id:current.id,patch:{...source,crop:{...FULL}}}});changed();
    }catch(error){notice(error instanceof Error?error.message:"Não foi possível substituir a imagem.");}};input.click();
  }
  function flipSelected(axis:"x"|"y") {
    const image=selected();if(!image||image.locked)return;
    bus.exec({op:"WIDGET_UPDATE",payload:{id:image.id,patch:axis==="x"?{flipX:!image.flipX}:{flipY:!image.flipY}}});changed();
  }
  function setMask(maskShape:MaskShape) {
    const image=selected();if(!image||image.locked)return;
    bus.exec({op:"WIDGET_UPDATE",payload:{id:image.id,patch:{maskShape}}});changed();
  }
  function downloadSelected() {
    const image=selected();if(!image)return;
    const type=image.src.match(/^data:image\/([\w.+-]+)/)?.[1]??"png";
    const link=document.createElement("a");link.href=image.src;link.download=`imagem-original.${type==="jpeg"?"jpg":type}`;link.click();
  }

  function cropSelected(initialMask?: MaskShape) {
    const image = asImage(state.widgets.get([...state.selection][0] ?? ""));
    if (!image || image.locked || state.selection.size !== 1 || modal) return;
    const boardKey=api.getBoardKey?.();
    const previousFocus=document.activeElement as HTMLElement|null;
    const dialog = document.createElement("div"); modal = dialog;
    dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "Recortar imagem");
    dialog.style.cssText = "position:fixed;inset:0;z-index:90;background:#19181299;display:grid;place-items:center;font:14px Segoe UI,sans-serif";
    dialog.innerHTML = `<section style="background:white;border-radius:12px;padding:22px;width:min(880px,94vw);max-height:96vh;overflow:auto;box-sizing:border-box;box-shadow:0 16px 60px #0004"><h2 style="margin:0 0 8px;font-size:18px">Recortar imagem</h2><p style="margin:0 0 16px;color:#73726c">Mova a área ou arraste as alças. O arquivo original é preservado.</p><div role="group" aria-label="Formato do recorte" style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap"><button data-mask="rectangle">Retângulo</button><button data-mask="ellipse">Círculo</button><button data-mask="round_rectangle">Cantos arredondados</button></div><div data-preview style="position:relative;margin:auto;max-width:100%;touch-action:none;cursor:crosshair;user-select:none;overflow:hidden"><img data-source draggable="false" style="display:block;width:100%;height:100%;pointer-events:none;filter:brightness(.42)"><div data-region style="position:absolute;box-sizing:border-box;cursor:move"><div data-crop-window style="position:absolute;inset:0;overflow:hidden;outline:2px solid #3859ff"><div data-crop-flip style="position:absolute;inset:0;pointer-events:none"><img data-crop-source draggable="false" style="position:absolute;max-width:none;pointer-events:none"></div></div></div></div><div style="display:flex;gap:6px;align-items:center;margin-top:18px;flex-wrap:wrap"><button data-full>Imagem inteira</button><button data-free>Proporção livre</button><button data-square>1:1</button><button data-wide>16:9</button><button data-ratio="1.3333333333333333">4:3</button><button data-ratio="1.5">3:2</button><button data-new>Nova área</button><span style="flex:1"></span><button data-cancel>Cancelar</button><button data-apply style="background:#3859ff;color:white">Aplicar recorte</button></div><p data-ratio-status style="margin:12px 0 0;font-size:12px;color:#73726c"></p></section>`;
    for (const button of dialog.querySelectorAll<HTMLButtonElement>("button")) {
      Object.assign(button.style, { border: "1px solid #d5d5d2", borderRadius: "6px", padding: "9px 12px", cursor: "pointer", font: "inherit" });
    }
    const preview = dialog.querySelector<HTMLElement>("[data-preview]")!;
    const displayScale = Math.min(1, Math.min(770, window.innerWidth * .94 - 44) / image.naturalWidth, (window.innerHeight * 0.48) / image.naturalHeight);
    const previewWidth = image.naturalWidth * displayScale, previewHeight = image.naturalHeight * displayScale;
    preview.style.width = `${previewWidth}px`;
    preview.style.height = `${previewHeight}px`;
    for (const element of dialog.querySelectorAll<HTMLImageElement>("img")) element.src = image.src;
    const region = dialog.querySelector<HTMLElement>("[data-region]")!;
    const cropWindow = dialog.querySelector<HTMLElement>("[data-crop-window]")!;
    const cropSource = dialog.querySelector<HTMLImageElement>("[data-crop-source]")!;
    dialog.querySelector<HTMLElement>("[data-crop-flip]")!.style.transform = `scale(${image.flipX ? -1 : 1},${image.flipY ? -1 : 1})`;
    for (const handle of ["nw","n","ne","e","se","s","sw","w"]) {
      const dot=document.createElement("span");dot.dataset.cropHandle=handle;
      dot.style.cssText=`position:absolute;width:11px;height:11px;box-sizing:border-box;background:#fff;border:2px solid #3859ff;transform:translate(-50%,-50%);left:${handle.includes("w")?"4px":handle.includes("e")?"calc(100% - 4px)":"50%"};top:${handle.includes("n")?"4px":handle.includes("s")?"calc(100% - 4px)":"50%"};cursor:${handle}-resize`;
      dot.setAttribute("aria-label",`Redimensionar recorte ${handle}`);region.append(dot);
    }
    let crop = { ...(image.crop ?? FULL) }, maskShape = initialMask ?? image.maskShape ?? "rectangle", lockedRatio = maskShape === "ellipse" ? 1 : 0, forceDraw = false;
    const fitRatio = (area: Crop, ratio: number): Crop => {
      const normalizedRatio = ratio * image.naturalHeight / image.naturalWidth;
      const width = Math.min(area.width, area.height * normalizedRatio), height = width / normalizedRatio;
      return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
    };
    if (maskShape === "ellipse") crop = fitRatio(crop, 1);
    const paint = () => {
      Object.assign(region.style, { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` });
      const cropped=cropGeometry(image,crop),previewRatio=previewWidth*crop.width/Math.max(1,cropped.width);
      const radius=Math.max(0,Math.min(image.style.cornerRadius??Math.min(cropped.width,cropped.height)*.12,Math.min(cropped.width,cropped.height)/2));
      cropWindow.style.borderRadius = maskShape === "ellipse" ? "50%" : maskShape === "round_rectangle" ? `${radius*previewRatio}px` : "0";
      Object.assign(cropSource.style, { width: `${previewWidth}px`, height: `${previewHeight}px`, left: `${-crop.x * previewWidth}px`, top: `${-crop.y * previewHeight}px` });
      for (const button of dialog.querySelectorAll<HTMLButtonElement>("[data-mask]")) {
        const active = button.dataset.mask === maskShape;
        button.setAttribute("aria-pressed", String(active));
        button.style.background = active ? "#edf0ff" : "white";
        button.style.borderColor = active ? "#3859ff" : "#d5d5d2";
        button.style.color = active ? "#2445df" : "#191812";
      }
      for (const button of dialog.querySelectorAll<HTMLButtonElement>("[data-free],[data-wide],[data-ratio]")) {
        button.disabled = maskShape === "ellipse";
        button.style.opacity = button.disabled ? ".4" : "1";
        button.style.cursor = button.disabled ? "default" : "pointer";
      }
      dialog.querySelector("[data-ratio-status]")!.textContent = maskShape === "ellipse" ? "Círculo · proporção 1:1 · arraste para escolher o enquadramento" : lockedRatio ? `Proporção fixa ${lockedRatio.toFixed(2)}:1` : "Proporção livre · arraste fora da área para criar outro recorte";
    };
    const local = (e: PointerEvent): Vec => {
      const rect = preview.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
    };
    let drag:{start:Vec;original:Crop;mode:string}|null=null;
    const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
    preview.onpointerdown = e => {
      if(e.button!==0)return;e.preventDefault();preview.setPointerCapture(e.pointerId);
      const handle=(e.target as HTMLElement).dataset.cropHandle;
      drag={start:local(e),original:{...crop},mode:!forceDraw&&handle?handle:!forceDraw&&region.contains(e.target as Node)?"move":"draw"};forceDraw=false;
    };
    preview.onpointermove = e => {
      if(!drag)return;const p=local(e),initial=drag.original,mode=drag.mode,min=.008;
      if(mode==="move"){crop={...initial,x:clamp(initial.x+p.x-drag.start.x,0,1-initial.width),y:clamp(initial.y+p.y-drag.start.y,0,1-initial.height)};paint();return;}
      let left=initial.x,top=initial.y,right=initial.x+initial.width,bottom=initial.y+initial.height;
      if(mode==="draw"){left=Math.min(drag.start.x,p.x);right=Math.max(drag.start.x,p.x);top=Math.min(drag.start.y,p.y);bottom=Math.max(drag.start.y,p.y);}
      else{if(mode.includes("w"))left=Math.min(p.x,right-min);if(mode.includes("e"))right=Math.max(p.x,left+min);if(mode.includes("n"))top=Math.min(p.y,bottom-min);if(mode.includes("s"))bottom=Math.max(p.y,top+min);}
      let width=Math.max(min,right-left),height=Math.max(min,bottom-top);
      if(lockedRatio){const normalizedRatio=lockedRatio*image.naturalHeight/image.naturalWidth;
        if(mode==="n"||mode==="s")width=height*normalizedRatio;else height=width/normalizedRatio;
        const scale=Math.min(1,1/width,1/height);width*=scale;height*=scale;
        if(mode.includes("w"))left=right-width;if(mode.includes("n"))top=bottom-height;
        if(mode==="n"||mode==="s")left=initial.x+(initial.width-width)/2;
        if(mode==="e"||mode==="w")top=initial.y+(initial.height-height)/2;
      }
      crop={x:clamp(left,0,1-width),y:clamp(top,0,1-height),width,height};paint();
    };
    preview.onpointerup = preview.onpointercancel = () => { drag = null; };
    const close = () => { dialog.remove(); modal = null; document.removeEventListener("keydown", keyboard, true);queueMicrotask(()=>{if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});else document.querySelector<HTMLElement>('#selection-properties [data-action="crop"]')?.focus({preventScroll:true});}); };
    const keyboard = (e: KeyboardEvent) => {
      e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();return;}
      if(e.key==='Tab'){
        const controls=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')],index=controls.indexOf(document.activeElement as HTMLElement);
        if(e.shiftKey&&index<=0){e.preventDefault();controls.at(-1)?.focus();}
        else if(!e.shiftKey&&(index<0||index===controls.length-1)){e.preventDefault();controls[0]?.focus();}
      }
    };
    document.addEventListener("keydown", keyboard, true);
    dialog.querySelector<HTMLElement>("[data-cancel]")!.onclick = close;
    dialog.onclick = e => { if (e.target === dialog) close(); };
    dialog.querySelector<HTMLElement>("[data-full]")!.onclick = () => { lockedRatio = maskShape === "ellipse" ? 1 : 0; crop = lockedRatio ? fitRatio(FULL, 1) : { ...FULL }; paint(); };
    dialog.querySelector<HTMLElement>("[data-free]")!.onclick=()=>{lockedRatio=0;paint();};
    dialog.querySelector<HTMLElement>("[data-new]")!.onclick=()=>{forceDraw=true;notice("Arraste na imagem para definir uma nova área.");};
    const preset = (ratio: number) => {
      lockedRatio=ratio;
      crop = fitRatio(FULL, ratio); paint();
    };
    dialog.querySelector<HTMLElement>("[data-square]")!.onclick = () => preset(1);
    dialog.querySelector<HTMLElement>("[data-wide]")!.onclick = () => preset(16 / 9);
    for(const button of dialog.querySelectorAll<HTMLElement>("[data-ratio]"))button.onclick=()=>preset(Number(button.dataset.ratio));
    for (const button of dialog.querySelectorAll<HTMLElement>("[data-mask]")) button.onclick = () => {
      maskShape = button.dataset.mask as MaskShape;
      lockedRatio = maskShape === "ellipse" ? 1 : 0;
      if (lockedRatio) crop = fitRatio(crop, 1);
      paint();
    };
    dialog.querySelector<HTMLElement>("[data-apply]")!.onclick = () => {
      const current = asImage(state.widgets.get(image.id));
      if (!sameBoard(boardKey) || !current || current.locked || current.src !== image.src) { close(); return; }
      const geometry = cropGeometry(current, crop);
      if (maskShape === "ellipse") {
        // A circle remains circular even if the previous picture was stretched.
        const side = Math.min(geometry.width, geometry.height);
        geometry.x += (geometry.width - side) / 2; geometry.y += (geometry.height - side) / 2;
        geometry.width = geometry.height = side;
      }
      bus.exec({ op: "WIDGET_UPDATE", payload: { id: image.id, patch: { ...geometry, maskShape } } });
      close(); sync(); api.onChange?.();
    };
    document.body.append(dialog); paint(); dialog.querySelector<HTMLButtonElement>("[data-cancel]")!.focus();
  }

  function circleCropSelected() { cropSelected("ellipse"); }

  function resetCrop() {
    const image = asImage(state.widgets.get([...state.selection][0] ?? "")); if (!image || image.locked) return;
    bus.exec({ op: "WIDGET_UPDATE", payload: { id: image.id, patch: cropGeometry(image,{...FULL}) } });
    sync(); api.onChange?.();
  }

  api.app.canvas.addEventListener("dragover", e => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  api.app.canvas.addEventListener("drop", e => {
    e.preventDefault(); if (!e.dataTransfer?.files.length) return;
    const rect = api.app.canvas.getBoundingClientRect();
    void importFiles(e.dataTransfer.files, camera.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }));
  });
  installClipboardImages({importFiles:(files,canInsert)=>importFiles(files,{canInsert}),getBoardKey:api.getBoardKey,notice,blocked:()=>!!modal||document.body.classList.contains('home-visible')||[...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].some(dialog=>!dialog.hidden&&dialog.getClientRects().length>0)});
  return { sync, importFiles, cropSelected, circleCropSelected, resetCrop, replaceSelected, flipSelected, setMask, downloadSelected };
}
