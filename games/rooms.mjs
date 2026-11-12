import {randomBytes,createHash} from 'node:crypto';
export const MAPS=['q3dm1','q3dm2','q3dm3','q3dm4','q3dm5','q3dm6','q3dm7','q3dm8','q3dm9','q3dm10','q3dm11','q3dm12','q3dm13','q3dm14','q3dm15','q3dm16','q3dm17','q3dm18','q3dm19','q3tourney1','q3tourney2','q3tourney3','q3tourney4','q3tourney5','q3tourney6','q3ctf1','q3ctf2','q3ctf3','q3ctf4'];
export const fail=(condition,status,message)=>{if(!condition)throw Object.assign(Error(message),{status});};
const hash=x=>createHash('sha256').update(x).digest('hex');
export function settings(input={}){
 fail(input&&typeof input==='object'&&!Array.isArray(input),400,'Invalid settings');
 const out={map:input.map??'q3dm7',mode:input.mode??0,players:input.players??8,fraglimit:input.fraglimit??20,timelimit:input.timelimit??15};
 fail(MAPS.includes(out.map)&&[0,1,3,4].includes(out.mode),400,'Unsupported map or mode');
 fail(out.mode===4?out.map.startsWith('q3ctf'):!out.map.startsWith('q3ctf'),400,'Choose a map for this game mode');
 for(const [key,min,max] of [['players',2,8],['fraglimit',0,100],['timelimit',5,60]])fail(Number.isInteger(out[key])&&out[key]>=min&&out[key]<=max,400,'Invalid '+key);
 if(out.mode===1)out.players=2;return out;
}
export class Rooms {
 constructor({launch,now=()=>Date.now(),maxRooms=4}){this.launch=launch;this.now=now;this.maxRooms=maxRooms;this.rooms=new Map();this.tickets=new Map();this.pending=new Set();}
 cleanCode(value){fail(typeof value==='string'&&/^[A-F0-9]{16}$/.test(value.toUpperCase()),400,'Enter a valid invite code');return value.toUpperCase();}
 view(room,actor){return {code:room.code,settings:room.settings,host:room.owner===actor,players:room.members.size,connected:room.connections.size,expiresAt:room.expiresAt};}
 member(actor,code){const room=this.rooms.get(this.cleanCode(code));fail(room,404,'Room is closed or does not exist');fail(room.members.has(actor),403,'Join this room first');return room;}
 async request(actor,action,{code,settings:input}={}){
  fail(typeof actor==='string'&&/^[a-f0-9-]{36}$/.test(actor),401,'Invalid player');this.sweep();
  if(action==='mine')return {rooms:[...this.rooms.values()].filter(r=>r.members.has(actor)).map(r=>this.view(r,actor))};
  if(action==='create'){
   fail(!this.pending.has(actor)&&![...this.rooms.values()].some(r=>r.owner===actor),409,'You already host a room');
   fail(this.rooms.size+this.pending.size<this.maxRooms,503,'All game servers are busy. Try again shortly');
   const config=settings(input);this.pending.add(actor);let engine;
   try{
    engine=await this.launch(config);
    const room={code:randomBytes(8).toString('hex').toUpperCase(),owner:actor,settings:config,members:new Map([[actor,this.now()]]),connections:new Map(),engine,expiresAt:this.now()+4*3600000,lastActive:this.now()};
    this.rooms.set(room.code,room);engine.onExit?.(()=>this.close(room));return {room:this.view(room,actor)};
   }catch(e){engine?.stop();throw e;}finally{this.pending.delete(actor);}
  }
  if(action==='join'){
   const room=this.rooms.get(this.cleanCode(code));fail(room,404,'Room is closed or does not exist');
   fail(room.members.has(actor)||room.members.size<room.settings.players,409,'Room is full');room.members.set(actor,this.now());room.lastActive=this.now();return {room:this.view(room,actor)};
  }
  const room=this.member(actor,code);room.members.set(actor,this.now());
  if(action==='room')return {room:this.view(room,actor)};
  if(action==='close'){fail(room.owner===actor,403,'Only the host can close the room');this.close(room);return {ok:true};}
  if(action==='leave'){if(room.owner===actor)this.close(room);else{room.connections.get(actor)?.stop();room.connections.delete(actor);room.members.delete(actor);}return {ok:true};}
  if(action==='ticket'){
   // At most one unused ticket per player and room; only its hash is retained.
   for(const [key,t] of this.tickets)if(t.actor===actor&&t.code===room.code)this.tickets.delete(key);
   const ticket=randomBytes(32).toString('base64url');this.tickets.set(hash(ticket),{actor,code:room.code,expiresAt:this.now()+60000});return {ticket,expiresIn:60};
  }
  fail(false,404,'Unknown action');
 }
 admit(actor,ticket){
  this.sweep();fail(typeof ticket==='string'&&/^[A-Za-z0-9_-]{43}$/.test(ticket),401,'Invalid ticket');
  const key=hash(ticket),record=this.tickets.get(key);fail(record&&record.actor===actor&&record.expiresAt>this.now(),401,'Invalid or expired ticket');this.tickets.delete(key);
  const room=this.member(actor,record.code);fail(!room.connections.has(actor),409,'Already connected');
  room.connections.set(actor,{stop:()=>{}});room.lastActive=this.now();return room;
 }
 close(room){if(!this.rooms.delete(room.code))return;for(const c of room.connections.values())c.stop();for(const [key,t] of this.tickets)if(t.code===room.code)this.tickets.delete(key);room.engine.stop();}
 sweep(){
  const now=this.now();for(const [key,t] of this.tickets)if(t.expiresAt<=now)this.tickets.delete(key);
  for(const r of this.rooms.values()){
   for(const [actor,seen] of r.members)if(actor!==r.owner&&!r.connections.has(actor)&&now-seen>300000)r.members.delete(actor);
   if(r.connections.size)r.lastActive=now;
   if(r.expiresAt<=now||now-r.lastActive>600000)this.close(r);
  }
 }
 stop(){for(const r of this.rooms.values())this.close(r);}
}
