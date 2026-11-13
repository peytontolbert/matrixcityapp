import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrivingServer} from '../server.mjs';
import {once} from 'node:events';
import {WebSocket} from 'ws';
test('private service rejects unauthenticated tickets and upgrades',async()=>{
 const s=createDrivingServer({sessions:new Map(),assets:{get:()=>{throw Error('Not found');}},key:'x'.repeat(43)});s.listen(0,'127.0.0.1');await once(s,'listening');const base='http://127.0.0.1:'+s.address().port;
 try{assert.equal((await fetch(base+'/ticket',{method:'POST',body:'{}'})).status,403);assert.equal((await fetch(base+'/sessions')).status,200);assert.equal((await fetch(base+'/assets/../private')).status,404);
  assert.equal((await fetch(base+'/diagnostics')).status,403);
  assert.deepEqual(await(await fetch(base+'/diagnostics',{headers:{authorization:'Bearer '+'x'.repeat(43)}})).json(),{sessions:[]});
  assert.equal((await fetch(base+'/dev-ticket',{method:'POST',body:'{}'})).status,404);
  assert.equal((await fetch(base+'/native-ticket',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(base+'/traffic-settings',{method:'POST',body:'{}'})).status,403);
  const code=await new Promise(resolve=>{const ws=new WebSocket(base.replace('http','ws')+'/socket');ws.on('unexpected-response',(req,res)=>{resolve(res.statusCode);req.destroy();});ws.on('error',()=>{});});assert.equal(code,403);
 }finally{await s.stop();}
});

test('traffic stop diagnostics require the service key and omit native account data',async()=>{
 const session={room:'nohesi-110',ready:true,advance(){},async exchange(){},fail(e){throw e;},async close(){},relay:{nativeVehicles:()=>[{id:'native:0',account:'private-account',coupled:true,position:[0,0,0],velocity:[0,0,0],heading:1,sampleTime:123}]},traffic:{diagnostics:()=>({stopped:2,reasons:{leader:1,merge:1}})}};
 const s=createDrivingServer({sessions:new Map([['nohesi-110',session]]),assets:{},key:'x'.repeat(43)});s.listen(0,'127.0.0.1');await once(s,'listening');const url='http://127.0.0.1:'+s.address().port+'/diagnostics';
 try{
  assert.equal((await fetch(url)).status,403);
  const data=await(await fetch(url,{headers:{authorization:'Bearer '+'x'.repeat(43)}})).json();
  assert.deepEqual(data.sessions[0].traffic,{stopped:2,reasons:{leader:1,merge:1}});
  assert.equal(data.sessions[0].native[0].heading,1);assert.ok(!JSON.stringify(data).includes('private-account'));
 }finally{await s.stop();}
});
