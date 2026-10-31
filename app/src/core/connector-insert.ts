import type {BoardState,Command} from './commands';
import {connectorGeometry,connectorPointAt,resolveEndpoint,facingAnchor,type Connector,type Endpoint} from './connectors';
import {rectsIntersect,widgetAABB,type Vec} from './geometry';
import {createWidget,nextId,TEXT_STYLE,type Widget,type TextWidget,type ShapeWidget} from './model';
import {naturalText} from './text-layout';

export interface ConnectorObjectChoice {type:'shape'|'text'|'sticky_note';shape?:ShapeWidget['shape'];ratio?:number}
interface Layout {center:Vec;width:number;height:number;source?:Widget;text?:TextWidget}

/** Match the midpoint/available-space rule without moving the existing endpoints. */
function insertionLayout(state:BoardState,line:Connector,choice:ConnectorObjectChoice,zoom=1):Layout|null {
  if(line.locked||line.hidden||line.mindBranch)return null;
  const geometry=connectorGeometry(line,state.widgets);
  if(!geometry||geometry.points.length<2)return null;
  let length=0;
  for(let i=1;i<geometry.points.length;i++)length+=Math.hypot(geometry.points[i]!.x-geometry.points[i-1]!.x,geometry.points[i]!.y-geometry.points[i-1]!.y);
  if(!Number.isFinite(length)||length<=1e-6)return null;
  const ends=[line.start,line.end].flatMap(ep=>ep.kind==='anchor'?[state.widgets.get(ep.widgetId)].filter((w):w is Widget=>!!w):[]);
  let width=length/3,height=length/3;
  for(const w of ends)if(w.type!=='text'){width=Math.min(width,w.width);height=Math.min(height,w.height);}
  if(choice.type==='sticky_note'){
    const unit=Math.min(width,height);width=unit;height=unit;
  }
  const center=connectorPointAt(geometry,.5),source=line.start.kind==='anchor'?state.widgets.get(line.start.widgetId):undefined;
  let text:TextWidget|undefined;
  if(choice.type==='text'){
    // A boxed source may retain an arbitrarily large preferred font. New free
    // text starts at a useful screen size and fits the actual available gap.
    text={id:'',type:'text',x:0,y:0,width,height,rotation:0,z:0,content:'Texto',style:{...TEXT_STYLE}};
    inheritStyle(text,source);text.style.fontSize=24/(Number.isFinite(zoom)&&zoom>0?zoom:1);
    text=naturalText(text);
    const fit=Math.min(1,width/text.width,height/text.height);
    if(fit<1)text=naturalText({...text,style:{...text.style,fontSize:text.style.fontSize*fit}});
    width=text.width;height=text.height;text.x=center.x-width/2;text.y=center.y-height/2;
  }
  const bounds={minX:center.x-width/2,minY:center.y-height/2,maxX:center.x+width/2,maxY:center.y+height/2};
  if(![center.x,center.y,width,height].every(Number.isFinite)||ends.some(w=>rectsIntersect(bounds,widgetAABB(w))))return null;
  return {center,width,height,source,text};
}

export function canInsertConnectorObject(state:BoardState,line:Connector,choice:ConnectorObjectChoice={type:'shape',shape:'rectangle'},zoom=1):boolean {
  return !!insertionLayout(state,line,choice,zoom);
}

function inheritStyle(widget:Widget,source:Widget|undefined):void {
  if(!source)return;
  if(widget.type===source.type){widget.style={...source.style};return;}
  if((widget.type==='shape'&&source.type==='text')||(widget.type==='text'&&source.type==='shape')){
    const {color,fontFamily,fontSize,fontWeight,fontStyle,textDecoration,textAlign,textAlignVertical}=source.style;
    widget.style={...widget.style,color,fontFamily,fontSize,fontWeight,fontStyle,textDecoration,textAlign,textAlignVertical};
  }
}

/** One serialized action: split the line, retain its end anchors, and select the new node. */
export function connectorInsertion(state:BoardState,line:Connector,choice:ConnectorObjectChoice,zoom=1):{commands:Command[];widgetId:string}|null {
  const layout=insertionLayout(state,line,choice,zoom);if(!layout)return null;
  const {center,width,height,source}=layout;
  const widget=layout.text?{...layout.text,id:nextId('text')}:createWidget(choice.type,{x:center.x-width/2,y:center.y-height/2,width,height,shape:choice.shape,content:''});
  if(!layout.text)inheritStyle(widget,source);
  const startPoint=resolveEndpoint(line.start,state.widgets),endPoint=resolveEndpoint(line.end,state.widgets);
  if(!startPoint||!endPoint)return null;
  const incoming:Endpoint={kind:'anchor',widgetId:widget.id,...facingAnchor(widget,startPoint)};
  const outgoing:Endpoint={kind:'anchor',widgetId:widget.id,...facingAnchor(widget,endPoint)};
  const firstStyle={...line.style},secondStyle={...line.style};
  if((line.style.startCap??'none')!=='none'&&(line.style.endCap??'none')!=='none'){firstStyle.endCap='none';secondStyle.startCap='none';}
  // Retain each caption once, carrying its formatting to the corresponding half.
  const captions=line.captions??[],firstCaptions:string[]=[],secondCaptions:string[]=[],firstPositions:number[]=[],secondPositions:number[]=[];
  const styles=line.captionStyles??[],firstStyles:typeof styles=[],secondStyles:typeof styles=[];
  captions.forEach((text,i)=>{
    const position=line.captionPositions?.[i]??(i+1)/(captions.length+1),left=position<.5;
    (left?firstCaptions:secondCaptions).push(text);
    (left?firstPositions:secondPositions).push(Math.max(.02,Math.min(.98,left?position*2:(position-.5)*2)));
    (left?firstStyles:secondStyles).push(styles[i]?{...styles[i]}:{});
  });
  const first:Partial<Connector>={end:incoming,style:firstStyle,waypoints:null,controlPoint:null,captions:firstCaptions,captionPositions:firstPositions,captionStyles:firstStyles};
  const second:Connector={...line,id:nextId('connector'),start:outgoing,style:secondStyle,waypoints:null,controlPoint:null,captions:secondCaptions,captionPositions:secondPositions,captionStyles:secondStyles};
  const commands:Command[]=[{op:'WIDGET_CREATE',payload:widget},{op:'CONNECTOR_UPDATE',payload:{id:line.id,patch:first}},{op:'CONNECTOR_CREATE',payload:second}];
  for(const [id,members] of state.groups)if(members.includes(line.id))commands.push({op:'GROUP_CREATE',payload:{id,items:[...members,widget.id,second.id]}});
  commands.push({op:'SELECTION_SET',payload:[widget.id]});
  return {commands,widgetId:widget.id};
}
