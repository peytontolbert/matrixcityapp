import test from 'node:test';import assert from 'node:assert/strict';import dgram from 'node:dgram';
import {WebSocket} from 'ws';import {createGameService} from '../server.mjs';
const actor='11111111-1111-1111-1111-111111111111',key='test-only-game-service-key-'.repeat(3);
test('private broker rejects unauthenticated requests and relays only ticket-bound game traffic',async()=>{
 const udp=dgram.createSocket('udp4');await new Promise(r=>udp.bind(0,'127.0.0.1',r));const packets=[];udp.on('message',(message,remote)=>{packets.push(message);udp.send(message,remote.port,remote.address);});
 const game=createGameService({key,launch:async()=>({port:udp.address().port,stop(){}})});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+game.server.address().port;
 let socket;
 try{
  const bad=await fetch(origin+'/rpc',{method:'POST',body:'{}'});assert.equal(bad.status,403);
  const {room}=await game.rooms.request(actor,'create');const {ticket}=await game.rooms.request(actor,'ticket',{code:room.code});
  socket=new WebSocket(origin.replace('http:','ws:')+'/socket',{headers:{Authorization:'Bearer '+key,'X-Player':actor,'X-Ticket':ticket}});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  socket.send(Buffer.from([255,255,255,255,112,111,114,116,109,56]));
  socket.send(Buffer.from('\xff\xff\xff\xffrcon secret quit','latin1'));
  const packet=Buffer.from([1,2,3,4,5,6]);const echoed=new Promise((resolve,reject)=>{socket.once('message',resolve);setTimeout(()=>reject(Error('Relay timed out')),2000).unref();});socket.send(packet);assert.deepEqual(await echoed,packet);assert.equal(packets.length,1);
  assert.throws(()=>game.rooms.admit(actor,ticket),{status:401});
  const closed=new Promise(r=>socket.once('close',r));await game.rooms.request(actor,'close',{code:room.code});await closed;assert.equal(game.rooms.rooms.size,0);
 }finally{socket?.terminate();game.rooms.stop();await new Promise(r=>game.server.close(r));udp.close();}
});
