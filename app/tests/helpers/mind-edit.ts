import {expect,type Page} from '@playwright/test';

/** Existing maps are ready to use; their editing tools open with a real right click. */
export async function editMindTopic(page:Page,id?:string){
  const target=await page.evaluate(requested=>{
    const b=(window as any).__board,id=requested??[...b.state.selection][0],node=b.state.widgets.get(id);
    if(!node?.mind)throw new Error('Select a mind topic before opening its editor');
    const rect=b.app.canvas.getBoundingClientRect(),bounds=b.geom.widgetAABB(node),a=b.camera.worldToScreen({x:bounds.minX,y:bounds.minY}),z=b.camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});
    const left=Math.max(rect.left+a.x,rect.left+100),right=Math.min(rect.left+z.x,rect.right-20),top=Math.max(rect.top+a.y,rect.top+110),bottom=Math.min(rect.top+z.y,rect.bottom-60);
    if(right<=left||bottom<=top)throw new Error(`Mind topic ${id} is outside the editable viewport`);
    return {id,x:(left+right)/2,y:(top+bottom)/2};
  },id);
  const panel=page.locator('#mindmap-properties');
  const alreadySelected=await page.evaluate(id=>{const b=(window as any).__board;return b.state.selection.size===1&&b.state.selection.has(id);},target.id);
  if(!alreadySelected||!await panel.isVisible())await page.mouse.click(target.x,target.y,{button:'right'});
  await expect(panel).toBeVisible();
}
