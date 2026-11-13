import test from 'node:test';
import assert from 'node:assert/strict';
import {ChaseCamera} from '../client/camera.js';
test('chase carries translation without speed lag and resets teleports',()=>{
 const camera=new ChaseCamera(),car={id:'a',position:[0,0,0],heading:0};
 camera.update(car,1/60);car.position=[2,0,0];assert.equal(camera.update(car,1/60).eye[0],-3.5);
 car.position=[200,0,0];assert.equal(camera.update(car,1/60).eye[0],194.5);
 car.cameraDistance=1;assert.equal(camera.update(car,1/60).eye[0],199);
});
test('chase turn smoothing is independent of frame rate',()=>{
 const run=hz=>{const camera=new ChaseCamera(),car={id:'a',position:[0,0,0],heading:0};camera.update(car,0);car.heading=Math.PI/2;for(let i=0;i<hz;i++)camera.update(car,1/hz);return camera.eye;};
 const a=run(30),b=run(120);assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-9);
});
