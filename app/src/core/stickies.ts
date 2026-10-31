import type {StickyWidget} from './model';

/** The front sheet is square; the remaining bounds contain the stack/grip. */
export function stickyPadPaper(widget:Pick<StickyWidget,'width'|'height'>){
  const side=Math.min(widget.width,widget.height)*.88;
  return {x:(widget.width-side)/2,y:0,width:side,height:side};
}
