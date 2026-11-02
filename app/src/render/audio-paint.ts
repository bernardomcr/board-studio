import {CanvasTextMetrics,Text,TextStyle,type Graphics,type Container} from 'pixi.js';
import {destroyDisplayTree} from './destroy-tree';
import type {Widget} from '../core/model';
import {audioWaveform,formatAudioTime} from '../core/audio';
import {resolvedWidgetStyle} from '../core/style-scale';
import {borderPattern,patternedContour,shapeContours} from '../core/shapes';
import {TEXT_SAMPLING,fitTextResolution} from './text-quality';
import {screenStroke,screenDot} from './screen-coverage';

// Wave and play share the retained card Graphics, so foreground edits must
// invalidate that display list as soon as the independently painted labels.
export function audioSignature(widget:Widget):string{return widget.audio?[widget.audio.name,widget.audio.duration,widget.audio.waveform.join(','),widget.style.color].join('|'):'';}
export function audioCardLayout(widget:Widget){const sx=widget.width/360,sy=widget.height/124,unit=Math.min(sx,sy);return {sx,sy,unit,playX:34*sx,playY:62*sy,playRadius:20*unit,waveX:76*sx,waveY:89*sy,waveWidth:260*sx,waveHeight:17*sy,titleX:76*sx,titleY:21*sy,durationY:45*sy};}
export const AUDIO_FONT_FAMILY='Inter';
export function audioFontSize(widget:Widget):number{return 16*audioCardLayout(widget).unit;}
const foreground=(widget:Widget)=>widget.style.color==='transparent'?'#4262ff':widget.style.color;
/** Draw the complete card into the object's existing Graphics, in local board units. */
export function paintAudioCard(graphics:Graphics,widget:Widget,zoom=1):void{
  if(!widget.audio)return;const {width,height}=widget,style=resolvedWidgetStyle(widget),layout=audioCardLayout(widget),radius=Math.max(0,Math.min(style.cornerRadius??14,width/2,height/2));
  graphics.roundRect(0,0,width,height,radius).fill({color:style.fillColor,alpha:style.fillOpacity});
  const pattern=borderPattern(style.borderWidth,style.borderStyle),coverage=screenStroke(style.borderWidth,zoom,undefined,style.borderOpacity??1);
  if(style.borderWidth>0){
    if(pattern){for(const contour of shapeContours('round_rectangle',width,height,zoom,radius)){const parts=patternedContour(contour,pattern.dash,pattern.gap);if(pattern.dash===0){const dot=screenDot(style.borderWidth/2,zoom,undefined,style.borderOpacity??1);for(const p of parts)graphics.circle(p[0]!,p[1]!,dot.radius);graphics.fill({color:style.borderColor,alpha:dot.alpha});}else{for(const p of parts){graphics.moveTo(p[0]!,p[1]!);for(let i=2;i<p.length;i+=2)graphics.lineTo(p[i]!,p[i+1]!);}graphics.stroke({color:style.borderColor,...coverage});}}}
    else graphics.stroke({color:style.borderColor,...coverage});
  }
  const accent=foreground(widget);
  graphics.circle(layout.playX,layout.playY,layout.playRadius).fill({color:accent,alpha:.07}).stroke({color:accent,...screenStroke(Math.max(.01,layout.unit),zoom,undefined,.2)});
  const r=layout.playRadius*.37;graphics.poly([layout.playX-r*.6,layout.playY-r,layout.playX+r,layout.playY,layout.playX-r*.6,layout.playY+r]).fill({color:accent,alpha:.9});
  const waveform=audioWaveform(widget.audio.waveform),count=64,gap=layout.waveWidth/count,barWidth=gap*.48;
  for(let i=0;i<count;i++){const amplitude=waveform[i]??0,h=Math.max(1.2*layout.sy,amplitude*layout.waveHeight*2);graphics.roundRect(layout.waveX+i*gap,layout.waveY-h/2,barWidth,h,barWidth/2).fill({color:accent,alpha:.58});}
}
const retained=new WeakMap<Container,string>();
function fittedTitle(widget:Widget):string{
  if(!widget.audio)return '';const full=widget.type==='frame'?widget.title:widget.content||widget.audio.name,layout=audioCardLayout(widget),maxWidth=Math.max(.01,widget.width-layout.titleX-20*layout.sx),style=new TextStyle({fontFamily:AUDIO_FONT_FAMILY,fontSize:audioFontSize(widget),fontWeight:'500'});
  if(CanvasTextMetrics.measureText(full,style).width<=maxWidth)return full;
  const chars=Array.from(full);let low=0,high=chars.length;
  while(low<high){const middle=Math.ceil((low+high)/2);if(CanvasTextMetrics.measureText(chars.slice(0,middle).join('')+'…',style).width<=maxWidth)low=middle;else high=middle-1;}
  return chars.slice(0,low).join('')+'…';
}
export function paintAudioLabels(target:Container,widget:Widget,resolution:number):void{
  if(!widget.audio)return;const layout=audioCardLayout(widget),font=audioFontSize(widget),color=foreground(widget),signature=[widget.type==='frame'?widget.title:widget.content,widget.audio.name,widget.audio.duration,widget.width,widget.height,font,color,resolution].join('|');
  target.position.set(0,0);if(retained.get(target)===signature)return;retained.set(target,signature);
  for(const child of target.removeChildren())destroyDisplayTree(child);
  const title=fittedTitle(widget),style=new TextStyle({fontFamily:AUDIO_FONT_FAMILY,fontSize:font,fill:color,fontWeight:'500'});
  const heading=new Text({...TEXT_SAMPLING,text:title,resolution,style}),duration=new Text({...TEXT_SAMPLING,text:formatAudioTime(widget.audio.duration),resolution,style:{fontFamily:AUDIO_FONT_FAMILY,fontSize:font*.75,fill:color}});
  heading.resolution=fitTextResolution(heading,resolution);duration.resolution=fitTextResolution(duration,resolution);heading.position.set(layout.titleX,layout.titleY);duration.position.set(layout.titleX,layout.durationY);target.addChild(heading,duration);
}
const xml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const num=(value:number)=>String(Math.round(value*10000)/10000);
/** Static SVG card; the editable board file retains the playable original audio. */
export function audioCardSvg(widget:Widget):string{
  if(!widget.audio)return '';const style=resolvedWidgetStyle(widget),l=audioCardLayout(widget),accent=xml(foreground(widget)),pattern=borderPattern(style.borderWidth,style.borderStyle),radius=Math.max(0,Math.min(style.cornerRadius??14,widget.width/2,widget.height/2)),r=l.playRadius*.37;
  const shape=`<rect width="${num(widget.width)}" height="${num(widget.height)}" rx="${num(radius)}" fill="${xml(style.fillColor)}" fill-opacity="${style.fillOpacity}" stroke="${xml(style.borderColor)}" stroke-width="${num(style.borderWidth)}" stroke-opacity="${style.borderOpacity??1}"${pattern?` stroke-dasharray="${pattern.dash} ${pattern.gap}"${pattern.dash===0?' stroke-linecap="round"':''}`:''}/>`;
  const play=`<circle cx="${num(l.playX)}" cy="${num(l.playY)}" r="${num(l.playRadius)}" fill="${accent}" fill-opacity=".07" stroke="${accent}" stroke-opacity=".2" stroke-width="${num(l.unit)}"/><path d="M${num(l.playX-r*.6)} ${num(l.playY-r)} L${num(l.playX+r)} ${num(l.playY)} L${num(l.playX-r*.6)} ${num(l.playY+r)}Z" fill="${accent}"/>`;
  const waveform=audioWaveform(widget.audio.waveform),gap=l.waveWidth/64,barWidth=gap*.48,bars=Array.from({length:64},(_,i)=>{const h=Math.max(1.2*l.sy,(waveform[i]??0)*l.waveHeight*2);return `<rect x="${num(l.waveX+i*gap)}" y="${num(l.waveY-h/2)}" width="${num(barWidth)}" height="${num(h)}" rx="${num(barWidth/2)}" fill="${accent}" opacity=".58"/>`;}).join('');
  const title=fittedTitle(widget),font=audioFontSize(widget);
  return `<desc>${xml('Áudio: '+(widget.audio.name)+' · '+formatAudioTime(widget.audio.duration))}</desc>${shape}${play}${bars}<text x="${num(l.titleX)}" y="${num(l.titleY+font)}" font-family="${AUDIO_FONT_FAMILY}" font-size="${num(font)}" font-weight="500" fill="${accent}">${xml(title)}</text><text x="${num(l.titleX)}" y="${num(l.durationY+font*.75)}" font-family="${AUDIO_FONT_FAMILY}" font-size="${num(font*.75)}" fill="${accent}">${formatAudioTime(widget.audio.duration)}</text>`;
}
