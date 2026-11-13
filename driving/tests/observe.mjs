// Read a paired staging session through a real browser ticket. No native control.
import {WebSocket} from 'ws';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Assets} from '../assets.js';
import {loadWorld} from '../world.js';
const base=process.env.DRIVING_STAGE_URL;
if(!base||!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback staging URL required');
const room=process.env.DRIVING_ROOM||'nohesi-110';
const config=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8'));
if(config.assets.indexFile)config.assets.index=JSON.parse(await readFile(config.assets.indexFile,'utf8'));
new Assets(config.assets).install();const world=await loadWorld(room);
const actor=randomUUID(),authorization='Bearer '+await readFile(config.keyFile,'utf8');
const response=await fetch(base+'/ticket',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({room,actor})});
const ticket=await response.json();if(!response.ok)throw Error(ticket.error);
const ws=new WebSocket(base.replace('http','ws')+'/socket',{headers:{authorization,'x-player':actor,'x-ticket':ticket.ticket,'x-room':room}});
const frames=[];
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{ws.close();frames.length?resolve():reject(Error('No states'));},Math.min(60000,Number(process.env.DRIVING_OBSERVE_MS)||5000));
 ws.on('error',e=>{clearTimeout(timer);ws.terminate();reject(e);});
 ws.on('message',raw=>{const data=JSON.parse(raw);if(data.type==='state'&&data.ready)frames.push(data);});
});
const latest=frames.at(-1),cars=[];
for(const car of latest.cars.filter(c=>c.kind!=='traffic')){
 await world.focus(car.position);const road=world.ground(...car.position,{maxRise:3,maxDrop:5});
 const first=frames[0].cars.find(c=>c.id===car.id);
 cars.push({kind:car.kind,position:car.position,heading:car.heading,pitch:car.pitch,ground:road?.z,heightAboveRoad:road?car.position[2]-road.z:null,moved:first?Math.hypot(...car.position.map((n,i)=>n-first.position[i])):null});
}
console.log(JSON.stringify({room,frames:frames.length,traffic:latest.cars.filter(c=>c.kind==='traffic').length,cars},null,2));
