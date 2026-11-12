import {WebSocket,WebSocketServer} from 'ws';
import {currentUser} from './auth.mjs';
import {check,send} from './security.mjs';
import {limit,clientKey} from './limits.mjs';

export async function gameRequest(config,actor,action,data={}) {
 check(config.quake3Key,503,'Quake III rooms are not available yet');
 const response=await fetch(config.quake3Origin+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.quake3Key},body:JSON.stringify({actor,action,...data}),signal:AbortSignal.timeout(20000)});
 const result=await response.json();check(response.ok,response.status,result.error||'Game service unavailable');return result;
}
export async function quake3Route(req,res,{db,config,url}) {
 if(!url.pathname.startsWith('/v1/quake3/'))return false;
 const user=await currentUser(db,req,config);check(user,401,'Sign in to play with friends');
 check(req.method==='POST',405,'Use POST');
 check(config.allowedOrigins.has(req.headers.origin),403,'An allowed origin is required');
 check(req.headers['content-type']?.split(';')[0]==='application/json',415,'Use application/json');
 let size=0,parts=[];for await(const part of req){size+=part.length;check(size<=2048,413,'Request too large');parts.push(part);}
 let body;try{body=JSON.parse(Buffer.concat(parts).toString());}catch{check(false,400,'Invalid JSON');}
 check(body&&typeof body==='object'&&!Array.isArray(body),400,'Invalid request');
 const action=url.pathname.slice('/v1/quake3/'.length);
 check(['create','join','room','leave','close','ticket','mine'].includes(action),404,'Not found');
 await limit(db,'q3:'+action+':'+user.id,action==='create'?4:60,action==='create'?600:60);
 // Actor is always derived from the session, never from the request body.
 const result=await gameRequest(config,user.id,action,{code:body.code,settings:body.settings});
 send(res,200,result);return true;
}
export function installQuake3Socket(server,{db,config}) {
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false,handleProtocols:protocols=>protocols.has('binary')?'binary':false});
 const clients=new Set();
 server.on('upgrade',async(req,socket,head)=>{
  if(req.url?.startsWith('/v1/arcade/'))return;
  socket.on('error',()=>{});socket.setTimeout(10000,()=>socket.destroy());
  try{
   check(req.url==='/v1/quake3/socket',404,'Not found');
   check(config.allowedOrigins.has(req.headers.origin),403,'Origin not allowed');
   const user=await currentUser(db,req,config);check(user,401,'Sign in');
   await limit(db,'q3:socket:'+clientKey(req,config),20,60);
   const protocols=(req.headers['sec-websocket-protocol']||'').split(',').map(x=>x.trim());
   const ticket=protocols.find(x=>/^mg-ticket\.[A-Za-z0-9_-]{43}$/.test(x))?.slice(10);
   check(ticket,401,'Missing ticket');
   const endpoint=new URL('/socket',config.quake3Origin);endpoint.protocol='ws:';
   const upstream=new WebSocket(endpoint,{headers:{Authorization:'Bearer '+config.quake3Key,'X-Player':user.id,'X-Ticket':ticket},handshakeTimeout:8000,maxPayload:16384,perMessageDeflate:false});
   upstream.once('error',()=>socket.destroy());
   socket.once('close',()=>upstream.terminate());
   upstream.once('open',()=>{
    if(socket.destroyed){upstream.terminate();return;}
    socket.setTimeout(0);
    wss.handleUpgrade(req,socket,head,client=>{
     clients.add(client);const stop=()=>{clients.delete(client);client.terminate();upstream.terminate();};
     client.on('error',stop);upstream.on('error',stop);client.on('close',stop);upstream.on('close',stop);
     client.on('message',(data,binary)=>{if(!binary||upstream.bufferedAmount>262144)return stop();if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:true});});
     upstream.on('message',data=>{if(client.bufferedAmount>262144)return stop();if(client.readyState===WebSocket.OPEN)client.send(data,{binary:true});});
    });
   });
  }catch{if(!socket.destroyed)socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
 });
 server.closeQuake3Sockets=()=>{for(const c of clients)c.terminate();};
 server.on('close',()=>{server.closeQuake3Sockets();wss.close();});
}
