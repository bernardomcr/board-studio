import {initializeUserFonts,userFontOptions,loadUserFont,snapshotUserFonts} from './user-fonts';
import type {Widget} from './core/model';
import type {Connector} from './core/connectors';

export const fontFamilyName=(family:string):string=>family.split(',')[0]!.trim().replace(/^['"]|['"]$/g,'');
/** Every entity that owns text participates in loading and portable exports. */
export function boardFontFamilies(widgets:Iterable<Pick<Widget,'style'>>,connectors?:Iterable<Pick<Connector,'captions'|'captionStyles'>>):string[]{
 const families=new Set<string>();
 for(const widget of widgets)families.add(widget.style.fontFamily);
 for(const connector of connectors??[])for(let i=0;i<(connector.captions?.length??0);i++)families.add(connector.captionStyles?.[i]?.fontFamily??'Arial, sans-serif');
 return [...families];
}
/** Authentic, locally bundled Google Fonts. Sources and upstream licenses: /fonts/manifest.json. */
export interface BoardFont {family:string;label:string;category:'sans'|'serif'|'mono'|'handwriting'|'display';slug:string}
export const FONT_OPTIONS:readonly BoardFont[]=[
  {
    "family": "Noto Sans",
    "label": "Noto Sans",
    "category": "sans",
    "slug": "notosans"
  },
  {
    "family": "Inter",
    "label": "Inter",
    "category": "sans",
    "slug": "inter"
  },
  {
    "family": "Figtree",
    "label": "Figtree",
    "category": "sans",
    "slug": "figtree"
  },
  {
    "family": "Open Sans",
    "label": "Open Sans",
    "category": "sans",
    "slug": "opensans"
  },
  {
    "family": "Roboto",
    "label": "Roboto",
    "category": "sans",
    "slug": "roboto"
  },
  {
    "family": "Roboto Condensed",
    "label": "Roboto Condensed",
    "category": "sans",
    "slug": "robotocondensed"
  },
  {
    "family": "Roboto Slab",
    "label": "Roboto Slab",
    "category": "serif",
    "slug": "robotoslab"
  },
  {
    "family": "Roboto Mono",
    "label": "Roboto Mono",
    "category": "mono",
    "slug": "robotomono"
  },
  {
    "family": "PT Sans",
    "label": "PT Sans",
    "category": "sans",
    "slug": "ptsans"
  },
  {
    "family": "PT Sans Narrow",
    "label": "PT Sans Narrow",
    "category": "sans",
    "slug": "ptsansnarrow"
  },
  {
    "family": "PT Serif",
    "label": "PT Serif",
    "category": "serif",
    "slug": "ptserif"
  },
  {
    "family": "IBM Plex Sans",
    "label": "IBM Plex Sans",
    "category": "sans",
    "slug": "ibmplexsans"
  },
  {
    "family": "IBM Plex Serif",
    "label": "IBM Plex Serif",
    "category": "serif",
    "slug": "ibmplexserif"
  },
  {
    "family": "IBM Plex Mono",
    "label": "IBM Plex Mono",
    "category": "mono",
    "slug": "ibmplexmono"
  },
  {
    "family": "Caveat",
    "label": "Caveat",
    "category": "handwriting",
    "slug": "caveat"
  },
  {
    "family": "Permanent Marker",
    "label": "Permanent Marker",
    "category": "handwriting",
    "slug": "permanentmarker"
  },
  {
    "family": "Abril Fatface",
    "label": "Abril Fatface",
    "category": "display",
    "slug": "abrilfatface"
  },
  {
    "family": "Bangers",
    "label": "Bangers",
    "category": "display",
    "slug": "bangers"
  },
  {
    "family": "EB Garamond",
    "label": "EB Garamond",
    "category": "serif",
    "slug": "ebgaramond"
  },
  {
    "family": "Graduate",
    "label": "Graduate",
    "category": "display",
    "slug": "graduate"
  },
  {
    "family": "Gravitas One",
    "label": "Gravitas One",
    "category": "display",
    "slug": "gravitasone"
  },
  {
    "family": "Nixie One",
    "label": "Nixie One",
    "category": "display",
    "slug": "nixieone"
  },
  {
    "family": "Rammetto One",
    "label": "Rammetto One",
    "category": "display",
    "slug": "rammettoone"
  },
  {
    "family": "Titan One",
    "label": "Titan One",
    "category": "display",
    "slug": "titanone"
  },
  {
    "family": "Fredoka One",
    "label": "Fredoka One",
    "category": "display",
    "slug": "fredokaone"
  }
];
export const UI_FONT='Noto Sans';
export function boardFontOptions():readonly BoardFont[]{return [...FONT_OPTIONS,...userFontOptions().map(font=>({family:font.family,label:font.label,category:'display' as const,slug:font.family}))];}
export const FONT_SOURCES={miro:'https://help.miro.com/hc/en-us/articles/360017572114-Fonts',google:'https://github.com/google/fonts',inter:'https://rsms.me/inter/',figtree:'https://github.com/erikdkennedy/figtree'};
const sheets=new Map<string,Promise<void>>();
let initialized:Promise<void>|undefined;
function register(font:BoardFont):Promise<void>{let loading=sheets.get(font.family);if(loading)return loading;loading=new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/fonts/'+font.slug+'.css';link.onload=()=>resolve();link.onerror=()=>reject(new Error('Não foi possível carregar '+font.family));document.head.append(link);});sheets.set(font.family,loading);return loading;}
/** Registers every local family. Only primary UI families are eagerly downloaded. */
export function ensureFonts():Promise<void>{return initialized??=(async()=>{await initializeUserFonts().catch(()=>{});await Promise.all(FONT_OPTIONS.map(register));await Promise.all(['Noto Sans','Inter','Figtree'].map(loadBoardFont));})();}
const loaded=new Map<string,Promise<void>>();
/** Resolves only when real font bytes are available, avoiding a fallback-text flash in Pixi. */
export function loadBoardFont(family:string):Promise<void>{const name=fontFamilyName(family);if(name.startsWith('BoardCustom-'))return initializeUserFonts().then(()=>loadUserFont(name));const option=FONT_OPTIONS.find(f=>f.family.toLowerCase()===name.toLowerCase());if(!option)return Promise.resolve();let task=loaded.get(option.family);if(task)return task;task=(async()=>{await register(option);await document.fonts.load('400 18px "'+option.family+'"','Ação — Aa0123');await document.fonts.load('italic 400 18px '+String.fromCharCode(34)+option.family+String.fromCharCode(34),'Ação — Aa0123');await document.fonts.load('italic 700 18px '+String.fromCharCode(34)+option.family+String.fromCharCode(34),'Ação — Aa0123');await document.fonts.load('700 18px "'+option.family+'"','Ação — Aa0123');})();loaded.set(option.family,task);return task;}

const svgFontSheets=new Map<string,Promise<string>>();
/** Make exported SVG and raster thumbnails independent of installed system fonts. */
export async function embedSvgFonts(svg:string,families:string[]):Promise<string>{
  const options=FONT_OPTIONS.filter(f=>families.some(name=>fontFamilyName(name).toLowerCase()===f.family.toLowerCase()));
  const sheets=await Promise.all(options.map(font=>{
    let task=svgFontSheets.get(font.family);if(task)return task;
    task=(async()=>{let css=await (await fetch('/fonts/'+font.slug+'.css')).text();const urls=[...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1]!.replace(/["']/g,'').trim()))];
      for(const url of urls){const absolute=new URL(url,location.origin+'/fonts/'+font.slug+'.css');const blob=await (await fetch(absolute)).blob();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});css=css.split(url).join(data);}return css;})();
    svgFontSheets.set(font.family,task);return task;
  }));
  const custom=snapshotUserFonts(families).map(font=>`@font-face{font-family:"${font.family}";font-style:normal;font-weight:400;src:url("${font.src}") format("${font.format}");}`);
  return svg.replace(/(<svg[^>]*>)/,'$1<defs><style type="text/css"><![CDATA['+[...sheets,...custom].join('\n')+']]></style></defs>');
}
