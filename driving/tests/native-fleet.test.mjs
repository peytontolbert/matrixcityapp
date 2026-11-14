import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {NativeJoins,nativePassword} from '../native-joins.mjs';
import {VEHICLES,DEFAULT_MODEL} from '../vehicles.js';
import {DrivingSession} from '../sessions.js';
const key='fixture-private-key',steam='76561198000000000',actor=i=>'11111111-1111-4111-8111-'+String(i).padStart(12,'0');
test('all reviewed native cars advertise and reserve their own seats and signatures',()=>{
 let now=100000;const s={ready:true,players:new Map(),tickets:new Map(),native:{track:'nohesi_110'},nativeSlots:VEHICLES.map((v,slot)=>({slot,model:v.id})),relay:{nativeVehicles:()=>[],nativePassword:(a,id,m)=>nativePassword('nohesi-110',a,id,key,now,m)}};
 const joins=new NativeJoins(new Map([['nohesi-110',s]]),()=>now);
 for(const [i,v] of VEHICLES.entries()){
  const grant=joins.issue(actor(i),'nohesi-110',v.id);assert.equal(grant.model,v.id);assert.throws(()=>joins.issue(actor(i+100),'nohesi-110',v.id),/No native seat/);
  const redeemed=joins.redeem(grant.authorization,steam),[,payload,signature]=redeemed.password.split('.');assert.equal(redeemed.model,v.id);
  assert.equal(signature,createHmac('sha256',key).update('nohesi-110|'+v.id+'|'+payload).digest('base64url'));
  assert.notEqual(signature,createHmac('sha256',key).update('nohesi-110|wrong-car|'+payload).digest('base64url'));
  assert.throws(()=>joins.issue(actor(i+100),'nohesi-110',v.id),/No native seat/);
 }
 assert.throws(()=>joins.issue(actor(999),'nohesi-110','not-in-roster'),/Unsupported/);now+=90001;assert.ok(joins.issue(actor(1000),'nohesi-110',DEFAULT_MODEL));
});
test('native car contacts and directory use the reviewed roster while preserving default handling',()=>{
 const s=new DrivingSession({room:'nohesi-110',world:{network:{schema:'matrix-city-110-gameplay-v1',lanes:[]},spawn:{position:[0,0,0],heading:0}},profile:{mass:1837},nativeSlots:VEHICLES.map((v,slot)=>({slot,model:v.id})),relay:{nativeVehicles:()=>[]}});s.ready=true;s.lastExchange=Date.now();
 for(const v of VEHICLES){s.relay.nativeVehicles=()=>[{id:'native:0',model:v.id,account:v.id,coupled:true,position:[0,0,0],velocity:[0,0,0],heading:0,sampleTime:1}];s.advance(0);assert.equal(s.nativeBodies.get('native:0').mass,v.id===DEFAULT_MODEL?1837:v.mass);}
 const info=s.info();assert.equal(info.cars.length,21);assert.equal(info.nativeCapacity,21);assert.equal(info.nativePlayers,1);assert.equal(info.cars[0].name,VEHICLES[0].name);
});
