// Implementation-team audit regressions. Added without running during the frozen stress baseline.
// @ts-nocheck
import {test,expect} from '@playwright/test';

async function blank(page){
  await page.goto('/');await page.waitForFunction(()=>window.__board?.booted);
  await page.getByRole('button',{name:'Criar board',exact:true}).click();
  await page.getByRole('dialog',{name:'Criar board',exact:true}).getByRole('button',{name:'Criar board',exact:true}).click();
  await expect(page.locator('#board-home')).toBeHidden();
}
async function shape(page){await page.evaluate(async()=>{
  const b=window.__board,{createWidget}=await import('/src/core/model.ts');
  b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-120,y:-70,width:240,height:140,content:'Texto editável'}),id:'visible'}});
  b.bus.exec({op:'SELECTION_SET',payload:['visible']});
});}

test('at two percent right-click selects the visible shape beneath a hidden overlapping widget',async({page})=>{
  await blank(page);const point=await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts');b.camera.scale=.02;
    const geometry={x:-4000,y:-3000,width:8000,height:6000,content:'Objeto visível'};
    b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',geometry),id:'visible'}});
    b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',geometry),id:'hidden',hidden:true}});
    return b.camera.worldToScreen({x:0,y:0});
  });
  await page.mouse.click(point.x,point.y,{button:'right'});
  await expect(page.getByRole('menu',{name:'Menu do objeto',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['visible']);
});

for(const kind of ['connector','stroke'])test(`at two percent right-click selects an unselected ${kind} and exposes object actions`,async({page})=>{
  await blank(page);const point=await page.evaluate(kind=>{
    const b=window.__board;b.camera.scale=.02;
    if(kind==='connector')b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'target',type:'connector',start:{kind:'point',x:-4000,y:0},end:{kind:'point',x:4000,y:0},shape:'straight',style:{strokeColor:'#333333',strokeWidth:100},z:1}});
    else b.bus.exec({op:'STROKE_CREATE',payload:{id:'target',type:'stroke',tool:'pen',color:'#333333',points:[{x:-4000,y:0,r:50},{x:4000,y:0,r:50}],z:1}});
    return b.camera.worldToScreen({x:0,y:0});
  },kind);
  await page.mouse.click(point.x,point.y,{button:'right'});
  expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['target']);
  await expect(page.getByRole('menu',{name:'Menu do objeto',exact:true}).getByRole('menuitem',{name:'Excluir',exact:true})).toBeVisible();
});

test('a copied anchored connector pastes after its original anchors are deleted',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await blank(page);
  const result=await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts');
    for(const [id,x] of [['a',-300],['b',100]])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x,y:0,width:100,height:100}),id}});
    b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'original',type:'connector',start:{kind:'anchor',widgetId:'a',x:1,y:.5},end:{kind:'anchor',widgetId:'b',x:0,y:.5},shape:'straight',style:{strokeColor:'#333333',strokeWidth:2},z:1}});
    b.bus.exec({op:'SELECTION_SET',payload:['original']});
    const data=new DataTransfer();document.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));
    b.bus.exec({op:'WIDGET_REMOVE',payload:'a'});b.bus.exec({op:'WIDGET_REMOVE',payload:'b'});
    const paste=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.dispatchEvent(paste);
    const copied=[...b.state.connectors.values()].find(c=>c.id!=='original');
    return {consumed:paste.defaultPrevented,count:b.state.connectors.size,start:copied?.start,end:copied?.end};
  });
  expect(errors).toEqual([]);expect(result).toEqual({consumed:true,count:2,start:{kind:'point',x:-176,y:74},end:{kind:'point',x:124,y:74}});
  await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.__board.state.connectors.size)).toBe(1);
});

test('deleting a mind-map branch through Layers removes its subtree and one undo restores it',async({page})=>{
  await blank(page);const ids=await page.evaluate(async()=>{
    const b=window.__board,{createMindMap,addMindChild}=await import('/src/core/mindmap.ts');
    const root=createMindMap(b.state,b.bus,{x:0,y:0}),branch=addMindChild(b.state,b.bus,root),leaf=addMindChild(b.state,b.bus,branch);
    b.bus.exec({op:'SELECTION_SET',payload:[branch]});return {root,branch,leaf};
  });
  await page.getByRole('button',{name:'Camadas',exact:true}).click();
  await page.getByRole('region',{name:'Camadas',exact:true}).getByRole('button',{name:'Excluir camada',exact:true}).click();
  expect(await page.evaluate(({root,branch,leaf})=>({root:window.__board.state.widgets.has(root),branch:window.__board.state.widgets.has(branch),leaf:window.__board.state.widgets.has(leaf)}),ids)).toEqual({root:true,branch:false,leaf:false});
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(({branch,leaf})=>({branch:window.__board.state.widgets.has(branch),parent:window.__board.state.widgets.get(leaf)?.mind?.parentId}),ids)).toEqual({branch:true,parent:ids.branch});
});

test('Space activates a focused formatting button without starting canvas navigation',async({page})=>{
  await blank(page);await shape(page);const bold=page.getByRole('button',{name:'Negrito',exact:true});await bold.focus();await bold.press('Space');
  expect(await page.evaluate(()=>window.__board.state.widgets.get('visible').style.fontWeight)).toBe('bold');
  await expect(bold).toHaveAttribute('aria-pressed','true');
});

test('Enter opens a focused property submenu without starting the inline text editor',async({page})=>{
  await blank(page);await shape(page);const summary=page.locator('#selection-properties summary[aria-label="Borda"]');await summary.focus();await summary.press('Enter');
  await expect(page.locator('#selection-properties details[data-menu="border"]')).toHaveAttribute('open','');
  await expect(page.locator('#inline-editor')).toBeHidden();
});

test('Clear content clears visible checklist and table data as one undoable selection action',async({page})=>{
  await blank(page);await page.evaluate(async()=>{
    const b=window.__board,{createChecklistWidget,createTableWidget,checklistFromLines}=await import('/src/core/structured-text.ts');
    b.bus.exec({op:'WIDGET_CREATE',payload:{...createChecklistWidget({x:-250,y:0},checklistFromLines('[x] Comprar leite\nRevisar proposta')),id:'checklist'}});
    b.bus.exec({op:'WIDGET_CREATE',payload:{...createTableWidget({x:250,y:0},{title:'Plano',headerColor:'#4262ff',cells:[['Cabeçalho'],['Entrega']]}),id:'table'}});
    b.bus.exec({op:'SELECTION_SET',payload:['checklist','table']});
  });
  await page.locator('#selection-properties summary[aria-label="Mais"]').click();await page.getByRole('button',{name:'Limpar conteúdo',exact:true}).click();
  expect(await page.evaluate(()=>{
    const b=window.__board;return ['checklist','table'].flatMap(id=>{const w=b.state.widgets.get(id);return [w.content??'',w.table?.title??'',...(w.checklist?.items.map(item=>item.text)??[]),...(w.table?.cells.flat()??[])];}).filter(value=>value.trim());
  })).toEqual([]);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(()=>window.__board.state.widgets.get('checklist').checklist.items[0].text)).toBe('Comprar leite');
  expect(await page.evaluate(()=>window.__board.state.widgets.get('table').table.cells[1][0])).toBe('Entrega');
});

test('all-shapes search and results remain reachable in a small viewport at two percent zoom',async({page})=>{
  await blank(page);await page.setViewportSize({width:360,height:640});await page.evaluate(()=>{window.__board.camera.scale=.02;});
  await page.locator('[data-tool="shape"]').click();await page.getByRole('button',{name:'Mais formas',exact:true}).click();
  const picker=page.getByRole('region',{name:'Escolher forma',exact:true});
  await expect(picker.getByRole('textbox',{name:'Buscar formas',exact:true})).toBeFocused();
  expect(await picker.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})).toMatchObject({width:360,height:640});
  const bounds=await picker.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(8);expect(bounds.x+bounds.width).toBeLessThanOrEqual(352);expect(bounds.y).toBeGreaterThanOrEqual(8);expect(bounds.y+bounds.height).toBeLessThanOrEqual(632);
  await picker.getByRole('textbox',{name:'Buscar formas',exact:true}).fill('Losango');await picker.getByRole('button',{name:'Losango',exact:true}).click();await expect(picker).toBeHidden();
});

test('an image crop modal owns keyboard focus and blocks the global object-link shortcut',async({page})=>{
  await blank(page);await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts'),canvas=document.createElement('canvas');canvas.width=240;canvas.height=120;canvas.getContext('2d').fillRect(0,0,240,120);
    b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x:-120,y:-60,width:240,height:120}),id:'image',type:'image',src:canvas.toDataURL(),naturalWidth:240,naturalHeight:120,content:''}});
    b.bus.exec({op:'SELECTION_SET',payload:['image']});
  });
  await page.getByRole('button',{name:'Recortar',exact:true}).click();const crop=page.getByRole('dialog',{name:'Recortar imagem',exact:true});await expect(crop).toBeVisible();
  await page.keyboard.press('Control+k');await expect(page.locator('#link-dialog')).not.toHaveAttribute('open','');
  await crop.getByRole('button',{name:'Aplicar recorte',exact:true}).focus();await page.keyboard.press('Tab');expect(await crop.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(crop).toHaveCount(0);
});

test('keyboard reorder and group shortcuts preserve the locks enforced by their menus',async({page})=>{
  await blank(page);await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts');
    for(const [id,x] of [['locked',-250],['other',100]])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x,y:0,width:120,height:80}),id,locked:id==='locked'}});
    b.bus.exec({op:'SELECTION_SET',payload:['locked']});
  });
  const order=await page.evaluate(()=>[...window.__board.state.widgets.values()].map(w=>[w.id,w.z]));await page.keyboard.press('Control+]');
  expect(await page.evaluate(()=>[...window.__board.state.widgets.values()].map(w=>[w.id,w.z]))).toEqual(order);
  await page.evaluate(()=>window.__board.bus.exec({op:'SELECTION_SET',payload:['locked','other']}));await page.keyboard.press('Control+g');expect(await page.evaluate(()=>window.__board.state.groups.size)).toBe(0);
  await page.evaluate(()=>window.__board.bus.exec({op:'GROUP_CREATE',payload:{id:'locked-group',items:['locked','other']}}));await page.keyboard.press('Control+Shift+g');
  expect(await page.evaluate(()=>window.__board.state.groups.get('locked-group'))).toEqual(['locked','other']);
});

test('Copy as image includes a connector whose anchored objects are outside the selection',async({page})=>{
  await blank(page);await page.evaluate(async()=>{
    const b=window.__board,{createWidget}=await import('/src/core/model.ts');
    for(const [id,x] of [['a',-250],['b',150]])b.bus.exec({op:'WIDGET_CREATE',payload:{...createWidget('shape',{x,y:0,width:100,height:100}),id}});
    b.bus.exec({op:'CONNECTOR_CREATE',payload:{id:'line',type:'connector',shape:'straight',start:{kind:'anchor',widgetId:'a',x:1,y:.5},end:{kind:'anchor',widgetId:'b',x:0,y:.5},style:{strokeColor:'#333333',strokeWidth:8,endCap:'triangle'},z:1}});
    b.bus.exec({op:'SELECTION_SET',payload:['line']});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{window.__qaSelectionPng=await items[0].getType('image/png');}}});
  });
  await page.locator('#selection-properties summary[aria-label="Mais"]').click();await page.getByRole('button',{name:'Copiar como imagem',exact:true}).click();
  await page.waitForFunction(()=>window.__qaSelectionPng instanceof Blob);
  const result=await page.evaluate(async()=>{
    const source=URL.createObjectURL(window.__qaSelectionPng),image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;let opaque=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>0)opaque++;URL.revokeObjectURL(source);return {width:canvas.width,height:canvas.height,opaque};
  });
  expect(result.width).toBeGreaterThan(100);expect(result.opaque).toBeGreaterThan(100);expect(await page.evaluate(()=>[...window.__board.state.selection])).toEqual(['line']);
});
