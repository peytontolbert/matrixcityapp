import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionStream} from '../collision-stream.mjs';
test('collision streaming coalesces downloads, caps concurrency, and retains all active regions',async()=>{
 const c={tiles:new Map(),index:{tiles:Array.from({length:6},(_,id)=>({id,x:id*30}))},local:p=>p,distance:(e,p)=>Math.abs(e.x-p[0])};let loads=0,active=0,peak=0;
 const s=new CollisionStream(c,async()=>{loads++;peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,5));active--;return {};});
 assert.equal(s.ready([60]),false);await Promise.all([s.focus([60]),s.focus([60])]);assert.equal(loads,6);assert.equal(peak,2);assert.equal(s.ready([60]),true);
 s.trim([[60],[5000]]);assert.equal(c.tiles.size,6);s.trim([[5000]]);assert.equal(c.tiles.size,0);
});
