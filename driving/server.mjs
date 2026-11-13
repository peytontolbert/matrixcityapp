import http from 'node:http';
import {DrivingLeaderboard} from './scoring.mjs';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {NativeJoins} from './native-joins.mjs';
import {pathToFileURL} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {Assets} from './assets.js';
import {loadWorld,jsonAsset} from './world.js';
import {DrivingSession} from './sessions.js';
import {AssettoRelay} from './bridge/relay.mjs';
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
export function createDrivingServer({sessions,assets,key,staticRoot=null}){
 if(!key||key.length<43)throw Error('Private driving service key required');
 const expected=Buffer.from('Bearer '+key),authorized=req=>{const b=Buffer.from(req.headers.authorization||'');return b.length===expected.length&&timingSafeEqual(b,expected);};
 const sockets=new Set(),wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
 const nativeJoins=new NativeJoins(sessions);
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&url.pathname==='/sessions')return json(res,200,{sessions:[...sessions.values()].map(s=>s.info()),loginRequired:true});
   if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,ready:[...sessions.values()].every(s=>s.ready)});
   if(req.method==='GET'&&url.pathname==='/diagnostics'){
    if(!authorized(req))return json(res,403,{error:'Forbidden'});
    return json(res,200,{sessions:[...sessions.values()].map(s=>({room:s.room,ready:s.ready,environment:s.relay.environment,poseOffsets:s.relay.poseOffsets,native:s.relay.nativeVehicles().map(v=>({id:v.id,coupled:v.coupled,position:v.position,velocity:v.velocity}))}))});
   }
   if(req.method==='POST'&&url.pathname==='/traffic-settings'){
    if(!authorized(req))return json(res,403,{error:'Forbidden'});
    let size=0,parts=[];for await(const p of req){size+=p.length;if(size>1024)throw Error('Request too large');parts.push(p);}
    const body=JSON.parse(Buffer.concat(parts)),s=sessions.get(body.room);if(!s||!s.traffic.setPreset(body.preset))throw Error('Invalid traffic settings');
    return json(res,200,{room:body.room,preset:s.traffic.preset,population:s.traffic.population});
   }
   if(req.method==='GET'&&url.pathname==='/asset-catalog')return json(res,200,assets.catalog());
   if(req.method==='POST'&&url.pathname==='/asset-proofs'){
    let n=0,parts=[];for await(const p of req){n+=p.length;if(n>32768)throw Error('Metadata request too large');parts.push(p);}
    const body=JSON.parse(Buffer.concat(parts));if(!Array.isArray(body.paths)||body.paths.length>64||body.paths.some(p=>typeof p!=='string'||p.length>2048))throw Error('Invalid asset paths');
    return json(res,200,{revision:assets.catalog().revision,entries:body.paths.map(path=>({path,asset:assets.describe(path)}))});
   }
   if(req.method==='GET'&&url.pathname.startsWith('/assets/')){const {bytes,type}=await assets.get(decodeURIComponent(url.pathname.slice(8)));res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=3600'});return res.end(bytes);}
   if(req.method==='POST'&&['/ticket','/native-ticket','/native-redeem'].includes(url.pathname)){
    if(!authorized(req))return json(res,403,{error:'Forbidden'});
    let size=0,parts=[];for await(const p of req){size+=p.length;if(size>2048)throw Error('Request too large');parts.push(p);}
    const body=JSON.parse(Buffer.concat(parts));if(url.pathname==='/native-redeem')return json(res,200,nativeJoins.redeem(body.authorization,body.steamId));
    const actor=body.actor,session=sessions.get(body.room);if(!session)throw Error('Unknown track');
    if(url.pathname==='/native-ticket')return json(res,200,nativeJoins.issue(actor,body.room));
    nativeJoins.available(actor);return json(res,200,session.ticket(actor));
   }
   if(req.method==='GET'&&staticRoot){
    const root=await realpath(staticRoot),file=await realpath(resolve(root,'.'+(url.pathname==='/'?'/driving/index.html':decodeURIComponent(url.pathname))));
    if(!file.startsWith(root+sep))throw Error('Invalid path');
    const type=({'html':'text/html','js':'text/javascript','css':'text/css','json':'application/json','exe':'application/octet-stream'})[file.split('.').at(-1)];if(!type)throw Error('Not served');
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});return res.end(await readFile(file));
   }
   json(res,404,{error:'Not found'});
  }catch(e){json(res,400,{error:e.message});}
 });
 server.on('upgrade',(req,socket,head)=>{
  socket.on('error',()=>{});
  try{
   if(req.url!=='/socket')throw Error('Wrong path');
   if(!authorized(req))throw Error('Forbidden');
   const actor=req.headers['x-player'],ticket=req.headers['x-ticket'];
   const room=req.headers['x-room'],session=sessions.get(room);
   if(!session)throw Error('Unknown track');let client;
   const id=session.admit(actor,ticket,data=>{if(client?.readyState===WebSocket.OPEN){if(client.bufferedAmount>262144)client.close(1013,'Connection too slow');else client.send(JSON.stringify(data));}});
   let removed=false;const remove=()=>{if(!removed){removed=true;session.remove(actor);}};
   socket.once('close',remove);
   wss.handleUpgrade(req,socket,head,ws=>{
    client=ws;sockets.add(ws);ws.send(JSON.stringify({type:'welcome',you:id,room}));let budget=80,last=Date.now(),alive=true;
    const ping=setInterval(()=>{if(!alive)return ws.terminate();alive=false;ws.ping();},15000);ping.unref();
    ws.on('pong',()=>alive=true);ws.on('error',()=>ws.terminate());ws.on('close',()=>{clearInterval(ping);sockets.delete(ws);remove();});
    ws.on('message',(data,binary)=>{try{const now=Date.now();budget=Math.min(80,budget+(now-last)*.065);last=now;if(binary||--budget<0)throw Error('Rate exceeded');const input=JSON.parse(data);if(input?.type==='recover'){ws.send(JSON.stringify({type:'notice',message:session.recover(actor)}));}else session.input(actor,input);}catch{ws.close(1008,'Invalid driving input');}});
   });
  }catch{socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');}
 });
 let previous=performance.now(),relayDebt=0;
 const tick=setInterval(()=>{
  const now=performance.now(),dt=(now-previous)/1000;previous=now;relayDebt+=dt;
  for(const s of sessions.values())try{s.advance(dt);}catch(e){s.fail(e);}
  if(relayDebt>=.05){relayDebt=0;for(const s of sessions.values())s.exchange().catch(e=>{s.ready=false;s.error=e.message;});}
 },8);tick.unref();
 server.requestTimeout=10000;server.headersTimeout=10000;
 server.stop=async()=>{clearInterval(tick);for(const ws of sockets)ws.terminate();await Promise.all([...sessions.values()].map(s=>s.close()));wss.close();server.close();};
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8'));
 if(config.assets.indexFile)config.assets.index=JSON.parse(await readFile(config.assets.indexFile,'utf8'));
 const assets=new Assets(config.assets);assets.install();const profile=(await jsonAsset('physics/assetto-corsa/06_ygt_53_nissan_350z.json')).assettoHandling;
 const boardFile=config.leaderboardDb||config.leaderboardFile;
 if(!boardFile)throw Error('Persistent leaderboardDb is required');
 const leaderboard=new DrivingLeaderboard(boardFile);await leaderboard.load();
 const sessions=new Map();for(const entry of config.sessions){const trafficCapacity=entry.slots.filter(s=>s.kind==='traffic').length;if(entry.trafficCapacity!==undefined&&entry.trafficCapacity!==trafficCapacity)throw Error('Traffic population must equal reserved native slots');const world=await loadWorld(entry.room),relay=new AssettoRelay(entry);const session=new DrivingSession({...entry,trafficCapacity,world,profile,relay,leaderboard});sessions.set(entry.room,session);await session.exchange();}
 const server=createDrivingServer({...config,assets,sessions,key:await readFile(config.keyFile,'utf8')});
 server.listen(config.port||4192,config.host||'127.0.0.1',()=>console.log('Matrix Games driving ready'));
 server.on('close',()=>{void leaderboard.close().catch(()=>console.error('Leaderboard close failed'));});
 process.once('SIGTERM',()=>server.stop());process.once('SIGINT',()=>server.stop());
}
