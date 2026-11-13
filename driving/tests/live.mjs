// Explicit isolated stage only; never runs as part of the public unit suite.
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base=process.env.DRIVING_STAGE_URL;if(!base||!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback staging URL required');
const origin=base,reports=[];
const config=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8')),authorization='Bearer '+await readFile(config.keyFile,'utf8');
for(const room of ['nohesi-110','nohesi-415']){
 const actor=randomUUID(),response=await fetch(base+'/ticket',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({room,actor})});const ticket=await response.json();assert.ok(response.ok,JSON.stringify(ticket));
 const ws=new WebSocket(base.replace('http','ws')+'/socket',{headers:{authorization,'x-player':actor,'x-ticket':ticket.ticket,'x-room':room}});
 let first,last,n=0,sequence=0,traffic=0,connected=false;const start=Date.now();
 await new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timeout);clearInterval(timer);ws.close();error?reject(error):resolve();};
  const timeout=setTimeout(()=>finish(Error('No complete driving state')),20000);
  const timer=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',sequence:sequence++,throttle:Date.now()-start<8000?1:0,brake:Date.now()-start<8000?0:1,steer:0,handbrake:0,direction:1}));},33);
  ws.on('error',finish);ws.on('message',data=>{const s=JSON.parse(data);if(s.type!=='state'||!s.ready)return;connected=true;const own=s.cars.find(c=>c.id===s.you);if(!own)return;first??=own;last=own;n++;traffic=Math.max(traffic,s.cars.filter(c=>c.kind==='traffic').length);if(Date.now()-start>10000)finish();});
 });
 assert.ok(connected&&n>30);assert.ok(traffic>0);const moved=Math.hypot(...last.position.map((v,i)=>v-first.position[i]));
 reports.push({room,snapshots:n,traffic,movedM:moved,first:first.position,last:last.position,speedMps:Math.hypot(...last.velocity)});
}
console.log(JSON.stringify({reports},null,2));
