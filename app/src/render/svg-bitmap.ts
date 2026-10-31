/** Cap raster dimensions before SVG decoding; the logical viewBox stays intact. */
export function boundedSvgBitmap(svg:string,maxEdge=4096,maxPixels=16*1024*1024):string{
  const document=new DOMParser().parseFromString(svg,'image/svg+xml'),root=document.documentElement;
  if(root.localName!=='svg'||document.querySelector('parsererror'))throw new Error('O SVG não pôde ser preparado para imagem.');
  const view=(root.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number),width=Number.parseFloat(root.getAttribute('width')??'')||(view[2]??NaN),height=Number.parseFloat(root.getAttribute('height')??'')||(view[3]??NaN);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('As dimensões da imagem não são válidas.');
  const scale=Math.min(1,maxEdge/width,maxEdge/height,Math.exp((Math.log(maxPixels)-Math.log(width)-Math.log(height))/2));
  root.setAttribute('width',String(Math.max(1,Math.floor(width*scale))));root.setAttribute('height',String(Math.max(1,Math.floor(height*scale))));
  return new XMLSerializer().serializeToString(root);
}
