import type {Command} from './commands';
import type {Widget} from './model';

/** Older boards always painted frames behind objects, regardless of their stored z. */
export function migrateFrameCommands(commands:Command[],frameIds:Set<string>):Command[]{
  return commands.map(raw=>{
    const c=structuredClone(raw),p=c.payload as {id?:string;patch?:Record<string,unknown>;ids?:string[];commands?:Command[]};
    if(c.op==='BATCH'&&p.commands)p.commands=migrateFrameCommands(p.commands,frameIds);
    if(c.op==='WIDGET_UPDATE'&&p.id&&frameIds.has(p.id)&&p.patch)delete p.patch.z;
    if(c.op==='WIDGET_REORDER'&&p.ids)p.ids=p.ids.filter(id=>!frameIds.has(id));
    return c;
  });
}
export function migrateFrameSnapshots(widgets:Widget[]):Widget[]{
  const bottom=Math.min(0,...widgets.map(w=>w.z));let i=0;
  return widgets.map(w=>w.type==='frame'?{...w,z:bottom-(++i)}:w);
}
