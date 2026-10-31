import {expect,type Page} from '@playwright/test';

/** The brush/eraser palette is contextual. Use a real canvas right-click above
 * the footer, with the popup kept away from the test's drawing area. */
export async function openDrawingPalette(page:Page){
 const panel=page.locator('#drawing-palette');if(await panel.isVisible())return panel;
 const viewport=page.viewportSize()??await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
 await page.mouse.click(viewport.width-30,Math.max(180,viewport.height-100),{button:'right'});
 await expect(panel).toBeVisible();return panel;
}
