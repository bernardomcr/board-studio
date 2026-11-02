import type {BoardState} from '../core/commands';
import {resolveEndpoint,type Connector,type Endpoint} from '../core/connectors';
import type {Camera} from '../core/camera';
import type {Widget} from '../core/model';
import type {BoardScene,MindBranchPresentation,MindTopicPresentation} from './scene';

/** Immutable record references captured before a Mind structural command. */
export interface MindMotionSnapshot {widgets:Map<string,Widget>;connectors:Map<string,Connector>}
interface TopicTrack {from:Widget;to:Widget;fromAlpha:number;toAlpha:number}
interface BranchTrack {from:Connector;to:Connector;fromAlpha:number;toAlpha:number}
interface MotionPlan {topics:Map<string,TopicTrack>;branches:Map<string,BranchTrack>;widgets:Map<string,Widget>}
interface MindMotionOptions {
  state:BoardState;
  scene:Pick<BoardScene,'beginMindPresentation'|'applyMindPresentation'|'endMindPresentation'|'hasMindPresentation'>;
  camera:Camera;
  requestRender:()=>void;
  getBoardKey?:()=>string|null;
}
const MAX_DURATION=250;
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
function visible(widget:Widget|undefined,widgets:Map<string,Widget>):boolean {
  if(!widget||widget.hidden)return false;
  const seen=new Set([widget.id]);let parentId=widget.mind?.parentId;
  while(parentId){
    if(seen.has(parentId))return false;seen.add(parentId);
    const parent=widgets.get(parentId);if(!parent?.mind||parent.mind.collapsed)return false;parentId=parent.mind.parentId;
  }
  return true;
}
function branchVisible(connector:Connector|undefined,widgets:Map<string,Widget>):boolean {
  return !!connector&&!connector.hidden&&!!connector.mindBranch&&visible(widgets.get(connector.mindBranch),widgets)&&[connector.start,connector.end].every(endpoint=>endpoint.kind!=='anchor'||!widgets.get(endpoint.widgetId)?.hidden);
}
function samePose(a:Widget,b:Widget):boolean {return a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height&&a.rotation===b.rotation;}
function sameEndpoint(a:Endpoint,b:Endpoint):boolean {return a.kind===b.kind&&a.x===b.x&&a.y===b.y&&(a.kind!=='anchor'||b.kind==='anchor'&&a.widgetId===b.widgetId);}
function sameRoute(a:Connector,b:Connector):boolean {return a.shape===b.shape&&sameEndpoint(a.start,b.start)&&sameEndpoint(a.end,b.end)&&a.controlPoint===b.controlPoint&&a.waypoints===b.waypoints;}
/** Start/end a revealed subtree at its closest ancestor that remains visible. */
function atAncestor(widget:Widget,lineage:Map<string,Widget>,other:Map<string,Widget>):Widget {
  let parentId=widget.mind?.parentId;const seen=new Set([widget.id]);
  while(parentId&&!seen.has(parentId)){
    seen.add(parentId);const ancestor=other.get(parentId);
    if(visible(ancestor,other))return {...widget,x:ancestor!.x+(ancestor!.width-widget.width)/2,y:ancestor!.y+(ancestor!.height-widget.height)/2};
    parentId=lineage.get(parentId)?.mind?.parentId;
  }
  return widget;
}
function planMotion(before:MindMotionSnapshot,state:BoardState):MotionPlan {
  const afterWidgets=new Map([...state.widgets].filter(([,widget])=>!!widget.mind)),afterBranches=new Map([...state.connectors].filter(([,connector])=>!!connector.mindBranch));
  const topics=new Map<string,TopicTrack>(),branches=new Map<string,BranchTrack>(),widgets=new Map(afterWidgets);
  for(const id of new Set([...before.widgets.keys(),...afterWidgets.keys()])){
    const old=before.widgets.get(id),next=afterWidgets.get(id),wasVisible=visible(old,before.widgets),isVisible=visible(next,afterWidgets);
    if(!wasVisible&&!isVisible||old&&next&&wasVisible===isVisible&&samePose(old,next))continue;
    const from=wasVisible?old!:atAncestor(next??old!,afterWidgets,before.widgets),to=isVisible?next!:atAncestor(old??next!,before.widgets,afterWidgets);
    topics.set(id,{from,to,fromAlpha:wasVisible?1:0,toAlpha:isVisible?1:0});
    if(!widgets.has(id))widgets.set(id,old!);
  }
  for(const id of new Set([...before.connectors.keys(),...afterBranches.keys()])){
    const old=before.connectors.get(id),next=afterBranches.get(id);
    if(!old?.mindBranch&&!next?.mindBranch)continue;
    const wasVisible=branchVisible(old,before.widgets),isVisible=branchVisible(next,afterWidgets);
    if(!wasVisible&&!isVisible)continue;
    const from=old??next!,to=next??old!,touchesTopic=[from.start,from.end,to.start,to.end].some(endpoint=>endpoint.kind==='anchor'&&topics.has(endpoint.widgetId));
    if(old&&next&&wasVisible===isVisible&&sameRoute(old,next)&&!touchesTopic)continue;
    branches.set(id,{from,to,fromAlpha:wasVisible?1:0,toAlpha:isVisible?1:0});
    // Removed branches can still reference a removed parent that never moved.
    for(const endpoint of [from.start,from.end,to.start,to.end])if(endpoint.kind==='anchor'&&!widgets.has(endpoint.widgetId)){const widget=before.widgets.get(endpoint.widgetId);if(widget)widgets.set(endpoint.widgetId,widget);}
  }
  return {topics,branches,widgets};
}
function topicAt(track:TopicTrack,t:number):Widget {
  return {...track.to,x:lerp(track.from.x,track.to.x,t),y:lerp(track.from.y,track.to.y,t),width:lerp(track.from.width,track.to.width,t),height:lerp(track.from.height,track.to.height,t),rotation:lerp(track.from.rotation,track.to.rotation,t)};
}
function endpointAt(from:Endpoint,to:Endpoint,t:number,widgets:Map<string,Widget>):Endpoint {
  if(from.kind==='anchor'&&to.kind==='anchor'&&from.widgetId===to.widgetId)return {...to,x:lerp(from.x,to.x,t),y:lerp(from.y,to.y,t)};
  const a=resolveEndpoint(from,widgets),b=resolveEndpoint(to,widgets);
  return a&&b?{kind:'point',x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)}:to;
}
function branchAt(track:BranchTrack,t:number,widgets:Map<string,Widget>):Connector {
  return {...track.to,start:endpointAt(track.from.start,track.to.start,t,widgets),end:endpointAt(track.from.end,track.to.end,t,widgets)};
}

/** Presentation only. Model records and undo/redo history are never written. */
export function installMindMotion(options:MindMotionOptions) {
  const {scene,camera,state,requestRender}=options,preference=typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):undefined;
  let frame:number|null=null,running:{plan:MotionPlan;epoch:number;started:number;duration:number;camera:number[];boardKey:string|null|undefined}|null=null,destroyed=false;
  const cameraPose=()=>[camera.x,camera.y,camera.scale,camera.width,camera.height];
  const cancel=()=>{
    if(frame!==null){cancelAnimationFrame(frame);frame=null;}
    const hadPresentation=!!running;running=null;
    if(hadPresentation){scene.endMindPresentation();requestRender();}
  };
  const apply=(plan:MotionPlan,t:number)=>{
    const widgets=plan.widgets,topics=new Map<string,MindTopicPresentation>(),branches=new Map<string,MindBranchPresentation>();
    for(const [id,track] of plan.topics){const widget=topicAt(track,t);widgets.set(id,widget);topics.set(id,{widget,alpha:lerp(track.fromAlpha,track.toAlpha,t)});}
    for(const [id,track] of plan.branches)branches.set(id,{connector:branchAt(track,t,widgets),alpha:lerp(track.fromAlpha,track.toAlpha,t)});
    scene.applyMindPresentation(topics,branches,widgets);requestRender();
  };
  const tick=(now:number)=>{
    frame=null;const current=running;if(!current)return;
    const pose=cameraPose();
    if(!scene.hasMindPresentation(current.epoch)||preference?.matches||current.boardKey!==options.getBoardKey?.()||current.camera.some((value,index)=>value!==pose[index])){cancel();return;}
    const progress=Math.min(1,Math.max(0,(now-current.started)/current.duration));
    if(progress>=1){cancel();return;}
    apply(current.plan,1-Math.pow(1-progress,3));frame=requestAnimationFrame(tick);
  };
  const play=(before:MindMotionSnapshot,duration=MAX_DURATION)=>{
    cancel();if(destroyed||preference?.matches||!Number.isFinite(duration)||duration<=0||document.hidden)return;
    const plan=planMotion(before,state);if(!plan.topics.size&&!plan.branches.size)return;
    const epoch=scene.beginMindPresentation(state,new Map([...plan.topics].map(([id,track])=>[id,track.from])),new Map([...plan.branches].map(([id,track])=>[id,track.from])));
    running={plan,epoch,started:performance.now(),duration:Math.min(MAX_DURATION,duration),camera:cameraPose(),boardKey:options.getBoardKey?.()};
    apply(plan,0);frame=requestAnimationFrame(tick);
  };
  const input=()=>cancel(),drag=(event:PointerEvent)=>{if(event.buttons)cancel();},visibility=()=>{if(document.hidden)cancel();},reducedMotion=()=>{if(preference?.matches)cancel();};
  const inputEvents=['pointerdown','keydown','wheel','input','blur'] as const;
  for(const name of inputEvents)window.addEventListener(name,input,true);
  window.addEventListener('pointermove',drag,true);document.addEventListener('visibilitychange',visibility);preference?.addEventListener('change',reducedMotion);
  return {
    play,cancel,
    active:()=>!!running&&scene.hasMindPresentation(running.epoch),
    destroy(){if(destroyed)return;cancel();destroyed=true;for(const name of inputEvents)window.removeEventListener(name,input,true);window.removeEventListener('pointermove',drag,true);document.removeEventListener('visibilitychange',visibility);preference?.removeEventListener('change',reducedMotion);},
  };
}
