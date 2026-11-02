// Run without a browser: node --test tests/cpu/mindmap.cpu.mjs
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const directory=await mkdtemp(join(tmpdir(),'board-mindmap-cpu-')),bundle=join(directory,'core.mjs');
await build({stdin:{contents:`export * from './core/mindmap';export * from './core/groups';export {CommandBus} from './core/commands';export {connectorGeometry} from './core/connectors';export {boxTextInsets,fitBoxText} from './core/text-layout';export {validateBoardFile} from './project-files';`,resolveDir:fileURLToPath(new URL('../../src/',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:bundle});
const m=await import(pathToFileURL(bundle));
after(async()=>{const absolute=resolve(directory),within=relative(resolve(tmpdir()),absolute);assert.ok(isAbsolute(directory)&&within&&!within.startsWith('..')&&!isAbsolute(within)&&basename(absolute).startsWith('board-mindmap-cpu-'));await rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
function fixture(scale=1){const state={widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()},bus=new m.CommandBus(state,()=>{}),root=m.createMindMap(state,bus,{x:0,y:0},'Centro',scale);return {state,bus,root};}
const snapshot=s=>JSON.stringify({widgets:[...s.widgets],connectors:[...s.connectors],order:s.order,connectorOrder:s.connectorOrder,selection:[...s.selection]});
const close=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
function fileOf(state){return {format:'local-board',version:1,title:'Mapa',widgets:[...state.widgets.values()],order:state.order,connectors:[...state.connectors.values()],connectorOrder:state.connectorOrder,strokes:[],strokeOrder:[],groups:[],camera:{x:0,y:0,scale:1}};}

test('new maps, child boxes, gaps, padding and branch strokes have the same screen geometry at every creation zoom',()=>{
  const fixtures=[1,50,.05].map(scale=>{const f=fixture(scale),a=m.addMindChild(f.state,f.bus,f.root,'Ramo'),b=m.addMindSibling(f.state,f.bus,a,'Outro'),c=m.addMindChild(f.state,f.bus,a,'Filho');return {...f,scale,ids:[f.root,a,b,c]};});
  const baseline=fixtures[0];
  for(const f of fixtures){for(let i=0;i<f.ids.length;i++){const w=f.state.widgets.get(f.ids[i]),base=baseline.state.widgets.get(baseline.ids[i]);for(const key of ['x','y','width','height'])close(w[key]/f.scale,base[key]);close(w.style.fontSize/f.scale,base.style.fontSize);close(m.boxTextInsets(w).left/f.scale,m.boxTextInsets(base).left);assert.equal(w.mind.layoutScale,f.scale);}for(const line of f.state.connectors.values())close(line.style.strokeWidth/f.scale,2.5);}
  for(const layout of ['org','list','balanced']){for(const f of fixtures)m.setMindLayout(f.state,f.bus,f.root,layout);for(const f of fixtures)for(let i=0;i<f.ids.length;i++){const w=f.state.widgets.get(f.ids[i]),base=baseline.state.widgets.get(baseline.ids[i]);close(w.x/f.scale,base.x);close(w.y/f.scale,base.y);}}
});

test('new branches remember the theme and the equivalent topic style without copying content or detail metadata',()=>{
  const {state,bus,root}=fixture(3),rootNode=state.widgets.get(root);bus.exec({op:'WIDGET_UPDATE',payload:{id:root,patch:{style:{...rootNode.style,fontSize:999,fontStyle:'italic'}}}});
  m.setMindTheme(state,bus,root,'ocean');const a=m.addMindChild(state,bus,root,'A');assert.equal(state.widgets.get(a).style.fontSize,60);assert.equal(state.widgets.get(a).style.fontStyle??'normal','normal');
  const first=state.widgets.get(a);bus.exec({op:'WIDGET_UPDATE',payload:{id:a,patch:{shape:'rhombus',style:{...first.style,fontFamily:'Caveat',fontSize:83,fontStyle:'italic',fillColor:'#badbad',color:'#114422',borderStyle:'dashed',cornerRadius:23},mind:{...first.mind,notes:'Do not duplicate',icon:'⭐'}}}});
  const firstLine=[...state.connectors.values()].find(line=>line.mindBranch===a);bus.exec({op:'CONNECTOR_UPDATE',payload:{id:firstLine.id,patch:{style:{...firstLine.style,strokeWidth:37,strokeStyle:'dashed'}}}});
  const b=m.addMindChild(state,bus,root,'B'),c=m.addMindChild(state,bus,a,'C'),d=m.addMindSibling(state,bus,b,'D');
  for(const id of [b,c,d]){const w=state.widgets.get(id);assert.equal(w.shape,'rhombus');assert.equal(w.style.fontFamily,'Caveat');assert.equal(w.style.fontSize,83);assert.equal(w.style.fontStyle,'italic');assert.equal(w.style.fillColor,'#badbad');assert.equal(w.style.borderStyle,'dashed');assert.equal(w.mind.notes,undefined);assert.equal(w.mind.icon,undefined);}
  assert.equal(state.widgets.get(b).mind.color,m.MIND_THEMES.ocean.colors[1]);assert.equal(state.widgets.get(d).mind.color,m.MIND_THEMES.ocean.colors[2]);assert.equal(state.widgets.get(c).mind.color,state.widgets.get(a).mind.color);assert.equal(state.widgets.get(b).style.borderColor,state.widgets.get(b).mind.color);
  for(const line of state.connectors.values()){assert.equal(line.style.strokeWidth,37);assert.equal(line.style.strokeStyle,'dashed');}
  const existing={width:first.width,height:first.height};m.layoutMindMap(state,bus,root);assert.deepEqual({width:state.widgets.get(a).width,height:state.widgets.get(a).height},existing);assert.ok(m.fitBoxText(state.widgets.get(a)).fontSize<=83);
});

test('relative level commands preserve manual visibility and locks, and select only visible editable descendants',()=>{
  const {state,bus,root}=fixture(),a=m.addMindChild(state,bus,root,'A'),b=m.addMindChild(state,bus,a,'B'),c=m.addMindChild(state,bus,b,'C'),hidden=m.addMindChild(state,bus,root,'Hidden'),locked=m.addMindChild(state,bus,root,'Locked');
  bus.exec({op:'WIDGET_UPDATE',payload:{id:hidden,patch:{hidden:true}}});bus.exec({op:'ENTITY_LOCK',payload:{ids:[locked],locked:true}});
  const lockedBefore=JSON.stringify(state.widgets.get(locked)),before=snapshot(state);assert.equal(m.showMindLevels(state,bus,root,1),true);assert.equal(m.mindNodeHidden(state,a),false);assert.equal(m.mindNodeHidden(state,b),true);assert.equal(state.widgets.get(hidden).hidden,true);assert.equal(JSON.stringify(state.widgets.get(locked)),lockedBefore);bus.undo();assert.equal(snapshot(state),before);bus.redo();
  m.showMindLevels(state,bus,a,1);assert.equal(m.mindNodeHidden(state,b),false);assert.equal(m.mindNodeHidden(state,c),true);m.showMindLevels(state,bus,root,0);assert.equal(m.mindNodeHidden(state,c),false);assert.equal(state.widgets.get(hidden).hidden,true);
  m.selectMindSubtopics(state,bus,root);assert.deepEqual([...state.selection],[a,b,c]);assert.equal(m.selectMindSubtopics(state,bus,root),false);
  const stable=snapshot(state);for(const value of [-1,10,1.5,NaN])assert.equal(m.showMindLevels(state,bus,root,value),false);assert.equal(snapshot(state),stable);
});

test('same-parent insertion excludes the dragged source, preserves order and sides, and is one undo step',()=>{
  const {state,bus,root}=fixture(),a=m.addMindChild(state,bus,root,'A'),b=m.addMindChild(state,bus,root,'B'),c=m.addMindChild(state,bus,root,'C'),leaf=m.addMindChild(state,bus,b,'Leaf'),before=snapshot(state);
  assert.equal(m.reparentMindNode(state,bus,b,root,'right',0),true);assert.deepEqual(m.mindChildren(state,root).map(w=>w.id),[b,a,c]);assert.deepEqual(m.mindChildren(state,root).map(w=>w.mind.order),[0,1,2]);bus.undo();assert.equal(snapshot(state),before);bus.redo();
  assert.equal(m.reparentMindNode(state,bus,b,root,'left',2),true);assert.deepEqual(m.mindChildren(state,root).map(w=>w.id),[a,c,b]);assert.equal(state.widgets.get(b).mind.side,'left');assert.equal(state.widgets.get(leaf).mind.side,'left');assert.equal(m.reparentMindNode(state,bus,b,root,'left',2),false);
  const stable=snapshot(state);assert.equal(m.reparentMindNode(state,bus,b,leaf),false);assert.equal(snapshot(state),stable);
  const branch=[...state.connectors.values()].find(line=>line.mindBranch===b);bus.exec({op:'ENTITY_LOCK',payload:{ids:[branch.id],locked:true}});const pinned=snapshot(state);assert.equal(m.reparentMindNode(state,bus,b,a),false);assert.equal(snapshot(state),pinned);
});

test('complete tree scaling retains its design unit, text and line proportions for later creation and copies',()=>{
  const {state,bus,root}=fixture(2),a=m.addMindChild(state,bus,root,'A'),b=m.addMindChild(state,bus,a,'B'),before=snapshot(state),oldFont=state.widgets.get(a).style.fontSize,selection=m.captureSelection(state,[root]);
  bus.exec({op:'BATCH',payload:{commands:m.transformSnapshot(state,selection,5,7,3,3)}});
  assert.equal(state.widgets.get(root).mind.layoutScale,6);assert.equal(state.widgets.get(a).mind.layoutScale,6);assert.equal(state.widgets.get(a).style.fontSize,oldFont*3);for(const line of state.connectors.values())assert.equal(line.style.strokeWidth,15);bus.undo();assert.equal(snapshot(state),before);bus.redo();
  const child=m.addMindChild(state,bus,a,'After scaling');assert.equal(state.widgets.get(child).mind.layoutScale,6);assert.equal(state.widgets.get(child).style.fontSize,oldFont*3);assert.equal(state.widgets.get(child).x-(state.widgets.get(a).x+state.widgets.get(a).width),300);
  const whole=m.captureSelection(state,[root]);m.duplicateSnapshot(state,bus,whole,1500,200);const copiedRoot=[...state.widgets.values()].find(w=>w.mind.parentId===null&&w.id!==root);assert.equal(copiedRoot.mind.layoutScale,6);const copiedChild=m.addMindChild(state,bus,copiedRoot.id,'Copy child');assert.equal(state.widgets.get(copiedChild).mind.layoutScale,6);
  const partial=m.captureSelection(state,[a]);m.duplicateSnapshot(state,bus,partial,-200,300);const partialRoot=[...state.widgets.values()].find(w=>w.mind.parentId===null&&w.id!==root&&w.id!==copiedRoot.id);assert.equal(partialRoot.mind.layoutScale,6);assert.equal(state.widgets.get(m.addMindChild(state,bus,partialRoot.id)).style.fontSize,oldFont*3);
  const validated=m.validateBoardFile(JSON.parse(JSON.stringify(fileOf(state))));assert.equal(validated.widgets.find(w=>w.id===root).mind.layoutScale,6);assert.equal(validated.widgets.find(w=>w.id===b).mind.layoutScale,6);m.validateMindMapGraph(validated.widgets,validated.connectors);
});

test('legacy metadata keeps scale 1 behavior and malformed scales are rejected without changing the board',()=>{
  const {state,bus,root}=fixture();for(const w of state.widgets.values()){const {layoutScale,...mind}=w.mind;state.widgets.set(w.id,{...w,mind});}
  const validated=m.validateBoardFile(JSON.parse(JSON.stringify(fileOf(state))));assert.equal(Object.hasOwn(validated.widgets[0].mind,'layoutScale'),false);const child=m.addMindChild(state,bus,root);assert.equal(state.widgets.get(child).mind.layoutScale,1);assert.equal(state.widgets.get(child).style.fontSize,20);assert.equal(state.widgets.get(child).x-(state.widgets.get(root).x+state.widgets.get(root).width),50);
  const stable=snapshot(state);for(const layoutScale of [0,-1,NaN,Infinity,'2']){assert.throws(()=>m.validateMindMetadata({...state.widgets.get(root).mind,layoutScale}));assert.throws(()=>m.createMindMap(state,bus,{x:0,y:0},'Bad',layoutScale));}assert.equal(snapshot(state),stable);
});

test('Mind branches keep their curve geometry at every design scale, with distinct Org and List spacing',()=>{
  const fixtures=[1,50,.05].map(scale=>{const f=fixture(scale),a=m.addMindChild(f.state,f.bus,f.root,'A'),b=m.addMindChild(f.state,f.bus,f.root,'B');return {...f,a,b,scale};}),baseline=fixtures[0];
  const curve=f=>{const geometry=m.connectorGeometry([...f.state.connectors.values()].find(line=>line.mindBranch===f.a),f.state.widgets);return geometry.cubics??[geometry.cubic];};
  const reference=curve(baseline);for(const f of fixtures){const actual=curve(f);assert.equal(actual.length,reference.length);for(let i=0;i<actual.length;i++)for(const point of ['p0','p1','p2','p3'])for(const axis of ['x','y'])close(actual[i][point][axis]/f.scale,reference[i][point][axis]);}
  for(const f of fixtures){m.setMindLayout(f.state,f.bus,f.root,'org');let root=f.state.widgets.get(f.root),a=f.state.widgets.get(f.a),b=f.state.widgets.get(f.b);close((a.y-root.y-root.height)/f.scale,48);close((b.x-a.x-a.width)/f.scale,20);m.setMindLayout(f.state,f.bus,f.root,'list');root=f.state.widgets.get(f.root);a=f.state.widgets.get(f.a);b=f.state.widgets.get(f.b);close((a.y-root.y-root.height)/f.scale,20);close((a.x-root.x)/f.scale,38);close((b.y-a.y-a.height)/f.scale,16);}
});

test('free topic placements survive additions and reflow; explicit Reorganize resets them in one undo',()=>{
  for(const layout of ['balanced','org','list']){
    const {state,bus,root}=fixture(),a=m.addMindChild(state,bus,root,'A'),leaf=m.addMindChild(state,bus,a,'Leaf');m.setMindLayout(state,bus,root,layout);
    bus.beginTransaction('Arrastar livremente');m.moveMindSubtree(state,bus,a,330,170);assert.equal(m.markMindManualPosition(state,bus,a),true);bus.endTransaction();
    const oldA=state.widgets.get(a),oldLeaf=state.widgets.get(leaf),b=m.addMindChild(state,bus,a,'New leaf'),next=state.widgets.get(b);
    for(const [id,old] of [[a,oldA],[leaf,oldLeaf]]){const node=state.widgets.get(id);close(node.x,old.x);close(node.y,old.y);assert.equal(node.mind.manualPosition,true);}
    assert.ok(next.x+next.width<=oldLeaf.x||oldLeaf.x+oldLeaf.width<=next.x||next.y+next.height<=oldLeaf.y||oldLeaf.y+oldLeaf.height<=next.y,'new auto-positioned topic must not cover a freely placed sibling');
    for(const command of m.mindLayoutCommands(state,root))bus.exec(command);close(state.widgets.get(a).x,oldA.x);close(state.widgets.get(leaf).y,oldLeaf.y);
    const before=snapshot(state);assert.equal(m.layoutMindMap(state,bus,root),true);assert.equal(state.widgets.get(a).mind.manualPosition,undefined);assert.equal(state.widgets.get(leaf).mind.manualPosition,undefined);bus.undo();assert.equal(snapshot(state),before);bus.redo();assert.equal(state.widgets.get(a).mind.manualPosition,undefined);
  }
});

test('manual placements persist, reject malformed metadata and locks, and reparent as one structural undo',()=>{
  const {state,bus,root}=fixture(),a=m.addMindChild(state,bus,root,'A'),leaf=m.addMindChild(state,bus,a,'Leaf'),target=m.addMindChild(state,bus,root,'Target');m.markMindManualPosition(state,bus,a);
  const file=m.validateBoardFile(JSON.parse(JSON.stringify(fileOf(state))));assert.equal(file.widgets.find(w=>w.id===a).mind.manualPosition,true);assert.equal(file.widgets.find(w=>w.id===leaf).mind.manualPosition,true);for(const value of [0,1,'true',null])assert.throws(()=>m.validateMindMetadata({...state.widgets.get(a).mind,manualPosition:value}));
  const before=snapshot(state);assert.equal(m.reparentMindNode(state,bus,a,target),true);assert.equal(state.widgets.get(a).mind.manualPosition,undefined);assert.equal(state.widgets.get(leaf).mind.manualPosition,undefined);bus.undo();assert.equal(snapshot(state),before);
  bus.exec({op:'ENTITY_LOCK',payload:{ids:[leaf],locked:true}});const stable=snapshot(state);assert.equal(m.markMindManualPosition(state,bus,a),false);assert.equal(snapshot(state),stable);
});

test('default Mind topics use readable canvas colors and transparent child boxes without replacing custom appearance',()=>{
  for(const dark of [false,true]){const {state,bus}=fixture(),root=m.createMindMap(state,bus,{x:0,y:0},'Central',1,{dark}),a=m.addMindChild(state,bus,root,'A'),r=state.widgets.get(root),child=state.widgets.get(a);assert.equal(r.style.fillColor,dark?'#643d55':'#f3c1d3');assert.equal(r.style.color,dark?'#f7edf4':'#342a3a');assert.equal(r.style.borderWidth,0);assert.equal(child.style.fillOpacity,0);assert.equal(child.style.color,r.style.color);bus.exec({op:'WIDGET_UPDATE',payload:{id:a,patch:{style:{...child.style,fillColor:'#345678',fillOpacity:.7,color:'#fedcba'}}}});const b=m.addMindSibling(state,bus,a);assert.equal(state.widgets.get(b).style.fillColor,'#345678');assert.equal(state.widgets.get(b).style.fillOpacity,.7);assert.equal(state.widgets.get(b).style.color,'#fedcba');}
});

const emptyState=()=>({widgets:new Map(),order:[],connectors:new Map(),connectorOrder:[],strokes:new Map(),strokeOrder:[],groups:new Map(),selection:new Set()});
const modelSnapshot=state=>JSON.stringify({widgets:[...state.widgets],connectors:[...state.connectors],order:state.order,connectorOrder:state.connectorOrder});
const attachedFile=()=>({id:'resize-file',name:'arquivo-local.txt',mimeType:'text/plain',src:'data:text/plain;base64,YQ==',size:1});

test('120 whole-map resize frames never read captured attachment metadata or source bytes and retain one compact gesture',()=>{
  const {state,bus,root}=fixture(),child=m.addMindChild(state,bus,root,'A');m.addMindAttachments(state,bus,root,[attachedFile()]);
  const before=modelSnapshot(state),depth=bus.undoStack.length,live=state.widgets.get(root).mind.attachments,captured=m.captureSelection(state,[root]),capturedRoot=captured.widgets.find(widget=>widget.id===root),capturedFiles=capturedRoot.mind.attachments,src=live[0].src;
  let capturedReads=0,sourceReads=0;Object.defineProperty(capturedRoot.mind,'attachments',{enumerable:true,get(){capturedReads++;return capturedFiles;}});Object.defineProperty(live[0],'src',{enumerable:true,get(){sourceReads++;return src;}});
  bus.beginTransaction('Redimensionar mapa');
  for(let frame=1;frame<=120;frame++){const scale=1+frame/120;bus.exec({op:'BATCH',payload:{commands:m.transformSnapshot(state,captured,frame,frame/2,scale,scale)}});assert.equal(state.widgets.get(root).mind.attachments,live);assert.equal(state.widgets.get(root).mind.attachments[0],live[0]);}
  bus.endTransaction();assert.equal(capturedReads,0,'resize must not inspect attachments in the capture');assert.equal(sourceReads,0,'pointer-frame commands must never read embedded bytes');assert.equal(bus.undoStack.length,depth+1);assert.equal(state.widgets.get(root).mind.layoutScale,2);assert.equal(state.widgets.get(child).mind.layoutScale,2);
  const gesture=JSON.stringify(bus.undoStack.at(-1).command);assert.ok(gesture.includes('mindLayoutScale'));assert.ok(!gesture.includes('attachments')&&!gesture.includes('base64,')&&!gesture.includes('arquivo-local.txt'));assert.ok(gesture.length<6000,'120 updates must coalesce into one final transform');
  const final=modelSnapshot(state);bus.undo();assert.equal(modelSnapshot(state),before);bus.redo();assert.equal(modelSnapshot(state),final);assert.equal(state.widgets.get(root).mind.attachments,live);
});

test('scalar map scaling survives JSON journal replay, its redo stack and full project round-trips with attachments intact',()=>{
  const {state,bus,root}=fixture(2),child=m.addMindChild(state,bus,root,'A');m.addMindAttachments(state,bus,root,[attachedFile()]);const before=modelSnapshot(state),capture=m.captureSelection(state,[root]);
  bus.beginTransaction('Resize');for(const scale of [1.2,1.7,3])bus.exec({op:'BATCH',payload:{commands:m.transformSnapshot(state,capture,40,15,scale,scale)}});bus.endTransaction();const final=modelSnapshot(state),journal=JSON.parse(JSON.stringify(bus.snapshot()));
  const replay=emptyState(),restored=new m.CommandBus(replay,()=>{});restored.restore(journal.applied,journal.undone);assert.equal(modelSnapshot(replay),final);restored.undo();assert.equal(modelSnapshot(replay),before);restored.redo();assert.equal(modelSnapshot(replay),final);
  bus.undo();const undoneJournal=JSON.parse(JSON.stringify(bus.snapshot())),pending=emptyState(),pendingBus=new m.CommandBus(pending,()=>{});pendingBus.restore(undoneJournal.applied,undoneJournal.undone);assert.equal(modelSnapshot(pending),before);assert.equal(pendingBus.canRedo,true);pendingBus.redo();assert.equal(modelSnapshot(pending),final);
  const validated=m.validateBoardFile(JSON.parse(JSON.stringify(fileOf(replay))));assert.equal(validated.widgets.find(widget=>widget.id===root).mind.layoutScale,6);assert.equal(validated.widgets.find(widget=>widget.id===child).mind.layoutScale,6);assert.deepEqual(validated.widgets.find(widget=>widget.id===root).mind.attachments,[attachedFile()]);
});

test('scalar scaling rejects invalid values and locked hidden-only bypasses; mixed metadata updates coalesce and replay in order',()=>{
  const f=fixture(),{state,bus,root}=f;for(const value of [0,-1,NaN,Infinity,'2',null]){const before=modelSnapshot(state),depth=bus.undoStack.length;bus.exec({op:'WIDGET_UPDATE',payload:{id:root,patch:{x:999},mindLayoutScale:value}});assert.equal(modelSnapshot(state),before);assert.equal(bus.undoStack.length,depth);}
  bus.exec({op:'ENTITY_LOCK',payload:{ids:[root],locked:true}});for(const patch of [{},{hidden:true}]){const before=modelSnapshot(state),depth=bus.undoStack.length;bus.exec({op:'WIDGET_UPDATE',payload:{id:root,patch,mindLayoutScale:4}});assert.equal(modelSnapshot(state),before);assert.equal(bus.undoStack.length,depth);}
  const ordinary={...state.widgets.get(root),id:'ordinary',mind:undefined,locked:false};bus.exec({op:'WIDGET_CREATE',payload:ordinary});const ordinaryBefore=modelSnapshot(state);bus.exec({op:'WIDGET_UPDATE',payload:{id:ordinary.id,patch:{x:998},mindLayoutScale:4}});assert.equal(modelSnapshot(state),ordinaryBefore);
  for(const sequence of ['scalar-full','full-scalar','scalar-position','full-and-scalar']){
    const {state,bus,root}=fixture();m.addMindAttachments(state,bus,root,[attachedFile()]);const before=modelSnapshot(state),initial={...state.widgets.get(root).mind};bus.beginTransaction(sequence);
    const update=(patch,mindLayoutScale)=>bus.exec({op:'WIDGET_UPDATE',payload:{id:root,patch,...(mindLayoutScale===undefined?{}:{mindLayoutScale})}});
    if(sequence==='scalar-full'){update({x:20},2);update({mind:{...initial,layoutScale:7,notes:'Replacement'}},undefined);}
    if(sequence==='full-scalar'){update({mind:{...initial,layoutScale:9,notes:'Keep replacement'}},undefined);update({x:40},4);}
    if(sequence==='scalar-position'){update({x:20},2);update({x:30},undefined);}
    if(sequence==='full-and-scalar'){update({x:20},2);update({mind:{...initial,layoutScale:9,notes:'Combined'}},4);}
    bus.endTransaction();const expected=modelSnapshot(state),journal=JSON.parse(JSON.stringify(bus.snapshot())),copy=emptyState(),replayed=new m.CommandBus(copy,()=>{});replayed.restore(journal.applied,journal.undone);assert.equal(modelSnapshot(copy),expected,sequence);replayed.undo();assert.equal(modelSnapshot(copy),before,`${sequence}: one Undo`);replayed.redo();assert.equal(modelSnapshot(copy),expected,`${sequence}: Redo`);
    assert.equal(state.widgets.get(root).mind.layoutScale,sequence==='scalar-full'?7:sequence==='scalar-position'?2:4);assert.deepEqual(state.widgets.get(root).mind.attachments,[attachedFile()]);
  }
});

test('resizing a collapsed root or branch transports absolute descendant anchors at every zoom and keeps one undo',()=>{
  for(const unit of [50,1,.05])for(const layout of ['right','left','org','list'])for(const internal of [false,true]){
    const {state,bus,root}=fixture(unit),branch=m.addMindChild(state,bus,root,'Branch'),leaf=m.addMindChild(state,bus,branch,'Leaf'),other=m.addMindChild(state,bus,root,'Other');m.setMindLayout(state,bus,root,layout);m.markMindManualPosition(state,bus,root);
    const id=internal?branch:root,childId=internal?leaf:branch;m.toggleMindBranch(state,bus,id);const initial=m.captureMindTopicResize(state,id),before=modelSnapshot(state),parent=state.widgets.get(id),child=state.widgets.get(childId),otherBefore=JSON.stringify(state.widgets.get(other)),depth=bus.undoStack.length;
    const originals=new Map(m.mindSubtree(state,id).map(nodeId=>[nodeId,state.widgets.get(nodeId)]));bus.beginTransaction('Resize topic');
    for(let frame=1;frame<=120;frame++){const t=frame/120;bus.exec({op:'BATCH',payload:{commands:m.mindTopicResizeCommands(state,initial,{x:parent.x-30*unit*t,y:parent.y-20*unit*t,width:parent.width+500*unit*t,height:parent.height+240*unit*t})}});}
    bus.endTransaction();assert.equal(bus.undoStack.length,depth+1);assert.equal(m.mindNodeHidden(state,childId),true);assert.equal(state.widgets.get(id).mind.collapsed,true);
    const resized=state.widgets.get(id),moved=state.widgets.get(childId);
    if(layout==='right')close(moved.x-resized.x-resized.width,child.x-parent.x-parent.width);
    if(layout==='left')close(resized.x-moved.x-moved.width,parent.x-child.x-child.width);
    if(layout==='org'){close(moved.x+moved.width/2-resized.x-resized.width/2,child.x+child.width/2-parent.x-parent.width/2);close(moved.y-resized.y-resized.height,child.y-parent.y-parent.height);}
    if(layout==='list'){close(moved.x-resized.x,child.x-parent.x);close(moved.y-resized.y-resized.height,child.y-parent.y-parent.height);}
    for(const [nodeId,old] of originals){const current=state.widgets.get(nodeId);assert.deepEqual(current.mind,old.mind);assert.deepEqual(current.style,old.style);if(nodeId!==id){close(current.width,old.width);close(current.height,old.height);}}
    if(internal)assert.equal(JSON.stringify(state.widgets.get(other)),otherBefore);const after=modelSnapshot(state);bus.undo();assert.equal(modelSnapshot(state),before);bus.redo();assert.equal(modelSnapshot(state),after);m.toggleMindBranch(state,bus,id);const revealed=state.widgets.get(childId),box=state.widgets.get(id);assert.equal(m.mindNodeHidden(state,childId),false);assert.ok(revealed.x+revealed.width<=box.x||revealed.x>=box.x+box.width||revealed.y+revealed.height<=box.y||revealed.y>=box.y+box.height,`${layout}: child outside resized parent`);if(internal)assert.equal(JSON.stringify(state.widgets.get(other)),otherBefore);
  }
});

test('expansion repairs already-saved colliding manual anchors without reorganizing unrelated free topics',()=>{
  for(const layout of ['right','left','org','list'])for(const internal of [false,true]){
    const {state,bus,root}=fixture(),branch=m.addMindChild(state,bus,root,'Branch'),leaf=m.addMindChild(state,bus,branch,'Leaf'),other=m.addMindChild(state,bus,root,'Other');m.setMindLayout(state,bus,root,layout);m.markMindManualPosition(state,bus,root);const otherNode=state.widgets.get(other);bus.exec({op:'WIDGET_UPDATE',payload:{id:other,patch:{x:otherNode.x+2000,y:otherNode.y-2000}}});const otherBefore=JSON.stringify(state.widgets.get(other)),id=internal?branch:root,childId=internal?leaf:branch;m.toggleMindBranch(state,bus,id);const parent=state.widgets.get(id);
    // Simulate an old saved board: only the collapsed parent's box grew.
    bus.exec({op:'WIDGET_UPDATE',payload:{id,patch:{x:parent.x-(layout==='left'?500:0),width:parent.width+500,height:parent.height+300}}});const before=modelSnapshot(state),childBefore=state.widgets.get(childId),depth=bus.undoStack.length;
    assert.equal(m.mindNodeHidden(state,childId),true);m.toggleMindBranch(state,bus,id);assert.equal(bus.undoStack.length,depth+1);const box=state.widgets.get(id),child=state.widgets.get(childId);assert.ok(child.x+child.width<=box.x||child.x>=box.x+box.width||child.y+child.height<=box.y||child.y>=box.y+box.height);assert.deepEqual(child.style,childBefore.style);assert.deepEqual(child.mind,childBefore.mind);assert.equal(JSON.stringify(state.widgets.get(other)),otherBefore);const after=modelSnapshot(state);bus.undo();assert.equal(modelSnapshot(state),before);bus.redo();assert.equal(modelSnapshot(state),after);
  }
});

test('topic resize skips locked descendants, vetoes a locked or removed parent, and never reads embedded attachment bytes',()=>{
  const {state,bus,root}=fixture(),a=m.addMindChild(state,bus,root,'A'),b=m.addMindChild(state,bus,a,'B');m.markMindManualPosition(state,bus,root);m.addMindAttachments(state,bus,a,[attachedFile()]);bus.exec({op:'ENTITY_LOCK',payload:{ids:[b],locked:true}});const locked=JSON.stringify(state.widgets.get(b)),live=state.widgets.get(a).mind.attachments,src=live[0].src;let reads=0;Object.defineProperty(live[0],'src',{enumerable:true,get(){reads++;return src;}});const capture=m.captureMindTopicResize(state,root),parent=state.widgets.get(root),geometry={x:parent.x,y:parent.y,width:parent.width+300,height:parent.height+100};
  for(let frame=1;frame<=20;frame++)bus.exec({op:'BATCH',payload:{commands:m.mindTopicResizeCommands(state,capture,geometry)}});assert.equal(reads,0);assert.equal(state.widgets.get(a).mind.attachments,live);assert.equal(JSON.stringify(state.widgets.get(b)),locked);
  bus.exec({op:'ENTITY_LOCK',payload:{ids:[root],locked:true}});assert.deepEqual(m.mindTopicResizeCommands(state,capture,geometry),[]);bus.exec({op:'ENTITY_LOCK',payload:{ids:[root,b],locked:false}});bus.exec({op:'WIDGET_REMOVE',payload:root});assert.deepEqual(m.mindTopicResizeCommands(state,capture,geometry),[]);
});
