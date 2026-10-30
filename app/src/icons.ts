/** Consistent, original outline icons used by the local editor and board library. */
const paths: Record<string,string> = {
  select:'<path d="m5 3 14 8-7 2-3 7z"/>',
  hand:'<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3-5a1.7 1.7 0 0 1 3-1l2 2"/>',
  sticky:'<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>',
  shape:'<rect x="3" y="3" width="8" height="8" rx=".8"/><circle cx="17" cy="7" r="4"/><path d="m7 14 4 7H3zM14 14h7v7h-7z"/>',
  connector:'<path d="M4 19h5V5h11M16 2l4 3-4 3"/>',
  text:'<path d="M4 6V4h16v2M12 4v16M8 20h8"/>',
  pen:'<path d="m4 20 1-5L16 4a2.2 2.2 0 0 1 3 3L8 18zM14 6l4 4M4 20l4-2"/>',
  highlighter:'<path d="m5 14 8-10 7 6-9 9zM5 14l-2 6h7l1-1M2 22h13M11 7l7 6"/>',
  eraser:'<path d="m4 13 9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 9H7l-5-5a2 2 0 0 1 0-3zM8 9l9 9M12 21h10"/>',
  lasso:'<path d="M8 17c-9-1-7-13 4-13 11 0 13 11 3 13-6 2-11 0-8-3 3-2 7 3 3 7"/>',
  frame:'<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 5 5 3-3 5 5"/>',
  undo:'<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',
  redo:'<path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12h3"/>',
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  duplicate:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  folder:'<path d="M3 5h7l2 3h9v12H3z"/>',
  sort:'<path d="M3 5h12M3 10h9M3 15h6M18 6v14M14 16l4 4 4-4"/>',
  'arrow-left':'<path d="M20 12H4m7-7-7 7 7 7"/>',
  'arrow-right':'<path d="M4 12h16m-7-7 7 7-7 7"/>',
  export:'<path d="M12 3v12M7 8l5-5 5 5M4 14v7h16v-7"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0M12 14v3"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  minus:'<path d="M4 12h16"/>',
  fit:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  rename:'<path d="m4 20 1-5L16 4a2.2 2.2 0 0 1 3 3L8 18zM13 21h8M14 6l4 4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings:'<path d="m9 3-.6 3-2 .9L4 6l-2 4 2.3 1.8v2.4L2 16l2 4 2.4-.9 2 .9.6 3h6l.6-3 2-.9L20 20l2-4-2.3-1.8v-2.4L22 10l-2-4-2.4.9-2-.9L15 3z"/><circle cx="12" cy="13" r="3"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  'chevron-right':'<path d="m9 6 6 6-6 6"/>',
  fill:'<path d="m4 12 8-8 8 8-8 8zM8 3l4 5M3 21h18"/><path d="M20 14s-2 2.4-2 3.5a2 2 0 0 0 4 0c0-1.1-2-3.5-2-3.5"/>',
  stroke:'<path d="M4 18 18 4M3 21h18M4 8V4h4M16 20h4v-4"/>',
  opacity:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 6h5M12 10h8M12 14h8M12 18h5"/>',
  crop:'<path d="M7 3v14h14M3 7h14v14M17 7l4-4M3 21l4-4"/>',
  'crop-circle':'<circle cx="12" cy="12" r="8"/><path d="M3 7h4V3M17 21v-4h4"/>',
  bold:'<path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/>',
  italic:'<path d="M11 4h8M5 20h8M15 4 9 20"/>',
  underline:'<path d="M6 4v7a6 6 0 0 0 12 0V4M4 21h16"/>',
  'text-color':'<path d="m5 17 7-14 7 14M8 12h8M4 21h16"/>',
  'align-left':'<path d="M4 5h16M4 10h10M4 15h16M4 20h10"/>',
  align:'<path d="M4 3v18M8 6h13v5H8zM8 15h8v5H8z"/>',
  group:'<rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="3 3"/><rect x="7" y="7" width="5" height="5"/><circle cx="16" cy="16" r="3"/>',
  ungroup:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><rect x="7" y="7" width="5" height="5"/><circle cx="16" cy="16" r="3"/>',
  arrange:'<rect x="3" y="3" width="12" height="12" rx="1"/><path d="M9 18v3h12V9h-3M6 6h6M6 9h6M6 12h6"/>',
  front:'<rect x="3" y="3" width="12" height="12" rx="1"/><path d="M9 18v3h12V9h-3"/>',
  back:'<rect x="9" y="9" width="12" height="12" rx="1"/><path d="M6 15H3V3h12v3"/>',
  size:'<path d="M3 9V3h6M15 21h6v-6M3 3l7 7M21 21l-7-7"/>',
  link:'<path d="m10 14 4-4M8 16l-2 2a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0M16 8l2-2a3.5 3.5 0 0 1 5 5l-5 5a3.5 3.5 0 0 1-5 0"/>',
  label:'<path d="M3 5h12l6 7-6 7H3z"/><circle cx="7" cy="12" r="1"/>',
  route:'<path d="M4 20V9h8V4h8"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/>',
  'cap-start':'<path d="M4 12h17M10 6l-6 6 6 6"/>',
  'cap-end':'<path d="M3 12h17M14 6l6 6-6 6"/>',
  swap:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  flip:'<path d="M12 3v18M8 6 3 18h5zM16 6l5 12h-5z"/>',
};

export function icon(name:string,size=20):string {
  const body=paths[name]??paths.more;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Replace only the symbol, retaining existing shortcut labels and accessible names. */
export function installIcons(root:ParentNode=document):void {
  const aliases:Record<string,string>={sticky_note:'sticky'};
  for(const button of root.querySelectorAll<HTMLElement>('[data-tool]')){
    const name=aliases[button.dataset.tool!]??button.dataset.tool!;
    if(!paths[name])continue;
    const template=document.createElement('template');template.innerHTML=icon(name,22);
    const svg=template.content.firstElementChild!;
    const existing=button.querySelector('svg');if(existing)existing.replaceWith(svg);else button.prepend(svg);
  }
  const controls:Record<string,string>={undo:'undo',redo:'redo',export:'download','export-svg':'image',help:'help'};
  for(const [id,name]of Object.entries(controls)){
    const button=root.querySelector<HTMLElement>('#'+id);if(!button)continue;
    const template=document.createElement('template');template.innerHTML=icon(name,18);const svg=template.content.firstElementChild!;
    const existing=button.querySelector('svg');if(existing)existing.replaceWith(svg);else button.prepend(svg);
  }
}
