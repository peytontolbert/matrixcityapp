import {WebSocket,WebSocketServer} from 'ws';
import {currentUser} from './auth.mjs';
import {check,send} from './security.mjs';
import {limit,clientKey} from './limits.mjs';
export async function drivingRoute(req,res,{db,config,url}){
 if(!url.pathname.startsWith('/v1/driving/'))return false;
 check(config.drivingKey,503,'Driving sessions are not available yet');
 const path=url.pathname.slice('/v1/driving'.length);
 if(req.method==='GET'&&(path==='/sessions'||path==='/asset-catalog'||path.startsWith('/assets/'))){
  const response=await fetch(config.drivingOrigin+path,{signal:AbortSignal.timeout(20000),redirect:'error'});
  check(response.ok,response.status,'Driving content unavailable');
  res.writeHead(200,{'Content-Type':response.headers.get('content-type')||'application/octet-stream','Cache-Control':path.startsWith('/assets/')?'public, max-age=3600':'no-store'});
  try{let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>100*1024*1024){res.destroy();return true;}if(!res.write(chunk))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});if(res.destroyed)break;}res.end();}catch(error){res.destroy(error);}return true;
 }
 if(req.method==='POST'&&path==='/asset-proofs'){
  check(config.allowedOrigins.has(req.headers.origin),403,'Origin not allowed');let bytes=0,parts=[];for await(const p of req){bytes+=p.length;check(bytes<=32768,413,'Metadata request too large');parts.push(p);}
  const response=await fetch(config.drivingOrigin+path,{method:'POST',headers:{'content-type':'application/json'},body:Buffer.concat(parts),signal:AbortSignal.timeout(5000)});
  const body=await response.json();send(res,response.status,body);return true;
 }
 check(req.method==='POST'&&['/ticket','/native-ticket','/native-redeem','/native-settings'].includes(path),404,'Not found');
 // Native launchers redeem a short-lived account-issued capability without a
 // browser cookie. All capability issuance requires the real website session.
 const redeem=path==='/native-redeem';
 check(redeem&&!req.headers.origin||config.allowedOrigins.has(req.headers.origin),403,'Origin not allowed');
 const user=redeem?null:await currentUser(db,req,config);if(!redeem)check(user,401,'Sign in to join a driving session');
 await limit(db,'driving:admission-ip:'+clientKey(req,config),30,60);
 if(user)await limit(db,'driving:join:'+user.id,12,60);
 check(req.headers['content-type']?.split(';')[0]==='application/json',415,'Use application/json');
 let bytes=0,parts=[];for await(const p of req){bytes+=p.length;check(bytes<=1024,413,'Request too large');parts.push(p);}
 let body;try{body=JSON.parse(Buffer.concat(parts));}catch{check(false,400,'Invalid request');}
 if(redeem)check(/^[A-Za-z0-9_-]{43}$/.test(body?.authorization||'')&&/^7656119[0-9]{10}$/.test(body?.steamId||''),400,'Invalid native authorization');
 else check(['nohesi-110','nohesi-415'].includes(body?.room),400,'Unknown track');
 const response=await fetch(config.drivingOrigin+path,{method:'POST',headers:{authorization:'Bearer '+config.drivingKey,'content-type':'application/json'},body:JSON.stringify(redeem?{authorization:body.authorization,steamId:body.steamId}:{actor:user.id,room:body.room}),signal:AbortSignal.timeout(5000)});
 const result=await response.json();check(response.ok,response.status,result.error||'Session unavailable');send(res,200,result);return true;
}
export function installDrivingSocket(server,{db,config}){
 const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false,handleProtocols:ps=>ps.has('json')?'json':false}),clients=new Set();
 server.on('upgrade',async(req,socket,head)=>{
  if(!req.url?.startsWith('/v1/driving/'))return;socket.on('error',()=>{});socket.setTimeout(10000,()=>socket.destroy());
  try{
   check(req.url==='/v1/driving/socket'&&config.drivingKey,403,'Unavailable');check(config.allowedOrigins.has(req.headers.origin),403,'Origin not allowed');const user=await currentUser(db,req,config);check(user,401,'Sign in');
   await limit(db,'driving:socket:'+clientKey(req,config),20,60);
   await limit(db,'driving:socket-account:'+user.id,12,60);
   const ps=(req.headers['sec-websocket-protocol']||'').split(',').map(s=>s.trim()),ticket=ps.find(s=>/^mg-ticket\.[A-Za-z0-9_-]{43}$/.test(s))?.slice(10),room=ps.find(s=>/^room\.nohesi-(110|415)$/.test(s))?.slice(5);check(ticket&&room,403,'Missing ticket');
   const endpoint=new URL('/socket',config.drivingOrigin);endpoint.protocol='ws:';
   const upstream=new WebSocket(endpoint,{headers:{authorization:'Bearer '+config.drivingKey,'x-player':user.id,'x-ticket':ticket,'x-room':room},handshakeTimeout:8000,maxPayload:262144,perMessageDeflate:false});
   upstream.once('error',()=>socket.destroy());socket.once('close',()=>upstream.terminate());
   upstream.once('open',()=>{if(socket.destroyed)return upstream.terminate();socket.setTimeout(0);wss.handleUpgrade(req,socket,head,client=>{
    clients.add(client);let alive=true,stopped=false,checking=false;
    const ping=setInterval(async()=>{if(!alive)return stop();alive=false;client.ping();if(checking)return;checking=true;try{if((await currentUser(db,req,config))?.id!==user.id)stop();}catch{stop();}finally{checking=false;}},15000);ping.unref();
    const stop=()=>{if(stopped)return;stopped=true;clearInterval(ping);clients.delete(client);client.terminate();upstream.terminate();};client.on('pong',()=>alive=true);client.on('close',stop);upstream.on('close',stop);client.on('error',stop);upstream.on('error',stop);
    client.on('message',(data,binary)=>{if(binary||upstream.bufferedAmount>32768)return stop();if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:false});});
    upstream.on('message',data=>{if(client.bufferedAmount>262144)return stop();if(client.readyState===WebSocket.OPEN)client.send(data,{binary:false});});
   });});
  }catch{socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');}
 });
 server.closeDrivingSockets=()=>{for(const client of clients)client.terminate();};server.on('close',()=>{server.closeDrivingSockets();wss.close();});
}
