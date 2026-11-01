import { Assets, Container, Graphics, Sprite, Texture, type Application } from "pixi.js";
import {destroyDisplayTree} from './render/destroy-tree';
import type { BoardState, CommandBus } from "./core/commands";
import type { Camera } from "./core/camera";
import { SHAPE_STYLE, nextId, type Widget } from "./core/model";
import type { Vec } from "./core/geometry";
import { borderPattern, patternedContour, shapeContours } from "./core/shapes";
import {resolvedWidgetStyle,borderWidthFor} from './core/style-scale';
import {screenStroke,screenDot,screenStrokeKey} from './render/screen-coverage';
import {configureRasterSampling} from './render/raster-quality';
import {imageRasterLimit,needsViewportImage,ViewportImageRaster} from './render/viewport-image-raster';
import {installClipboardImages} from './clipboard-images';
import {openImageCrop} from './image-crop';

type Crop = { x: number; y: number; width: number; height: number };
type MaskShape = "rectangle" | "ellipse" | "round_rectangle";
type ImageItem = Omit<Widget, "type"> & { type: "image"; src: string; naturalWidth: number; naturalHeight: number; crop?: Crop; content: string; maskShape?: MaskShape; flipX?: boolean; flipY?: boolean; opacity?: number };
interface ImageAPI {
  state: BoardState; bus: CommandBus; camera: Camera; app: Application;
  world: Container; nodeAt?: (id: string) => Container | undefined; onChange?: () => void;
  getBoardKey?(): string | null;
}
export interface ImageImportOptions{point?:Vec;zoom?:number;viewport?:{width:number;height:number};label?:string;afterCreate?(ids:string[]):void;canInsert?():boolean}
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
  const nodes = new Map<string, { container: Container; sprite: Sprite; mask: Graphics; border: Graphics; src: string; sig:string;raster?:ViewportImageRaster }>();
  const textures = new Map<string, Promise<Texture>>();
  let rasterLimit:number|undefined;
  let cropEditor: ReturnType<typeof openImageCrop> | null = null;
  let croppingId: string | null = null;
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
      if (!asImage(state.widgets.get(id)) || node.container.destroyed) { node.raster?.destroy();if (!node.container.destroyed) destroyDisplayTree(node.container); nodes.delete(id); }
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
      node.container.visible=w.id!==croppingId;
      if (!api.nodeAt) {
        node.container.pivot.set(w.width / 2, w.height / 2);
        node.container.position.set(w.x + w.width / 2, w.y + w.height / 2);
        node.container.rotation = w.rotation;
        node.container.zIndex = w.z;
      }
      const crop = w.crop ?? FULL;
      if(node.raster){const texture=node.raster.update(w,camera);node.sprite.visible=!!texture;if(texture)node.sprite.texture=texture;}
      else node.sprite.visible=true;
      if(node.src!==w.src)node.sig='';
      const sig=[w.width,w.height,crop.x,crop.y,crop.width,crop.height,w.maskShape,w.flipX,w.flipY,w.opacity,w.style.borderWidth,w.style.borderScale,w.style.borderColor,w.style.borderStyle,w.style.borderOpacity,w.style.cornerRadius,Math.round(Math.log2(Math.max(.02,camera.scale))*2),screenStrokeKey(borderWidthFor(w),camera.scale)].join('|');
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
      const coverage=screenStroke(borderWidth,camera.scale,undefined,borderOpacity);
      if (borderWidth > 0 && borderColor !== "transparent" && borderOpacity > 0) {
        const shape = w.maskShape === "ellipse" ? "circle" : w.maskShape ?? "rectangle";
        const radius = cornerRadius;
        const pattern = borderPattern(borderWidth, borderStyle);
        if (pattern) {
          for (const contour of shapeContours(shape, w.width, w.height, camera.scale, radius)) {
            const pieces = patternedContour(contour, pattern.dash, pattern.gap);
            if (pattern.dash === 0) {
              const dot=screenDot(borderWidth/2,camera.scale,undefined,borderOpacity);
              for (const p of pieces) node.border.circle(p[0]!, p[1]!, dot.radius);
              node.border.fill({ color: borderColor, alpha: dot.alpha });
            } else {
              for (const p of pieces) {
                node.border.moveTo(p[0]!, p[1]!);
                for (let i = 2; i < p.length; i += 2) node.border.lineTo(p[i]!, p[i + 1]!);
              }
              node.border.stroke({ color: borderColor, ...coverage, cap: "butt", join: "round" });
            }
          }
        } else {
          if (w.maskShape === "ellipse") node.border.ellipse(w.width/2, w.height/2, w.width/2, w.height/2);
          else if (w.maskShape === "round_rectangle") node.border.roundRect(0, 0, w.width, w.height, radius);
          else node.border.rect(0, 0, w.width, w.height);
          node.border.stroke({ color: borderColor, ...coverage, join: "round" });
        }
      }
      const imageWidth = w.width / (crop.width>0?crop.width:1), imageHeight = w.height / (crop.height>0?crop.height:1);
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
          current.sprite.texture=Texture.WHITE;current.raster?.destroy();current.raster=undefined;
          const limit=rasterLimit??=imageRasterLimit(api.app.renderer);
          if(needsViewportImage(texture,limit))current.raster=new ViewportImageRaster(texture,limit);
          else{configureRasterSampling(texture);current.sprite.texture=texture;}
          current.sprite.tint = 0xffffff; current.sig='';
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
    const requestedZoom=options.zoom??camera.scale,zoom=Number.isFinite(requestedZoom)&&requestedZoom>0?requestedZoom:1,viewport=options.viewport??{width:camera.width,height:camera.height};
    const screenWidth=Math.min(520,Math.max(32,viewport.width-160)),screenHeight=Math.min(420,Math.max(32,viewport.height-180));
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
        const scale = Math.min(1, screenWidth / source.naturalWidth, screenHeight / source.naturalHeight)/zoom;
        const width = source.naturalWidth * scale, height = source.naturalHeight * scale;
        const image: ImageItem = {
          id: nextId("image"), type: "image", ...source,
          x: center.x - width / 2 + ids.length * 24/zoom, y: center.y - height / 2 + ids.length * 24/zoom,
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
    const image=selected();if(!image||image.locked||cropEditor)return;
    const boardKey=api.getBoardKey?.();
    const valid=()=>{
      const current=selected();
      return sameBoard(boardKey)&&!!current&&current.id===image.id&&!current.locked&&current.src===image.src
        &&current.x===image.x&&current.y===image.y&&current.width===image.width&&current.height===image.height
        &&current.rotation===image.rotation&&current.flipX===image.flipX&&current.flipY===image.flipY
        &&JSON.stringify(current.crop)===JSON.stringify(image.crop)&&!document.body.classList.contains('home-visible');
    };
    croppingId=image.id;
    cropEditor=openImageCrop({image,camera,canvas:api.app.canvas,initialMask,valid,
      apply:patch=>{
        const oldCrop=image.crop??FULL;
        if((['x','y','width','height','rotation'] as const).every(key=>patch[key]===image[key])
          &&(['x','y','width','height'] as const).every(key=>patch.crop[key]===oldCrop[key])&&patch.maskShape===(image.maskShape??'rectangle'))return;
        bus.exec({op:'WIDGET_UPDATE',payload:{id:image.id,patch}});changed();
      },
      closed:()=>{cropEditor=null;croppingId=null;changed();}
    });
    changed();
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
  installClipboardImages({importFiles:(files,canInsert,placement)=>importFiles(files,{canInsert,...placement}),getPlacement:()=>({point:{x:camera.x,y:camera.y},zoom:camera.scale,viewport:{width:camera.width,height:camera.height}}),getBoardKey:api.getBoardKey,notice,blocked:()=>!!cropEditor||document.body.classList.contains('home-visible')||[...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].some(dialog=>!dialog.hidden&&dialog.getClientRects().length>0)});
  return { sync, importFiles, cropSelected, circleCropSelected, resetCrop, replaceSelected, flipSelected, setMask, downloadSelected };
}
