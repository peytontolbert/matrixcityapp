import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {currentUser} from './auth.mjs';
import {one,transaction} from './db.mjs';
import {check,send,randomToken,hash} from './security.mjs';
import {limit,clientKey} from './limits.mjs';
import {validateManifest,publicIPv4,identifier,supportedGames} from './asset-manifest.mjs';
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
async function body(req){check(req.headers['content-type']?.split(';')[0]==='application/json',415,'Use application/json');let size=0,parts=[];for await(const p of req){size+=p.length;check(size<=1024*1024,413,'Request too large');parts.push(p);}let data;try{data=JSON.parse(Buffer.concat(parts));}catch{check(false,400,'Invalid JSON');}check(data&&typeof data==='object'&&!Array.isArray(data),400,'Expected a JSON object');return data;}
async function identity(db,req,config,write=false){
 const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 if(token)return one(db,'SELECT u.id,u.name FROM launcher_sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now()',[hash(token)]);
 if(write)check(config.allowedOrigins.has(req.headers.origin),403,'An allowed website origin is required');return currentUser(db,req,config);
}
async function user(db,req,config,write=false){const u=await identity(db,req,config,write);check(u,401,'Sign in to Matrix Games');return u;}
async function managed(config){
 if(!config.drivingKey)return [];try{const r=await fetch(config.drivingOrigin+'/sessions',{signal:AbortSignal.timeout(4000),redirect:'error'});check(r.ok,503,'Driving directory unavailable');const d=await r.json();return d.sessions.map(s=>({id:'managed-'+s.room,game:'assetto-corsa',name:s.room==='nohesi-110'?'110 · Los Angeles':'415 · Island',online:s.ready===true,players:s.nativePlayers??s.browserPlayers,capacity:s.nativeCapacity??s.capacity,managed:true,room:s.room,track:s.native.track,models:(s.cars||[{id:s.model,name:s.model}]).map(c=>({id:c.id,name:c.name}))}));}catch{return [];}
}
function publicServer(s){return {id:s.id,game:s.game,name:s.name,online:Date.now()-new Date(s.last_seen).getTime()<90000,players:s.players,capacity:s.capacity,managed:false,track:s.track,models:s.models.map(id=>({id,name:id}))};}
async function selected(db,config,id){if(id.startsWith('managed-'))return (await managed(config)).find(s=>s.id===id);const s=await one(db,'SELECT * FROM game_servers WHERE id=$1',[id]);return s?{...publicServer(s),record:s}:undefined;}
async function manifestFor(s,config){
 if(!s.managed)return validateManifest(s.record.manifest,s.game);
 check(config.nativeManifestsFile,503,'Server owner has not configured native assets');let manifests;try{manifests=JSON.parse(await readFile(config.nativeManifestsFile,'utf8'));}catch{check(false,503,'Server asset manifest unavailable');}
 return validateManifest(manifests[s.room],s.game);
}
export async function launcherRoute(req,res,{db,config,url}){
 const path=url.pathname;if(!path.startsWith('/v1/launcher/')&&!path.startsWith('/v1/servers'))return false;
 if(path==='/v1/servers'&&req.method==='GET'){
  const rows=(await db.query('SELECT * FROM game_servers ORDER BY last_seen DESC NULLS LAST LIMIT 200')).rows;send(res,200,{games:supportedGames,servers:[...await managed(config),...rows.map(publicServer)]});return true;
 }
 if(path==='/v1/launcher/me'&&req.method==='GET'){send(res,200,{user:await user(db,req,config)});return true;}
 check(req.method==='POST'||req.method==='GET',405,'Method not allowed');
 const match=path.match(/^\/v1\/servers\/([a-zA-Z0-9_-]{1,80})\/(manifest|join|update|remove|heartbeat)$/);
 if(match&&req.method==='GET'&&match[2]==='manifest'){
  await user(db,req,config);const s=await selected(db,config,match[1]);check(s,404,'Server not found');send(res,200,{server:s.id,manifest:await manifestFor(s,config)});return true;
 }
 check(req.method==='POST',404,'Not found');const data=await body(req),ip=clientKey(req,config);
 if(path==='/v1/launcher/auth/start'){
  await limit(db,'launcher:start:'+ip,8,600);const device=randomToken(),code=randomBytes(5).toString('hex').toUpperCase();
  await db.query("INSERT INTO launcher_devices(hash,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[hash(device),hash(code)]);
  send(res,200,{deviceCode:device,userCode:code,verificationUrl:config.appOrigin+'/launcher.html#code='+code,expiresIn:600,interval:5});return true;
 }
 if(path==='/v1/launcher/auth/approve'){
  check(config.allowedOrigins.has(req.headers.origin),403,'Use the Matrix Games website');const u=await currentUser(db,req,config);check(u,401,'Sign in first');await limit(db,'launcher:approve:'+u.id,15,600);
  check(/^[A-F0-9]{10}$/.test(data.userCode),400,'Invalid device code');const row=await one(db,'UPDATE launcher_devices SET user_id=$1 WHERE code_hash=$2 AND user_id IS NULL AND expires_at>now() RETURNING hash',[u.id,hash(data.userCode)]);check(row,400,'Code expired or already approved');send(res,200,{approved:true});return true;
 }
 if(path==='/v1/launcher/auth/poll'){
  check(tokenPattern.test(data.deviceCode),400,'Invalid device code');await limit(db,'launcher:poll:'+hash(data.deviceCode),15,60);
  const result=await transaction(db,async tx=>{const d=await one(tx,'SELECT * FROM launcher_devices WHERE hash=$1 AND expires_at>now() FOR UPDATE',[hash(data.deviceCode)]);check(d,400,'Sign-in expired');if(!d.user_id)return {pending:true};await tx.query('DELETE FROM launcher_devices WHERE hash=$1',[d.hash]);const token=randomToken();await tx.query("INSERT INTO launcher_sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",[hash(token),d.user_id]);return {token,expiresIn:30*86400};});send(res,200,result);return true;
 }
 if(path==='/v1/launcher/auth/logout'){
  const u=await user(db,req,config,true),token=req.headers.authorization?.slice(7);if(token)await db.query('DELETE FROM launcher_sessions WHERE hash=$1 AND user_id=$2',[hash(token),u.id]);send(res,200,{ok:true});return true;
 }
 if(match&&match[2]==='heartbeat'){
  check(tokenPattern.test(data.token),401,'Invalid heartbeat token');await limit(db,'server:beat:'+match[1],20,60);
  check(Number.isInteger(data.players)&&data.players>=0&&data.players<=255,400,'Invalid player count');const row=await one(db,'UPDATE game_servers SET last_seen=now(),players=LEAST($1,capacity) WHERE id=$2 AND heartbeat_hash=$3 RETURNING id',[data.players,match[1],hash(data.token)]);check(row,403,'Server heartbeat rejected');send(res,200,{ok:true});return true;
 }
 const u=await user(db,req,config,true);
 if(path==='/v1/servers/register'||match?.[2]==='update'){
  await limit(db,'server:manage:'+u.id,20,600);
  check(data.game==='assetto-corsa'&&typeof data.name==='string'&&data.name.trim().length>=1&&data.name.length<=100&&publicIPv4(data.host),400,'Use a supported game, name and public IPv4 address');
  check([data.gamePort,data.httpPort].every(p=>Number.isInteger(p)&&p>=1&&p<=65535)&&Number.isInteger(data.capacity)&&data.capacity>=1&&data.capacity<=255,400,'Invalid ports or capacity');
  check(identifier(data.track)&&Array.isArray(data.models)&&data.models.length>0&&data.models.length<=64&&data.models.every(identifier),400,'Invalid track or models');
  const manifest=validateManifest(data.manifest,data.game);check(manifest.assets.some(a=>a.kind==='track'&&a.id===data.track)&&data.models.every(id=>manifest.assets.some(a=>a.kind==='car'&&a.id===id)),400,'Manifest must cover the server track and cars');
  if(path==='/v1/servers/register'){
   const result=await transaction(db,async tx=>{await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);const count=await one(tx,'SELECT count(*)::int AS count FROM game_servers WHERE owner_id=$1',[u.id]);check(count.count<10,429,'Server listing limit reached');const id=randomUUID(),token=randomToken();await tx.query('INSERT INTO game_servers(id,owner_id,game,name,host,game_port,http_port,track,models,manifest,capacity,heartbeat_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,u.id,data.game,data.name.trim(),data.host,data.gamePort,data.httpPort,data.track,JSON.stringify(data.models),JSON.stringify(manifest),data.capacity,hash(token)]);return {id,heartbeatToken:token,heartbeatEverySeconds:30};});send(res,201,result);return true;
  }
  const row=await one(db,'UPDATE game_servers SET name=$1,host=$2,game_port=$3,http_port=$4,track=$5,models=$6,manifest=$7,capacity=$8,last_seen=NULL WHERE id=$9 AND owner_id=$10 RETURNING id',[data.name.trim(),data.host,data.gamePort,data.httpPort,data.track,JSON.stringify(data.models),JSON.stringify(manifest),data.capacity,match[1],u.id]);check(row,404,'Owned server not found');send(res,200,{id:row.id});return true;
 }
 if(match?.[2]==='remove'){const row=await one(db,'DELETE FROM game_servers WHERE id=$1 AND owner_id=$2 RETURNING id',[match[1],u.id]);check(row,404,'Owned server not found');send(res,200,{removed:true});return true;}
 if(match?.[2]==='join'){
  await limit(db,'launcher:join:'+u.id,12,60);check(/^7656119[0-9]{10}$/.test(data.steamId)&&identifier(data.model),400,'Invalid Steam account or model');
  const s=await selected(db,config,match[1]);check(s&&s.online,409,'Server is offline');check(s.models.some(m=>m.id===data.model),400,'Car is not in this server');const manifest=await manifestFor(s,config);check(data.manifestRevision===manifest.revision,409,'Server content changed; review its assets again');
  if(s.managed){const call=async(path,body)=>{const r=await fetch(config.drivingOrigin+path,{method:'POST',headers:{authorization:'Bearer '+config.drivingKey,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000)});const d=await r.json();check(r.ok,r.status,d.error||'Native join unavailable');return d;};const grant=await call('/native-ticket',{actor:u.id,room:s.room,model:data.model});send(res,200,{game:s.game,server:s.id,...await call('/native-redeem',{authorization:grant.authorization,steamId:data.steamId})});return true;}
  send(res,200,{schema:3,mode:'community',game:s.game,server:s.id,host:s.record.host,httpPort:s.record.http_port,gamePort:s.record.game_port,track:s.track,model:data.model,password:'',expiresAt:Date.now()+90000});return true;
 }
 send(res,404,{error:'Not found'});return true;
}
