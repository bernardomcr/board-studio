// Run without a browser: node --test tests/cpu/mindmap.cpu.mjs
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const directory=await mkdtemp(join(tmpdir(),'board-mindmap-cpu-')),bundle=join(directory,'core.mjs');
await build({stdin:{contents:`export * from './core/mindmap';export * from './core/groups';export {CommandBus} from './core/commands';export {boxTextInsets,fitBoxText} from './core/text-layout';export {validateBoardFile} from './project-files';`,resolveDir:fileURLToPath(new URL('../../src/',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:bundle});
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
