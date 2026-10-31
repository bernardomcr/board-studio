import {parseRich,type Run} from './richtext';
import type {Style,TextWidget,Widget} from './model';
import {rotate,widgetCenter,worldToLocal,type HandleId,type Vec} from './geometry';

let context:CanvasRenderingContext2D|null|undefined;
/** Browser font metrics saturate at large CSS sizes. Logical type stays unbounded;
 * measurement and glyph rasterization use a stable design size and a transform. */
export const TEXT_DESIGN_SIZE=1024;
export const isFreeText=(w:Widget):w is TextWidget=>w.type==='text'&&!w.checklist&&!w.table;
export function textFontScale(size:number):{fontSize:number;scale:number}{
  const fontSize=Math.min(TEXT_DESIGN_SIZE,size);return {fontSize,scale:size/fontSize};
}
export function measureTextRun(text:string,style:Style,run:{bold?:boolean;italic?:boolean}={}):number{
  if(context===undefined)context=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
  if(!context)return Array.from(text).length*style.fontSize*.6;
  context.font=`${run.italic||style.fontStyle==='italic'?'italic ':''}${run.bold||style.fontWeight==='bold'?'700 ':'400 '}${TEXT_DESIGN_SIZE}px ${style.fontFamily}`;
  return context.measureText(text).width*(style.fontSize/TEXT_DESIGN_SIZE);
}
const graphemeSegmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const sameMarks=(a:Run,b:Run)=>!!a.bold===!!b.bold&&!!a.italic===!!b.italic&&!!a.underline===!!b.underline&&!!a.strike===!!b.strike&&a.link===b.link;
function appendRun(runs:Run[],run:Run,text=run.text):void{
  if(!text)return;const previous=runs[runs.length-1];if(previous&&sameMarks(previous,run))previous.text+=text;else runs.push({...run,text});
}
/** Shape text is a real wrapping box. Free text passes Infinity and only explicit
 * newlines are kept. Oversized words split on graphemes, preserving inline marks. */
export function wrapRichLines(content:string,maxWidth:number,style:Style):Run[][]{
  const paragraphs=parseRich(content);if(!Number.isFinite(maxWidth))return paragraphs;
  const width=Math.max(Number.EPSILON,maxWidth),output:Run[][]=[];
  for(const runs of paragraphs){
    const tokens:Array<{space:boolean;runs:Run[]}>=[];
    for(const run of runs)for(const text of run.text.split(/(\s+)/).filter(Boolean)){
      const space=/^\s+$/.test(text);let token=tokens[tokens.length-1];if(!token||token.space!==space){token={space,runs:[]};tokens.push(token);}appendRun(token.runs,run,text);
    }
    let line:Run[]=[],used=0;
    const flush=()=>{output.push(line);line=[];used=0;};
    const append=(run:Run,text=run.text)=>{appendRun(line,run,text);used+=measureTextRun(text,style,run);};
    for(const token of tokens){
      const tokenWidth=token.runs.reduce((sum,run)=>sum+measureTextRun(run.text,style,run),0);
      if(token.space){for(const run of token.runs)append(run);continue;}
      if(line.length&&used+tokenWidth>width)flush();
      if(tokenWidth<=width){for(const run of token.runs)append(run);continue;}
      for(const run of token.runs){
        const letters=[...graphemeSegmenter.segment(run.text)].map(segment=>segment.segment);let start=0;
        while(start<letters.length){
          const available=Math.max(0,width-used);let low=1,high=letters.length-start,best=0;
          while(low<=high){const count=Math.floor((low+high)/2),part=letters.slice(start,start+count).join('');if(measureTextRun(part,style,run)<=available){best=count;low=count+1;}else high=count-1;}
          if(!best&&line.length){flush();continue;}
          // A single glyph wider than the box remains at its chosen font size.
          const count=Math.max(1,best);append(run,letters.slice(start,start+count).join(''));start+=count;if(start<letters.length)flush();
        }
      }
    }
    flush();
  }
  return output;
}
const naturalMeasurements=new Map<string,{width:number;height:number}>();
let measurementCharacters=0;
/** Free text has a natural ink area; explicit newlines are the only wrapping. */
export function naturalTextSize(w:TextWidget):{width:number;height:number}{
  const key=JSON.stringify([w.content||' ',w.style.fontFamily,w.style.fontWeight,w.style.fontStyle]);
  let measured=naturalMeasurements.get(key);
  if(!measured){
    const lines=parseRich(w.content||' '),designStyle={...w.style,fontSize:TEXT_DESIGN_SIZE};
    const widths=lines.map(runs=>runs.reduce((sum,run)=>sum+measureTextRun(run.text,designStyle,run),0));
    measured={width:widths.reduce((max,width)=>Math.max(max,width),TEXT_DESIGN_SIZE*.3)+TEXT_DESIGN_SIZE/32,height:Math.max(1,lines.length)*TEXT_DESIGN_SIZE*1.35};
    if(key.length<=2_000_000){naturalMeasurements.set(key,measured);measurementCharacters+=key.length;while(naturalMeasurements.size>256||measurementCharacters>2_000_000){const oldest=naturalMeasurements.keys().next().value!;measurementCharacters-=oldest.length;naturalMeasurements.delete(oldest);}}
  }
  const scale=w.style.fontSize/TEXT_DESIGN_SIZE;return {width:measured.width*scale,height:measured.height*scale};
}
export function naturalText(w:TextWidget):TextWidget{return {...w,...naturalTextSize(w),textSizing:'natural'};}
/** Every text handle scales the glyphs uniformly around the opposite handle. */
export function resizeFreeText(w:TextWidget,handle:HandleId,p:Vec):Pick<Widget,'x'|'y'|'width'|'height'|'style'>&{textSizing:'natural'}{
  const sx=handle.includes('e')?1:handle.includes('w')?-1:0,sy=handle.includes('s')?1:handle.includes('n')?-1:0;
  const local=worldToLocal(w,p),anchor={x:sx===1?0:sx===-1?w.width:w.width/2,y:sy===1?0:sy===-1?w.height:w.height/2};
  const vector={x:sx*w.width,y:sy*w.height};
  const length=Math.hypot(vector.x,vector.y),projection=((local.x-anchor.x)*(vector.x/length)+(local.y-anchor.y)*(vector.y/length))/length;
  const factor=Math.max(1/Math.max(1,w.style.fontSize),Number.isFinite(projection)?projection:1);
  const fontSize=w.style.fontSize*factor,{width,height}=naturalTextSize({...w,style:{...w.style,fontSize}}),c=widgetCenter(w);
  if(w.rotation===0)return {x:w.x+(sx===1?0:sx===-1?w.width-width:(w.width-width)/2),y:w.y+(sy===1?0:sy===-1?w.height-height:(w.height-height)/2),width,height,textSizing:'natural',style:{...w.style,fontSize}};
  const fixed=rotate({x:anchor.x-w.width/2,y:anchor.y-w.height/2},w.rotation),offset=rotate({x:-sx*width/2,y:-sy*height/2},w.rotation);
  return {x:c.x+fixed.x-offset.x-width/2,y:c.y+fixed.y-offset.y-height/2,width,height,textSizing:'natural',style:{...w.style,fontSize}};
}
