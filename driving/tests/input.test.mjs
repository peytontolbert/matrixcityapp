import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleInput} from '../client/input.js';
test('blur, paused server and stale state release throttle and apply brakes',()=>{
 for(const options of [{focused:false},{ready:false},{stale:true}])assert.deepEqual(sampleInput(new Set(['KeyW','KeyA','Space']),options),{throttle:0,brake:1,steer:0,handbrake:0,direction:1});
});
test('opposite steering cancels and reverse remains explicit',()=>{
 assert.deepEqual(sampleInput(new Set(['ArrowUp','KeyA','KeyD']),{direction:-1}),{throttle:1,brake:0,steer:0,handbrake:0,direction:-1});
});
test('standard gamepad has deadzone, analog triggers, and releases on blur',()=>{
 const gamepad={connected:true,mapping:'standard',axes:[.56],buttons:Array.from({length:8},()=>({value:0}))};gamepad.buttons[7].value=.7;gamepad.buttons[6].value=.2;
 const input=sampleInput(new Set(),{gamepad});assert.ok(Math.abs(input.steer+.5)<1e-9);assert.equal(input.throttle,.7);assert.equal(input.brake,.2);
 gamepad.axes[0]=.1;assert.equal(sampleInput(new Set(),{gamepad}).steer,0);
 assert.deepEqual(sampleInput(new Set(),{gamepad,focused:false}),{throttle:0,brake:1,steer:0,handbrake:0,direction:1});
});
