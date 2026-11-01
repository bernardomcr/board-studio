'use strict';
const {_electron}=require('../../app/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const baseline=process.argv.includes('--baseline');
const binaryArg=process.argv.slice(2).find(argument=>!argument.startsWith('--'));
const executable=binaryArg?path.resolve(root,binaryArg):require('electron');
const output=path.join(root,'test-results',`smoke-${Date.now()}`);
const userData=path.join(output,'data');
fs.mkdirSync(output,{recursive:true});

const environment={...process.env};
delete environment.ELECTRON_RUN_AS_NODE;

async function launch(){
  const application=await _electron.launch({
    executablePath:executable,
    args:[...(!binaryArg?[root]:[]),'--smoke-test',`--board-studio-data=${userData}`],
    env:environment,
    timeout:45000,
  });
  // Chromium does not reliably capture a never-presented native window when
  // the renderer is idle. Present without focus or visible pixels, as in the
  // native performance checks; keep all normal rendering and close behavior.
  await application.evaluate(({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    window.setOpacity(0);
    window.showInactive();
  });
  return application;
}

function observeErrors(page,report){
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
}

async function ready(page){
  await page.waitForFunction(()=>window.__board?.booted,null,{timeout:45000});
}

async function restoreStorage(page){
  if(!page||page.isClosed())return;
  await page.evaluate(()=>{
    if(window.__smokeOriginalPut){
      IDBObjectStore.prototype.put=window.__smokeOriginalPut;
      delete window.__smokeOriginalPut;
    }
  }).catch(()=>{});
}

(async()=>{
  let application;
  let page;
  const report={exe:executable,errors:[],checks:[]};
  try{
    application=await launch();
    page=await application.firstWindow();
    observeErrors(page,report);
    await ready(page);

    report.desktop=await page.evaluate(()=>window.boardStudioDesktop.info());
    assert.equal(report.desktop.isDesktop,true);
    report.checks.push('desktop IPC');
    assert.deepEqual(await page.evaluate(()=>[typeof require,typeof process]),['undefined','undefined']);
    report.checks.push('isolated renderer');
    assert.equal(await page.evaluate(()=>typeof window.__board.flushForClose),'function');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    assert.equal(await page.title(),'no teu cu e atiro');
    report.checks.push('branded dark first run');

    const profile=page.getByRole('dialog',{name:'Perfil local',exact:true});
    if(await profile.isVisible()){
      await profile.getByRole('textbox',{name:'Seu nome',exact:true}).fill('Teste de instalação');
      await profile.getByRole('button',{name:'Salvar perfil',exact:true}).click();
      report.checks.push('profile');
    }else if(!baseline){
      throw Error('Expected first-run local profile');
    }

    await page.getByRole('button',{name:'Criar board',exact:true}).click();
    const create=page.getByRole('dialog',{name:'Criar board',exact:true});
    await create.getByRole('textbox',{name:'Nome do board',exact:true}).fill('Smoke desktop');
    await create.getByRole('button',{name:'Criar board',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('board-home').hidden);
    report.checks.push('create board');

    await page.evaluate(async()=>{
      const board=window.__board;
      board.bus.exec({op:'WIDGET_CREATE',payload:{
        id:'desktop-text',type:'text',textSizing:'natural',x:0,y:0,width:200,height:40,
        rotation:0,z:0,content:'Texto salvo no aplicativo',
        style:{fillColor:'transparent',fillOpacity:1,borderColor:'#222222',borderWidth:0,
          borderStyle:'normal',color:'#222222',fontFamily:'Inter',fontSize:24,
          textAlign:'left',textAlignVertical:'top'},
      }});
      await board.saveNow();
    });
    await page.reload();
    await ready(page);
    assert.equal(await page.evaluate(()=>window.__board.state.widgets.get('desktop-text')?.content),'Texto salvo no aplicativo');
    report.checks.push('save and reload');

    await page.getByRole('button',{name:'Início',exact:true}).click();
    await page.getByRole('button',{name:'Criar board',exact:true}).waitFor();
    await page.getByRole('button',{name:'Abrir Smoke desktop',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('board-home').hidden);
    assert.equal(await page.evaluate(()=>window.__board.state.widgets.get('desktop-text')?.content),'Texto salvo no aplicativo');
    report.checks.push('home and reopen');
    await page.screenshot({path:path.join(output,'desktop.png')});

    // A failed durable write must keep the real native close action pending.
    await page.evaluate(()=>{
      window.__smokeOriginalPut=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(){throw new DOMException('Smoke: durable storage unavailable','QuotaExceededError');};
      window.__smokeCloseAttempts=0;
      const board=window.__board,flush=board.flushForClose;
      board.flushForClose=(...arguments_)=>{window.__smokeCloseAttempts++;return flush(...arguments_);};
      board.bus.exec({op:'WIDGET_UPDATE',payload:{id:'desktop-text',patch:{content:'Alteração antes da falha'}}});
    });
    await application.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});
    await page.waitForFunction(()=>window.__smokeCloseAttempts>0&&document.getElementById('save-warning'));
    assert.equal(page.isClosed(),false);
    assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
    assert.equal(await page.evaluate(()=>window.__board.state.widgets.get('desktop-text')?.content),'Alteração antes da falha');
    report.checks.push('failed IDB write blocks native close');
    await restoreStorage(page);

    // Leave the text editor focused: closing must commit its DOM draft too.
    const center=await page.evaluate(()=>{
      const board=window.__board,widget=board.state.widgets.get('desktop-text');
      return board.camera.worldToScreen({x:widget.x+widget.width/2,y:widget.y+widget.height/2});
    });
    await page.mouse.dblclick(center.x,center.y);
    const editor=page.locator('#inline-editor');
    await editor.waitFor({state:'visible'});
    await editor.fill('Digitado no editor ao fechar');
    assert.equal(await editor.evaluate(element=>element===document.activeElement),true);
    assert.equal(await page.evaluate(()=>window.__board.state.widgets.get('desktop-text').content),'Alteração antes da falha');
    await application.close();
    application=undefined;

    application=await launch();
    page=await application.firstWindow();
    observeErrors(page,report);
    await ready(page);
    await page.getByRole('button',{name:'Abrir Smoke desktop',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('board-home').hidden);
    assert.equal(await page.evaluate(()=>window.__board.state.widgets.get('desktop-text')?.content),'Digitado no editor ao fechar');
    report.checks.push('focused text draft flush and restart');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>window.__board.state.widgets.get('desktop-text')?.content),'Alteração antes da falha');
    report.checks.push('close commit preserves Undo');
    assert.deepEqual(report.errors,[]);
  }catch(error){
    report.failure=String(error?.stack||error);
    throw error;
  }finally{
    await restoreStorage(page);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    await application?.close();
  }
  console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
