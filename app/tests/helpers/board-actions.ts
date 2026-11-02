import type {Page} from '@playwright/test';

/** Document commands live in the same More menu at every viewport width. */
export async function boardAction(page:Page,name:string){
  if(name==='Desfazer'||name==='Refazer'){
    await page.keyboard.press(name==='Desfazer'?'Control+z':'Control+Shift+z');return;
  }
  const menu=page.getByRole('group',{name:'Opções do board',exact:true});
  if(!await menu.isVisible())await page.getByRole('button',{name:'Mais opções do board',exact:true}).click();
  await menu.getByRole('button',{name,exact:true}).click();
}
