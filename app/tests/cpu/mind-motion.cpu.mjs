// Root verification: node --test tests/cpu/mind-motion.cpu.mjs
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const directory=await mkdtemp(join(tmpdir(),'board-mind-motion-cpu-')),bundle=join(directory,'motion.mjs');
await build({entryPoints:[fileURLToPath(new URL('../../src/render/mind-motion.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:bundle});
const {installMindMotion}=await import(pathToFileURL(bundle));
const saved=new Map(['window','document','requestAnimationFrame','cancelAnimationFrame','performance'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
let now=0,nextFrame=0;const frames=new Map(),preference=Object.assign(new EventTarget(),{matches:false});
globalThis.window=Object.assign(new EventTarget(),{matchMedia:()=>preference});
globalThis.document=Object.assign(new EventTarget(),{hidden:false});
globalThis.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
after(async()=>{
  for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  const absolute=resolve(directory),within=relative(resolve(tmpdir()),absolute);assert.ok(isAbsolute(directory)&&within&&!within.startsWith('..')&&!isAbsolute(within)&&basename(absolute).startsWith('board-mind-motion-cpu-'));await rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:50});
});
function advance(milliseconds){now+=milliseconds;const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(now);}
function topic(id,parentId,x,y=0){return Object.freeze({id,type:'shape',shape:'round_rectangle',x,y,width:80,height:40,rotation:0,z:1,content:id,style:{},mind:{rootId:'root',parentId,side:'right',order:0}});}
function branch(id,child,parent='root',mind=true){return Object.freeze({id,type:'connector',...(mind?{mindBranch:child}:{}),start:{kind:'anchor',widgetId:parent,x:1,y:.5},end:{kind:'anchor',widgetId:child,x:0,y:.5},shape:'curved',style:{strokeColor:'#123456',strokeWidth:2},z:0});}
const snapshot=state=>({widgets:new Map([...state.widgets].filter(([,widget])=>widget.mind)),connectors:new Map([...state.connectors].filter(([,connector])=>connector.mindBranch))});
const serialized=state=>JSON.stringify({widgets:[...state.widgets],connectors:[...state.connectors],order:state.order,selection:[...state.selection]});
function fixture(){
  assert.equal(frames.size,0);now=0;preference.matches=false;
  const state={widgets:new Map([['root',topic('root',null,0)],['a',topic('a','root',150)],['b',topic('b','root',150,100)]]),connectors:new Map([['pa',branch('pa','a')],['pb',branch('pb','b')],['ordinary',branch('ordinary','a','root',false)]]),order:['root','a','b'],selection:new Set(['a'])};
  const camera={x:0,y:0,scale:1,width:1000,height:800};let boardKey='board:1',renders=0;
  const scene={epoch:0,alive:false,begins:0,ends:0,last:null,
    beginMindPresentation(_state,topics,branches){this.alive=true;this.begins++;this.initial={topics,branches};return ++this.epoch;},
    hasMindPresentation(epoch){return this.alive&&epoch===this.epoch;},
    applyMindPresentation(topics,branches,widgets){this.last={topics,branches,widgets:new Map(widgets)};},
    endMindPresentation(){if(this.alive)this.ends++;this.alive=false;},
  };
  const motion=installMindMotion({state,scene,camera,requestRender:()=>renders++,getBoardKey:()=>boardKey});
  return {state,scene,camera,motion,get renders(){return renders;},switchBoard:()=>boardKey='board:2'};
}

test('only affected Mind topics and branches move; final model stays immutable and RAF ends',()=>{
  const f=fixture(),before=snapshot(f.state),old=f.state.widgets.get('a');f.state.widgets.set('a',Object.freeze({...old,x:350}));const committed=serialized(f.state);
  f.motion.play(before,250);assert.equal(f.motion.active(),true);assert.deepEqual([...f.scene.initial.topics.keys()],['a']);assert.deepEqual([...f.scene.initial.branches.keys()],['pa']);assert.equal(f.scene.last.topics.get('a').widget.x,150);assert.equal(frames.size,1);
  advance(125);assert.ok(f.scene.last.topics.get('a').widget.x>150&&f.scene.last.topics.get('a').widget.x<350);assert.equal(serialized(f.state),committed);assert.equal(f.state.widgets.get('a').x,350);
  advance(125);assert.equal(f.motion.active(),false);assert.equal(frames.size,0);assert.equal(f.scene.ends,1);assert.equal(serialized(f.state),committed);f.motion.destroy();
});

test('folds retain disappearing descendants for a fade without changing hidden flags',()=>{
  const f=fixture(),leaf=topic('leaf','a',300);f.state.widgets.set('leaf',leaf);f.state.connectors.set('leaf-line',branch('leaf-line','leaf','a'));const before=snapshot(f.state),root=f.state.widgets.get('root');f.state.widgets.set('root',Object.freeze({...root,mind:{...root.mind,collapsed:true}}));const committed=serialized(f.state);
  f.motion.play(before);assert.ok(f.scene.initial.topics.has('leaf'));assert.equal(f.scene.last.topics.get('leaf').alpha,1);advance(125);
  assert.ok(f.scene.last.topics.get('leaf').alpha>0&&f.scene.last.topics.get('leaf').alpha<1);assert.ok(f.scene.last.topics.get('leaf').widget.x<leaf.x);assert.ok(f.scene.last.branches.has('leaf-line'));assert.equal(f.state.widgets.get('leaf').hidden,undefined);assert.equal(serialized(f.state),committed);
  f.motion.cancel();assert.equal(frames.size,0);f.motion.destroy();
});

test('reduced motion and zero duration finish immediately without scheduling presentation',()=>{
  const f=fixture(),before=snapshot(f.state);f.state.widgets.set('a',{...f.state.widgets.get('a'),x:350});preference.matches=true;f.motion.play(before);assert.equal(f.scene.begins,0);assert.equal(frames.size,0);
  preference.matches=false;f.motion.play(before,0);assert.equal(f.scene.begins,0);assert.equal(frames.size,0);f.motion.destroy();
});

test('new input, transitions, camera movement, board switch and authoritative sync cancel cleanly',()=>{
  const f=fixture(),before=snapshot(f.state);f.state.widgets.set('a',{...f.state.widgets.get('a'),x:350});
  f.motion.play(before);f.motion.play(before);assert.equal(f.scene.begins,2);assert.equal(f.scene.ends,1);assert.equal(frames.size,1);window.dispatchEvent(new Event('wheel'));assert.equal(frames.size,0);assert.equal(f.motion.active(),false);
  f.motion.play(before);f.camera.x=2;advance(16);assert.equal(frames.size,0);assert.equal(f.motion.active(),false);
  f.motion.play(before);f.switchBoard();advance(16);assert.equal(frames.size,0);assert.equal(f.motion.active(),false);
  f.motion.play(before);f.scene.endMindPresentation();advance(16);assert.equal(frames.size,0);assert.equal(f.motion.active(),false);
  f.motion.play(before);preference.matches=true;preference.dispatchEvent(new Event('change'));assert.equal(frames.size,0);assert.equal(f.motion.active(),false);f.motion.destroy();
});
