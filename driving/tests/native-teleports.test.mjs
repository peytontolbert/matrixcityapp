import test from 'node:test';
import assert from 'node:assert/strict';
import {enablePlayerTeleports,teleportOptions} from '../tools/native-teleports.mjs';
import {nativePointToMatrix,nativeYawToMatrix} from '../bridge/coordinates.mjs';
test('teleport options preserve native coordinate axes and reject INI injection',()=>{
 const position=nativePointToMatrix('nohesi-110',[100,20,-300]),heading=nativeYawToMatrix('nohesi-110',.5);
 const ini=teleportOptions('nohesi-110',[{name:'Pits',position,heading}]);
 assert.match(ini,/POINT_0_POS=100.0000,20.0000,-300.0000/);
 assert.match(ini,/POINT_0_HEADING=28.6479/);
 assert.throws(()=>teleportOptions('nohesi-110',[{name:'bad\n[INJECT]',position,heading}]));
 assert.throws(()=>teleportOptions('nohesi-110',[{name:'bad',position:[NaN,0,0],heading}]));
});
test('player teleport permission is idempotent and preserves other flags and reserved slots',()=>{
 const input='[CAR_0]\nSKIN=red/ABAH\n[CAR_1]\nSKIN=traffic\n';
 const output=enablePlayerTeleports(input,[0]);assert.match(output,/SKIN=red\/ADAn/);assert.match(output,/SKIN=traffic/);
 assert.equal(enablePlayerTeleports(output,[0]),output);
 assert.throws(()=>enablePlayerTeleports(input,[2]));
 assert.throws(()=>enablePlayerTeleports(input.replace('ABAH','garbage'),[0]));
});
