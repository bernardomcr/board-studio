import {Container,Graphics,Text} from 'pixi.js';
import type {StickyWidget} from '../core/model';
import {stickyPadLayout,stickyPaperCurve} from '../core/stickies';
import {destroyDisplayTree} from './destroy-tree';
import {TEXT_SAMPLING,fitTextResolution,sharedTextStyle} from './text-quality';

/** A stack is a source card; its paper color belongs to the user's notes. */
export function paintStickyPad(g:Graphics,w:StickyWidget):void{
  const {unit:u,card:c,paper:p,depth,radius}=stickyPadLayout(w),alpha=w.style.fillOpacity;
  for(let i=4;i>=1;i--)g.roundRect(c.x-i*u*.35,c.y+i*u*.65,c.width+i*u*.7,c.height+i*u*.25,radius+i*u*.4).fill({color:0x000000,alpha:.014});
  g.roundRect(c.x,c.y,c.width,c.height,radius).fill('#ffffff').stroke({color:'#dedfe3',width:Math.max(Number.MIN_VALUE,u)});
  for(let i=5;i>=1;i--)g.roundRect(p.x-i*u*1.5,p.y+p.height-7*u,p.width+i*u*3,depth+i*u*2.7,7*u).fill({color:0x000000,alpha:.018*alpha});
  g.rect(p.x,p.y+depth,p.width,p.height).fill({color:w.style.fillColor,alpha});
  g.rect(p.x,p.y+p.height,p.width,depth).fill({color:0x000000,alpha:.18*alpha});
  g.rect(p.x,p.y+depth*.35,p.width,p.height).fill({color:w.style.fillColor,alpha});
  g.rect(p.x,p.y+p.height,p.width,depth*.35).fill({color:0xffffff,alpha:.16*alpha});
  paintStickySheet(g,p,w.style.fillColor,alpha,0);
}

export function paintStickySheet(g:Graphics,p:{x:number;y:number;width:number;height:number},color:string,alpha:number,lift=0,flatten=0):void{
  const s=p.width,t=Math.max(0,Math.min(1,lift)),f=Math.max(0,Math.min(1,flatten)),base=stickyPaperCurve(t),c={left:base.left+(1-base.left)*f,right:base.right+(1-base.right)*f,control1:base.control1+(1-base.control1)*f,control2:base.control2+(1-base.control2)*f,tipX:base.tipX*(1-f)},x=p.x,y=p.y;
  const leaf=(dx=0,dy=0)=>g.moveTo(x+dx,y+dy).lineTo(x+s+dx,y+dy).lineTo(x+s+dx,y+s*c.right+dy).bezierCurveTo(x+s*.72+dx,y+s*c.control2+dy,x+s*.28+dx,y+s*c.control1+dy,x+s*c.tipX+dx,y+s*c.left+dy).closePath();
  const shadow=s*(.012+.045*t);for(let i=4;i>=1;i--)leaf(0,shadow*i/4).fill({color:0x000000,alpha:(.012+.018*t)*alpha});
  leaf().fill({color,alpha});
  // Thin translucent bands reproduce the gently lit paper without a bitmap.
  for(let i=0;i<12;i++){const top=i/12,bottom=(i+1)/12;if(bottom>c.right)break;g.rect(x,y+s*top,s,s/12+.001*s).fill({color:0xffffff,alpha:(.018+top*.035)*alpha});}
  if(f<1){
    const a={x:x+s*(.79-.06*t),y:y+s*(.835-.015*t)},b={x:x+s*(.935-.015*t),y:y+s*(.75-.155*t)},tip={x:x+s*(1+.01*t),y:y+s*(.90-.185*t)};
    g.moveTo(a.x,a.y).quadraticCurveTo(x+s*(.86-.05*t),y+s*(.79-.07*t),b.x,b.y).lineTo(tip.x,tip.y).quadraticCurveTo(x+s*(.88-.02*t),y+s*(.87-.10*t),a.x,a.y).closePath().fill({color,alpha:alpha*(1-f)});
    g.moveTo(a.x,a.y).quadraticCurveTo(x+s*(.86-.05*t),y+s*(.79-.07*t),b.x,b.y).lineTo(tip.x,tip.y).quadraticCurveTo(x+s*(.88-.02*t),y+s*(.87-.10*t),a.x,a.y).closePath().fill({color:0xffffff,alpha:.23*alpha*(1-f)});
  }
}

const labelKeys=new WeakMap<Container,string>();
export function paintStickyPadLabel(target:Container,w:StickyWidget,resolution:number):void{
  const layout=stickyPadLayout(w),key=[w.width,w.height,resolution].join('|');target.position.set(0,0);if(labelKeys.get(target)===key&&target.children.some(child=>child.label==='sticky-pad-title'))return;labelKeys.set(target,key);
  for(const child of target.removeChildren())destroyDisplayTree(child);
  const style=sharedTextStyle({fontFamily:'Noto Sans',fontSize:25,fontWeight:'500',lineHeight:31,fill:'#24252b'});
  for(const [index,text]of ['Bloco de notas','adesivas'].entries()){
    const label=new Text({...TEXT_SAMPLING,text,style});label.label=index?'sticky-pad-title-second-line':'sticky-pad-title';label.position.set(layout.title.x,layout.title.y+31*layout.unit*index);label.scale.set(layout.unit);label.resolution=fitTextResolution(label,resolution*layout.unit);target.addChild(label);
  }
}
