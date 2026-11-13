import test from 'node:test';
import assert from 'node:assert/strict';
import {reservesPassingCorridor} from '../traffic-corridor.js';
import {routeInterest} from '../traffic-interest.js';
const group=(along=1000,shift=0)=>[0,4,8].map((side,id)=>({lane:{id},along,side:side+shift}));
test('passing reservations are world anchored and do not reset when drivers advance or change lanes',()=>{
 const rows=group();
 for(let distance=1200;distance<1700;distance+=25)for(let index=0;index<3;index++){
  const expected=reservesPassingCorridor(rows,rows[index],distance,50,24,24,1000);
  const moved=group(1050),shifted=group(1000,-4);
  assert.equal(reservesPassingCorridor(moved,moved[index],distance+24,50,24,24,2000),expected);
  assert.equal(reservesPassingCorridor(shifted,shifted[index],distance,50,24,24,1000),expected);
 }
});
test('slow drivers and single-lane roads retain traffic; uncertainty only reserves additional space',()=>{
 const rows=group();let reserved=0,open=0;
 for(let distance=1150;distance<1700;distance+=10)for(const row of rows){
  assert.equal(reservesPassingCorridor(rows,row,distance,28,24,16,1000),false);
  assert.equal(reservesPassingCorridor([row],row,distance,50,24,16,1000),false);
  const certain=reservesPassingCorridor(rows,row,distance,50,24,24,1000);
  const uncertain=reservesPassingCorridor(rows,row,distance,50,24,16,1000);
  if(certain)assert.equal(uncertain,true);if(uncertain)reserved++;else open++;
 }
 assert.ok(reserved>0&&open>0,'Reservation must leave traffic and an opening');
});
test('route projection exposes signed lane offset, deck and heading alignment for corridor isolation',()=>{
 const lane={points:[[0,4,0],[1000,4,0]],cumulative:[0,1000],lengthM:1000};
 const p=Object.assign([100,0,0],{heading:0});
 const r=routeInterest(lane,p,300);assert.equal(r.side,4);assert.equal(r.along,100);assert.equal(r.ahead,200);assert.equal(r.height,0);assert.equal(r.alignment,1);
 assert.equal(routeInterest(lane,Object.assign([100,0,0],{heading:Math.PI}),300).relevant,false);
 assert.equal(routeInterest(lane,Object.assign([100,0,9],{heading:0}),300).relevant,false);
});
