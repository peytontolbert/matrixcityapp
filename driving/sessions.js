import {randomBytes,createHash} from 'node:crypto';
import {vehicle,DEFAULT_MODEL} from './vehicles.js';
import {TrafficSurface} from './traffic-surface.js';
import {CutUpScoring,DrivingLeaderboard} from './scoring.mjs';
import {createAuthoritative110Traffic} from './traffic.js';
import {createCar,controls,NEUTRAL,STEP,stepCar,resolveCars,wireCar,vehicleBody} from './physics.js';
const hash=t=>createHash('sha256').update(t).digest('hex');
export class DrivingSession {
 constructor({room,world,profile,nativeSlots,relay,capacity=4,trafficCapacity=8,trafficPreset='heavy',native,clock=Date.now,leaderboard=new DrivingLeaderboard()}){
  if(capacity<1||trafficCapacity<1)throw Error('Invalid capacity');
  Object.assign(this,{room,world,profile,nativeSlots,relay,capacity,native,clock});this.players=new Map();this.tickets=new Map();this.loading=new Set();this.sequence=0;this.debt=0;this.ready=false;this.lastExchange=0;this.exchangeBusy=false;this.error=null;
  this.trafficSurface=new TrafficSurface(world);
  this.scoring=new CutUpScoring(room,leaderboard);this.scoreRows=new Map();this.collided=new Set();this.scoreAt=0;
  this.traffic=createAuthoritative110Traffic(world.network,{maximumPopulation:trafficCapacity,preset:trafficPreset,models:['prius'],surface:s=>this.trafficSurface.sample(s)});this.trafficCars=[];
 }
 ticket(actor){
  if(typeof actor!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(actor))throw Error('Invalid identity');
  this.sweep();if(!this.ready)throw Error('Native server is unavailable');
  if(this.players.has(actor)||[...this.tickets.values()].some(t=>t.actor===actor))throw Error('Already connected or joining');
  if(this.players.size+this.tickets.size>=this.capacity)throw Error('Session is full');
  const ticket=randomBytes(32).toString('base64url');this.tickets.set(hash(ticket),{actor,expires:this.clock()+30000});return {ticket,room:this.room};
 }
 admit(actor,ticket,send){
  this.sweep();const key=hash(String(ticket)),t=this.tickets.get(key);if(!t||t.actor!==actor||!this.ready)throw Error('Invalid or expired ticket');this.tickets.delete(key);
  if(this.players.has(actor)||this.players.size>=this.capacity)throw Error('Session is full');
  const position=this.spawnPosition();if(!position)throw Error('Pit is occupied; try again');
  const car=createCar('browser:'+actor,{...this.world.spawn,position},this.profile);car.lastInput=this.clock();this.players.set(actor,{car,send});
  return car.id;
 }
 spawnPosition(exclude){
  const s=this.world.spawn,c=Math.cos(s.heading),h=Math.sin(s.heading);
  for(let i=0;i<16;i++){
   const p=[s.position[0]-c*i*6,s.position[1]-h*i*6,s.position[2]],g=this.world.ground(...p,{maxRise:2,maxDrop:3});
   if(!g||!Number.isFinite(g.z))continue;p[2]=g.z;
   if([-1.35,0,1.35].some(offset=>this.world.wall?.(p[0]+c*offset,p[1]+h*offset,p[2]+.12,.88,1.25,.24,0,0,.24)))continue;
   if([...this.players.values()].some(v=>v.car.id!==exclude&&Math.hypot(v.car.position[0]-p[0],v.car.position[1]-p[1])<6))continue;
   if(this.relay.nativeVehicles().some(v=>Math.hypot(v.position[0]-p[0],v.position[1]-p[1])<6))continue;
   if(this.trafficCars.some(v=>Math.hypot(v.position[0]-p[0],v.position[1]-p[1])<6))continue;return p;
  }return null;
 }
 input(actor,raw){const p=this.players.get(actor);if(!p)throw Error('Not admitted');const input=controls(raw);if(raw.sequence<=p.car.lastSequence)throw Error('Replayed input');p.car.lastSequence=raw.sequence;p.car.lastInput=this.clock();p.car.input=input;}
 recover(actor){
  const p=this.players.get(actor);if(!p)throw Error('Not admitted');const now=this.clock();
  if(now-(p.lastRecovery??-Infinity)<10000)return 'Wait 10 seconds between pit recoveries.';
  if(now-(p.lastRecoveryAttempt??-Infinity)<1000)return 'Wait a moment before trying again.';p.lastRecoveryAttempt=now;
  if(!this.ready)return 'Wait for the server to reconnect.';
  if(Math.hypot(...p.car.velocity.slice(0,2))>2&&p.car.contacts>0)return 'Stop the car before returning to pits.';
  const position=this.spawnPosition(p.car.id);if(!position)return 'Pit is occupied. Try again shortly.';
  const next=createCar(p.car.id,{...this.world.spawn,position},this.profile);next.lastInput=now;next.lastSequence=p.car.lastSequence;p.car=next;p.lastRecovery=now;
  return 'Returned to pits.';
 }
 remove(actor){this.players.delete(actor);this.scoring.reset(actor);this.scoreRows.delete(actor);}
 fail(error){this.fault=String(error?.message||error);this.ready=false;this.error=this.fault;for(const p of this.players.values())p.car.input={...NEUTRAL};}
 sweep(){for(const [key,t] of this.tickets)if(t.expires<=this.clock())this.tickets.delete(key);}
 advance(elapsed){
  this.sweep();this.debt+=Math.min(.1,Math.max(0,elapsed));
  const now=this.clock();if(now-this.lastExchange>1500)this.ready=false;
  this.nativeBodies??=new Map();const samples=this.relay.nativeVehicles(),liveNative=new Set(samples.map(v=>v.id));for(const id of this.nativeBodies.keys())if(!liveNative.has(id))this.nativeBodies.delete(id);
  const natives=samples.map(v=>{const previous=this.nativeBodies.get(v.id);if(previous&&previous.sampleTime===v.sampleTime&&previous.model===v.model&&previous.account===v.account&&previous.coupled===v.coupled)return previous;const body={...v,kind:'native',kinematic:!v.coupled,...((v.model??DEFAULT_MODEL)===DEFAULT_MODEL?vehicleBody(this.profile):(({mass,length,width,height})=>({mass,length,width,height}))(vehicle(v.model)))};this.nativeBodies.set(v.id,body);return body;});
  if(!this.ready){for(const p of this.players.values())p.car.input={...NEUTRAL};this.debt=0;return;}
  const nativeBefore=new Map(natives.map(v=>[v.id,[...v.velocity]]));
  const interest=[...this.players.values()].map(p=>({x:p.car.position[0],y:p.car.position[1],feetZ:p.car.position[2],velocity:p.car.velocity,heading:p.car.heading})).concat(natives.map(v=>({x:v.position[0],y:v.position[1],feetZ:v.position[2],velocity:v.velocity,heading:v.heading})));
  if(!interest.length)interest.push({x:this.world.spawn.position[0],y:this.world.spawn.position[1],feetZ:this.world.spawn.position[2],heading:this.world.spawn.heading,velocity:[0,0,0]});
  this.traffic.update(Math.min(.1,elapsed),now,interest);
  const traffic=this.traffic.snapshot().agents.map(a=>({id:'traffic:'+a.id,kind:'traffic',model:'nohesi_traffic_toyota_prius',position:[a.x,a.y,a.feetZ],velocity:[Math.cos(a.heading)*a.speedMps,Math.sin(a.heading)*a.speedMps,Math.tan(a.pitch)*a.speedMps],heading:a.heading,pitch:a.pitch,roll:a.roll,spawnGeneration:a.spawnGeneration,brake:a.brake,lights:(this.relay.environment?.hour??14)<7||(this.relay.environment?.hour??14)>18,kinematic:true,mass:1450,length:4.5,width:1.8,height:1.5}));
  this.trafficCars=traffic;
  while(this.debt>=STEP){
   this.debt-=STEP;
   const cars=[...this.players.values()].map(p=>p.car);
   for(const car of cars){const damage=car.damage;if(now-car.lastInput>400)car.input={...NEUTRAL};if(!car.streaming)stepCar(car,this.world);if(car.damage>damage)this.collided.add(car.id);}
   for(const native of natives)if(native.coupled)for(const other of traffic)if(resolveCars(native,other))this.collided.add(native.id);
   for(let i=0;i<cars.length;i++){
    for(let j=i+1;j<cars.length;j++)if(resolveCars(cars[i],cars[j])){this.collided.add(cars[i].id);this.collided.add(cars[j].id);}
    for(const other of [...natives,...traffic])if(resolveCars(cars[i],other)){this.collided.add(cars[i].id);this.collided.add(other.id);}
   }
  }
  for(const n of natives){const before=nativeBefore.get(n.id),delta=n.velocity.map((v,i)=>v-before[i]);if(Math.hypot(...delta)>.001)this.relay.impact?.(n,delta);}
  if(now-this.scoreAt>=50){this.scoreAt=now;const actors=new Set();for(const [actor,{car}]of this.players){actors.add(actor);this.scoreRows.set(actor,{id:car.id,...this.scoring.update(actor,car,traffic,now,this.collided.has(car.id))});}for(const car of samples)if(car.account){actors.add(car.account);this.scoreRows.set(car.account,{id:car.id,...this.scoring.update(car.account,{...car,kind:'native'},traffic,now,this.collided.has(car.id)||car.collision)});}for(const actor of this.scoreRows.keys())if(!actors.has(actor)){this.scoreRows.delete(actor);this.scoring.reset(actor);}this.collided.clear();}
 }
 async exchange(){
  if(this.exchangeBusy)return;this.exchangeBusy=true;
  try{
   const keep=[this.world.spawn.position];
   for(const [actor,{car,send}] of this.players){
    const ray=this.world.collision?.ray?.bind(this.world.collision),origin=[...car.position];origin[2]+=1.6;
    const hit=ray?.(origin,[-Math.cos(car.heading),-Math.sin(car.heading),0],5.5);
    car.cameraDistance=hit?Math.max(.2,Math.min(5.5,hit.distance-.25)):5.5;
    car.streaming=this.world.readyAt?.(car.position)===false;
    const ahead=car.position.map((v,i)=>v+Math.max(-100,Math.min(100,car.velocity[i]*2)));keep.push(car.position,ahead);
    if(!this.loading.has(car.id)){this.loading.add(car.id);Promise.resolve().then(()=>this.world.focus(ahead)).catch(()=>{if(!this.closed&&this.players.has(actor)){send({type:'error',error:'Road assets unavailable. Please rejoin.'});this.remove(actor);}}).finally(()=>this.loading.delete(car.id));}
   }
   for(const native of this.relay.nativeVehicles()){keep.push(native.position);this.trafficSurface.request(native.position);}
   keep.push(...this.trafficCars.map(c=>c.position),...this.trafficSurface.keep.values());this.world.trim?.(keep);
   this.world.grip=this.relay.environment?.grip??1;
   this.world.wetness=this.relay.environment?.wetness??0;
   const top=this.scoring.board.top(this.room),scores=this.relay.nativeVehicles().filter(n=>n.account&&this.scoreRows.has(n.account)).map(n=>{const row=this.scoreRows.get(n.account);return {slot:Number(n.id.split(':')[1]),account:n.account,score:Math.min(2147483647,row.score),combo:row.combo,passes:row.passes,rank:top.find(r=>r.driver===row.driver)?.rank||0,leaders:top.slice(0,3)};});
   const result=await this.relay.exchange([...this.players.values()].map(p=>wireCar(p.car)).concat(this.trafficCars),scores);
   this.ready=result.ready===true&&!this.fault;if(this.ready)this.lastExchange=this.clock();this.error=this.fault||(this.ready?null:result.reason);
   // A bridge allocation failure must not produce browser-only ghost cars.
   for(const failure of result.rejected||[])for(const [id,p] of this.players)if(p.car.id===failure.id){p.send({type:'error',error:'Native car slot unavailable'});this.remove(id);}
   const state=this.snapshot();for(const p of this.players.values())p.send({...state,you:p.car.id});
  }finally{this.exchangeBusy=false;}
 }
 snapshot(){return {type:'state',schema:1,room:this.room,scores:[...this.scoreRows.values()],leaderboard:this.scoring.board.top(this.room),environment:this.relay.environment,sequence:++this.sequence,serverTime:this.clock(),ready:this.ready,cars:[...this.players.values()].map(p=>wireCar(p.car)).concat(this.trafficCars.map(wireCar),this.relay.nativeVehicles().map(v=>wireCar({...v,kind:'native'})))};}
 info(){return {cars:[...new Set((this.nativeSlots||[{model:DEFAULT_MODEL}]).map(s=>s.model))].map(id=>({id,name:vehicle(id).name})),nativePlayers:this.relay.nativeVehicles().length,nativeCapacity:this.nativeSlots?.length||4,room:this.room,ready:this.ready,browserPlayers:this.players.size,capacity:this.capacity,native:this.native,spawn:this.world.spawn,model:'06_ygt_53_nissan_350z'};}
 async close(){this.closed=true;this.players.clear();this.tickets.clear();await this.relay.exchange([]);}
}
