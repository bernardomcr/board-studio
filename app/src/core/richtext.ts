/** Local inline text format: **bold**, *italic*, __underline__, ~~strike~~ and links. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
}
type Marks=Omit<Run,'text'>;
const escapeHtml=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const equalMarks=(a:Marks,b:Marks)=>!!a.bold===!!b.bold&&!!a.italic===!!b.italic&&!!a.underline===!!b.underline&&!!a.strike===!!b.strike&&a.link===b.link;
function append(runs:Run[],text:string,marks:Marks={}){
  if(!text)return;const last=runs[runs.length-1];if(last&&equalMarks(last,marks))last.text+=text;else runs.push({...marks,text});
}
function safeLink(url:string):string|undefined {
  const value=url.trim();return /^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(value)?value:undefined;
}
function closing(text:string,token:string,start:number):number {
  for(let i=start;i<=text.length-token.length;i++){if(text[i]==='\\'){i++;continue;}if(text.startsWith(token,i))return i;}return -1;
}
function parseLine(text:string,marks:Marks={},depth=0):Run[] {
  if(depth>20)return [{...marks,text}];const runs:Run[]=[];
  for(let i=0;i<text.length;){
    if(text[i]==='\\'&&i+1<text.length&&'\\*_~[]()'.includes(text[i+1]!)){append(runs,text[i+1]!,marks);i+=2;continue;}
    if(text[i]==='['){const labelEnd=closing(text,'](',i+1);if(labelEnd>=0){let end=labelEnd+2,balance=1;for(;end<text.length;end++){if(text[end]==='\\'){end++;continue;}if(text[end]==='(')balance++;if(text[end]===')'&&--balance===0)break;}if(balance===0){const url=safeLink(text.slice(labelEnd+2,end));if(url){for(const run of parseLine(text.slice(i+1,labelEnd),{...marks,link:url},depth+1))append(runs,run.text,run);i=end+1;continue;}}}}
    const token=['***','**','__','~~','*','_'].find(t=>text.startsWith(t,i));
    if(token){const end=closing(text,token,i+token.length);if(end>i+token.length){const next={...marks};if(token==='***'){next.bold=true;next.italic=true;}else if(token==='**')next.bold=true;else if(token==='__')next.underline=true;else if(token==='~~')next.strike=true;else next.italic=true;for(const run of parseLine(text.slice(i+token.length,end),next,depth+1))append(runs,run.text,run);i=end+token.length;continue;}}
    append(runs,text[i]!,marks);i++;
  }
  return runs.length?runs:[{...marks,text:''}];
}
export function parseRich(content:string):Run[][] {return content.split('\n').map(line=>parseLine(line));}
export function plainText(content:string):string {return parseRich(content).map(line=>line.map(run=>run.text).join('')).join('\n');}
export function toHtml(content:string):string {
  return parseRich(content).map(line=>line.map(run=>{let html=escapeHtml(run.text);if(run.bold)html='<b>'+html+'</b>';if(run.italic)html='<i>'+html+'</i>';if(run.underline)html='<u>'+html+'</u>';if(run.strike)html='<s>'+html+'</s>';if(run.link)html='<a href="'+escapeHtml(run.link)+'">'+html+'</a>';return html;}).join('')).join('<br>');
}
function serialize(run:Run):string {
  let text=run.text.replace(/([\\*_~\[\]])/g,'\\$1');
  if(!text)return '';if(run.italic)text='_'+text+'_';if(run.bold)text='**'+text+'**';if(run.underline)text='__'+text+'__';if(run.strike)text='~~'+text+'~~';if(run.link)text='['+text+']('+run.link.replace(/\(/g,'%28').replace(/\)/g,'%29')+')';return text;
}
/** Preserve inherited marks from native contenteditable tags and CSS spans. */
export function fromHtml(html:string):string {
  const doc=new DOMParser().parseFromString(html,'text/html'),runs:Run[]=[];
  const newline=()=>append(runs,'\n');
  const endsNewline=()=>runs[runs.length-1]?.text.endsWith('\n');
  const walk=(node:Node,marks:Marks={})=>{
    if(node.nodeType===Node.TEXT_NODE){append(runs,(node.textContent??'').replace(/\u00a0/g,' '),marks);return;}
    if(node.nodeType!==Node.ELEMENT_NODE)return;const el=node as HTMLElement,tag=el.tagName;
    if(['SCRIPT','STYLE','IFRAME','OBJECT'].includes(tag))return;if(tag==='BR'){newline();return;}
    const block=['DIV','P','LI'].includes(tag);if(block&&runs.length&&!endsNewline())newline();
    const next={...marks},weight=el.style.fontWeight,decoration=el.style.textDecorationLine||el.style.textDecoration;
    if(tag==='B'||tag==='STRONG'||weight==='bold'||Number(weight)>=600)next.bold=true;
    if(tag==='I'||tag==='EM'||el.style.fontStyle==='italic')next.italic=true;
    if(tag==='U'||decoration.includes('underline'))next.underline=true;
    if(['S','DEL','STRIKE'].includes(tag)||decoration.includes('line-through'))next.strike=true;
    if(tag==='A'){const link=safeLink(el.getAttribute('href')??'');if(link)next.link=link;}
    for(const child of [...el.childNodes])walk(child,next);
    if(block&&el.nextSibling&&!endsNewline())newline();
  };
  for(const child of [...doc.body.childNodes])walk(child);
  const lines:Run[][]=[[]];for(const run of runs){const pieces=run.text.split('\n');pieces.forEach((piece,i)=>{if(i)lines.push([]);append(lines[lines.length-1]!,piece,run);});}
  return lines.map(line=>line.map(serialize).join('')).join('\n');
}
