import type {BoardState,CommandBus} from './core/commands';
import {icon} from './icons';

export function normalizeObjectLink(value:string):string{
  const text=value.trim();if(!text)return '';
  const candidate=/^[a-z][a-z\d+.-]*:/i.test(text)?text:'https://'+text;
  const url=new URL(candidate);if(!['https:','http:','mailto:'].includes(url.protocol))throw new Error('Use um endereço https://, http:// ou mailto:.');
  return url.href;
}
interface API{state:BoardState;bus:CommandBus;getEditor():HTMLElement|null;commitEditor():void;onChange():void}
export function installLinkUI(api:API){
  const dialog=document.createElement('dialog');dialog.id='link-dialog';dialog.setAttribute('aria-label','Adicionar link');
  dialog.style.cssText='width:min(380px,calc(100vw - 40px));box-sizing:border-box;border:1px solid #dedfe5;border-radius:12px;padding:24px;color:#292823;font:13px Inter,Segoe UI,sans-serif;box-shadow:0 12px 60px #0003';
  dialog.innerHTML=`<form><h2 style="margin:0 0 20px;font-size:18px">Adicionar link</h2><label style="display:block">Endereço<input aria-label="Endereço do link" type="text" placeholder="https://" required style="display:block;box-sizing:border-box;width:100%;margin:8px 0 12px;padding:10px;border:1px solid #cfd3df;border-radius:6px;font:inherit"></label><p data-link-scope style="color:#737784;line-height:1.5"></p><p data-link-error role="alert" style="color:#bd3348"></p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px"><button type="button" data-link-remove>Remover link</button><button type="button" data-link-cancel>Cancelar</button><button type="submit" style="background:#4262ff;color:white;border-color:#4262ff">Salvar link</button></div></form>`;
  const css=document.createElement('style');css.textContent='#link-dialog::backdrop{background:#14182433}#link-dialog button{font:inherit;padding:8px 11px;border:1px solid #dfe2e9;border-radius:6px;background:#fff;cursor:pointer}';document.head.append(css);document.body.append(dialog);
  const input=dialog.querySelector<HTMLInputElement>('input')!,error=dialog.querySelector<HTMLElement>('[data-link-error]')!;
  let target:string|null=null,range:Range|null=null,editing:HTMLElement|null=null,previousFocus:HTMLElement|null=null;
  const restore=()=>{if(editing?.isConnected){editing.focus();if(range){const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}}};
  function close(commit=false){const returnFocus=editing??previousFocus;dialog.close();restore();if(commit&&editing?.isConnected)api.commitEditor();editing=null;range=null;target=null;api.onChange();queueMicrotask(()=>{if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else document.querySelector<HTMLElement>('#selection-properties [data-action="add-link"]')?.focus({preventScroll:true});});}
  function open(){
    if(dialog.open){input.focus();return;}
    if([...document.querySelectorAll<HTMLElement>('dialog[open],[role="dialog"][aria-modal="true"]')].some(modal=>!modal.hidden&&modal.getClientRects().length>0))return;
    const widget=api.state.selection.size===1?api.state.widgets.get([...api.state.selection][0]!):undefined;if(!widget||widget.locked)return;
    editing=api.getEditor();const selection=window.getSelection();range=editing&&selection?.rangeCount&&editing.contains(selection.getRangeAt(0).commonAncestorContainer)?selection.getRangeAt(0).cloneRange():null;
    previousFocus=document.activeElement as HTMLElement|null;target=widget.id;error.textContent='';input.value=widget.link??'';
    const selectedText=range?.toString();dialog.querySelector('[data-link-scope]')!.textContent=selectedText?`Aplicar ao trecho “${selectedText.slice(0,70)}”.`:widget.type==='text'?'Aplicar ao texto inteiro.':'Abrir este endereço ao clicar no objeto. Arrastar continua movendo o objeto.';
    if(range){const parent=range.startContainer.parentElement?.closest('a');if(parent)input.value=parent.getAttribute('href')??input.value;}
    dialog.showModal();input.focus();input.select();
  }
  function apply(remove=false){
    const widget=target?api.state.widgets.get(target):undefined;if(!widget||widget.locked){close();return;}
    let url='';try{url=remove?'':normalizeObjectLink(input.value);}catch(problem){error.textContent=problem instanceof Error?problem.message:'Endereço inválido.';return;}
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
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('keydown',event=>{
    event.stopPropagation();if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(control=>control.getClientRects().length>0),index=controls.indexOf(document.activeElement as HTMLElement);
    if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&(index<0||index===controls.length-1)){event.preventDefault();controls[0]?.focus();}
  });
  // Preserve an inline text range while its floating-toolbar button is pressed.
  document.addEventListener('pointerdown',event=>{if((event.target as Element).closest('[data-action="add-link"],[data-mind-action="link"]'))event.preventDefault();},true);
  window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.body.classList.contains('home-visible')){event.preventDefault();event.stopImmediatePropagation();open();}},true);
  return {open,editing:()=>dialog.open,icon:()=>icon('link',20)};
}
