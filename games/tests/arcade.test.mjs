import test from 'node:test';import assert from 'node:assert/strict';
import {WebSocket} from 'ws';import {createGameService} from '../server.mjs';import {cleanInput,GAME_IDS} from '../arcade.mjs';
const host='11111111-1111-1111-1111-111111111111',friend='22222222-2222-2222-2222-222222222222',outsider='33333333-3333-3333-3333-333333333333',key='arcade-test-only-key-'.repeat(4);
const until=(ws,predicate)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{ws.off('message',read);reject(Error('Message timeout'))},2500);function read(data){const m=JSON.parse(data);if(predicate(m)){clearTimeout(timeout);ws.off('message',read);resolve(m)}}ws.on('message',read)});
async function fixture(fn){const g=createGameService({key,launch:async()=>({stop(){}})});await new Promise(r=>g.server.listen(0,'127.0.0.1',r));const sockets=[];const origin='http://127.0.0.1:'+g.server.address().port;
 async function connect(game,actor,code){const pool=g.arcade.pools.get(game),{ticket}=await pool.request(actor,'ticket',{code});const ws=new WebSocket(origin.replace('http:','ws:')+`/arcade/${game}/socket`,{headers:{Authorization:'Bearer '+key,'X-Player':actor,'X-Ticket':ticket}});sockets.push(ws);const welcome=await until(ws,m=>m.type==='welcome');return {ws,welcome,ticket};}
 try{await fn({g,origin,connect})}finally{for(const ws of sockets)ws.terminate();g.arcade.stop();g.rooms.stop();await new Promise(r=>g.server.close(r));}}
test('arcade input rejects nonfinite values and unrecognized keys',()=>{const v=cleanInput({mx:Infinity,aim:NaN,aimX:1e99,fire:'yes',keys:['a','__proto__','a']});assert.equal(v.mx,0);assert.equal(v.aim,0);assert.equal(v.aimX,4096);assert.equal(v.fire,false);assert.deepEqual(v.keys,['a']);});
test('all four lobbies bind ownership, membership and single-use tickets to one game',()=>fixture(async({g,origin,connect})=>{
 assert.equal((await fetch(origin+'/arcade/duck-game/rpc',{method:'POST',body:'{}'})).status,403);
 for(const game of GAME_IDS){const pool=g.arcade.pools.get(game),{room}=await pool.request(host,'create');
  await assert.rejects(pool.request(outsider,'room',{code:room.code}),{status:403});await pool.request(friend,'join',{code:room.code});
  await assert.rejects(pool.request(friend,'close',{code:room.code}),{status:403});
  const {ws,welcome,ticket}=await connect(game,host,room.code);assert.equal(welcome.host,true);assert.equal(welcome.slot,0);assert.throws(()=>pool.admit(host,ticket),{status:401});
  for(const [other,p] of g.arcade.pools)if(other!==game)assert.throws(()=>p.admit(host,ticket),{status:401});
  const closed=new Promise(r=>ws.once('close',r));await pool.request(host,'close',{code:room.code});await closed;assert.equal(pool.rooms.size,0);
 }
}));
for(const game of ['duck-game','broforce'])test(game+' relays guest input and only host snapshots; host exit closes the match',()=>fixture(async({g,connect})=>{
 const pool=g.arcade.pools.get(game),{room}=await pool.request(host,'create');await pool.request(friend,'join',{code:room.code});
 const h=await connect(game,host,room.code),f=await connect(game,friend,room.code);assert.equal(f.welcome.host,false);assert.equal(f.welcome.slot,1);
 const input=until(h.ws,m=>m.type==='input');f.ws.send(JSON.stringify({type:'input',input:{left:true,keys:['a']}}));assert.equal((await input).input.left,true);
 const snapshot=until(f.ws,m=>m.type==='snapshot');h.ws.send(JSON.stringify({type:'snapshot',state:{tick:42}}));assert.equal((await snapshot).state.tick,42);
 const rejected=new Promise(r=>f.ws.once('close',r));f.ws.send(JSON.stringify({type:'snapshot',state:{tick:999}}));await rejected;
 h.ws.close();await new Promise(r=>h.ws.once('close',r));assert.equal(pool.rooms.size,0);
}));
for(const game of ['gungeon','nuclear-throne'])test(game+' simulates shared players and rejects guest restart',()=>fixture(async({g,connect})=>{
 const pool=g.arcade.pools.get(game),{room}=await pool.request(host,'create');await pool.request(friend,'join',{code:room.code});const h=await connect(game,host,room.code),f=await connect(game,friend,room.code);
 const before=f.welcome.state.players.p1.x;f.ws.send(JSON.stringify({type:'input',input:{right:true,mx:1}}));
 const moved=await until(h.ws,m=>m.type==='snapshot'&&m.state.players.p1?.x>before);assert.equal(Object.keys(moved.state.players).length,2);
 const closed=new Promise(r=>f.ws.once('close',r));f.ws.send(JSON.stringify({type:'restart'}));await closed;
}));
