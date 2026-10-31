import {Container} from 'pixi.js';
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
  if(Math.hypot(current.x-start.x,current.y-start.y)*zoom<=5)return {...base,x:start.x-base.width/2,y:start.y-base.height/2};
  const next={...base,x:Math.min(start.x,current.x),y:Math.min(start.y,current.y),width:Math.max(12,Math.abs(current.x-start.x)),height:Math.max(12,Math.abs(current.y-start.y))};
  return next.type==='text'?naturalText(next):next;
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
  let template:Widget|undefined,current:Widget|undefined,inside=false,client:Vec={x:0,y:0};
  function show(widget:Widget){
    current=widget;const displayed={...widget,id:'creation-preview-widget'};
    state.widgets.set(displayed.id,displayed);state.order=[displayed.id];layer.visible=true;
    scene.sync(state,api.camera.visibleWorldRect(),api.camera.scale);
  }
  function clear(){layer.visible=false;template=undefined;current=undefined;}
  function refresh(){
    if(!inside||!isCreationTool(api.getTool())||api.temporaryHand()||document.body.classList.contains('home-visible')){clear();return;}
    const gesture=api.getGesture();if(gesture.kind==='create'){if(current)show(current);return;}if(gesture.kind!=='none'){clear();return;}
    template??=api.getTemplate();if(!template){clear();return;}
    const rect=api.canvas.getBoundingClientRect(),point=api.camera.screenToWorld({x:client.x-rect.left,y:client.y-rect.top});
    show(creationWidgetAt(template,point,point,api.camera.scale));
  }
  function move(event:PointerEvent){inside=true;client={x:event.clientX,y:event.clientY};if(api.getGesture().kind!=='create')refresh();}
  function leave(){inside=false;if(api.getGesture().kind!=='create')clear();}
  const keyboard=()=>queueMicrotask(refresh);
  api.canvas.addEventListener('pointermove',move);api.canvas.addEventListener('pointerenter',move);api.canvas.addEventListener('pointerleave',leave);
  // Key events update the ghost when Space changes navigation without a move.
  window.addEventListener('keydown',keyboard);window.addEventListener('keyup',keyboard);
  return {show,clear,refresh,layer,destroy(){api.canvas.removeEventListener('pointermove',move);api.canvas.removeEventListener('pointerenter',move);api.canvas.removeEventListener('pointerleave',leave);window.removeEventListener('keydown',keyboard);window.removeEventListener('keyup',keyboard);layer.destroy({children:true});}};
}
