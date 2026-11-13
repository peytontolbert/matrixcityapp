import test from 'node:test';
import assert from 'node:assert/strict';
import {ResolutionBudget} from '../client/quality.js';
test('resolution adapts within bounds without reacting to individual slow frames',()=>{
 const q=new ResolutionBudget();q.sample(0);q.sample(1000);assert.equal(q.scale,1);
 for(let time=2000;time<60000;time+=100)q.sample(time);assert.equal(q.scale,.6);
 for(let time=60000;time<130000;time+=16)q.sample(time);assert.ok(q.scale>.99);assert.ok(q.scale<=1);
});
