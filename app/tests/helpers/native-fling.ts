// @ts-nocheck
import {expect} from '@playwright/test';
// Accelerate through the final three native points and release without waiting
// for their GPU ACKs. Observe delivery before sending the next point so Chrome
// cannot coalesce the flick's native moves. This keeps the 450ms save observation
// a real fast flick rather than a pause caused by software-renderer ACK latency.
export async function nativeFling(page,{x,y,dx,dy=0,steps=8,repeatSpace=false,captureReleaseState=false}){
 const client=await page.context().newCDPSession(page);
 await page.evaluate(captureReleaseState=>{const canvas=window.__board.app.canvas,controller=new AbortController(),moves=[],repeats=[],waiters=[],release={time:0,trusted:false};window.__nativeFlingMoveDelivered=count=>moves.length>=count?Promise.resolve():new Promise(resolve=>waiters.push({count,resolve}));window.__nativeFlingReady=new Promise(resolve=>{
  canvas.addEventListener('pointermove',event=>{if(event.buttons===1){moves.push({time:performance.now(),trusted:event.isTrusted});for(const waiter of waiters)if(moves.length>=waiter.count)waiter.resolve();}},{signal:controller.signal,capture:true});
  window.addEventListener('keydown',event=>{if(event.code==='Space')repeats.push({repeat:event.repeat,trusted:event.isTrusted});},{signal:controller.signal,capture:true});
  canvas.addEventListener('pointerup',event=>{release.time=performance.now();release.trusted=event.isTrusted;},{once:true,signal:controller.signal,capture:true});
  // Read active after the app's listener, but age the input at arrival rather
  // than including the selection/menu DOM work done by that listener.
  canvas.addEventListener('pointerup',()=>{controller.abort();const camera=window.__board.camera;resolve({moves:moves.length,allTrusted:release.trusted&&moves.every(sample=>sample.trusted)&&repeats.every(sample=>sample.trusted),lastSampleAge:release.time-moves.at(-1).time,span:moves.at(-1).time-moves[0].time,activeAtRelease:window.__board.navigation.active(),repeats:repeats.length,allRepeats:repeats.every(sample=>sample.repeat),...(captureReleaseState?{cameraAtRelease:{x:camera.x,y:camera.y,scale:camera.scale},drawsAtRelease:window.__renderSubmissions}:{})});},{once:true,signal:controller.signal});
 });},captureReleaseState);
 await page.mouse.move(x,y);await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});let observed;
 try{const tail=[];for(let i=1;i<=steps;i++){
  if(i<=steps-2)await new Promise(resolve=>setTimeout(resolve,16));const px=x+i*dx,py=y+i*dy,batch=[client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:px,y:py,button:'none',buttons:1})];
  if(repeatSpace)batch.push(client.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32,autoRepeat:true}));
  if(i===steps){batch.push(client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:px,y:py,button:'left',buttons:0,clickCount:1}));batch.push(client.send('Runtime.evaluate',{expression:'window.__nativeFlingReady',awaitPromise:true,returnByValue:true}));}
  if(i>steps-3)tail.push(...batch);else await Promise.all(batch);
  if(i>steps-3&&i<steps)await client.send('Runtime.evaluate',{expression:'window.__nativeFlingMoveDelivered('+i+')',awaitPromise:true,returnByValue:true});
  if(i===steps){const results=await Promise.all(tail);observed=results.at(-1).result.value;}
 }}finally{await client.detach();}
 console.log('NATIVE_FLING '+JSON.stringify(observed));expect(observed.moves).toBe(steps);expect(observed.allTrusted).toBe(true);expect(observed.span).toBeGreaterThanOrEqual(8);expect(observed.lastSampleAge).toBeLessThan(80);expect(observed.activeAtRelease).toBe(true);if(repeatSpace){expect(observed.repeats).toBe(steps);expect(observed.allRepeats).toBe(true);}return observed;
}
