import type {Style,Widget} from './model';

export function relativeBorderScale(w:Widget):number {
  return Number.isFinite(w.style.borderScale)?Math.max(0,w.style.borderScale!):Math.max(0,w.style.borderWidth)/Math.max(1,Math.min(w.width,w.height));
}
export function borderWidthFor(w:Widget):number {
  return w.style.borderScale===undefined?w.style.borderWidth:relativeBorderScale(w)*Math.min(w.width,w.height);
}
export function resolvedWidgetStyle(w:Widget):Style{return {...w.style,borderWidth:borderWidthFor(w)};}
export function scaledWidgetStyle(w:Widget,sx:number,sy:number):Style {
  const scale=Math.sqrt(Math.abs(sx*sy)),borderScale=relativeBorderScale(w);
  return {...w.style,borderScale,borderWidth:borderScale*Math.min(w.width*Math.abs(sx),w.height*Math.abs(sy)),fontSize:w.style.fontSize*scale,
    ...(w.style.cornerRadius===undefined?{}:{cornerRadius:w.style.cornerRadius*Math.min(Math.abs(sx),Math.abs(sy))})};
}
