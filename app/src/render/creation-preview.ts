import {Container} from 'pixi.js';
import {destroyDisplayTree} from './destroy-tree';
import type {Camera} from '../core/camera';
import type {BoardState} from '../core/commands';
import type {Widget} from '../core/model';
import type {Vec} from '../core/geometry';
import {naturalText} from '../core/text-layout';
import {BoardScene} from './scene';

const CREATION_TOOLS=new Set(['shape','sticky_note','text','frame']);
export const isCreationTool=(tool:string)=>CREATION_TOOLS.has(tool);

/** One sizing rule for the live object and the eventual committed object. */
export function creationWidgetAt(widget:Widget,start:Vec,current:Vec,zoom:number):Widget{
  const base=widget.type==='text'?naturalText(widget):widget;
  if(base.type==='text')return {...base,x:start.x,y:start.y};
  if(Math.hypot(current.x-start.x,current.y-start.y)*zoom<=5)return {...base,x:start.x-base.width/2,y:start.y-base.height/2};
  const pad=base.type==='sticky_note'&&!!base.stickyPad,square=base.type==='sticky_note'&&!pad,side=Math.max(.001,Math.max(Math.abs(current.x-start.x),Math.abs(current.y-start.y))),factor=pad?Math.max(.001/base.width,Math.abs(current.x-start.x)/base.width,Math.abs(current.y-start.y)/base.height):1,width=pad?base.width*factor:square?side:Math.max(12,Math.abs(current.x-start.x)),height=pad?base.height*factor:square?side:Math.max(12,Math.abs(current.y-start.y));
  const next={...base,x:square||pad?(current.x<start.x?start.x-width:start.x):Math.min(start.x,current.x),y:square||pad?(current.y<start.y?start.y-height:start.y):Math.min(start.y,current.y),width,height};
  return next;
}

interface CreationPreviewOptions{
  parent:Container;camera:Camera;canvas:HTMLCanvasElement;
  getTool():string;
  getTemplate():Widget|undefined;
  getGesture():{kind:string};
  temporaryHand():boolean;
  onChange?():void;
}

/** Real renderer, isolated transient state: a triangle previews as a triangle. */
export function installCreationPreview(api:CreationPreviewOptions){
  const layer=new Container();layer.label='creation-preview';layer.eventMode='none';layer.alpha=.62;layer.visible=false;api.parent.addChild(layer);
  const scene=new BoardScene(layer),state:BoardState={widgets:new Map(),order:[],strokes:new Map(),strokeOrder:[],connectors:new Map(),connectorOrder:[],groups:new Map(),selection:new Set()};
  let current:Widget|undefined;
  function show(widget:Widget){
    current=widget;const displayed={...widget,id:'creation-preview-widget'};
    state.widgets.set(displayed.id,displayed);state.order=[displayed.id];layer.visible=true;
    scene.sync(state,api.camera.visibleWorldRect(),api.camera.scale);
    api.onChange?.();
  }
  function clear(){const changed=layer.visible;layer.visible=false;current=undefined;if(changed)api.onChange?.();}
  function refresh(){
    if(!isCreationTool(api.getTool())&&api.getGesture().kind!=='sticky-pull'||api.temporaryHand()||document.body.classList.contains('home-visible')){clear();return;}
    if(['create','sticky-pull'].includes(api.getGesture().kind)&&current)show(current);else clear();
  }
  function move(){if(!['create','sticky-pull'].includes(api.getGesture().kind))refresh();}
  function leave(){if(!['create','sticky-pull'].includes(api.getGesture().kind))clear();}
  const keyboard=()=>queueMicrotask(refresh);
  api.canvas.addEventListener('pointermove',move);api.canvas.addEventListener('pointerenter',move);api.canvas.addEventListener('pointerleave',leave);
  // A creation preview exists only while the pointer gesture is in progress.
  window.addEventListener('keydown',keyboard);window.addEventListener('keyup',keyboard);
  return {show,clear,refresh,layer,destroy(){api.canvas.removeEventListener('pointermove',move);api.canvas.removeEventListener('pointerenter',move);api.canvas.removeEventListener('pointerleave',leave);window.removeEventListener('keydown',keyboard);window.removeEventListener('keyup',keyboard);destroyDisplayTree(layer);}};
}
