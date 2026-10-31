import type {BoardState,CommandBus} from './core/commands';
import {icon} from './icons';
import type {Camera} from './core/camera';
import {widgetAABB} from './core/geometry';

export function normalizeObjectLink(value:string):string{
  const text=value.trim();if(!text)return '';
  const candidate=/^[a-z][a-z\d+.-]*:/i.test(text)?text:'https://'+text;
  const url=new URL(candidate);if(!['https:','http:','mailto:'].includes(url.protocol))throw new Error('Use um endereço https://, http:// ou mailto:.');
  return url.href;
}
interface API{state:BoardState;bus:CommandBus;camera?:Camera;getBoardKey?():string|null;getEditor():HTMLElement|null;commitEditor():void;onChange():void}
export function installLinkUI(api:API){
  const dialog=document.createElement('dialog');dialog.id='link-dialog';dialog.setAttribute('aria-label','Adicionar link');
  dialog.innerHTML=`<form><div class="link-editor-row"><label for="object-link-url">Inserir link</label><input id="object-link-url" aria-label="Endereço do link" aria-describedby="object-link-scope" type="text" placeholder="Colar um link" required><button type="submit" aria-label="Salvar link" title="Aplicar link">Aplicar</button><button type="button" data-link-remove aria-label="Remover link" title="Remover link">${icon('trash',17)}</button><button type="button" data-link-cancel aria-label="Cancelar" title="Fechar">${icon('close',17)}</button></div><p id="object-link-scope" data-link-scope class="link-scope"></p><p data-link-error role="alert"></p></form>`;
  const css=document.createElement('style');css.textContent=`
  #link-dialog{position:fixed;margin:0;width:min(460px,calc(100vw - 24px));max-width:calc(100vw - 24px);box-sizing:border-box;border:1px solid #e1e4eb;border-radius:8px;padding:8px;background:#fff;color:#292823;font:12px 'Noto Sans',Arial,sans-serif;box-shadow:0 5px 24px #19181226}
  #link-dialog::backdrop{background:transparent}
  #link-dialog .link-editor-row{display:flex;align-items:center;gap:5px}
  #link-dialog label{white-space:nowrap;font-weight:500;margin:0 4px}
  #link-dialog input{min-width:0;flex:1;height:32px;box-sizing:border-box;border:1px solid #ccd2df;border-radius:5px;padding:0 8px;font:inherit;color:inherit;background:#fff;outline:none}
  #link-dialog input:focus{border-color:#4262ff;box-shadow:0 0 0 2px #4262ff26}
  #link-dialog button{height:32px;min-width:30px;display:flex;align-items:center;justify-content:center;border:0;border-radius:5px;padding:6px;background:transparent;color:#626b7b;cursor:pointer;font:inherit;flex:none}
  #link-dialog button[type=submit]{color:#4262ff;font-weight:600;padding:6px 8px}
  #link-dialog button:hover{background:#f0f3fc;color:#4262ff}
  #link-dialog button:focus-visible{outline:2px solid #4262ff;outline-offset:1px}
  #link-dialog .link-scope{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);margin:0}
  #link-dialog [role=alert]{color:#b93246;line-height:1.45;margin:7px 4px 1px}
  #link-dialog [role=alert]:empty{display:none}
  @media(max-width:480px){#link-dialog label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}}
  `;document.head.append(css);document.body.append(dialog);
  const input=dialog.querySelector<HTMLInputElement>('input')!,error=dialog.querySelector<HTMLElement>('[data-link-error]')!;
  let target:string|null=null,range:Range|null=null,editing:HTMLElement|null=null,previousFocus:HTMLElement|null=null,boardKey:string|null|undefined;
  function position(){
    if(!dialog.open)return;const widget=target?api.state.widgets.get(target):undefined,rect=dialog.getBoundingClientRect(),camera=api.camera;
    if(!widget||!camera){dialog.style.left=`${Math.max(12,(innerWidth-rect.width)/2)}px`;dialog.style.top=`${Math.max(72,(innerHeight-rect.height)/2)}px`;return;}
    const bounds=widgetAABB(widget),a=camera.worldToScreen({x:bounds.minX,y:bounds.minY}),b=camera.worldToScreen({x:bounds.maxX,y:bounds.maxY});
    const center=(Math.max(12,a.x)+Math.min(innerWidth-12,b.x))/2,below=b.y+8,top=below+rect.height<innerHeight-16?below:a.y-rect.height-8;
    dialog.style.left=`${Math.max(12,Math.min(innerWidth-rect.width-12,center-rect.width/2))}px`;dialog.style.top=`${Math.max(72,Math.min(innerHeight-rect.height-16,top))}px`;
  }
  const restore=()=>{if(editing?.isConnected){editing.focus();if(range){const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}}};
  function close(commit=false){const returnFocus=editing??previousFocus;dialog.close();restore();if(commit&&editing?.isConnected)api.commitEditor();editing=null;range=null;target=null;api.onChange();queueMicrotask(()=>{if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else document.querySelector<HTMLElement>('#selection-properties [data-action="add-link"]')?.focus({preventScroll:true});});}
  function open(){
    if(document.body.classList.contains('image-cropping'))return;
    if(dialog.open){input.focus();return;}
    if([...document.querySelectorAll<HTMLElement>('dialog[open],[role="dialog"][aria-modal="true"]')].some(modal=>!modal.hidden&&modal.getClientRects().length>0))return;
    const widget=api.state.selection.size===1?api.state.widgets.get([...api.state.selection][0]!):undefined;if(!widget||widget.locked)return;
    editing=api.getEditor();const selection=window.getSelection();range=editing&&selection?.rangeCount&&editing.contains(selection.getRangeAt(0).commonAncestorContainer)?selection.getRangeAt(0).cloneRange():null;
    previousFocus=document.activeElement as HTMLElement|null;target=widget.id;boardKey=api.getBoardKey?.();error.textContent='';input.value=widget.link??'';
    const selectedText=range?.toString();dialog.querySelector('[data-link-scope]')!.textContent=selectedText?`Aplicar ao trecho “${selectedText.slice(0,70)}”.`:widget.type==='text'?'Aplicar ao texto inteiro.':'Abrir este endereço ao clicar no objeto. Arrastar continua movendo o objeto.';
    if(range){const parent=range.startContainer.parentElement?.closest('a');if(parent)input.value=parent.getAttribute('href')??input.value;}
    dialog.showModal();position();input.focus();input.select();
  }
  function apply(remove=false){
    const widget=target?api.state.widgets.get(target):undefined;if(!widget||widget.locked||api.getBoardKey&&boardKey!==api.getBoardKey()){close();return;}
    let url='';try{url=remove?'':normalizeObjectLink(input.value);}catch(problem){error.textContent=problem instanceof Error?problem.message:'Endereço inválido.';position();return;}
    if(editing?.isConnected){if(!range||range.collapsed){range=document.createRange();range.selectNodeContents(editing);}dialog.close();restore();document.execCommand(remove?'unlink':'createLink',false,url);close(true);return;}
    if(widget.type==='text'){
      // Existing rich text is parsed again inside the link label, preserving marks.
      const content=widget.content,linkContent=url?`[${content}](${url})`:content.replace(/\[([^\]]+)\]\((?:https?:|mailto:)[^)]*\)/g,'$1');
      api.bus.exec({op:'WIDGET_UPDATE',payload:{id:widget.id,patch:{content:linkContent,link:undefined}}});
    }else api.bus.exec({op:'WIDGET_UPDATE',payload:{id:widget.id,patch:{link:url||undefined}}});
    close();
  }
  dialog.querySelector('form')!.onsubmit=event=>{event.preventDefault();apply();};
  dialog.querySelector<HTMLButtonElement>('[data-link-remove]')!.onclick=()=>apply(true);
  dialog.querySelector<HTMLButtonElement>('[data-link-cancel]')!.onclick=()=>close();
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();});
  window.addEventListener('resize',position);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('keydown',event=>{
    event.stopPropagation();if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(control=>control.getClientRects().length>0),index=controls.indexOf(document.activeElement as HTMLElement);
    if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&(index<0||index===controls.length-1)){event.preventDefault();controls[0]?.focus();}
  });
  // Preserve an inline text range while its floating-toolbar button is pressed.
  document.addEventListener('pointerdown',event=>{if((event.target as Element).closest('[data-action="add-link"],[data-mind-action="link"]'))event.preventDefault();},true);
  window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.body.classList.contains('home-visible')&&![...document.querySelectorAll('dialog[open]')].some(other=>other!==dialog)){event.preventDefault();event.stopImmediatePropagation();open();}},true);
  return {open,editing:()=>dialog.open,icon:()=>icon('link',20)};
}
