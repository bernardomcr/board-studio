import type {Texture,TextureSource} from 'pixi.js';

const configured=new WeakSet<TextureSource>();

/** Allocate filtered mip levels once; retain the original pixels for every zoom. */
export function configureRasterSampling(texture:Texture):void{
  const source=texture.source;if(configured.has(source))return;configured.add(source);
  source.style.scaleMode='linear';source.style.update();
  if(!source.autoGenerateMipmaps){
    source.autoGenerateMipmaps=true;
    // A source can already be shared by another image. Recreate its GPU allocation,
    // so WebGL/WebGPU can allocate the full mip chain during their next initSource.
    source.unload();source.update();
  }
}
