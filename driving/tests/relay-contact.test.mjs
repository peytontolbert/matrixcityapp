import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AssettoRelay} from '../bridge/relay.mjs';
import {TRACKS,matrixVectorToNative} from '../bridge/coordinates.mjs';

test('relay carries target velocity and actual physics sample time across bridge polls',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'matrix-contact-')),key=join(dir,'key');writeFileSync(key,'fixture'.repeat(8));
 const original=globalThis.fetch;let frame;const stamp=Date.now()-100;let bridgeTime=stamp+50;
 try{
  globalThis.fetch=async(url,request)=>{
   frame=JSON.parse(request.body);
   return new Response(JSON.stringify({schema:1,room:'nohesi-110',revision:TRACKS['nohesi-110'].revision,serverTime:bridgeTime,appliedSequence:frame.sequence,
    vehicles:[{slot:0,account:'fixture-account',model:'06_ygt_53_nissan_350z',position:[0,0,0],feet:[0,0,0],rotation:[0,0,0],velocity:[50,0,0],coupled:true,physicsTime:stamp}]}));
  };
  const relay=new AssettoRelay({room:'nohesi-110',endpoint:'http://127.0.0.1:8081/_matrix/bridge/v1/exchange',tokenFile:key,slots:[]});
  assert.equal((await relay.exchange([])).ready,true);
  const car=relay.nativeVehicles()[0];assert.equal(car.sampleTime,stamp);
  car.velocity=[20,0,0];relay.impact(car,[-30,0,0]);bridgeTime+=50;
  assert.equal((await relay.exchange([])).ready,true);
  assert.deepEqual(frame.impacts[0].targetVelocity,matrixVectorToNative('nohesi-110',[20,0,0]));
  assert.deepEqual(frame.impacts[0].delta,matrixVectorToNative('nohesi-110',[-30,0,0]));
  assert.equal(relay.nativeVehicles()[0].sampleTime,stamp,'Bridge clock must not masquerade as a fresh physics sample');
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true});}
});
