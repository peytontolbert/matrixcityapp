import http from 'node:http';
import {createArcade} from './arcade.mjs';
import dgram from 'node:dgram';
import {timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {Rooms,fail} from './rooms.mjs';
import {launchEngine} from './engine.mjs';
export function createGameService({key,launch}){
 if(!key||key.length<43)throw Error('A dedicated game-service key is required');
 const rooms=new Rooms({launch});const expected=Buffer.from('Bearer '+key);
 const authorized=req=>{const value=Buffer.from(req.headers.authorization||'');return value.length===expected.length&&timingSafeEqual(value,expected);};
 const arcade=createArcade({authorized});
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  if(await arcade.http(req,res))return;
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  try{
   fail(authorized(req),403,'Forbidden');fail(req.method==='POST'&&req.url==='/rpc',404,'Not found');
   let size=0,parts=[];for await(const part of req){size+=part.length;fail(size<=4096,413,'Request too large');parts.push(part);}
   let body;try{body=JSON.parse(Buffer.concat(parts));}catch{fail(false,400,'Invalid JSON');}
   fail(body&&typeof body==='object',400,'Invalid request');const result=await rooms.request(body.actor,body.action,body);res.end(JSON.stringify(result));
  }catch(e){res.statusCode=e.status||503;res.end(JSON.stringify({error:e.status?e.message:'Game service unavailable'}));}
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  if(arcade.upgrade(req,socket,head))return;
  socket.on('error',()=>{});
  try{
   fail(req.url==='/socket'&&authorized(req),403,'Forbidden');
   const actor=req.headers['x-player'];const room=rooms.admit(actor,req.headers['x-ticket']);
   // Reserve the membership before upgrading so concurrent tickets cannot exceed capacity.
   const reservation=room.connections.get(actor);
   const release=()=>{if(room.connections.get(actor)===reservation)room.connections.delete(actor);};
   socket.once('close',release);
   wss.handleUpgrade(req,socket,head,ws=>{
    const udp=dgram.createSocket('udp4');let stopped=false,alive=true,tokens=200,last=Date.now();
    const stop=()=>{if(stopped)return;stopped=true;release();clearInterval(ping);ws.terminate();udp.close();};
    const ping=setInterval(()=>{if(!alive)return stop();alive=false;ws.ping();},30000);ping.unref();
    reservation.stop=stop;ws.on('pong',()=>alive=true);ws.on('close',stop);ws.on('error',stop);udp.on('error',stop);
    udp.on('message',(data,remote)=>{if(remote.address!=='127.0.0.1'||remote.port!==room.engine.port)return;if(ws.bufferedAmount>262144)return stop();if(ws.readyState===WebSocket.OPEN)ws.send(data,{binary:true});});
    ws.on('message',(data,binary)=>{
     const now=Date.now();tokens=Math.min(200,tokens+(now-last)*.12);last=now;
     if(!binary||data.length>16384||--tokens<0)return stop();
     // Emscripten's transport port announcement is not a Quake packet.
     if(data.length===10&&data.subarray(0,8).equals(Buffer.from([255,255,255,255,112,111,114,116])))return;
     if(data.length>=4&&data.readUInt32LE(0)===0xffffffff){
      const text=data.subarray(4,40).toString('ascii');
      if(!/^(getchallenge|connect|getinfo|getstatus)(?: |\n|$)/.test(text))return;
     }
     udp.send(data,room.engine.port,'127.0.0.1');
    });
   });
  }catch{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
 });
 const timer=setInterval(()=>rooms.sweep(),15000);timer.unref();
 server.requestTimeout=10000;server.headersTimeout=10000;
 server.on('close',()=>{clearInterval(timer);rooms.stop();arcade.stop();wss.close();});
 return {server,rooms,arcade};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {server,rooms,arcade}=createGameService({key:process.env.QUAKE3_SERVICE_KEY,launch:config=>launchEngine(config,{binary:process.env.QUAKE3_BINARY,assets:process.env.QUAKE3_ASSETS,state:process.env.QUAKE3_STATE||'/var/lib/matrixgames-quake3/rooms'})});
 server.listen(Number(process.env.PORT||4191),'127.0.0.1',()=>console.log('Quake III room service ready'));
 const stop=()=>{rooms.stop();arcade.stop();server.close(()=>process.exit(0));};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
