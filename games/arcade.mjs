import {WebSocketServer} from 'ws';
import {Rooms,fail} from './rooms.mjs';
import * as gungeon from '../web/arcade/gungeon/shared-game.js';
import * as nuclear from '../web/arcade/nuclear-throne/shared-game.js';

export const GAME_IDS=['duck-game','broforce','gungeon','nuclear-throne'];
export function cleanInput(value={}) {
 fail(value&&typeof value==='object'&&!Array.isArray(value),400,'Invalid input');
 const result={};
 for(const k of ['up','down','left','right','shoot','swap','pickup','fire','roll','blank','reload','interact','jump','throw','quack','grab','crouch','melee','grenade','use'])result[k]=value[k]===true;
 for(const [k,max] of [['mx',1],['my',1],['aim',100],['aimX',4096],['aimY',4096],['switch',6],['seq',1e9]])result[k]=typeof value[k]==='number'&&Number.isFinite(value[k])?Math.max(-max,Math.min(max,value[k])):0;
 // Broforce key transitions are interpreted by the host's authored simulation.
 const keys=['a','d','w','s','j','z',' ','e','c','q','x','r','k','arrowleft','arrowright','arrowup','arrowdown'];
 for(const k of ['keys','pressed'])result[k]=Array.isArray(value[k])?[...new Set(value[k].filter(v=>keys.includes(v)))].slice(0,20):[];
 return result;
}
export function createArcade({authorized}) {
 const pools=new Map(GAME_IDS.map(game=>[game,new Rooms({
  maxRooms:3,validateSettings:()=>({game,players:4}),
  launch:async()=>({stop(){},onExit(){}})
 })]));
 const wss=new WebSocketServer({noServer:true,maxPayload:262144,perMessageDeflate:false});
 const simulations=new Map();
 const send=(ws,value)=>{if(ws.readyState!==1)return;if(ws.bufferedAmount>524288)return ws.terminate();ws.send(JSON.stringify(value));};
 function runtime(room,game){
  if(simulations.has(room))return simulations.get(room);
  const sim=game==='gungeon'?gungeon:game==='nuclear-throne'?nuclear:null;
  const rt={sim,state:sim?.createRun(),peers:new Map(),slots:new Map([[room.owner,0]]),counter:0};
  const stop=room.engine.stop;room.engine.stop=()=>{clearInterval(rt.timer);simulations.delete(room);stop();};
  if(sim){rt.timer=setInterval(()=>{
   try{sim.tick(rt.state,1/30);if(++rt.counter%2===0){const state=sim.snapshot(rt.state);for(const p of rt.peers.values())send(p.ws,{type:'snapshot',state});}}
   catch{pools.get(game).close(room);}
  },1000/30);rt.timer.unref();}
  simulations.set(room,rt);return rt;
 }
 async function http(req,res){
  const match=/^\/arcade\/([a-z-]+)\/rpc$/.exec(req.url||'');
  if(!match)return false;
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  try{
   fail(authorized(req),403,'Forbidden');fail(req.method==='POST',405,'Use POST');
   const pool=pools.get(match[1]);fail(pool,404,'Unknown game');
   let size=0,parts=[];for await(const p of req){size+=p.length;fail(size<=4096,413,'Request too large');parts.push(p);}
   let body;try{body=JSON.parse(Buffer.concat(parts));}catch{fail(false,400,'Invalid JSON');}
   fail(body&&typeof body==='object'&&!Array.isArray(body),400,'Invalid request');
   res.end(JSON.stringify(await pool.request(body.actor,body.action,body)));
  }catch(e){res.statusCode=e.status||503;res.end(JSON.stringify({error:e.status?e.message:'Game service unavailable'}));}
  return true;
 }
 function upgrade(req,socket,head){
  if(!req.url?.startsWith('/arcade/'))return false;
  socket.on('error',()=>{});
  try{
   const match=/^\/arcade\/([a-z-]+)\/socket$/.exec(req.url);const pool=pools.get(match?.[1]);
   fail(pool&&authorized(req),403,'Forbidden');
   const actor=req.headers['x-player'],room=pool.admit(actor,req.headers['x-ticket']);
   const reservation=room.connections.get(actor),rt=runtime(room,match[1]);
   const release=()=>{if(room.connections.get(actor)===reservation)room.connections.delete(actor);};
   socket.once('close',release);
   wss.handleUpgrade(req,socket,head,ws=>{
    let slot=rt.slots.get(actor);
    if(slot===undefined){slot=[1,2,3].find(n=>![...rt.peers.values()].some(p=>p.slot===n));rt.slots.set(actor,slot);}
    const id='p'+slot;const peer={ws,slot,id,seen:Date.now()};rt.peers.set(actor,peer);
    let stopped=false,alive=true,tokens=100,last=Date.now(),bytes=1048576;
    const stop=()=>{if(stopped)return;stopped=true;clearInterval(ping);release();if(rt.peers.get(actor)===peer)rt.peers.delete(actor);if(actor!==room.owner)rt.slots.delete(actor);rt.sim?.removePlayer(rt.state,id);ws.terminate();
     // Browser-hosted games cannot continue authoritatively after their host leaves.
     if(!rt.sim&&actor===room.owner)pool.close(room);
     else for(const p of rt.peers.values())send(p.ws,{type:'roster',slots:[...rt.peers.values()].map(p=>p.slot)});
    };
    const ping=setInterval(()=>{if(!alive)return stop();alive=false;ws.ping();if(Date.now()-peer.seen>2000&&rt.sim)rt.sim.setInput(rt.state,id,cleanInput());},15000);ping.unref();
    reservation.stop=stop;ws.on('close',stop);ws.on('error',stop);ws.on('pong',()=>alive=true);
    if(rt.sim)rt.sim.addPlayer(rt.state,id,'PLAYER '+(slot+1));
    send(ws,{type:'welcome',id,slot,host:actor===room.owner,state:rt.sim?.snapshot(rt.state),slots:[...rt.peers.values()].map(p=>p.slot)});
    for(const p of rt.peers.values())send(p.ws,{type:'roster',slots:[...rt.peers.values()].map(p=>p.slot)});
    ws.on('message',(data,binary)=>{
     const now=Date.now(),elapsed=now-last;last=now;tokens=Math.min(100,tokens+elapsed*.06);bytes=Math.min(1048576,bytes+elapsed*1048);
     if(binary||--tokens<0||(bytes-=data.length)<0)return stop();
     let m;try{m=JSON.parse(data);if(!m||typeof m!=='object')throw Error();}catch{return stop();}
     try{
      if(m.type==='input'){fail(data.length<=4096,413,'Input too large');const input=cleanInput(m.input);peer.seen=now;if(rt.sim)rt.sim.setInput(rt.state,id,input);else {const host=rt.peers.get(room.owner);if(host)send(host.ws,{type:'input',slot,input});}}
      else if(m.type==='snapshot'&&!rt.sim){fail(actor===room.owner,403,'Host only');fail(m.state&&typeof m.state==='object'&&!Array.isArray(m.state),400,'Invalid state');for(const [other,p] of rt.peers)if(other!==actor)send(p.ws,{type:'snapshot',state:m.state});}
      else if(m.type==='restart'&&rt.sim){fail(actor===room.owner,403,'Host only');rt.state=rt.sim.createRun();for(const p of rt.peers.values())rt.sim.addPlayer(rt.state,p.id,'PLAYER '+(p.slot+1));}
      else if(m.type==='mutation'&&rt.sim===nuclear){fail(actor===room.owner,403,'Host only');if(typeof m.key==='string'&&m.key.length<32)nuclear.chooseMutation(rt.state,id,m.key);}
      else if(m.type==='join'){/* Identity and progression are never taken from client messages. */}
      else fail(false,400,'Unsupported message');
     }catch{stop();}
    });
   });
  }catch{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
  return true;
 }
 const timer=setInterval(()=>{for(const p of pools.values())p.sweep();for(const rt of simulations.values())if(rt.sim)for(const p of rt.peers.values())if(Date.now()-p.seen>1500)rt.sim.setInput(rt.state,p.id,cleanInput());},1000);timer.unref();
 return {http,upgrade,pools,stop(){clearInterval(timer);for(const p of pools.values())p.stop();wss.close();}};
}
