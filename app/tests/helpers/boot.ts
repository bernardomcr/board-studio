import type {Page,Request} from '@playwright/test';

/** Retry only a lost local source-module connection during the initial load. */
export async function gotoBoardWithModuleRetry(page:Page):Promise<void>{
  const failedModules:string[]=[];
  const failed=(request:Request)=>{
    if(request.resourceType()!=='script'||request.failure()?.errorText!=='net::ERR_CONNECTION_FAILED')return;
    const url=new URL(request.url());
    if(url.pathname.startsWith('/src/'))failedModules.push(url.href);
  };
  page.on('requestfailed',failed);
  try{await page.goto('/',{waitUntil:'load'});}finally{page.off('requestfailed',failed);}
  const origin=new URL(page.url()).origin;
  const lostModule=failedModules.find(url=>new URL(url).origin===origin);
  if(lostModule){
    console.log('BOOT_TRANSPORT_RETRY '+new URL(lostModule).pathname+' net::ERR_CONNECTION_FAILED');
    // The listener is already removed: a second failure cannot trigger a loop.
    // HTTP errors, application exceptions and slow boot do not enter this path.
    await page.reload({waitUntil:'load'});
  }
}
