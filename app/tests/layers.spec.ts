// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function fixture(page){await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');
  for(const[id,x,content]of[['a',-300,'Alpha'],['b',0,'Beta'],['c',300,'Gamma']])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x,y:-100,width:180,height:110,content}),id}});
  b.bus.exec({op:'STROKE_CREATE',payload:{id:'ink',type:'stroke',name:'Esboço',tool:'pen',color:'#3859ff',points:[{x:-280,y:80,r:3},{x:-160,y:80,r:3}],z:0}});
  b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'link',type:'connector',name:'Ligação',shape:'curved',start:{kind:'anchor',widgetId:'a',x:1,y:.5},end:{kind:'anchor',widgetId:'b',x:0,y:.5},style:{strokeColor:'#333333',strokeWidth:2,endCap:'arrow'},z:0}});
});}
async function open(page){await page.getByRole('button',{name:'Camadas',exact:true}).click();await expect(page.getByRole('region',{name:'Camadas',exact:true})).toBeVisible();for(const caret of await page.getByRole('button',{name:/^Expandir objetos da camada /}).all())await caret.click();}
const row=(page,id)=>page.locator(`[data-layer-id="${id}"]`);
const panel=page=>page.getByRole('region',{name:'Camadas',exact:true});

test('layers list every object kind, rename, hide, lock and persist their state',async({page})=>{
  await blank(page);await fixture(page);await open(page);await expect(page.locator('#layers-list [data-layer-id]')).toHaveCount(5);
  await row(page,'b').getByRole('button',{name:'Selecionar objeto Beta',exact:true}).click();
  await panel(page).getByRole('button',{name:'Renomear objeto',exact:true}).click();
  const name=page.getByRole('textbox',{name:'Nome do objeto',exact:true});await name.fill('Título da composição');await name.press('Enter');
  await expect(row(page,'b').getByRole('button',{name:'Selecionar objeto Título da composição',exact:true})).toBeVisible();
  await row(page,'ink').getByRole('button',{name:'Ocultar Esboço',exact:true}).click();
  await row(page,'link').getByRole('button',{name:'Bloquear Ligação',exact:true}).click();
  expect(await page.evaluate(()=>({name:window.__board.state.widgets.get('b').name,hidden:window.__board.state.strokes.get('ink').hidden,locked:window.__board.state.connectors.get('link').locked}))).toEqual({name:'Título da composição',hidden:true,locked:true});
  await page.evaluate(()=>window.__board.saveNow());await page.reload();await page.waitForFunction(()=>window.__board?.booted);await open(page);
  await expect(row(page,'ink').getByRole('button',{name:'Mostrar Esboço',exact:true})).toBeVisible();await expect(row(page,'link').getByRole('button',{name:'Desbloquear Ligação',exact:true})).toBeVisible();
  await expect(row(page,'b').getByRole('button',{name:'Selecionar objeto Título da composição',exact:true})).toBeVisible();
  const svg=await page.evaluate(async()=>{const{boardToSvg}=await import('/src/core/exportSvg.ts');return boardToSvg(window.__board.state);});expect(svg).not.toContain('#3859ff');
});

test('nested layer groups collapse, toggle visibility and locking as one undoable action',async({page})=>{
  await blank(page);await fixture(page);await page.evaluate(()=>{const b=window.__board;b.bus.exec({op:'GROUP_CREATE',payload:{id:'inner',items:['a','ink']}});b.bus.exec({op:'GROUP_CREATE',payload:{id:'outer',items:['inner','b']}});});
  await open(page);await expect(page.locator('#layers-list [data-layer-id]')).toHaveCount(7);
  await row(page,'outer').getByRole('button',{name:'Recolher grupo',exact:true}).click();await expect(page.locator('#layers-list [data-layer-id]')).toHaveCount(3);
  await row(page,'outer').getByRole('button',{name:'Ocultar Grupo',exact:true}).click();
  expect(await page.evaluate(()=>['a','b','ink'].every(id=>(window.__board.state.widgets.get(id)??window.__board.state.strokes.get(id)).hidden))).toBe(true);
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>['a','b','ink'].every(id=>!(window.__board.state.widgets.get(id)??window.__board.state.strokes.get(id)).hidden))).toBe(true);
  await row(page,'outer').getByRole('button',{name:'Bloquear Grupo',exact:true}).click();
  expect(await page.evaluate(()=>['a','b','ink'].every(id=>(window.__board.state.widgets.get(id)??window.__board.state.strokes.get(id)).locked))).toBe(true);
  await row(page,'outer').getByRole('button',{name:'Desbloquear Grupo',exact:true}).click();await row(page,'outer').getByRole('button',{name:'Expandir grupo',exact:true}).click();
  await row(page,'a').getByRole('button',{name:'Selecionar objeto Alpha',exact:true}).click();expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['a']);
  await row(page,'c').getByRole('button',{name:'Selecionar objeto Gamma',exact:true}).click({modifiers:['Control']});expect(await page.evaluate(()=>[...window.__board.state.selection].sort())).toEqual(['a','c']);
});

test('layer ordering handles mixed entities, drag and one-step undo',async({page})=>{
  await blank(page);await fixture(page);await open(page);
  const order=()=>page.evaluate(async()=>{const{orderEntities}=await import('/src/core/layers.ts');return orderEntities(window.__board.state);});
  const original=await order();await row(page,'a').getByRole('button',{name:'Selecionar objeto Alpha',exact:true}).click();
  await panel(page).getByRole('button',{name:'Mover objeto acima',exact:true}).click();let now=await order();expect(now.indexOf('a')).toBeGreaterThan(now.indexOf('b'));
  await page.keyboard.press('Control+z');expect(await order()).toEqual(original);
  await row(page,'a').dragTo(row(page,'link'),{targetPosition:{x:110,y:7}});now=await order();expect(now.at(-1)).toBe('a');
  await page.keyboard.press('Control+z');expect(await order()).toEqual(original);
  await row(page,'c').getByRole('button',{name:'Selecionar objeto Gamma',exact:true}).click();await panel(page).getByRole('button',{name:'Duplicar objeto',exact:true}).click();
  expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(4);
  await panel(page).getByRole('button',{name:'Excluir objeto',exact:true}).click();expect(await page.evaluate(()=>window.__board.state.widgets.size)).toBe(3);
});

test('mixed layer order changes actual canvas pixels and hidden entities cannot be picked',async({page})=>{
  await blank(page);await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts'),w=createWidget('shape',{x:-100,y:-70,width:200,height:140,content:''});
    b.bus.exec({op:'WIDGET_CREATE',payload:{...w,id:'red',name:'Painel vermelho',style:{...w.style,fillColor:'#ff0000',borderWidth:0}}});
    b.bus.exec({op:'STROKE_CREATE',payload:{id:'green',name:'Traço verde',type:'stroke',tool:'pen',color:'#00ff00',points:[{x:-90,y:0,r:20},{x:90,y:0,r:20}],z:0}});
    b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'blue',name:'Linha azul',type:'connector',shape:'straight',start:{kind:'point',x:-80,y:0},end:{kind:'point',x:80,y:0},style:{strokeColor:'#0000ff',strokeWidth:16},z:0}});
  });
  const pixel=()=>page.evaluate(()=>{const b=window.__board,Rectangle=b.app.screen.constructor;return [...b.app.renderer.extract.pixels({target:b.app.stage,frame:new Rectangle(800,500,1,1),resolution:1}).pixels];});
  expect(await pixel()).toEqual([0,0,255,255]);
  await page.evaluate(async()=>{const b=window.__board,{reorderLayerCommands}=await import('/src/core/layers.ts');b.bus.exec({op:'BATCH',payload:{label:'Enviar conector para trás',commands:reorderLayerCommands(b.state,['blue'],'back')}});});
  expect(await pixel()).toEqual([0,255,0,255]);
  await page.evaluate(async()=>{const b=window.__board,{reorderLayerCommands}=await import('/src/core/layers.ts');b.bus.exec({op:'BATCH',payload:{label:'Enviar traço para trás',commands:reorderLayerCommands(b.state,['green'],'back')}});});
  expect(await pixel()).toEqual([255,0,0,255]);
  await open(page);await row(page,'red').getByRole('button',{name:'Ocultar Painel vermelho',exact:true}).click();expect(await pixel()).toEqual([0,0,255,255]);
  await page.mouse.click(800,500);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['blue']);
  await row(page,'blue').getByRole('button',{name:'Ocultar Linha azul',exact:true}).click();await page.mouse.click(600,800);await page.mouse.click(800,500);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['green']);
  await row(page,'green').getByRole('button',{name:'Ocultar Traço verde',exact:true}).click();await page.mouse.click(600,800);await page.mouse.click(800,500);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual([]);
});
