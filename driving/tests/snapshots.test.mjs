import test from 'node:test';
import assert from 'node:assert/strict';
import {Snapshots} from '../client/snapshots.js';
const car=(x=0)=>({id:'native:0',kind:'native',model:'car',position:[x,0,0],velocity:[10,0,0],heading:0,pitch:0,roll:0});
const frame=(sequence,time,cars=[car(sequence)])=>({schema:1,room:'test',sequence,serverTime:time,cars});
test('snapshot interpolation absorbs jitter, rejects replay, and freezes without extrapolation',()=>{
 const b=new Snapshots('test',100);b.push(frame(1,1000),10);b.push(frame(2,1050),85);b.push(frame(3,1100),105);
 assert.equal(b.sample(130)[0].position[0],1.5);assert.equal(b.push(frame(2,1050),140),false);
 assert.equal(b.sample(9000)[0].position[0],3);
});
test('removed cars disappear and respawns are not interpolated across the map',()=>{
 const b=new Snapshots('test',0);b.push(frame(1,1000),10);b.push(frame(2,1050,[car(900)]),60);assert.equal(b.sample(60)[0].position[0],900);
 b.push(frame(3,1100,[]),110);assert.deepEqual(b.sample(110),[]);
});
test('invalid worlds, duplicate identities and nonfinite poses are refused',()=>{
 const b=new Snapshots('test');assert.throws(()=>b.push({...frame(1,1000),room:'other'},0));
 assert.throws(()=>b.push(frame(1,1000,[car(),car()]),0));assert.throws(()=>b.push(frame(1,1000,[car(NaN)]),0));
});
