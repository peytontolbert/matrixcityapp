// Requires the owned, stationary real native staging client. Never moves it by
// admin commands: a ticketed browser driver approaches through normal controls.
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base=process.env.DRIVING_STAGE_URL;
assert.equal(new URL(base).hostname,'127.0.0.1');
const config=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8'));
const authorization='Bearer '+await readFile(config.keyFile,'utf8'),room=process.env.DRIVING_ROOM||'nohesi-110';
const diagnostics=async()=> (await(await fetch(base+'/diagnostics',{headers:{authorization}})).json()).sessions.find(s=>s.room===room);
const start=await diagnostics();assert.equal(start.native.length,1,'Exactly one owned native test driver is required');assert.ok(start.native[0].coupled,'Native companion must acknowledge the server lease');assert.ok(Math.hypot(...start.native[0].velocity)<.2,'Native test must start stationary');
const actor=randomUUID(),r=await fetch(base+'/ticket',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({room,actor})});assert.ok(r.ok);const ticket=await r.json();
const ws=new WebSocket(base.replace('http','ws')+'/socket',{headers:{authorization,'x-player':actor,'x-ticket':ticket.ticket,'x-room':room}});
const frames=[];let sequence=0,timer,stop=false,peak=0,moved=0;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Native impact was not observed')),10000);
  ws.on('error',reject);ws.on('open',()=>timer=setInterval(()=>ws.send(JSON.stringify({type:'input',sequence:sequence++,throttle:stop?0:1,brake:stop?1:0,steer:0,handbrake:0,direction:1})),33));
  ws.on('message',raw=>{const s=JSON.parse(raw);if(s.type==='error'){clearTimeout(timeout);reject(Error(s.error));return;}if(s.type!=='state'||!s.ready)return;
   const n=s.cars.find(c=>c.kind==='native');if(!n)return;frames.push(s);
   peak=Math.max(peak,Math.hypot(...n.velocity));moved=Math.max(moved,Math.hypot(...n.position.map((v,i)=>v-start.native[0].position[i])));
   if(peak>.5&&moved>.15&&!stop){stop=true;clearTimeout(timeout);setTimeout(resolve,700);}
  });
 });
 assert.ok((await diagnostics()).native[0].coupled,'Companion lease dropped during contact');
 console.log(JSON.stringify({passed:true,room,snapshots:frames.length,nativePeakSpeedMps:peak,nativeDisplacementM:moved,realNativeImpulse:true},null,2));
}finally{clearInterval(timer);ws.close();}
