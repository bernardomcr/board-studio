// @ts-nocheck
import {test,expect} from '@playwright/test';

const cases=[
 ...[2000,20000].flatMap(size=>[false,true].map(italic=>({name:`Caveat ${size}${italic?' italic':''}`,size,italic}))),
 {name:'rotated multiline rich runs and accented glyphs',size:20000,rotation:.37,content:'**Tchau** *ÁÉãçgj*\n[Tchau](https://example.test/) __fj__',align:'center'},
 {name:'negative bearings in a rotated serif',family:'EB Garamond',size:20000,italic:true,rotation:-.39,content:'jfy ÁÉãçgj',align:'right'},
 {name:'uploaded handwriting with rotation',size:20000,italic:true,rotation:.51,custom:true},
 {name:'decoration-only span boundaries preserve shaping',size:20000,italic:true,content:'T__ch__au\n[Tch](https://example.test/)au',align:'right'},
];
for(const options of cases)test(`SVG export preserves all actual ink: ${options.name}`,async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
 const result=await page.evaluate(async options=>{
  const {createWidget}=await import('/src/core/model.ts'),{naturalText}=await import('/src/core/text-layout.ts'),fonts=await import('/src/fonts.ts'),{boardToSvg}=await import('/src/core/exportSvg.ts');
  let family=options.family??'Caveat',custom;
  if(options.custom){const bytes=await(await fetch('/fonts/caveat-947ed15831ba.woff2')).arrayBuffer();custom=await(await import('/src/user-fonts.ts')).importUserFont(new File([bytes],'Escrita para exportar.woff2',{type:'font/woff2'}));family=custom.family;}
  await fonts.loadBoardFont(family);const base=createWidget('text',{x:-350,y:240,content:options.content??'Tchau'}),widget=naturalText({...base,id:'export-ink',rotation:options.rotation??0,style:{...base.style,fontFamily:family,fontSize:options.size,fontStyle:options.italic?'italic':'normal',textAlign:options.align??'left',textAlignVertical:'top',color:'#d03040',fillColor:'transparent',borderWidth:0}}),state={widgets:new Map([[widget.id,widget]]),order:[widget.id],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},before=JSON.stringify(widget),originalFont=custom?JSON.stringify(custom):undefined;
  const rows=[];
  // The zero-padding case is also used by copy/thumbnail consumers. The
  // independent reference enlarges only the viewport, never text or layout.
  for(const padding of [0,80]){
   const svg=await fonts.embedSvgFonts(boardToSvg(state,{background:'none',padding}),[family]),documentSvg=new DOMParser().parseFromString(svg,'image/svg+xml'),root=documentSvg.documentElement,view=root.getAttribute('viewBox').trim().split(/\s+/).map(Number),extra=options.size*.5,expanded=[view[0]-extra,view[1]-extra,view[2]+extra*2,view[3]+extra*2],density=Math.min(.1,1800/Math.max(expanded[2],expanded[3]));
   async function raster(box){const node=root.cloneNode(true),width=Math.max(1,Math.ceil(box[2]*density)),height=Math.max(1,Math.ceil(box[3]*density));node.setAttribute('viewBox',box.join(' '));node.setAttribute('width',String(width));node.setAttribute('height',String(height));const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(node)],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return {width,height,pixels:context.getImageData(0,0,width,height).data};}finally{URL.revokeObjectURL(url);}}
   const original=await raster(view),reference=await raster(expanded),scaleX=reference.width/expanded[2],scaleY=reference.height/expanded[3],left=(view[0]-expanded[0])*scaleX,right=(view[0]+view[2]-expanded[0])*scaleX,top=(view[1]-expanded[1])*scaleY,bottom=(view[1]+view[3]-expanded[1])*scaleY;let referenceInk=0,originalInk=0,outside=0,outerEdge=0;
   for(let y=0;y<reference.height;y++)for(let x=0;x<reference.width;x++)if(reference.pixels[(y*reference.width+x)*4+3]>=224){referenceInk++;if(x+1<left||x-1>right||y+1<top||y-1>bottom)outside++;if(x<2||y<2||x>=reference.width-2||y>=reference.height-2)outerEdge++;}
   for(let i=3;i<original.pixels.length;i+=4)if(original.pixels[i]>=224)originalInk++;
   rows.push({padding,view,referenceInk,originalInk,outside,outerEdge,embedded:svg.includes('base64,')});
  }
  return {rows,unchanged:before===JSON.stringify(widget),fontUnchanged:custom?originalFont===JSON.stringify((await import('/src/user-fonts.ts')).userFont(family)):true,customFamily:custom?.family};
 },options);
 expect(result.unchanged).toBe(true);expect(result.fontUnchanged).toBe(true);if(options.custom)expect(result.customFamily).toMatch(/^BoardCustom-/);
 for(const row of result.rows){expect(row.referenceInk,JSON.stringify(row)).toBeGreaterThan(500);expect(row.originalInk,JSON.stringify(row)).toBeGreaterThan(500);expect(row.outerEdge,JSON.stringify(row)).toBe(0);expect(row.outside,JSON.stringify(row)).toBe(0);expect(row.originalInk/row.referenceInk,JSON.stringify(row)).toBeGreaterThan(.96);expect(row.originalInk/row.referenceInk,JSON.stringify(row)).toBeLessThan(1.04);expect(row.embedded).toBe(true);}
});
