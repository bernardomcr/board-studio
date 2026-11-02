// @ts-nocheck
import {expect} from '@playwright/test';

/** Assert actual hit targets and exposed canvas, rather than duplicating the
 * responsive rail dimensions from CSS in the test. */
export async function expectFloatingRail(page){
 const layout=await page.evaluate(()=>{
  const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},rail=document.getElementById('toolbar'),r=rect(rail),background=document.getElementById('board-background-toggle'),b=rect(background),style=getComputedStyle(rail),hit=element=>{const box=rect(element),at=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return element===at||element.contains(at);};
  return {rail:r,header:rect(document.getElementById('topbar')),background:b,backgroundHit:hit(background),radius:parseFloat(style.borderRadius),shadow:style.boxShadow,overflow:[style.overflowX,style.overflowY],buttons:[...rail.querySelectorAll('button')].map(button=>({name:button.getAttribute('aria-label'),...rect(button),hit:hit(button)})),above:document.elementFromPoint(r.right+8,r.y-8)?.tagName,below:document.elementFromPoint(r.x+r.width/2,r.bottom+8)?.tagName,width:innerWidth,height:innerHeight};
 });
 expect(layout.rail.x).toBeGreaterThanOrEqual(8);expect(layout.rail.y).toBeGreaterThanOrEqual(layout.header.bottom+8);expect(layout.rail.right).toBeLessThan(layout.width);expect(layout.rail.bottom+8).toBeLessThanOrEqual(layout.background.y);expect(layout.background.bottom).toBeLessThanOrEqual(layout.height-8);expect(layout.radius).toBeGreaterThan(0);expect(layout.shadow).not.toBe('none');expect(layout.overflow).not.toContain('auto');expect(layout.overflow).not.toContain('scroll');expect(layout.backgroundHit).toBe(true);expect(layout.above).toBe('CANVAS');expect(layout.below).toBe('CANVAS');
 for(const button of layout.buttons){expect(button.x,button.name).toBeGreaterThanOrEqual(layout.rail.x);expect(button.y,button.name).toBeGreaterThanOrEqual(layout.rail.y);expect(button.right,button.name).toBeLessThanOrEqual(layout.rail.right);expect(button.bottom,button.name).toBeLessThanOrEqual(layout.rail.bottom);expect(button.hit,button.name).toBe(true);}
 return layout;
}
