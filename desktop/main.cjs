'use strict';
const {app,BrowserWindow,protocol,net,shell,session,dialog,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const ORIGIN='boardstudio://app';
const smoke=process.argv.includes('--smoke-test');
// Keep the data directory stable across this display-name change.
app.setPath('userData',path.join(app.getPath('appData'),'Board Studio'));
const dataFlag=process.argv.find(value=>value.startsWith('--board-studio-data='));
if(dataFlag)app.setPath('userData',path.resolve(dataFlag.slice('--board-studio-data='.length)));
app.setName('No Teu Cu e Atiro');
protocol.registerSchemesAsPrivileged([{scheme:'boardstudio',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let window;
const ownUrl=url=>{try{const parsed=new URL(url);return parsed.protocol==='boardstudio:'&&parsed.hostname==='app'&&!parsed.port&&!parsed.username&&!parsed.password;}catch{return false;}};
const external=url=>{try{return ['https:','http:','mailto:'].includes(new URL(url).protocol);}catch{return false;}};
async function createWindow(){
 const renderer=path.join(__dirname,'renderer');
 protocol.handle('boardstudio',async request=>{
  try{
   const url=new URL(request.url);if(url.hostname!=='app')return new Response('Not found',{status:404});
   const pathname=decodeURIComponent(url.pathname),relative=pathname==='/'?'index.html':pathname.replace(/^\//,'');
   if(relative.includes('\0')||relative.includes('\\'))return new Response('Invalid path',{status:400});
   const file=path.resolve(renderer,relative);if(!file.startsWith(renderer+path.sep))return new Response('Invalid path',{status:403});
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Not found',{status:404});
   const response=await net.fetch(pathToFileURL(file).href),headers=new Headers(response.headers);
   headers.set('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https: data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'");
   return new Response(response.body,{status:response.status,headers});
  }catch{return new Response('Unable to load resource',{status:404});}
 });
 let microphoneAllowed=false;
 session.defaultSession.setPermissionRequestHandler(async(webContents,permission,callback,details)=>{
  if(!ownUrl(details.requestingUrl||webContents.getURL())){callback(false);return;}
  if(permission==='media'&&details.mediaTypes?.includes('audio')&&!details.mediaTypes?.includes('video')){
   if(smoke){callback(false);return;}
   const result=await dialog.showMessageBox(window,{type:'question',title:'Microfone',message:'Permitir que o No Teu Cu e Atiro grave áudio pelo microfone?',detail:'A gravação fica neste computador e começa somente quando você pedir.',buttons:['Não permitir','Permitir'],defaultId:0,cancelId:0});microphoneAllowed=result.response===1;callback(microphoneAllowed);return;
  }
  callback(permission==='clipboard-sanitized-write');
 });
 session.defaultSession.setPermissionCheckHandler((webContents,permission,origin,details)=>ownUrl(origin||webContents?.getURL()||'')&&(permission==='clipboard-sanitized-write'||permission==='media'&&details.mediaType==='audio'&&microphoneAllowed&&!smoke));
 window=new BrowserWindow({width:1480,height:960,minWidth:760,minHeight:520,show:false,backgroundColor:'#1b1a21',icon:path.join(__dirname,'assets/icon.png'),autoHideMenuBar:true,title:'no teu cu e atiro',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:!smoke}});
 window.removeMenu();
 let closingAllowed=false,savingBeforeClose=false;
 window.on('close',event=>{
  if(closingAllowed||window.webContents.isDestroyed())return;
  event.preventDefault();if(savingBeforeClose)return;savingBeforeClose=true;const closingWindow=window;closingWindow.setEnabled(false);
  let timer;
  Promise.race([closingWindow.webContents.executeJavaScript('window.__board ? window.__board.flushForClose?.() : true'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('O salvamento demorou mais do que o esperado.')),15000);})]).then(saved=>{if(saved!==true)throw Error('O salvamento não foi confirmado.');clearTimeout(timer);closingAllowed=true;closingWindow.close();}).catch(async()=>{clearTimeout(timer);savingBeforeClose=false;if(closingWindow.isDestroyed())return;closingWindow.setEnabled(true);if(!smoke)await dialog.showMessageBox(closingWindow,{type:'warning',title:'Seu trabalho continua aberto',message:'Ainda não foi possível concluir o salvamento.',detail:'Finalize ou cancele uma gravação de áudio pendente e aguarde a abertura do quadro. Se houver aviso de armazenamento, use Salvar arquivo para guardar uma cópia antes de fechar.',buttons:['Voltar ao quadro']});});
 });
 window.webContents.setWindowOpenHandler(({url})=>{if(external(url))void shell.openExternal(url).catch(()=>{});return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!ownUrl(url)){event.preventDefault();if(external(url))void shell.openExternal(url).catch(()=>{});}});
 ipcMain.handle('board-studio:desktop-info',event=>{if(event.sender!==window.webContents||!ownUrl(event.senderFrame?.url||''))throw Error('Invalid sender');return {version:app.getVersion(),isDesktop:true,platform:process.platform};});
 window.once('ready-to-show',()=>{if(!smoke)window.show();});
 window.on('closed',()=>{window=undefined;});
 await window.loadURL(ORIGIN+'/index.html');
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.whenReady().then(createWindow).catch(error=>{if(!smoke)dialog.showErrorBox('No Teu Cu e Atiro não abriu',String(error?.message||error));console.error(error);app.quit();});
 app.on('window-all-closed',()=>app.quit());
}
