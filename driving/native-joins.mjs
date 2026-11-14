import {vehicle,DEFAULT_MODEL} from './vehicles.js';
import {randomBytes,createHash,createHmac} from 'node:crypto';
const digest=v=>createHash('sha256').update(v).digest('hex');
export function nativePassword(room,actor,steamId,key,now=Date.now(),model=DEFAULT_MODEL){
 vehicle(model);
 if(!/^[a-f0-9-]{36}$/i.test(actor)||!/^7656119[0-9]{10}$/.test(steamId))throw Error('Invalid native identity');
 const payload=Buffer.from([actor,steamId,Math.floor(now/1000)+90,randomBytes(12).toString('base64url')].join('|')).toString('base64url');
 return 'mg1.'+payload+'.'+createHmac('sha256',key).update(room+'|'+model+'|'+payload).digest('base64url');
}
export class NativeJoins {
 constructor(sessions,clock=Date.now){this.sessions=sessions;this.clock=clock;this.pending=new Map();this.leases=new Map();}
 sweep(){for(const [key,v] of this.pending)if(v.expires<=this.clock())this.pending.delete(key);for(const [key,v] of this.leases)if(v.expires<=this.clock())this.leases.delete(key);}
 available(actor){this.sweep();if(this.leases.has(actor)||[...this.sessions.values()].some(s=>s.players.has(actor)||[...s.tickets.values()].some(t=>t.actor===actor)||s.relay.nativeVehicles().some(c=>c.account===actor)))throw Error('Already connected or joining');}
 issue(actor,room,model=DEFAULT_MODEL){
  vehicle(model);
  if(!/^[a-f0-9-]{36}$/i.test(actor))throw Error('Invalid account');this.available(actor);
  const s=this.sessions.get(room);if(!s?.ready)throw Error('Native server unavailable');if(!s.nativeSlots&&model!==DEFAULT_MODEL)throw Error('Car unavailable in this native session');
  if(s.nativeSlots){const count=s.nativeSlots.filter(slot=>slot.model===model).length,native=s.relay.nativeVehicles(),used=native.filter(c=>c.model===model).length+[...this.leases].filter(([id,g])=>g.room===room&&g.model===model&&!native.some(c=>c.account===id)).length;if(used>=count)throw Error('No native seat for this car');}
  if(this.pending.size>=1000)throw Error('Join queue full');
  const token=randomBytes(32).toString('base64url'),expires=this.clock()+90000;this.pending.set(digest(token),{actor,room,model,expires});this.leases.set(actor,{expires,room,model});
  return {schema:2,room,...s.native,model,authorization:token,expiresAt:expires};
 }
 redeem(token,steamId){
  this.sweep();if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||!/^7656119[0-9]{10}$/.test(steamId))throw Error('Invalid native authorization');
  const key=digest(token),grant=this.pending.get(key);if(!grant)throw Error('Native authorization expired or already used');
  const s=this.sessions.get(grant.room);if(!s?.ready)throw Error('Native server unavailable');
  this.pending.delete(key);this.leases.set(grant.actor,{expires:this.clock()+90000,room:grant.room,model:grant.model});
  return {schema:2,room:grant.room,...s.native,model:grant.model,password:s.relay.nativePassword(grant.actor,steamId,grant.model),expiresAt:this.clock()+90000};
 }
}
