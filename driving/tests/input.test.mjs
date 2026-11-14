import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleInput} from '../client/input.js';
import {settings,mappedInput,detectBinding,chooseDevice,readSettings} from '../client/control-settings.js';
test('blur, paused server and stale state release throttle and apply brakes',()=>{
 for(const options of [{focused:false},{ready:false},{stale:true}])assert.deepEqual(sampleInput(new Set(['KeyW','KeyA','Space']),options),{throttle:0,brake:1,steer:0,handbrake:0,direction:1});
});
test('mouse steering and pedals release on stale state; keyboard remains available',()=>{
 const config=settings({mode:'mouse'}),keys=new Set(['KeyW']);
 const options={config,mouse:.65,mouseActive:true};
 assert.equal(sampleInput(keys,options).steer,.65);assert.equal(sampleInput(keys,options).source,'mouse');
 assert.equal(sampleInput(keys,{...options,stale:true}).throttle,0);assert.equal(sampleInput(keys,{...options,stale:true}).steer,0);
 keys.add('KeyD');assert.equal(sampleInput(keys,options).steer,-1);
});
test('unmapped wheel uses calibrated inverted pedals and full steering travel',()=>{
 const p={id:'wheel',connected:true,mapping:'',axes:[.5,-1,1],buttons:[]};
 const config=settings({mode:'device',deadzone:0,profiles:{wheel:{kind:'wheel',bindings:{steer:{type:'axis',index:0,rest:0,end:1},throttle:{type:'axis',index:1,rest:1,end:-1},brake:{type:'axis',index:2,rest:1,end:-1}}}}});
 const value=mappedInput(p,config);assert.equal(value.steer,-.5);assert.equal(value.throttle,1);assert.equal(value.brake,0);assert.equal(value.source,'wheel');
 p.connected=false;assert.equal(mappedInput(p,config),null);
});
test('combined pedal axis, calibration and explicit device selection',()=>{
 const rest={axes:[0,0],buttons:[{value:0}]},pressed={axes:[0,-1],buttons:[{value:0}]};
 assert.deepEqual(detectBinding(rest,pressed,'throttle'),{type:'axis',index:1,rest:0,end:-1});
 const p={id:'wheel',connected:true,mapping:'',...pressed};
 const config=settings({device:'wheel',deadzone:0,profiles:{wheel:{kind:'wheel',bindings:{steer:{type:'axis',index:0,rest:0,end:1},throttle:{type:'axis',index:1,rest:0,end:-1},brake:{type:'axis',index:1,rest:0,end:1}}}}});
 assert.equal(mappedInput(p,config).throttle,1);assert.equal(mappedInput(p,config).brake,0);p.axes[1]=1;assert.equal(mappedInput(p,config).brake,1);assert.equal(mappedInput(p,config).throttle,0);
 assert.equal(chooseDevice([{id:'other',connected:true,mapping:'standard'}],config),null);
});
test('invalid saved settings and inaccessible storage fail safely',()=>{
 assert.equal(readSettings({getItem(){throw Error('blocked');}}).mode,'auto');
 assert.equal(readSettings({getItem(){return 'null';}}).mode,'auto');
 assert.equal(settings({deadzone:99}).deadzone,.4);
 assert.equal(mappedInput({id:'unmapped',connected:true,mapping:'',axes:[],buttons:[]},settings()),null);
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

test('keyboard override does not acquire unfiltered wheel steering',()=>{
 const gamepad={id:'wheel',connected:true,mapping:'standard',axes:[.5],buttons:Array.from({length:8},()=>({value:0}))};
 const config=settings();
 const result=sampleInput(new Set(['KeyA']),{gamepad,config});
 assert.equal(result.steer,1);assert.equal(result.source,'keyboard');
});
