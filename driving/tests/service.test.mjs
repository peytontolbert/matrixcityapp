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
