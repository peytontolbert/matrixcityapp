import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VEHICLE_PROFILE,verifyProfileIdentity,verifiedHandling,sha256} from '../vehicle-profile.mjs';
import {vehicleBody,createCar,MODEL,resolveCars} from '../physics.js';

const source={carId:MODEL,dataAcdSha256:'a'.repeat(64)};
const fixture=()=>({schema:'webglgta-assetto-corsa-profile-v1',source:{...source},tyreSource:{...source},assettoHandling:{mass:1234}});
const contract=bytes=>({...VEHICLE_PROFILE,dataAcdSha256:source.dataAcdSha256,profileSha256:sha256(bytes)});
test('export bytes are pinned, not merely an untrusted source-hash field',()=>{
 const bytes=Buffer.from(JSON.stringify(fixture())),expected=contract(bytes);
 assert.equal(verifyProfileIdentity(bytes,expected).assettoHandling.mass,1234);
 const edited=Buffer.from(bytes.toString().replace('1234','4321'));
 assert.throws(()=>verifyProfileIdentity(edited,expected),/export checksum mismatch/);
});
test('car and tyre provenance must both match the native archive',()=>{
 for(const change of [d=>d.source.carId='different',d=>d.source.dataAcdSha256='b'.repeat(64),
  d=>d.tyreSource.carId='different',d=>d.tyreSource.dataAcdSha256='b'.repeat(64),d=>delete d.tyreSource,d=>d.schema='unknown']){
  const d=fixture();change(d);const bytes=Buffer.from(JSON.stringify(d));
  assert.throws(()=>verifyProfileIdentity(bytes,contract(bytes)),/source does not match/);
 }
});
test('shared bodies reject missing mass and unsupported car models',()=>{
 for(const mass of [undefined,NaN,Infinity,0,-1])assert.throws(()=>vehicleBody({mass}),/mass/);
 assert.throws(()=>vehicleBody({mass:1500},'another-model'),/No verified collision profile/);
});
test('changing browser/native driver type cannot change traffic contact response',()=>{
 for(const heading of [0,.4,1.7])for(const speed of [10,35,80])for(const reversed of [false,true]){
  const c=Math.cos(heading),s=Math.sin(heading);
  const run=kind=>{
   const driver={id:kind,kind,...vehicleBody({mass:1710}),heading,position:[0,0,0],velocity:[speed*c,speed*s,2]};
   const traffic={id:'traffic',kind:'traffic',kinematic:true,mass:1450,length:4.5,width:1.8,height:1.5,heading,position:[4*c,4*s,0],velocity:[5*c,5*s,0]};
   assert.equal(reversed?resolveCars(traffic,driver):resolveCars(driver,traffic),true);
   assert.ok(Math.abs(driver.velocity[0]-5*c)<1e-10);assert.ok(Math.abs(driver.velocity[1]-5*s)<1e-10);
   assert.equal(driver.velocity[2],2);return {position:driver.position,velocity:driver.velocity,damage:driver.damage};
  };
  assert.deepEqual(run('browser'),run('native'));
 }
});
test('authored deployed profile satisfies the pinned identity and browser body contract',{skip:!process.env.DRIVING_TEST_PROFILE},()=>{
 const profile=verifiedHandling(readFileSync(process.env.DRIVING_TEST_PROFILE));
 const car=createCar('fixture',{position:[0,0,0],heading:0},profile);
 assert.deepEqual(vehicleBody(profile),{mass:car.mass,length:car.length,width:car.width,height:car.height});
 assert.equal(car.mass,1710);
});
