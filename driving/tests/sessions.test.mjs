import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingSession} from '../sessions.js';
const fixture=()=>{
 let time=100000;
 const session=new DrivingSession({room:'nohesi-110',world:{network:{schema:'matrix-city-110-gameplay-v1',lanes:[]},spawn:{position:[0,0,0],heading:0},focus:async()=>{}},profile:{},clock:()=>time,
  relay:{nativeVehicles:()=>[],exchange:async()=>({ready:true,rejected:[]})}});
 session.ready=true;return {session,advance:n=>time+=n};
};
test('tickets reserve capacity, are actor bound, and expire without leaking seats',()=>{
 const {session:s,advance}=fixture(),ticket=s.ticket('alice').ticket;
 assert.throws(()=>s.ticket('alice'),/Already/);assert.throws(()=>s.admit('bob',ticket,()=>{}),/Invalid/);
 for(const actor of ['b','c','d'])s.ticket(actor);assert.throws(()=>s.ticket('e'),/full/);
 advance(30001);assert.throws(()=>s.admit('alice',ticket,()=>{}),/expired/);assert.ok(s.ticket('e').ticket);
});
test('a simulation fault stays paused after a successful bridge exchange',async()=>{
 const {session:s}=fixture();s.fail(Error('Non-finite simulation'));await s.exchange();
 assert.equal(s.ready,false);assert.equal(s.error,'Non-finite simulation');assert.throws(()=>s.ticket('alice'),/unavailable/);
});
test('stale bridge pauses inputs and does not accumulate catch-up time',()=>{
 const {session:s,advance}=fixture();s.lastExchange=100000;advance(1600);s.advance(1);
 assert.equal(s.ready,false);assert.equal(s.debt,0);
});
test('slow collision downloads never block native relay updates',async()=>{
 const {session:s}=fixture();let resolveLoad,exchanges=0;s.world.focus=()=>new Promise(r=>resolveLoad=r);s.world.readyAt=()=>false;
 s.players.set('fixture',{car:{id:'browser:fixture',kind:'browser',model:'car',position:[0,0,0],velocity:[10,0,0],heading:0},send:()=>{}});
 s.relay.exchange=async vehicles=>{exchanges++;assert.deepEqual(vehicles[0].velocity,[0,0,0]);return {ready:true};};
 await s.exchange();await s.exchange();assert.equal(exchanges,2);assert.equal(s.players.get('fixture').car.streaming,true);resolveLoad();
});

test('native clean-pass score reaches both browser snapshot and authenticated native HUD frame',async()=>{
 const {session:s,advance}=fixture();let x=0,packet;
 s.relay.nativeVehicles=()=>[{id:'native:0',account:'private-native-account',kind:'native',model:'car',coupled:true,position:[x,0,0],velocity:[30,0,0],heading:0,sampleTime:x+1}];
 s.traffic={update(){},snapshot:()=>({agents:[{id:1,x:40,y:2.5,feetZ:0,heading:0,pitch:0,roll:0,speedMps:10,spawnGeneration:1}]})};
 s.relay.exchange=async(vehicles,scores)=>{packet=scores;return {ready:true,rejected:[]};};
 for(x=0;x<65;x++){advance(1000/30);s.lastExchange=s.clock();s.advance(1/30);}
 await s.exchange();assert.equal(packet.length,1);assert.equal(packet[0].account,'private-native-account');assert.equal(packet[0].slot,0);
 assert.equal(packet[0].passes,1);assert.ok(packet[0].score>0);assert.equal(packet[0].rank,1);
 const snapshot=s.snapshot();assert.equal(snapshot.scores[0].score,packet[0].score);assert.equal(snapshot.leaderboard[0].score,packet[0].score);
 assert.ok(!JSON.stringify(snapshot).includes('private-native-account'));
});
