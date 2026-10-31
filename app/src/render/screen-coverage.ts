/** Resolve subpixel coverage without changing the board's vector geometry.
 * MSAA has a finite number of samples and can entirely miss a hairline. A
 * one-physical-pixel footprint with proportional alpha retains its average ink. */
export function screenStroke(width:number,zoom:number,dpr=globalThis.devicePixelRatio||1,alpha=1):{width:number;alpha:number}{
 const density=Math.max(1e-12,Math.abs(zoom)*Math.max(.001,Math.min(3,dpr))),physical=Math.max(0,width)*density;
 if(physical>=1||width<=0)return {width,alpha};
 return {width:1/density,alpha:alpha*physical};
}
/** Dots are two-dimensional: preserve their area when a circle is subpixel. */
export function screenDot(radius:number,zoom:number,dpr=globalThis.devicePixelRatio||1,alpha=1):{radius:number;alpha:number}{
 if(radius<=0)return {radius:0,alpha:0};
 const stroke=screenStroke(radius*2,zoom,dpr,alpha),ratio=radius*2/stroke.width;
 return {radius:stroke.width/2,alpha:alpha*Math.min(1,ratio*ratio)};
}
export function screenStrokeKey(width:number,zoom:number,dpr=globalThis.devicePixelRatio||1):number{
 const density=Math.abs(zoom)*Math.max(.001,Math.min(3,dpr));return width*density<1?density:0;
}
