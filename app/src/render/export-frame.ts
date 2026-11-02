import {Rectangle,Text,type BoundsData,type Container} from 'pixi.js';

/** Pixi measures Text advances, but its rendered quad also contains ink padding.
 * Extraction frames are in target-local coordinates, not world/model space. */
export function pngExportFrame(stage:Container):Rectangle|undefined{
  const ordinary=stage.getLocalBounds(),normal={minX:ordinary.minX,minY:ordinary.minY,maxX:ordinary.maxX,maxY:ordinary.maxY};
  const texts:Text[]=[],suppressedAncestors=new Set<Container>(),pending=[stage];
  while(pending.length){
    const node=pending.pop()!;
    if(!node.visible||node.alpha<=0)continue;
    if(node instanceof Text){
      if(node.renderable)texts.push(node);
      else for(let parent:Container|null=node;parent;parent=parent.parent){suppressedAncestors.add(parent);if(parent===stage)break;}
    }
    if(node.renderable)pending.push(...node.children);
  }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const add=(x:number,y:number)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
  const addRect=(node:Container,bounds:BoundsData,padding=0)=>{
    if(![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY,padding].every(Number.isFinite))return;
    for(const x of [bounds.minX-padding,bounds.maxX+padding])for(const y of [bounds.minY-padding,bounds.maxY+padding]){const p=stage.toLocal({x,y},node);add(p.x,p.y);}
  };
  if(!suppressedAncestors.size){add(normal.minX,normal.minY);add(normal.maxX,normal.maxY);}
  else{
    // Oversized runs are replaced by viewport sprites. Pixi's ordinary bounds
    // still include their non-renderable logical Text, so exclude only those
    // paths and retain native bounds for every unaffected measured subtree.
    const visit=[stage];
    while(visit.length){
      const node=visit.pop()!,raster=node.label==='large-text-raster';
      if(!node.visible||!node.renderable||node.alpha<=0||node!==stage&&!node.measurable&&!raster)continue;
      if(!suppressedAncestors.has(node)&&!raster){addRect(node,node.getLocalBounds());continue;}
      if(node.renderPipeId)addRect(node,(node as Container&{bounds:BoundsData}).bounds);
      visit.push(...node.children);
    }
  }
  for(const text of texts)addRect(text,text.bounds,text.style._getFinalPadding());
  if(![minX,minY,maxX,maxY].every(Number.isFinite))return;
  if(!suppressedAncestors.size&&minX===normal.minX&&minY===normal.minY&&maxX===normal.maxX&&maxY===normal.maxY)return;
  // GenerateTextureSystem truncates fractional sizes. Round outward so the
  // final pixel row/column cannot cut off an antialiased glyph edge.
  const left=Math.floor(minX),top=Math.floor(minY),right=Math.ceil(maxX),bottom=Math.ceil(maxY);
  return new Rectangle(left,top,Math.max(1,right-left),Math.max(1,bottom-top));
}
