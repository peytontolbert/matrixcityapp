import test from 'node:test';
import assert from 'node:assert/strict';
import {emissionState} from '../client/materials.js';
test('authored light masks select headlight, brake and reverse state bits',()=>{
 const material={assettoEmissionStates:Array.from({length:32},(_,index)=>({index}))};
 assert.equal(emissionState(material,{lights:true,brake:1,gear:-1}).index,7);
 assert.equal(emissionState(material,{lights:false,brake:0,gear:1}).index,0);
 assert.equal(emissionState({assettoEmissionStates:material.assettoEmissionStates.slice(0,4)},{lights:true,brake:1,gear:-1}).index,3);
 assert.deepEqual(emissionState({},{}),{});
});
