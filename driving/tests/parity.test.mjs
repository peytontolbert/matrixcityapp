import test from 'node:test';
import assert from 'node:assert/strict';
import {originFromFeet} from '../bridge/pose.mjs';
import {nativeEnvironment,DrivingEnvironment} from '../environment.js';
import {resolveCars} from '../physics.js';
import {shadowCamera,inShadowBounds} from '../vendor/js/shadow-math.js';
import {vehicleAudioPhaseWeights,vehicleAudioScheduleWindow,vehicleAudioShiftWobble} from '../vendor/js/audio_system.js';

test('native origin conversion preserves the feet anchor on banked roads',()=>{
 const car={model:'06_ygt_53_nissan_350z',position:[-52245,31809,607],heading:1.2,pitch:.2,roll:-.3};
 const p=originFromFeet(car,.36);assert.ok(Math.abs(Math.hypot(...p.map((v,i)=>v-car.position[i]))-.36)<1e-10);assert.ok(p[2]>car.position[2]);
 assert.deepEqual(originFromFeet({...car,pitch:0,roll:0},.36),[-52245,31809,607.36]);
});
test('coupled native impacts exchange finite momentum, separating decks remain isolated',()=>{
 const car=(id,x,v)=>({id,position:[x,0,0],velocity:[v,0,0],heading:0,mass:1510,length:4.4,width:1.85,height:1.5});
 const a=car('browser',0,12),b=car('native',4,0);assert.equal(resolveCars(a,b),true);assert.ok(b.velocity[0]>0);assert.ok(a.velocity[0]<12);assert.ok(Math.abs(a.velocity[0]+b.velocity[0]-12)<1e-10);
 const before=[...b.velocity];resolveCars(a,b);assert.deepEqual(b.velocity,before);b.position[2]+=6;assert.equal(resolveCars(a,b),false);
});
test('native weather clamps malformed inputs and maps the solar up-axis',()=>{
 const n=nativeEnvironment({hour:14,rain:5,wetness:-1,grip:NaN});assert.equal(n.rain,1);assert.equal(n.wetness,0);assert.equal(n.grip,1);
 const e=new DrivingEnvironment('nohesi-110').update({...n,cloud:1},0);assert.ok(e.sun[2]>0);assert.equal(e.rain,1);assert.ok(e.haze>.0003);
});
test('world shadow camera remains stable at distant 415 coordinates',()=>{
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],center=[-52245,31809,607];
 const c=shadowCamera(identity,center,[.4,-.5,1],2048,160);assert.ok([...c.matrix].every(Number.isFinite));assert.equal(inShadowBounds([...center.map(v=>v-2),...center.map(v=>v+2)],c),true);assert.equal(inShadowBounds([0,0,0,1,1,1],c),false);
});
test('authored audio phase mix is normalized and stalls never accumulate grains',()=>{
 for(const rpm of [0,.1,.5,1])for(const throttle of [0,.2,1]){const w=vehicleAudioPhaseWeights(rpm,throttle);assert.ok(Math.abs(w.idle+w.accel+w.decel-1)<1e-12);}
 const scheduled=vehicleAudioScheduleWindow(0,100,120);assert.ok(scheduled.times.length<=32);assert.ok(scheduled.times.every(t=>t>=100&&t<=100.05));assert.deepEqual(vehicleAudioShiftWobble({},1),{rate:1,gain:1});
});
