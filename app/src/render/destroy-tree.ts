import type {Container} from 'pixi.js';

/** Destroy each owned display resource without forwarding options to children.
 * Graphics.destroy() releases an owned context, while preserving a context
 * explicitly shared by its caller. Sprite/font textures remain shared too. */
export function destroyDisplayTree(node:Container):void {
  if(node.destroyed)return;
  for(const child of node.removeChildren())destroyDisplayTree(child);
  node.destroy();
}
