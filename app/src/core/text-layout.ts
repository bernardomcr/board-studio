import {parseRich,type Run} from './richtext';
import type {Style,TextWidget,Widget} from './model';
import {rotate,widgetCenter,worldToLocal,type HandleId,type Vec} from './geometry';
import {canonicalShape} from './shapes';
import {borderWidthFor} from './style-scale';

let context:CanvasRenderingContext2D|null|undefined;
const runWidths=new Map<string,number>();let runWidthCharacters=0;
/** Browser font metrics saturate at large CSS sizes. Logical type stays unbounded;
 * measurement and glyph rasterization use a stable design size and a transform. */
export const TEXT_DESIGN_SIZE=1024;
export const isFreeText=(w:Widget):w is TextWidget=>w.type==='text'&&!w.checklist&&!w.table&&!w.mind;
/** A shape, note or mind topic owns a fixed text box. Its stored font size is a
 * preferred maximum; fitting is a rendering decision, never a model mutation. */
export const isBoxText=(w:Widget):boolean=>!w.audio&&!w.checklist&&!w.table&&(w.type==='shape'||w.type==='sticky_note'||w.type==='text'&&!!w.mind);
export interface BoxTextInsets {left:number;right:number;top:number;bottom:number}
export interface BoxTextFit {fontSize:number;lines:Run[][];lineHeight:number;padding:number;insets:BoxTextInsets;width:number;height:number;blockHeight:number}
/** Basic shape text regions follow the observed Miro shape component. Notes and
 * our MindMeister-style topics retain their own compact padding. */
export function boxTextInsets(w:Widget):BoxTextInsets{
  if(!isBoxText(w))return {left:0,right:0,top:0,bottom:0};
  const width=w.width,height=w.height,short=Math.min(width,height),mindPadding=w.mind?Math.min(10*(w.mind.layoutScale??1),Math.max(0,short)/4):undefined;
  let left=mindPadding??short*.05,right=left,top=left,bottom=left;
  if(w.type==='sticky_note'){left=right=top=bottom=Math.max(0,short)/16;}
  else if(w.type==='shape'){
    const shape=canonicalShape(w.shape);
    switch(shape){
      case 'circle':left=right=width*(1-Math.SQRT1_2)/2;top=bottom=height*(1-Math.SQRT1_2)/2;break;
      case 'rhombus':left=right=width*.26;top=bottom=height*.26;break;
      case 'triangle':left=right=width*.25;top=w.shape==='merge'?0:height*.5;bottom=w.shape==='merge'?height*.5:0;break;
      case 'star':left=right=width*.26;top=height*.34;bottom=height*.22;break;
      case 'cloud':left=right=width*.2;top=bottom=height*.15;break;
      case 'cross':left=right=width*.285;top=bottom=height*.27;break;
      case 'hexagon':case 'octagon':case 'parallelogram':case 'trapezoid':case 'predefined_process':left=right=width*.25;top=bottom=height*.05;break;
      case 'pentagon':left=right=width*.25;top=height*.2;bottom=height*.05;break;
      case 'cylinder':left=right=width*.05;top=bottom=height*.05;break;
      case 'arrow_left':left=width*.2;right=width*.01;top=height*.22;bottom=height*.23;break;
      case 'arrow_right':left=width*.01;right=width*.2;top=height*.22;bottom=height*.23;break;
      case 'arrow_both':left=right=width*.2;top=height*.22;bottom=height*.23;break;
      case 'speech_bubble':left=right=top=short*.0375+8;bottom=top+height*.22;break;
      case 'chevron':left=right=Math.min(height/3.5,width/5)*.75;top=bottom=height*.1;break;
      case 'notched_chevron':left=width*.05;right=Math.min(height/3.5,width/5)*.5;top=bottom=height*.1;break;
      case 'brace_left':case 'brace_right':left=right=width*.05;top=bottom=height*.05;if(shape==='brace_left')right+=15+borderWidthFor(w)/2;else left+=15+borderWidthFor(w)/2;break;
      case 'text_block':left=right=top=bottom=0;break;
    }
    // Topics keep compact padding in rectangular boxes, while their shaped
    // variants share the same safe glyph region as ordinary board shapes.
    if(mindPadding!==undefined){left=Math.max(left,mindPadding);right=Math.max(right,mindPadding);top=Math.max(top,mindPadding);bottom=Math.max(bottom,mindPadding);}
  }
  // A tiny box or an extreme brace border must still have a finite positive area.
  left=Math.max(0,Math.min(width,left));right=Math.max(0,Math.min(width,right));top=Math.max(0,Math.min(height,top));bottom=Math.max(0,Math.min(height,bottom));
  if(left+right>=width){const factor=width*.98/(left+right);left*=factor;right*=factor;}
  if(top+bottom>=height){const factor=height*.98/(top+bottom);top*=factor;bottom*=factor;}
  return {left,right,top,bottom};
}
export function boxTextPadding(w:Widget):number{const insets=boxTextInsets(w);return Math.min(insets.left,insets.right,insets.top,insets.bottom);}
const boxFits=new Map<string,BoxTextFit>();let boxFitCharacters=0;
/** Fit both axes without imposing a minimum font size or reducing the preferred
 * value. The height bound keeps enormous preferred values cheap to resolve. */
export function fitBoxText(w:Widget,content?:string):BoxTextFit{
  const raw=content??(w.type==='frame'?w.title:w.content),value=content===undefined&&w.mind?.icon?`${w.mind.icon} ${raw}`:raw;
  const insets=boxTextInsets(w),padding=Math.min(insets.left,insets.right,insets.top,insets.bottom),width=Math.max(Number.MIN_VALUE,w.width-insets.left-insets.right),height=Math.max(Number.MIN_VALUE,w.height-insets.top-insets.bottom);
  if(!isBoxText(w)){const lines=wrapRichLines(value,Infinity,w.style),lineHeight=w.style.fontSize*1.35;return {fontSize:w.style.fontSize,lines,lineHeight,padding,insets,width,height,blockHeight:lines.length*lineHeight};}
  const key=JSON.stringify([value,w.width,w.height,insets,w.style.fontFamily,w.style.fontSize,w.style.fontWeight,w.style.fontStyle]);
  const retained=boxFits.get(key);if(retained)return retained;
  const layout=(fontSize:number):BoxTextFit=>{const lines=wrapRichLines(value,width,{...w.style,fontSize}),lineHeight=fontSize*1.35;return {fontSize,lines,lineHeight,padding,insets,width,height,blockHeight:lines.length*lineHeight};};
  const fits=(fit:BoxTextFit)=>fit.blockHeight<=height&&fit.lines.every(line=>trimTextLine(line).runs.reduce((sum,run)=>sum+measureTextRun(run.text,{...w.style,fontSize:fit.fontSize},run),0)<=width);
  let result=layout(w.style.fontSize);
  if(!fits(result)){
    const paragraphs=Math.max(1,parseRich(value).length);let low=0,high=Math.min(w.style.fontSize,height/(paragraphs*1.35));
    // 28 bisections are relative to the box's height rather than the arbitrary
    // preferred size; even a preferred size of 1e100 stays a bounded operation.
    for(let i=0;i<28;i++){const middle=low+(high-low)/2,candidate=layout(Math.max(Number.MIN_VALUE,middle));if(fits(candidate)){low=middle;result=candidate;}else high=middle;}
    // Leave a tiny subpixel reserve for native glyph hinting at small sizes.
    result=layout(Math.max(Number.MIN_VALUE,(low||high)*.999));
  }
  if(key.length<=2_000_000){boxFits.set(key,result);boxFitCharacters+=key.length;while(boxFits.size>256||boxFitCharacters>2_000_000){const first=boxFits.keys().next().value!;boxFitCharacters-=first.length;boxFits.delete(first);}}
  return result;
}
export function effectiveTextFontSize(w:Widget,content?:string):number{return isBoxText(w)?fitBoxText(w,content).fontSize:w.style.fontSize;}
export function textFontScale(size:number):{fontSize:number;scale:number}{
  const fontSize=Math.min(TEXT_DESIGN_SIZE,size);return {fontSize,scale:size/fontSize};
}
export function measureTextRun(text:string,style:Style,run:{bold?:boolean;italic?:boolean}={}):number{
  if(context===undefined)context=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
  if(!context)return Array.from(text).length*style.fontSize*.6;
  const font=`${run.italic||style.fontStyle==='italic'?'italic ':''}${run.bold||style.fontWeight==='bold'?'700 ':'400 '}${TEXT_DESIGN_SIZE}px ${style.fontFamily}`,key=JSON.stringify([font,text]);
  let width=runWidths.get(key);if(width===undefined){context.font=font;width=text.split(/(\s+)/).reduce((sum,token)=>{const metrics=context!.measureText(token);return sum+Math.max(metrics.width,(metrics.actualBoundingBoxLeft??0)+(metrics.actualBoundingBoxRight??0));},0);if(key.length<=200_000){runWidths.set(key,width);runWidthCharacters+=key.length;while(runWidths.size>4096||runWidthCharacters>2_000_000){const first=runWidths.keys().next().value!;runWidthCharacters-=first.length;runWidths.delete(first);}}}
  return width*(style.fontSize/TEXT_DESIGN_SIZE);
}
const graphemeSegmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const sameMarks=(a:Run,b:Run)=>!!a.bold===!!b.bold&&!!a.italic===!!b.italic&&!!a.underline===!!b.underline&&!!a.strike===!!b.strike&&a.link===b.link;
function appendRun(runs:Run[],run:Run,text=run.text):void{
  if(!text)return;const previous=runs[runs.length-1];if(previous&&sameMarks(previous,run))previous.text+=text;else runs.push({...run,text});
}
/** Pre-wrap hangs separator spaces at a soft line end. They stay in the model
 * and SVG text content, but have no ink/decoration width in a fixed text box. */
export function trimTextLine(line:Run[]):{runs:Run[];trailing:Run[]}{
  const runs=[...line],trailing:Run[]=[];
  while(runs.length){const run=runs[runs.length-1]!,text=run.text.trimEnd();if(text===run.text)break;runs.pop();const rest=run.text.slice(text.length);if(rest)trailing.unshift({...run,text:rest});if(text){runs.push({...run,text});break;}}
  return {runs,trailing};
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
