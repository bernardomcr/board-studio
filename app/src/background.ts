import { Assets, Container, Sprite, Texture, type Application } from 'pixi.js';
import type { BoardState, CommandBus } from './core/commands';
import type { Camera } from './core/camera';
import { BACKGROUND_MAX_BYTES, DEFAULT_BACKGROUND, type BackgroundImage, type BackgroundPatch, type BoardBackground } from './core/background';
import { icon } from './icons';
import {configureRasterSampling} from './render/raster-quality';

interface BackgroundAPI {
  state: BoardState;
  bus: CommandBus;
  camera: Camera;
  app: Application;
  world: Container;
  onChange?: () => void;
}

/** Scenery uses board coordinates and cannot intercept selection, drawing or erasing. */
export function installBackground(api: BackgroundAPI) {
  const { state, bus, camera, app, world } = api;
  const layer = new Container(); layer.label = 'board-background'; layer.eventMode = 'none'; layer.zIndex = -1_000_000;
  const sprite = new Sprite(Texture.WHITE); sprite.eventMode = 'none'; sprite.visible = false; layer.addChild(sprite);
  let source = '', loadedSource = '', lastBackground: BoardBackground | undefined, renderedBackground: BoardBackground | undefined;
  let importError = '', importing = false;
  const current = () => state.background ?? DEFAULT_BACKGROUND;
  const css = document.createElement('style');
  css.textContent = `
#board-background-controls{position:fixed;left:14px;bottom:14px;z-index:27;font:12px Inter,'Segoe UI',sans-serif;color:#292823}
body.home-visible #board-background-controls{display:none!important}
#board-background-controls button,#board-background-controls input{font:inherit;color:inherit;box-sizing:border-box}
#board-background-controls button{border:1px solid #deded9;border-radius:6px;background:white;cursor:pointer}
#board-background-controls button:hover{background:#f4f5fb;color:#3859ff}
#board-background-controls button:focus-visible,#board-background-controls input:focus-visible{outline:2px solid #3859ff;outline-offset:2px}
#board-background-toggle{display:flex;align-items:center;gap:8px;height:38px;padding:0 11px;box-shadow:0 2px 9px #19181215}
#board-background-toggle [data-background-swatch]{width:16px;height:16px;border:1px solid #0003;border-radius:50%}
#board-background-panel{position:absolute;left:0;bottom:48px;width:284px;max-width:calc(100vw - 28px);max-height:calc(100vh - 90px);overflow:auto;background:white;border:1px solid #deded9;border-radius:9px;box-shadow:0 5px 24px #19181224;padding:14px;box-sizing:border-box}
#board-background-panel[hidden]{display:none}
#board-background-panel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;font-weight:600;font-size:13px}
#board-background-panel header button{border:0;display:flex;padding:3px}
#board-background-panel .background-themes{display:flex;gap:8px;margin-bottom:12px}
#board-background-panel .background-themes button{display:flex;align-items:center;justify-content:center;gap:8px;height:39px;flex:1}
#board-background-panel .background-themes button[aria-pressed=true]{outline:2px solid #3859ff;outline-offset:1px}
#board-background-panel .background-themes span{width:18px;height:18px;border:1px solid #0003;border-radius:50%}
#board-background-panel label{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:34px;margin:5px 0}
#board-background-panel input[type=color]{height:30px;width:44px;padding:2px;border:1px solid #deded9;border-radius:5px;background:white;cursor:pointer}
#board-background-panel input[type=number]{height:31px;width:90px;border:1px solid #deded9;border-radius:5px;padding:5px 7px;background:white}
#board-background-panel input[type=checkbox]{width:16px;height:16px;accent-color:#3859ff}
#board-background-panel hr{border:0;border-top:1px solid #ededeb;margin:12px 0}
#board-background-panel .background-action{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:9px;margin-top:7px}
#board-background-panel .background-action svg{flex:none}
#board-background-panel .background-note{font-size:11px;line-height:1.5;color:#85857f;margin:9px 0 0}
#board-background-panel [role=alert]{color:#b93c3c;font-size:11px;line-height:1.5;margin:9px 0 0}
#board-background-panel button:disabled{opacity:.45;cursor:default}
`;
  document.head.append(css);
  const controls = document.createElement('div'); controls.id = 'board-background-controls';
  controls.innerHTML = `<button id="board-background-toggle" aria-label="Fundo do board" aria-haspopup="dialog" aria-expanded="false" aria-controls="board-background-panel"><span data-background-swatch></span><span>Fundo</span>${icon('chevron-down',10)}</button><section id="board-background-panel" role="dialog" aria-label="Fundo do board" hidden></section>`;
  document.body.append(controls);
  const button = controls.querySelector<HTMLButtonElement>('#board-background-toggle')!;
  const panel = controls.querySelector<HTMLElement>('#board-background-panel')!;
  const patch = (value: BackgroundPatch) => { bus.exec({ op: 'BACKGROUND_UPDATE', payload: value }); sync(); api.onChange?.(); };
  let pointerInteraction=false,pendingRender=false,pointerRelease:ReturnType<typeof setTimeout>|undefined;
  const releasePointer=()=>{pointerInteraction=false;if(pendingRender){pendingRender=false;render();}};
  controls.addEventListener('pointerdown',()=>{if(pointerRelease)clearTimeout(pointerRelease);pointerInteraction=true;},true);
  document.addEventListener('click',releasePointer);
  window.addEventListener('pointerup',()=>{if(pointerInteraction)pointerRelease=setTimeout(releasePointer,120);},true);
  window.addEventListener('pointercancel',releasePointer,true);

  function render() {
    if(pointerInteraction){pendingRender=true;return;}
    const background = current(), image = background.image;
    controls.querySelector<HTMLElement>('[data-background-swatch]')!.style.background = background.color;
    // Keep the paired dimension current without replacing an input during typing.
    for (const input of panel.querySelectorAll<HTMLInputElement>('input[data-background-input]')) {
      if (input === document.activeElement) continue;
      const field = input.dataset.backgroundInput;
      if (field === 'grid') input.checked = background.grid;
      else if (field === 'color') input.value = background.color;
      else if (image && (field === 'width' || field === 'height' || field === 'opacity')) input.value = String(field === 'opacity' ? Math.round(image.opacity * 100) : Math.round(image[field] * 100) / 100);
    }
    if (renderedBackground === background || panel.contains(document.activeElement) && document.activeElement?.matches('input')) return;
    renderedBackground = background;
    panel.innerHTML = `<header><span>Fundo do board</span><button data-background-close aria-label="Fechar fundo do board">${icon('close',17)}</button></header><div class="background-themes"><button data-background-color="#fbfaf7" aria-label="Fundo claro" aria-pressed="${background.color === '#fbfaf7'}"><span style="background:#fbfaf7"></span>Claro</button><button data-background-color="#16181d" aria-label="Fundo escuro" aria-pressed="${background.color === '#16181d'}"><span style="background:#16181d"></span>Escuro</button></div><label>Cor personalizada<input type="color" aria-label="Cor de fundo" data-background-input="color" value="${background.color}"></label><label>Mostrar grade<input type="checkbox" aria-label="Mostrar grade" data-background-input="grid" ${background.grid ? 'checked' : ''}></label><hr><button class="background-action" data-background-import ${importing ? 'disabled' : ''}>${icon('image',17)}${importing ? 'Abrindo imagem…' : image ? 'Substituir imagem de fundo' : 'Usar imagem como fundo'}</button>${image ? `<label>Largura<input type="number" aria-label="Largura da imagem de fundo" data-background-input="width" value="${Math.round(image.width * 100) / 100}" min="1" max="10000000"></label><label>Altura<input type="number" aria-label="Altura da imagem de fundo" data-background-input="height" value="${Math.round(image.height * 100) / 100}" min="1" max="10000000"></label><label>Opacidade<input type="number" aria-label="Opacidade da imagem de fundo" data-background-input="opacity" value="${Math.round(image.opacity * 100)}" min="0" max="100"></label><button class="background-action" data-background-fit>${icon('size',17)}Ajustar à tela</button><button class="background-action" data-background-center>${icon('align',17)}Centralizar na tela</button><button class="background-action" data-background-remove>${icon('trash',17)}Remover imagem de fundo</button>` : ''}<p class="background-note">${image ? 'A imagem acompanha o board e mantém a proporção ao mudar o tamanho.' : 'PNG, JPEG ou WebP de até 25 MB. A imagem fica atrás dos objetos.'}</p>${importError ? '<p role="alert"></p>' : ''}`;
    const error = panel.querySelector('[role=alert]'); if (error) error.textContent = importError;
  }

  function sync() {
    const background = current();
    app.renderer.background.color = background.color;
    if (background !== lastBackground) {
      lastBackground = background;
      const image = background.image;
      if (!image) { layer.removeFromParent(); source = ''; loadedSource = ''; sprite.visible = false; }
      else {
        if (layer.parent !== world) world.addChildAt(layer, 0);
        sprite.position.set(image.x, image.y); sprite.width = image.width; sprite.height = image.height; sprite.alpha = image.opacity;
        if (source !== image.src) {
          source = image.src; sprite.visible = false;
          const requested = source;
          void Assets.load<Texture>(requested).then(texture => {
            if (source !== requested || !current().image || sprite.destroyed) return;
            configureRasterSampling(texture);
            sprite.texture = texture; loadedSource = requested; lastBackground = undefined; sync(); api.onChange?.();
          }).catch(() => { if (source === requested) { importError = 'Não foi possível abrir a imagem de fundo.'; renderedBackground = undefined; render(); } });
        }
        sprite.visible = loadedSource === image.src;
      }
    }
    render();
  }

  function open() { panel.hidden = false; button.setAttribute('aria-expanded', 'true'); renderedBackground = undefined; render(); }
  function close() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  button.onclick = () => { if (panel.hidden) open(); else close(); };

  function centered(image: BackgroundImage, fit: boolean): BackgroundImage {
    const scale = fit ? Math.max(camera.width / Math.max(.0001,camera.scale) / image.width, camera.height / Math.max(.0001,camera.scale) / image.height) : 1;
    const width = image.width * scale, height = image.height * scale;
    return { ...image, width, height, x: camera.x - width / 2, y: camera.y - height / 2 };
  }

  async function importFile(file: File): Promise<void> {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Use uma imagem PNG, JPEG ou WebP.');
    if (file.size > BACKGROUND_MAX_BYTES) throw new Error('Escolha uma imagem de até 25 MB.');
    const src = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
    const decoded = new Image(); decoded.src = src;
    try { await decoded.decode(); } catch { throw new Error('Esta imagem está danificada ou não é compatível.'); }
    if (!decoded.naturalWidth || !decoded.naturalHeight || decoded.naturalWidth > 16384 || decoded.naturalHeight > 16384 || decoded.naturalWidth * decoded.naturalHeight > 64_000_000) throw new Error('A imagem excede 64 megapixels ou 16384 pixels por lado.');
    const scale = Math.max(1,camera.width / Math.max(.0001,camera.scale) / decoded.naturalWidth,camera.height / Math.max(.0001,camera.scale) / decoded.naturalHeight);
    const width = decoded.naturalWidth * scale, height = decoded.naturalHeight * scale;
    importError = ''; patch({image:{ src, width, height, x: camera.x - width / 2, y: camera.y - height / 2, opacity: 1 }});
  }

  panel.addEventListener('click',event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button'); if (!target) return;
    if (target.hasAttribute('data-background-close')) close();
    if (target.dataset.backgroundColor) patch({ color: target.dataset.backgroundColor });
    if (target.hasAttribute('data-background-remove')) patch({ image: null });
    const image = current().image;
    if (image && target.hasAttribute('data-background-fit')) patch({ image: centered(image,true) });
    if (image && target.hasAttribute('data-background-center')) patch({ image: centered(image,false) });
    if (target.hasAttribute('data-background-import')) {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
      input.onchange = async () => { const file = input.files?.[0]; if (!file) return; importing = true; importError = ''; renderedBackground = undefined; render(); try { await importFile(file); } catch (error) { importError = error instanceof Error ? error.message : 'Não foi possível importar a imagem.'; } finally { importing = false; renderedBackground = undefined; render(); } }; input.click();
    }
  });
  panel.addEventListener('change',event => {
    const input = event.target as HTMLInputElement, field = input.dataset.backgroundInput; if (!field) return;
    if (field === 'color') patch({ color: input.value });
    else if (field === 'grid') patch({ grid: input.checked });
    else {
      const image = current().image, value = Number(input.value); if (!image || !Number.isFinite(value)) return;
      if (field === 'opacity') patch({ image: { ...image, opacity: Math.max(0, Math.min(100, value)) / 100 } });
      else if (field === 'width' || field === 'height') {
        const ratio = image.width / image.height;
        let width = field === 'width' ? Math.max(1,value) : Math.max(1,value) * ratio, height = width / ratio;
        const scale = Math.min(1,10_000_000/width,10_000_000/height); width *= scale; height *= scale;
        patch({ image: { ...image, x: image.x + (image.width-width)/2, y: image.y + (image.height-height)/2, width, height } });
      }
    }
  });
  panel.addEventListener('focusout',() => queueMicrotask(sync));
  document.addEventListener('pointerdown',event => { if (!controls.contains(event.target as Node)) close(); });
  document.addEventListener('keydown',event => { if (event.key === 'Escape' && !panel.hidden) { event.stopPropagation(); event.preventDefault(); close(); button.focus(); } },true);
  sync();
  return { sync, open, close, importFile };
}
