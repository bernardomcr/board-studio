// Run independently of Playwright: node --test tests/cpu/eraser.cpu.mjs
import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const directory=await mkdtemp(join(tmpdir(),'board-eraser-cpu-'));
async function loadCore(label,eraserSource,strokesSource){
  const names={strokes:`${label}-strokes.mjs`,eraser:`${label}-eraser.mjs`};
  for(const [name,source]of [['strokes',strokesSource],['eraser',eraserSource]]){
    let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    code=code.replaceAll('"./strokes"',`"./${names.strokes}"`);await writeFile(join(directory,names[name]),code);
  }
  return {...await import(pathToFileURL(join(directory,names.strokes))),...await import(pathToFileURL(join(directory,names.eraser)))};
}
const sourceRoot=new URL('../../src/core/',import.meta.url),eraserSource=await readFile(new URL('eraser.ts',sourceRoot),'utf8'),strokesSource=await readFile(new URL('strokes.ts',sourceRoot),'utf8');
const core=await loadCore('current',eraserSource,strokesSource);
const baseline=process.env.ERASER_BASELINE_SOURCE?await loadCore('baseline',await readFile(process.env.ERASER_BASELINE_SOURCE,'utf8'),process.env.STROKES_BASELINE_SOURCE?await readFile(process.env.STROKES_BASELINE_SOURCE,'utf8'):strokesSource):null;
after(async()=>{
  const absolute=resolve(directory),within=relative(resolve(tmpdir()),absolute);
  assert.ok(isAbsolute(directory)&&within&&!within.startsWith('..')&&!isAbsolute(within)&&basename(absolute).startsWith('board-eraser-cpu-'),'Refuse cleanup outside the intended temporary fixture directory.');
  await rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:50});
});
const make=(points,erasures=[])=>({id:'cpu-brush',type:'stroke',tool:'brush',color:'#299d70',precision:false,points,erasures,z:0});
const median=values=>values.sort((a,b)=>a-b)[values.length>>1];
const coveredCuts=()=>[{radius:4,points:[{x:-3,y:0}]},{radius:4,points:[{x:3,y:0}]}];

test('an already erased union never revisits forty thousand overlapping paint segments',()=>{
  const stroke=make(Array.from({length:40000},(_,i)=>({x:i%2?-100:100,y:0,r:1})),coveredCuts()),geometry=core.strokeGeometry(stroke);
  core.strokeBounds(stroke);
  let reads=0;geometry.points=new Proxy(geometry.points,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver);}});
  const timings=[];for(let i=0;i<15;i++){const start=performance.now();assert.equal(core.strokeIntersectsEraser(stroke,{x:0,y:0},{x:0,y:0},2),false);timings.push(performance.now()-start);}
  assert.equal(core.eraseStrokeArea(stroke,{x:0,y:0},{x:0,y:0},2),stroke);
  assert.ok(reads<20,`The erased sweep visited ${reads} brush samples.`);
  console.log(JSON.stringify({case:'covered-union',samples:stroke.points.length,medianMs:median(timings),geometrySampleReads:reads}));
});

test('repeated old-cut caps do not multiply the exact union arrangement',()=>{
  const erasures=Array.from({length:300},(_,i)=>({radius:4,points:[{x:i%2?-3:3,y:0}]})),stroke=make([{x:-100,y:0,r:1},{x:100,y:0,r:1}],erasures);
  const start=performance.now();assert.equal(core.strokeIntersectsEraser(stroke,{x:0,y:0},{x:0,y:0},2),false);
  console.log(JSON.stringify({case:'duplicate-cuts',oldCuts:erasures.length,ms:performance.now()-start}));
});

test('an individual sweep outside the painted bounds never reads old cut samples',()=>{
  let reads=0;const oldPoints=new Proxy(Array.from({length:12000},(_,i)=>({x:i*.01,y:0})),{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver);}}),stroke=make([{x:-100,y:0,r:4},{x:100,y:0,r:4}],[{radius:8,points:oldPoints}]);
  core.strokeBounds(stroke);assert.equal(core.strokeIntersectsEraser(stroke,{x:0,y:70},{x:0,y:100},5),false);assert.equal(reads,0);
});

test('partial cuts retain tapered paint, union holes, islands and original samples at different scales',()=>{
  for(const scale of [.001,1,1000000]){
    const p=(x,y)=>({x:x*scale,y:y*scale}),sample=(x,y,r)=>({...p(x,y),r:r*scale}),hit=(stroke,x,y,r,to)=>core.strokeIntersectsEraser(stroke,p(x,y),to?p(...to):p(x,y),r*scale);
    const tapered=make([sample(0,0,1),sample(200,0,20)]),union=make([sample(-100,0,1),sample(100,0,1)],coveredCuts().map(area=>({radius:area.radius*scale,points:area.points.map(point=>p(point.x,point.y))}))),swept=make(union.points,[{radius:4*scale,points:[p(-3,-10),p(-3,10)]},{radius:4*scale,points:[p(3,-10),p(3,10)]}]),island=make([sample(0,0,5)],[[-3,0],[3,0],[0,-3],[0,3]].map(([x,y])=>({radius:2.8*scale,points:[p(x,y)]})));
    assert.equal(hit(tapered,0,15,1),false);assert.equal(hit(tapered,200,15,1),true);assert.equal(hit(tapered,-20,15,1,[0,15]),false);assert.equal(hit(tapered,-20,15,1,[200,15]),true);
    assert.equal(hit(union,0,0,2),false);assert.equal(hit(union,6,0,2),true);assert.equal(hit(swept,0,-5,2,[0,5]),false);assert.equal(hit(swept,0,-5,2,[9,5]),true);assert.equal(hit(island,0,0,1),true);
    const cut=core.eraseStrokeArea(tapered,p(100,-5),p(100,5),2*scale);assert.notEqual(cut,tapered);assert.equal(cut.points,tapered.points);assert.equal(cut.erasures.length,1);assert.equal(tapered.erasures.length,0);assert.deepEqual(cut.erasures[0],{radius:2*scale,points:[p(100,-5),p(100,5)]});
  }
});

// Optional reproducible comparison with a saved pre-change source, with no git
// operations or browser needed. The source paths are caller-controlled fixtures.
if(baseline){
  test('dense CPU baseline and seeded geometry agree with the previous exact implementation',()=>{
    const fixtures=[make(Array.from({length:40000},(_,i)=>({x:i%2?-100:100,y:0,r:1})),coveredCuts()),make(Array.from({length:2000},(_,i)=>({x:i%2?-100:100,y:0,r:1})),Array.from({length:30},(_,i)=>({radius:4,points:[{x:i%2?-3:3,y:0}]})))];
    for(const stroke of fixtures){const results={samples:stroke.points.length,oldCuts:stroke.erasures.length};for(const [label,implementation]of [['before',baseline],['after',core]]){implementation.strokeGeometry(stroke);const times=[];for(let i=0;i<3;i++){const start=performance.now();assert.equal(implementation.strokeIntersectsEraser(stroke,{x:0,y:0},{x:0,y:0},2),false);times.push(performance.now()-start);}results[label+'Ms']=median(times);}console.log(JSON.stringify(results));}
    let seed=123456789;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
    for(let i=0;i<600;i++){const points=Array.from({length:1+Math.floor(random()*8)},()=>({x:random()*60-30,y:random()*60-30,r:.5+random()*10})),erasures=Array.from({length:Math.floor(random()*12)},()=>({radius:1+random()*12,points:Array.from({length:1+Math.floor(random()*3)},()=>({x:random()*60-30,y:random()*60-30}))})),stroke=make(points,erasures),from={x:random()*60-30,y:random()*60-30},to=random()<.5?from:{x:random()*60-30,y:random()*60-30},radius=.5+random()*8;assert.equal(core.strokeIntersectsEraser(stroke,from,to,radius),baseline.strokeIntersectsEraser(stroke,from,to,radius),`Seeded case ${i}`);}
  });
}
