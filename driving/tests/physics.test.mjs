import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCar,controls,stepCar,resolveCars,NEUTRAL,STEP} from '../physics.js';
import {DrivingSession} from '../sessions.js';
const profile=process.env.DRIVING_TEST_PROFILE?JSON.parse(readFileSync(process.env.DRIVING_TEST_PROFILE)).assettoHandling:null;
const flat={ground:(x,y,z)=>({z:0,grip:1}),wall:()=>null};
const car=(id='one',x=0)=>createCar(id,{position:[x,0,0],heading:0},profile);
const drive={...NEUTRAL,throttle:1,brake:0,automaticLaunch:true};
test('manual gears and analog input source reach the authoritative solver',()=>{
 const raw={type:'input',sequence:1,throttle:.25,brake:0,steer:.4,handbrake:0,direction:1,transmission:'sequential',gear:3,source:'wheel',clutch:0};
 const input=controls(raw);assert.equal(input.gearRequest,3);assert.equal(input.source,'wheel');assert.equal(input.transmission,'sequential');
 for(const bad of [{gear:1.5},{gear:11},{source:'admin'},{clutch:2},{transmission:'anything'}])assert.throws(()=>controls({...raw,...bad}));
});
test('manual gear holds and forward/reverse changes are blocked at speed',{skip:!profile},()=>{
 const a=car();a.input={...drive,transmission:'sequential',gearRequest:2,source:'controller'};
 for(let i=0;i<1200;i++)stepCar(a,flat);assert.equal(a.state.gear,2);assert.ok(a.state.longitudinal>1);
 a.input.gearRequest=-1;stepCar(a,flat);assert.equal(a.state.selectedGear,2);
});
test('controls reject pose injection, NaN, replay format and unbounded pedals',()=>{
 for(const raw of [{type:'state',sequence:1},{type:'input',sequence:1,throttle:Infinity,brake:0,steer:0,handbrake:0,direction:1},{type:'input',sequence:1,throttle:1.1,brake:0,steer:0,handbrake:0,direction:1}])assert.throws(()=>controls(raw));
 assert.equal(controls({type:'input',sequence:2,throttle:1,brake:0,steer:-1,handbrake:0,direction:1}).gearRequest,1);
});
test('oblique car impact conserves momentum and does not add kinetic energy',()=>{
 const a={position:[0,0,0],velocity:[12,0,0],heading:0,mass:1500,length:4.4,width:1.8,height:1.5},b={...a,position:[3.9,.2,0],velocity:[0,0,0]};
 assert.equal(resolveCars(a,b),true);assert.ok(Math.abs(a.velocity[0]+b.velocity[0]-12)<1e-8);assert.ok(a.velocity[0]**2+b.velocity[0]**2<=144);
});
test('separate road decks never collide',()=>{
 const a={position:[0,0,0],velocity:[12,0,0],heading:0,mass:1500,length:4.4,width:1.8,height:1.5},b={...a,position:[0,0,6],velocity:[0,0,0]};assert.equal(resolveCars(a,b),false);
});
test('streaming-held cars cannot impart their stored pre-pause velocity',()=>{
 const a={position:[0,0,0],velocity:[0,0,0],heading:0,mass:1500,length:4.4,width:1.8,height:1.5},b={...a,position:[3.9,0,0],velocity:[-20,0,0],streaming:true};
 assert.equal(resolveCars(a,b),true);assert.deepEqual(a.velocity,[0,0,0]);assert.deepEqual(b.position,[3.9,0,0]);
});
test('native kinematic car changes browser velocity without overwriting native authority',()=>{
 const a={position:[0,0,0],velocity:[10,0,0],heading:0,mass:1500,length:4.4,width:1.8,height:1.5},b={...a,position:[4,0,0],velocity:[0,0,0],kinematic:true};assert.ok(resolveCars(a,b));assert.ok(a.velocity[0]<=0);assert.deepEqual(b.velocity,[0,0,0]);
});
test('authored vehicle accelerates, brakes to rest, and reverses',{skip:!profile},()=>{
 const a=car();a.input=drive;for(let i=0;i<1200;i++)stepCar(a,flat);assert.ok(a.state.longitudinal>8,'must accelerate');assert.ok(a.position[0]>30);a.input={...NEUTRAL};for(let i=0;i<1200;i++)stepCar(a,flat);assert.ok(Math.abs(a.state.longitudinal)<.4,'must brake');a.input={...drive,gearRequest:-1};for(let i=0;i<600;i++)stepCar(a,flat);assert.ok(a.state.longitudinal< -1,'must reverse');
});
test('authored wheel contacts produce a turn and remain finite',{skip:!profile},()=>{
 const a=car();a.input=drive;for(let i=0;i<600;i++)stepCar(a,flat);a.input={...drive,steer:.25};for(let i=0;i<300;i++)stepCar(a,flat);assert.ok(Math.abs(a.heading)>.05);assert.ok([...a.position,...a.velocity].every(Number.isFinite));
});
test('high-speed chassis sweep cannot skip a thin wall',{skip:!profile},()=>{
 const a=car();a.state.longitudinal=70;a.input={...NEUTRAL,brake:0};const wall={ground:flat.ground,wall:(x,y,z,r,h,step,dx)=>x+r>5&&dx>0?{normalX:-1,normalY:0,distanceSq:Math.max(0,5-x)**2}:null};
 for(let i=0;i<30;i++)stepCar(a,wall);assert.ok(a.position[0]<5);assert.ok(a.velocity[0]<1);
});
test('missing road produces freefall rather than an invented flat floor',{skip:!profile},()=>{const a=car();for(let i=0;i<120;i++)stepCar(a,{ground:()=>null});assert.ok(a.position[2]<-4);assert.equal(a.contacts,0);});
test('pit recovery preserves identity and sequence, blocks moving cars, and enforces cooldown',{skip:!profile},()=>{
 let now=100000;const s=new DrivingSession({room:'nohesi-110',world:{...flat,spawn:{position:[0,0,0],heading:0},network:{schema:'matrix-city-110-gameplay-v1',lanes:[]}},profile,clock:()=>now,relay:{nativeVehicles:()=>[]}});s.ready=true;
 const ticket=s.ticket('a');s.admit('a',ticket.ticket,()=>{});const p=s.players.get('a');p.car.lastSequence=12;p.car.velocity=[10,0,0];p.car.contacts=4;
 assert.match(s.recover('a'),/Stop/);now+=1000;p.car.velocity=[0,0,0];assert.match(s.recover('a'),/Returned/);assert.equal(p.car.id,'browser:a');assert.equal(p.car.lastSequence,12);assert.match(s.recover('a'),/10 seconds/);
 now+=10001;p.car.position=[100,0,-50];p.car.contacts=0;assert.match(s.recover('a'),/Returned/);
});
