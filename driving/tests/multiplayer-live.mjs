// Explicit loopback staging only. Two independent WebSocket clients per track.
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base=process.env.DRIVING_STAGE_URL;
if(!base||new URL(base).hostname!=='127.0.0.1')throw Error('Explicit loopback stage required');
const config=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8')),authorization='Bearer '+await readFile(config.keyFile,'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),reports=[];
async function until(check,ms=12000){const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw Error('Timed out waiting for multiplayer state');await wait(40);}}
async function connect(room){
 const actor=randomUUID(),r=await fetch(base+'/ticket',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({room,actor})}),ticket=await r.json();assert.ok(r.ok,JSON.stringify(ticket));
 const c={frames:new Map(),state:null,errors:[],sequence:0};
 c.ws=new WebSocket(base.replace('http','ws')+'/socket',{headers:{authorization,'x-player':actor,'x-ticket':ticket.ticket,'x-room':room}});
 c.ws.on('error',e=>c.errors.push(e.message));c.ws.on('message',bytes=>{const s=JSON.parse(bytes);if(s.type==='error')c.errors.push(s.error);if(s.type==='state'&&s.ready){c.state=s;c.frames.set(s.sequence,s);if(c.frames.size>100)c.frames.delete(c.frames.keys().next().value);}});
 c.close=()=>{clearInterval(c.timer);c.ws.close();};
 await until(()=>c.state||c.errors.length);assert.deepEqual(c.errors,[]);return c;
}
try{
 for(const [index,room] of ['nohesi-110','nohesi-415'].entries()){
  const expectedTraffic=config.sessions.find(s=>s.room===room).slots.filter(s=>s.kind==='traffic').length;const clients=[];
  try{
   const a=await connect(room);clients.push(a);const b=await connect(room);clients.push(b);
   await until(()=>a.state.cars.some(c=>c.id===b.state.you));
   const start=a.state.cars.find(c=>c.id===a.state.you).position,trafficStart=new Map(a.state.cars.filter(c=>c.kind==='traffic').map(c=>[c.id,c.position]));
   const send=(c,throttle)=>c.ws.send(JSON.stringify({type:'input',sequence:c.sequence++,throttle,brake:throttle?0:1,steer:0,handbrake:0,direction:1}));
   a.timer=setInterval(()=>send(a,1),33);b.timer=setInterval(()=>send(b,0),33);
   await wait(4000);let matches=0;
   for(const [sequence,s] of a.frames){const other=b.frames.get(sequence);if(!other)continue;assert.deepEqual(s.cars,other.cars,'Clients disagree on authoritative cars');matches++;}
   assert.ok(matches>20,'Too few common snapshots');assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
   const moved=Math.hypot(...a.state.cars.find(c=>c.id===a.state.you).position.map((v,i)=>v-start[i]));assert.ok(moved>1,'Driver did not move');
   const traffic=a.state.cars.filter(c=>c.kind==='traffic');assert.equal(traffic.length,expectedTraffic);
   assert.ok(traffic.some(c=>trafficStart.has(c.id)&&Math.hypot(...c.position.map((v,i)=>v-trafficStart.get(c.id)[i]))>1),'Traffic did not move');
   const listing=await(await fetch('http://127.0.0.1:'+(18081+index)+'/JSON%7C0')).json();
   assert.equal(listing.Cars.filter(c=>c.DriverName==='Traffic').length,expectedTraffic);assert.ok(listing.Cars.filter(c=>c.DriverName==='Browser driver').length>=2);
   const old=b.state.you;b.close();await until(()=>!a.state.cars.some(c=>c.id===old));
   const joined=await connect(room);clients.push(joined);await until(()=>a.state.cars.some(c=>c.id===joined.state.you));
   reports.push({room,matchingSnapshots:matches,driverMovedM:moved,traffic:expectedTraffic,nativeListingMatches:true,disconnectAndRejoin:true,nativeDrivers:a.state.cars.filter(c=>c.kind==='native').length});
  }finally{for(const c of clients)c.close();}
  await wait(250);
 }
 console.log(JSON.stringify({passed:true,reports},null,2));
}catch(e){console.error(e);process.exitCode=1;}
