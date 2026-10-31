// @ts-nocheck
import {test,expect} from '@playwright/test';
async function blank(page){await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);await page.getByRole('button',{name:'Criar board',exact:true}).click();await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();await expect(page.locator('#board-home')).toBeHidden();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function audioSource(){const count=800,buffer=Buffer.alloc(44+count*2);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);return 'data:audio/wav;base64,'+buffer.toString('base64');}

test('portable audio embeds its actual Inter font even when a legacy style names another family',async({page})=>{
 await blank(page);const result=await page.evaluate(async src=>{const b=window.__board,{createAudioWidget}=await import('/src/core/audio.ts'),{boardFontFamilies,embedSvgFonts}=await import('/src/fonts.ts'),{boardToSvg}=await import('/src/core/exportSvg.ts'),w=createAudioWidget({src,mime:'audio/wav',name:'Inter no player',duration:.1,waveform:Array(64).fill(.3)},{x:0,y:0});w.style.fontFamily='Caveat';b.bus.exec({op:'WIDGET_CREATE',payload:w});const families=boardFontFamilies(b.state.widgets.values()),svg=await embedSvgFonts(boardToSvg(b.state),families);return {families,actualInter:svg.includes('font-family="Inter"'),embeddedInter:/@font-face\s*\{[^}]*font-family:\s*['"]Inter['"][^}]*url\(data:font\/woff2;base64,/.test(svg)};},audioSource());expect(result.families).toEqual(expect.arrayContaining(['Caveat','Inter']));expect(result.actualInter).toBe(true);expect(result.embeddedInter).toBe(true);
});

for(const mode of['checklist','table','audio','pad'])test(`switching the same widget into ${mode} drops old link hotspots and restores them on return to text`,async({page})=>{
 await blank(page);const source=await page.evaluate(async mode=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts'),w=createWidget(mode==='checklist'?'text':mode==='pad'?'sticky_note':'shape',{x:-180,y:-100,width:300,height:160,content:'[Link anterior](https://example.test/visible-again)'});w.style={...w.style,textAlign:'left',textAlignVertical:'top'};
  b.bus.exec({op:'WIDGET_CREATE',payload:w});b.bus.exec({op:'SELECTION_SET',payload:[w.id]});
  window.__linkOpens=[];window.open=url=>{window.__linkOpens.push(String(url));return null;};
  const hits=b.linksFor(w.id),last=hits.at(-1);if(!last)throw Error('Fixture needs an actual rendered link hotspot');
  return {id:w.id,type:w.type,point:b.camera.worldToScreen({x:w.x+last.x+last.w/2,y:w.y+last.y+last.h/2}),urls:hits.map(hit=>hit.url)};
 },mode);
 expect(source.urls).toContain('https://example.test/visible-again');
 await page.evaluate(({id,mode,src})=>{
  const b=window.__board,patch=mode==='checklist'?{checklist:{items:[{id:'task',text:'Uma tarefa',checked:false}]}}:mode==='table'?{table:{title:'',headerColor:'#4262ff',cells:[['Uma célula','Outra'],['Terceira','Quarta']]}}:mode==='audio'?{audio:{src,mime:'audio/wav',duration:.1,name:'Mensagem',waveform:Array(64).fill(.3)}}:{stickyPad:true};
  b.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch}});
 },{id:source.id,mode,src:audioSource()});await settle(page);
 expect(await page.evaluate(id=>window.__board.state.widgets.get(id).type,source.id)).toBe(source.type);
 expect(await page.evaluate(id=>window.__board.linksFor(id),source.id)).toEqual([]);
 await page.mouse.click(source.point.x,source.point.y);expect(await page.evaluate(()=>window.__linkOpens)).toEqual([]);
 // A checkbox remains interactive in its new mode and cannot activate a URL
 // that belonged to the old rich text at the same object id.
 if(mode==='checklist'){await page.getByRole('checkbox',{name:'Uma tarefa',exact:true}).click();expect(await page.evaluate(id=>window.__board.state.widgets.get(id).checklist.items[0].checked,source.id)).toBe(true);expect(await page.evaluate(()=>window.__linkOpens)).toEqual([]);}
 await page.evaluate(({id,mode})=>{const field=mode==='pad'?'stickyPad':mode,b=window.__board;b.bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{[field]:undefined}}});},{id:source.id,mode});await settle(page);
 expect(await page.evaluate(id=>window.__board.linksFor(id).map(hit=>hit.url),source.id)).toContain('https://example.test/visible-again');
 await page.mouse.click(source.point.x,source.point.y);expect(await page.evaluate(()=>window.__linkOpens)).toEqual(['https://example.test/visible-again']);
});
