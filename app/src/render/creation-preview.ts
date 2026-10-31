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
  const next={...base,x:Math.min(start.x,current.x),y:Math.min(start.y,current.y),width:Math.max(12,Math.abs(current.x-start.x)),height:Math.max(12,Math.abs(current.y-start.y))};
  return next;
}

interface CreationPreviewOptions{
  parent:Container;camera:Camera;canvas:HTMLCanvasElement;
  getTool():string;
  getTemplate():Widget|undefined;
  getGesture():{kind:string};
  temporaryHand():boolean;
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
  }
  function clear(){layer.visible=false;current=undefined;}
  function refresh(){
    if(!isCreationTool(api.getTool())||api.temporaryHand()||document.body.classList.contains('home-visible')){clear();return;}
    if(api.getGesture().kind==='create'&&current)show(current);else clear();
  }
  function move(){if(api.getGesture().kind!=='create')refresh();}
  function leave(){if(api.getGesture().kind!=='create')clear();}
  const keyboard=()=>queueMicrotask(refresh);
  api.canvas.addEventListener('pointermove',move);api.canvas.addEventListener('pointerenter',move);api.canvas.addEventListener('pointerleave',leave);
  // A creation preview exists only while the pointer gesture is in progress.
  window.addEventListener('keydown',keyboard);window.addEventListener('keyup',keyboard);
  return {show,clear,refresh,layer,destroy(){api.canvas.removeEventListener('pointermove',move);api.canvas.removeEventListener('pointerenter',move);api.canvas.removeEventListener('pointerleave',leave);window.removeEventListener('keydown',keyboard);window.removeEventListener('keyup',keyboard);destroyDisplayTree(layer);}};
}
