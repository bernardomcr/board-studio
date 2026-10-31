import type {BoardState,CommandBus} from './core/commands';
import type {Camera} from './core/camera';
import type {Widget} from './core/model';
import {mindNodeHidden} from './core/mindmap';
import {widgetAABB,widgetCorners,worldToLocal,type Vec} from './core/geometry';
import {visibleFrames,frameForWidget} from './core/frame-visibility';
import {MAX_AUDIO_BYTES,createAudioWidget,audioWaveform,formatAudioTime,type AudioMetadata} from './core/audio';
import {audioCardLayout} from './render/audio-paint';
import {icon} from './icons';

interface AudioAPI{
  state:BoardState;bus:CommandBus;camera:Camera;
  getTool?():string;setTool?(tool:'select'):void;getBoardKey?():string|null;
  onChange?():void;
}
interface Player{element:HTMLDivElement;play:HTMLButtonElement;download:HTMLButtonElement;seek:HTMLInputElement;line:HTMLDivElement;time:HTMLSpanElement;audio:HTMLAudioElement;src:string;boardKey?:string|null}
const message=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
const sourceData=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Não foi possível ler o áudio.'));reader.readAsDataURL(blob);});
async function audioDuration(blob:Blob,fallback=0):Promise<number>{
  return new Promise(resolve=>{
    const audio=new Audio(),url=URL.createObjectURL(blob);let settled=false;
    const finish=(value:number)=>{if(settled)return;settled=true;clearTimeout(timer);audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);resolve(Number.isFinite(value)&&value>=0?value:fallback);};
    const timer=setTimeout(()=>finish(fallback),3500);
    audio.onloadedmetadata=()=>finish(Number.isFinite(audio.duration)?audio.duration:fallback);audio.onerror=()=>finish(fallback);audio.preload='metadata';audio.src=url;
  });
}
/** Decode only a bounded analysis buffer; larger recordings remain playable originals. */
async function blobMetadata(blob:Blob,name:string,durationHint=0,samples:readonly number[]=[]):Promise<AudioMetadata>{
  if(!blob.size)throw new Error('O áudio está vazio. Grave um trecho antes de salvar.');
  if(blob.size>MAX_AUDIO_BYTES)throw new Error('O arquivo de áudio excede 64 MB. Importe um trecho menor para este board.');
  if(!blob.type.startsWith('audio/'))throw new Error('Escolha um arquivo de áudio.');
  let duration=durationHint||await audioDuration(blob),waveform=audioWaveform(samples);
  if(!waveform.length&&blob.size<=8*1024*1024&&duration>0&&duration*48000<=16_000_000&&typeof AudioContext!=='undefined'){
    const context=new AudioContext();
    try{const buffer=await context.decodeAudioData(await blob.arrayBuffer());duration=buffer.duration;waveform=audioWaveform(buffer.getChannelData(0));}catch{/* Browser playback can support formats not exposed by decodeAudioData. */}finally{await context.close();}
  }
  return {src:await sourceData(blob),mime:blob.type,name:name.trim()||'Áudio',duration,waveform};
}

/** Local recording, embedded originals, and native audio playback aligned to board objects. */
export function installAudio(api:AudioAPI){
  const {state,bus,camera}=api,players=new Map<string,Player>();let popup:HTMLDivElement|null=null,recording:HTMLDivElement|null=null,playFrame=0;
  const style=document.createElement('style');style.textContent=`
  #audio-create-menu{position:fixed;z-index:46;width:212px;padding:6px;background:#fff;color:#303746;border:1px solid #e4e7ed;border-radius:9px;box-shadow:0 5px 24px #15171b26;font:12px Inter,'Segoe UI',sans-serif}
  #audio-create-menu button{display:flex;align-items:center;gap:10px;width:100%;height:38px;padding:0 10px;border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
  #audio-create-menu button:hover{background:#eef2ff;color:#4262ff}
  #audio-overlays{position:fixed;inset:0;pointer-events:none;z-index:27;overflow:hidden}
  #audio-overlays [hidden],#audio-record-dialog [hidden]{display:none!important}
  body.home-visible #audio-overlays{display:none!important}
  .audio-overlay{position:absolute;transform:translate(-50%,-50%);transform-origin:center;pointer-events:none}
  .audio-overlay button{position:absolute;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;padding:0;background:var(--audio-fill,#fff);color:var(--audio-ink,#303746);cursor:pointer;pointer-events:auto;transform:translate(-50%,-50%)}
  .audio-overlay button:hover{box-shadow:0 0 0 2px #4262ff44}
  .audio-overlay button:focus-visible,.audio-overlay input:focus-visible{outline:2px solid #4262ff;outline-offset:3px}
  .audio-overlay button svg{width:64%;height:64%}
  .audio-overlay [data-audio-download]{opacity:0;pointer-events:none;transition:opacity .12s}
  .audio-overlay:hover [data-audio-download],.audio-overlay:focus-within [data-audio-download],.audio-overlay[data-selected=true] [data-audio-download]{opacity:1;pointer-events:auto}
  .audio-overlay input{position:absolute;opacity:0;pointer-events:auto;margin:0;cursor:pointer}
  .audio-overlay input:focus-visible{opacity:.75}
  .audio-playhead{position:absolute;width:1px;background:#4262ff;pointer-events:none;transform:translateX(-50%)}
  .audio-current-time{position:absolute;right:5%;bottom:3%;background:var(--audio-fill,#fff);color:var(--audio-ink,#303746);padding:0 3px;pointer-events:none;font:10px Inter,'Segoe UI',sans-serif;white-space:nowrap}
  #audio-record-dialog{position:fixed;inset:0;background:#11182765;z-index:85;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;font:13px Inter,'Segoe UI',sans-serif;color:#303746}
  #audio-record-dialog section{width:420px;max-width:100%;box-sizing:border-box;padding:24px;border:1px solid #e4e7ed;border-radius:14px;background:#fff;box-shadow:0 16px 60px #0004}
  #audio-record-dialog h2{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:18px}
  #audio-record-dialog p{color:#7b8290;font-size:12px;line-height:1.6;margin:8px 0}
  #audio-record-dialog .audio-record-time{text-align:center;font-variant-numeric:tabular-nums;font-size:34px;font-weight:500;padding:16px 0 9px}
  #audio-record-dialog .audio-record-wave{display:flex;align-items:center;justify-content:center;gap:3px;height:56px;margin:6px 0 16px;overflow:hidden}
  #audio-record-dialog .audio-record-wave span{width:4px;min-height:3px;max-height:52px;border-radius:3px;background:#4262ff}
  #audio-record-dialog .audio-record-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}
  #audio-record-dialog button{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border:1px solid #dce0e8;border-radius:7px;background:#fff;color:inherit;font:inherit;cursor:pointer}
  #audio-record-dialog button[data-start]{background:#4262ff;border-color:#4262ff;color:white}
  #audio-record-dialog button[data-stop]{background:#f4f6ff;color:#4262ff;border-color:#c9d3ff}
  #audio-record-dialog button:disabled{opacity:.5;cursor:default}
  #audio-record-dialog [role=alert]{color:#bb3543;min-height:18px}
  `;document.head.append(style);
  const overlays=document.createElement('div');overlays.id='audio-overlays';document.body.append(overlays);
  const toolbarButton=document.createElement('button');toolbarButton.type='button';toolbarButton.dataset.tool='audio';toolbarButton.dataset.label='Áudio';toolbarButton.setAttribute('aria-label','Áudio');toolbarButton.title='Áudio';toolbarButton.innerHTML=icon('audio',22);
  const toolbar=document.getElementById('toolbar')!;toolbar.querySelector('[data-tool="image"]')?.after(toolbarButton);if(!toolbarButton.parentElement)toolbar.append(toolbarButton);
  const picker=document.createElement('input');picker.type='file';picker.accept='audio/*,.mp3,.wav,.ogg,.opus,.webm,.m4a,.aac,.flac';picker.multiple=true;picker.hidden=true;document.body.append(picker);
  function notice(text:string){const toast=document.createElement('div');toast.setAttribute('role','status');toast.textContent=text;toast.style.cssText='position:fixed;bottom:64px;left:50%;transform:translateX(-50%);max-width:min(600px,90vw);padding:12px 16px;background:#303746;color:#fff;border-radius:8px;z-index:110;font:13px Inter,Segoe UI,sans-serif';document.body.append(toast);setTimeout(()=>toast.remove(),6500);}
  function closeMenu(){popup?.remove();popup=null;}
  function insert(metadata:AudioMetadata,point:Vec){const node=createAudioWidget(metadata,point);bus.exec({op:'BATCH',payload:{label:'Inserir áudio',commands:[{op:'WIDGET_CREATE',payload:node},{op:'SELECTION_SET',payload:[node.id]}]}});api.setTool?.('select');refresh();api.onChange?.();return node.id;}
  async function importFiles(files:FileList|File[]){
    closeMenu();const boardKey=api.getBoardKey?.(),point={x:camera.x,y:camera.y};let index=0;
    for(const file of Array.from(files))try{
      let blob:Blob=file;if(!file.type.startsWith('audio/')){const extension=file.name.split('.').pop()?.toLowerCase(),type=({mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',opus:'audio/ogg',webm:'audio/webm',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac'} as Record<string,string>)[extension??''];if(!type)throw new Error('Escolha um arquivo de áudio.');blob=new Blob([file],{type});}
      const metadata=await blobMetadata(blob,file.name);
      if(api.getBoardKey&&api.getBoardKey()!==boardKey){notice('O board mudou. Importe o áudio novamente no board desejado.');return;}
      insert(metadata,{x:point.x+index*24,y:point.y+index*24});index++;
    }catch(error){notice(message(error,'Não foi possível abrir o áudio.'));}
  }
  picker.onchange=()=>{if(picker.files)void importFiles(picker.files);picker.value='';};
  function openMenu(){
    if(popup){closeMenu();return;}const menu=document.createElement('div');popup=menu;menu.id='audio-create-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Adicionar áudio');
    menu.innerHTML=`<button type="button" role="menuitem" data-record>${icon('mic',18)}Gravar áudio</button><button type="button" role="menuitem" data-import>${icon('upload',18)}Importar áudio</button>`;
    document.body.append(menu);const rect=toolbarButton.getBoundingClientRect();menu.style.left=`${Math.min(innerWidth-226,rect.right+10)}px`;menu.style.top=`${Math.max(70,Math.min(innerHeight-menu.offsetHeight-16,rect.top))}px`;
    menu.querySelector<HTMLButtonElement>('[data-record]')!.onclick=()=>openRecorder();menu.querySelector<HTMLButtonElement>('[data-import]')!.onclick=()=>{closeMenu();picker.click();};
  }
  toolbarButton.addEventListener('click',event=>{event.stopPropagation();openMenu();});
  document.addEventListener('pointerdown',event=>{if(popup&&!popup.contains(event.target as Node)&&!toolbarButton.contains(event.target as Node))closeMenu();});
  window.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});

  function download(id:string){const node=state.widgets.get(id);if(!node?.audio)return;const link=document.createElement('a');link.href=node.audio.src;const extension=node.audio.mime.split(';')[0]!.split('/')[1]?.replace('mpeg','mp3').replace('x-wav','wav')||'webm',title=(node.type==='frame'?node.title:node.content||node.audio.name).replace(/[<>:"/\\|?*]/g,'-');link.download=/\.[a-z0-9]{2,5}$/i.test(title)?title:`${title}.${extension}`;link.click();}
  function pauseOthers(id:string){for(const [other,player]of players)if(other!==id)player.audio.pause();}
  function playback(){
    playFrame=0;let playing=false;const homeVisible=document.body.classList.contains('home-visible');
    for(const [id,player]of players){const node=state.widgets.get(id);if(!node?.audio)continue;const duration=Number.isFinite(player.audio.duration)?player.audio.duration:node.audio.duration,position=duration>0?Math.max(0,Math.min(1,player.audio.currentTime/duration)):0;
      if(homeVisible||node.hidden||mindNodeHidden(state,id)||api.getBoardKey&&player.boardKey!==api.getBoardKey())player.audio.pause();
      player.seek.value=String(Math.round(position*1000));player.line.style.left=`${(76+260*position)/360*100}%`;player.line.hidden=player.audio.currentTime===0;player.time.hidden=player.audio.paused&&player.audio.currentTime===0;player.time.textContent=formatAudioTime(player.audio.currentTime);
      if(!player.audio.paused&&!player.audio.ended)playing=true;
    }
    if(playing)playFrame=requestAnimationFrame(playback);
  }
  function requestPlayback(){if(!playFrame)playFrame=requestAnimationFrame(playback);}
  function newPlayer(id:string,src:string):Player{
    const element=document.createElement('div');element.className='audio-overlay';element.dataset.audioId=id;
    const play=document.createElement('button'),save=document.createElement('button'),seek=document.createElement('input'),line=document.createElement('div'),time=document.createElement('span'),audio=new Audio();
    play.type='button';play.dataset.audioPlay='';play.innerHTML=icon('play',20);save.type='button';save.dataset.audioDownload='';save.setAttribute('aria-label','Baixar áudio original');save.title='Baixar áudio original';save.innerHTML=icon('download',16);
    seek.type='range';seek.min='0';seek.max='1000';seek.value='0';seek.step='1';seek.setAttribute('aria-label','Posição do áudio');line.className='audio-playhead';line.hidden=true;time.className='audio-current-time';time.hidden=true;
    audio.preload='none';audio.src=src;
    const player:Player={element,play,download:save,seek,line,time,audio,src,boardKey:api.getBoardKey?.()};
    const update=()=>{const active=!audio.paused&&!audio.ended;play.innerHTML=icon(active?'pause':'play',20);play.setAttribute('aria-label',active?'Pausar áudio':'Reproduzir áudio');play.setAttribute('aria-pressed',String(active));play.title=active?'Pausar áudio':'Reproduzir áudio';requestPlayback();};
    play.onclick=async event=>{event.stopPropagation();if(!audio.paused){audio.pause();return;}pauseOthers(id);try{await audio.play();}catch{notice('Não foi possível reproduzir este áudio. Baixe o original para abrir em outro aplicativo.');}update();};
    save.onclick=event=>{event.stopPropagation();download(id);};
    for(const control of [play,save,seek])control.addEventListener('pointerdown',event=>event.stopPropagation());
    seek.oninput=()=>{const node=state.widgets.get(id),duration=Number.isFinite(audio.duration)?audio.duration:node?.audio?.duration??0;if(duration>0){try{audio.currentTime=duration*Number(seek.value)/1000;requestPlayback();}catch{}}};
    audio.onplay=update;audio.onpause=update;audio.onended=update;audio.onloadedmetadata=()=>requestPlayback();audio.ontimeupdate=()=>requestPlayback();audio.onerror=()=>notice('Não foi possível carregar o áudio. O arquivo original continua disponível para baixar.');
    element.append(play,save,seek,line,time);overlays.append(element);update();return player;
  }
  function refresh(){
    const homeVisible=document.body.classList.contains('home-visible');
    for(const [id,player]of players)if(!state.widgets.get(id)?.audio||!homeVisible&&api.getBoardKey&&player.boardKey!==api.getBoardKey()){player.audio.pause();player.audio.removeAttribute('src');player.audio.load();player.element.remove();players.delete(id);}
    const visible=camera.visibleWorldRect(),selectionTool=!api.getTool||api.getTool()==='select',frames=visibleFrames(state);
    for(const node of state.widgets.values()){
      if(!node.audio)continue;let player=players.get(node.id);if(!player){player=newPlayer(node.id,node.audio.src);players.set(node.id,player);}else if(player.src!==node.audio.src){player.audio.pause();player.audio.src=node.audio.src;player.src=node.audio.src;}
      const box=widgetAABB(node),outside=box.maxX<visible.minX||box.minX>visible.maxX||box.maxY<visible.minY||box.minY>visible.maxY;
      player.element.hidden=homeVisible||!!node.hidden||mindNodeHidden(state,node.id)||outside||!selectionTool||node.width*camera.scale<60||node.height*camera.scale<24;
      if(homeVisible||node.hidden||mindNodeHidden(state,node.id))player.audio.pause();
      const center=camera.worldToScreen({x:node.x+node.width/2,y:node.y+node.height/2}),layout=audioCardLayout(node),scale=camera.scale;
      Object.assign(player.element.style,{left:`${center.x}px`,top:`${center.y}px`,width:`${node.width*scale}px`,height:`${node.height*scale}px`,transform:`translate(-50%,-50%) rotate(${node.rotation}rad)`});
      player.element.style.setProperty('--audio-fill',node.style.fillColor==='transparent'?'#ffffff':node.style.fillColor);player.element.style.setProperty('--audio-ink',node.style.color==='transparent'?'#4262ff':node.style.color);player.element.dataset.selected=String(state.selection.has(node.id));
      Object.assign(player.play.style,{left:`${layout.playX/node.width*100}%`,top:`${layout.playY/node.height*100}%`,width:`${layout.playRadius*1.6*scale}px`,height:`${layout.playRadius*1.6*scale}px`});
      Object.assign(player.download.style,{left:'94%',top:'18%',width:`${Math.max(18,16*layout.unit*scale)}px`,height:`${Math.max(18,16*layout.unit*scale)}px`});
      Object.assign(player.seek.style,{left:`${layout.waveX/node.width*100}%`,top:`${(layout.waveY-layout.waveHeight)/node.height*100}%`,width:`${layout.waveWidth/node.width*100}%`,height:`${layout.waveHeight*2*scale}px`});
      Object.assign(player.line.style,{top:`${(layout.waveY-layout.waveHeight)/node.height*100}%`,height:`${layout.waveHeight*2*scale}px`});
      // Controls follow frame clipping just like the card's canvas content.
      const frame=frameForWidget(node,frames);
      player.element.style.clipPath=frame?`polygon(${widgetCorners(frame).map(point=>{const local=worldToLocal(node,point);return `${local.x*scale}px ${local.y*scale}px`;}).join(',')})`:'';
    }
  }
  let lastHomeVisible=document.body.classList.contains('home-visible');
  new MutationObserver(()=>{const visible=document.body.classList.contains('home-visible');if(visible!==lastHomeVisible){lastHomeVisible=visible;refresh();}}).observe(document.body,{attributes:true,attributeFilter:['class']});

  function openRecorder(){
    closeMenu();if(recording)return;api.setTool?.('select');const dialog=document.createElement('div');recording=dialog;dialog.id='audio-record-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Gravar áudio');
    dialog.innerHTML=`<section><h2>${icon('mic',22)}Gravar áudio</h2><p>O microfone é ativado ao começar a gravação. O áudio fica salvo neste board.</p><div class="audio-record-time" aria-live="off">0:00</div><div class="audio-record-wave" aria-hidden="true">${Array.from({length:48},()=>'<span style="height:3px"></span>').join('')}</div><p data-record-status>Pronto para gravar</p><p role="alert"></p><div class="audio-record-actions"><button type="button" data-cancel>Cancelar</button><button type="button" data-stop disabled>${icon('stop',16)}Parar e inserir</button><button type="button" data-start>${icon('mic',16)}Começar gravação</button></div></section>`;
    document.body.append(dialog);const start=dialog.querySelector<HTMLButtonElement>('[data-start]')!,stop=dialog.querySelector<HTMLButtonElement>('[data-stop]')!,cancel=dialog.querySelector<HTMLButtonElement>('[data-cancel]')!,error=dialog.querySelector<HTMLElement>('[role=alert]')!,status=dialog.querySelector<HTMLElement>('[data-record-status]')!,timer=dialog.querySelector<HTMLElement>('.audio-record-time')!,bars=[...dialog.querySelectorAll<HTMLElement>('.audio-record-wave span')];
    const point={x:camera.x,y:camera.y},boardKey=api.getBoardKey?.();let stream:MediaStream|undefined,recorder:MediaRecorder|undefined,context:AudioContext|undefined,analyser:AnalyserNode|undefined,frame=0,started=0,lastSample=0,sampleInterval=40,discard=false,failed=false,oversize=false,totalBytes=0,peaks:number[]=[],chunks:Blob[]=[];
    const cleanup=()=>{if(frame)cancelAnimationFrame(frame);frame=0;stream?.getTracks().forEach(track=>track.stop());if(context&&context.state!=='closed')void context.close();};
    const close=()=>{cleanup();dialog.remove();if(recording===dialog)recording=null;};
    const cancelRecord=()=>{discard=true;if(recorder?.state==='recording')recorder.stop();close();};
    cancel.onclick=cancelRecord;dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();cancelRecord();}if(event.key==='Tab'){const buttons=[...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([hidden])')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(event.shiftKey&&index<=0){event.preventDefault();buttons.at(-1)?.focus();}else if(!event.shiftKey&&index===buttons.length-1){event.preventDefault();buttons[0]?.focus();}}});
    function meter(){frame=0;if(discard||!started||recorder?.state!=='recording')return;const now=performance.now();timer.textContent=formatAudioTime((now-started)/1000);if(analyser&&now-lastSample>=sampleInterval){const values=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(values);let peak=0;for(const value of values)peak=Math.max(peak,Math.abs(value-128)/128);peaks.push(peak);lastSample=now;if(peaks.length>=512){peaks=Array.from({length:256},(_,i)=>Math.max(peaks[i*2]!,peaks[i*2+1]!));sampleInterval*=2;}const view=audioWaveform(peaks,48);for(let i=0;i<bars.length;i++)bars[i]!.style.height=`${Math.max(3,(view[i]??0)*52)}px`;}frame=requestAnimationFrame(meter);}
    start.onclick=async()=>{
      start.disabled=true;error.textContent='';status.textContent='Aguardando microfone…';
      try{
        if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Este navegador não permite gravar áudio. Importe um arquivo pelo botão Áudio.');
        stream=await navigator.mediaDevices.getUserMedia({audio:true});if(discard||recording!==dialog){cleanup();return;}
        const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
        if(typeof AudioContext!=='undefined'){context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=512;context.createMediaStreamSource(stream).connect(analyser);await context.resume();}
        recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);totalBytes+=event.data.size;if(totalBytes>MAX_AUDIO_BYTES&&recorder?.state==='recording'){oversize=true;recorder.stop();}}};
        recorder.onstop=async()=>{
          const duration=(performance.now()-started)/1000;cleanup();if(discard){close();return;}if(failed)return;status.textContent='Salvando áudio…';start.disabled=true;stop.disabled=true;
          if(oversize){status.textContent='Gravação finalizada';error.textContent='O áudio ultrapassou o armazenamento por arquivo do board. Baixe o original para preservar a gravação.';cancel.textContent='Fechar';const save=document.createElement('button');save.type='button';save.textContent='Baixar gravação';save.onclick=()=>{const url=URL.createObjectURL(new Blob(chunks,{type:recorder!.mimeType||'audio/webm'})),link=document.createElement('a');link.href=url;link.download='gravacao.webm';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};dialog.querySelector('.audio-record-actions')!.append(save);return;}
          try{const blob=new Blob(chunks,{type:recorder!.mimeType||mime||'audio/webm'}),metadata=await blobMetadata(blob,'Gravação de áudio',duration,peaks);if(discard||recording!==dialog)return;if(api.getBoardKey&&api.getBoardKey()!==boardKey)throw new Error('O board mudou. Grave novamente no board desejado.');insert(metadata,point);close();}catch(failure){error.textContent=message(failure,'Não foi possível salvar a gravação.');status.textContent='A gravação não foi inserida';cancel.textContent='Fechar';}
        };
        recorder.onerror=()=>{failed=true;cleanup();status.textContent='Gravação interrompida';error.textContent='Não foi possível continuar a gravação. Tente novamente ou importe um arquivo.';stop.disabled=true;cancel.textContent='Fechar';};
        recorder.start(1000);started=performance.now();status.textContent='Gravando';start.hidden=true;stop.disabled=false;stop.focus();meter();
      }catch(failure){cleanup();error.textContent=(failure as DOMException)?.name==='NotAllowedError'?'O acesso ao microfone não foi permitido. Libere o microfone no navegador ou importe um áudio.':message(failure,'Não foi possível iniciar a gravação.');status.textContent='Não foi possível gravar';start.disabled=false;}
    };
    stop.onclick=()=>{if(recorder?.state==='recording'){stop.disabled=true;status.textContent='Finalizando gravação…';recorder.stop();}};
    start.focus();
  }
  refresh();return {refresh,openRecorder,importFiles,downloadSelected:()=>{const id=[...state.selection][0];if(id)download(id);},pauseAll:()=>{for(const player of players.values())player.audio.pause();}};
}
