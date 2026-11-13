import test from 'node:test';
import assert from 'node:assert/strict';
import {mat4,vec3} from 'gl-matrix';
import {canRoll,wheelMatrix} from '../client/wheels.js';
test('authored wheel pivots remain fixed; calipers steer without spinning',()=>{
 const pivot=[.7,1.3,.1],body=mat4.create();mat4.translate(body,body,[100,200,3]);
 const matrix=wheelMatrix(body,pivot,27922,2,.3);const transformed=vec3.transformMat4(vec3.create(),pivot,matrix),expected=vec3.transformMat4(vec3.create(),pivot,body);
 assert.ok(vec3.distance(transformed,expected)<1e-5);
 assert.deepEqual(wheelMatrix(body,pivot,27922,2,.3,false),wheelMatrix(body,pivot,27922,0,.3,false));
 assert.ok(canRoll({min:[0,0,0],max:[.2,.65,.65]}));assert.equal(canRoll({min:[0,0,0],max:[.2,.1,.5]}),false);
});
