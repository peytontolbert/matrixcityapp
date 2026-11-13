import {randomBytes,createHash,createHmac} from 'node:crypto';
const digest=v=>createHash('sha256').update(v).digest('hex');
export function nativePassword(room,actor,steamId,key,now=Date.now()){
 if(!/^[a-f0-9-]{36}$/i.test(actor)||!/^7656119[0-9]{10}$/.test(steamId))throw Error('Invalid native identity');
 const payload=Buffer.from([actor,steamId,Math.floor(now/1000)+90,randomBytes(12).toString('base64url')].join('|')).toString('base64url');
 return 'mg1.'+payload+'.'+createHmac('sha256',key).update(room+'|'+payload).digest('base64url');
}
export class NativeJoins {
 constructor(sessions,clock=Date.now){this.sessions=sessions;this.clock=clock;this.pending=new Map();this.leases=new Map();}
 sweep(){for(const [key,v] of this.pending)if(v.expires<=this.clock())this.pending.delete(key);for(const [key,v] of this.leases)if(v<=this.clock())this.leases.delete(key);}
 available(actor){this.sweep();if(this.leases.has(actor)||[...this.sessions.values()].some(s=>s.players.has(actor)||[...s.tickets.values()].some(t=>t.actor===actor)||s.relay.nativeVehicles().some(c=>c.account===actor)))throw Error('Already connected or joining');}
 issue(actor,room){
  if(!/^[a-f0-9-]{36}$/i.test(actor))throw Error('Invalid account');this.available(actor);
  const s=this.sessions.get(room);if(!s?.ready)throw Error('Native server unavailable');if(this.pending.size>=1000)throw Error('Join queue full');
  const token=randomBytes(32).toString('base64url'),expires=this.clock()+90000;this.pending.set(digest(token),{actor,room,expires});this.leases.set(actor,expires);
  return {schema:2,room,...s.native,model:'06_ygt_53_nissan_350z',authorization:token,expiresAt:expires};
 }
 redeem(token,steamId){
  this.sweep();if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||!/^7656119[0-9]{10}$/.test(steamId))throw Error('Invalid native authorization');
  const key=digest(token),grant=this.pending.get(key);if(!grant)throw Error('Native authorization expired or already used');
  const s=this.sessions.get(grant.room);if(!s?.ready)throw Error('Native server unavailable');
  this.pending.delete(key);this.leases.set(grant.actor,this.clock()+90000);
  return {schema:2,room:grant.room,...s.native,model:'06_ygt_53_nissan_350z',password:s.relay.nativePassword(grant.actor,steamId),expiresAt:this.clock()+90000};
 }
}
