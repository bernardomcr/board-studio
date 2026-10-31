import {parseRich} from './richtext';
import type {TextWidget,Widget} from './model';
import {rotate,widgetCenter,worldToLocal,type HandleId,type Vec} from './geometry';

let context:CanvasRenderingContext2D|null|undefined;
/** Free text has a natural ink area; explicit newlines are the only wrapping. */
export function naturalTextSize(w:TextWidget):{width:number;height:number}{
  if(context===undefined)context=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
  const lines=parseRich(w.content||' '),size=w.style.fontSize;
  const widths=lines.map(runs=>runs.reduce((sum,run)=>{
    if(context){context.font=`${run.italic||w.style.fontStyle==='italic'?'italic ':''}${run.bold||w.style.fontWeight==='bold'?'700 ':'400 '}${size}px ${w.style.fontFamily}`;return sum+context.measureText(run.text).width;}
    return sum+Array.from(run.text).length*size*.6;
  },0));
  return {width:Math.max(size*.3,...widths)+1,height:Math.max(1,lines.length)*size*1.35};
}
export function naturalText(w:TextWidget):TextWidget{return {...w,...naturalTextSize(w),textSizing:'natural'};}
/** Every text handle scales the glyphs uniformly around the opposite handle. */
export function resizeFreeText(w:TextWidget,handle:HandleId,p:Vec):Pick<Widget,'x'|'y'|'width'|'height'|'style'>&{textSizing:'natural'}{
  const sx=handle.includes('e')?1:handle.includes('w')?-1:0,sy=handle.includes('s')?1:handle.includes('n')?-1:0;
  const local=worldToLocal(w,p),anchor={x:sx===1?0:sx===-1?w.width:w.width/2,y:sy===1?0:sy===-1?w.height:w.height/2};
  const vector={x:sx*w.width,y:sy*w.height};
  const length=Math.hypot(vector.x,vector.y),projection=((local.x-anchor.x)*(vector.x/length)+(local.y-anchor.y)*(vector.y/length))/length;
  const factor=Math.max(1/Math.max(1,w.style.fontSize),Number.isFinite(projection)?projection:1);
  const width=w.width*factor,height=w.height*factor,c=widgetCenter(w);
  const fixed=rotate({x:anchor.x-w.width/2,y:anchor.y-w.height/2},w.rotation),offset=rotate({x:-sx*width/2,y:-sy*height/2},w.rotation);
  return {x:c.x+fixed.x-offset.x-width/2,y:c.y+fixed.y-offset.y-height/2,width,height,textSizing:'natural',style:{...w.style,fontSize:w.style.fontSize*factor}};
}
