import {createWidget,nextId,type ShapeWidget} from './model';
import type {Vec} from './geometry';

export interface AudioMetadata{
  /** Original audio is embedded locally, never a remote upload URL. */
  src:string;mime:string;name:string;duration:number;waveform:number[];
}
export const MAX_AUDIO_BYTES=64*1024*1024;
export function validateAudioMetadata(value:unknown):AudioMetadata{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Áudio inválido.');
  const audio=value as Record<string,unknown>;
  if(typeof audio.src!=='string'||audio.src.length>Math.ceil(MAX_AUDIO_BYTES/3)*4+256)throw new Error('O arquivo de áudio excede o armazenamento permitido por arquivo.');
  const match=audio.src.match(/^data:(audio\/[\w.+-]+(?:;codecs=[\w.,"' -]+)?);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if(!match||match[2]!.length%4!==0)throw new Error('O áudio deve estar incorporado no board.');
  const bytes=match[2]!.length/4*3-(match[2]!.endsWith('==')?2:match[2]!.endsWith('=')?1:0);if(bytes>MAX_AUDIO_BYTES)throw new Error('O arquivo de áudio excede o armazenamento permitido por arquivo.');
  if(typeof audio.mime!=='string'||audio.mime.length>160||audio.mime.split(';')[0]!.toLowerCase()!==match[1]!.split(';')[0]!.toLowerCase())throw new Error('Formato de áudio inválido.');
  if(typeof audio.name!=='string'||!audio.name.trim()||audio.name.length>1000)throw new Error('Nome do áudio inválido.');
  if(typeof audio.duration!=='number'||!Number.isFinite(audio.duration)||audio.duration<0)throw new Error('Duração do áudio inválida.');
  if(!Array.isArray(audio.waveform)||audio.waveform.length>4096||audio.waveform.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))throw new Error('Forma de onda inválida.');
  return {src:audio.src,mime:audio.mime,name:audio.name,duration:audio.duration,waveform:[...audio.waveform] as number[]};
}
export function formatAudioTime(seconds:number):string{
  if(!Number.isFinite(seconds)||seconds<0)return '--:--';
  const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total/60)%60,remaining=total%60;
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(remaining).padStart(2,'0')}`:`${minutes}:${String(remaining).padStart(2,'0')}`;
}
export function audioWaveform(samples:ArrayLike<number>,count=64):number[]{
  if(!samples.length)return [];
  const result:number[]=[];
  for(let index=0;index<count;index++){
    const from=Math.floor(index*samples.length/count),to=Math.max(from+1,Math.floor((index+1)*samples.length/count));let peak=0;
    for(let at=from;at<Math.min(samples.length,to);at++)peak=Math.max(peak,Math.abs(samples[at]??0));result.push(Math.max(0,Math.min(1,peak)));
  }
  return result;
}
export function createAudioWidget(metadata:AudioMetadata,point:Vec):ShapeWidget{
  const audio=validateAudioMetadata(metadata),width=360,height=124;
  const node=createWidget('shape',{x:point.x-width/2,y:point.y-height/2,width,height,shape:'round_rectangle',content:audio.name}) as ShapeWidget;
  return {...node,id:nextId('audio'),audio,style:{...node.style,fillColor:'#ffffff',fillOpacity:1,borderColor:'#dce1eb',borderWidth:1,borderScale:1/height,cornerRadius:14,fontFamily:'Inter',fontSize:16,color:'#303746',textAlign:'left',textAlignVertical:'top'}};
}
