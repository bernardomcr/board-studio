import type {Point} from './camera';

/** Screen-space inertia stays consistent at every board zoom. */
export class PanMomentum {
  private samples:Array<Point&{time:number}>=[];
  private velocity={x:0,y:0};
  private last=0;
  private started=0;
  active=false;
  stop(){this.active=false;this.velocity={x:0,y:0};this.samples=[];}
  begin(point:Point,time:number){this.stop();this.samples=[{...point,time}];}
  move(point:Point,time:number){this.samples.push({...point,time});while(this.samples.length>2&&this.samples[1]!.time<time-90)this.samples.shift();}
  release(time:number){
    const last=this.samples.at(-1),first=this.samples[0];this.active=false;
    if(!first||!last||time-last.time>80||last.time-first.time<8)return;
    const dt=last.time-first.time;
    this.velocity={x:(last.x-first.x)/dt,y:(last.y-first.y)/dt};
    const speed=Math.hypot(this.velocity.x,this.velocity.y);
    if(speed<.08)return;if(speed>3.5){this.velocity.x*=3.5/speed;this.velocity.y*=3.5/speed;}
    this.last=time;this.started=time;this.active=true;this.samples=[];
  }
  tick(time:number):Point{
    if(!this.active)return {x:0,y:0};
    if(time-this.last>180||time-this.started>1400){this.stop();return {x:0,y:0};}
    const dt=Math.max(0,time-this.last);this.last=time;const decay=Math.exp(-dt/180);
    const delta={x:this.velocity.x*180*(1-decay),y:this.velocity.y*180*(1-decay)};
    this.velocity.x*=decay;this.velocity.y*=decay;
    if(Math.hypot(this.velocity.x,this.velocity.y)<.015)this.stop();
    return delta;
  }
}
