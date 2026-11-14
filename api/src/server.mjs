import http from 'node:http';
import {launcherRoute} from './launcher.mjs';
import {nativeSetupRoute} from './native-setup.mjs';
import {arcadeRoute,installArcadeSocket} from './arcade.mjs';
import {drivingRoute,installDrivingSocket} from './driving.mjs';
import {pathToFileURL} from 'node:url';
import {configuration} from './config.mjs';
import {connect,cleanup} from './db.mjs';
import {currentUser,startLogin,finishLogin} from './auth.mjs';
import {check,cookie,cookieName,hash,setCookie,send} from './security.mjs';
import {clientKey,limit} from './limits.mjs';
import {quake3Route,installQuake3Socket} from './quake3.mjs';
export function createServer({db,config,verify,fetcher}){
 const server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  if(config.production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try{
   check(req.url.length<=8192,414,'Request URL too long');
   const origin=req.headers.origin;
   if(origin){check(config.allowedOrigins.has(origin),403,'Origin is not allowed');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){
    check(origin&&['GET','POST'].includes(req.headers['access-control-request-method']),403,'Preflight is not allowed');
    const headers=(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    check(headers.every(x=>x==='content-type'),403,'Headers are not allowed');
    res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}).end();return;
   }
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(path==='/health'&&req.method==='GET'){await db.query('SELECT 1');send(res,200,{ok:true,service:'matrixgames-accounts'});return;}
   if(req.method==='GET'&&path.startsWith('/v1/driving/assets/')){await limit(db,'driving:assets:'+clientKey(req,config),1800,60);await drivingRoute(req,res,{db,config,url});return;}
   if(req.method==='POST'&&path==='/v1/driving/asset-proofs'){await limit(db,'driving:metadata:'+clientKey(req,config),240,60);await drivingRoute(req,res,{db,config,url});return;}
   await limit(db,'requests:global',1200,60);
   const key=clientKey(req,config);await limit(db,'requests:'+key,120,60);
   if(await launcherRoute(req,res,{db,config,url}))return;
   if(await quake3Route(req,res,{db,config,url}))return;
   if(await arcadeRoute(req,res,{db,config,url}))return;
   if(await drivingRoute(req,res,{db,config,url}))return;
   if(await nativeSetupRoute(req,res,{db,config,url}))return;
   if(path==='/v1/config'&&req.method==='GET'){send(res,200,{googleEnabled:Boolean(config.googleClientId&&config.googleClientSecret),loginUrl:config.apiOrigin+'/auth/google/start'});return;}
   if(path==='/v1/me'&&req.method==='GET'){send(res,200,{user:await currentUser(db,req,config)||null});return;}
   if(path==='/auth/google/start'&&req.method==='GET'){
    await limit(db,'login:global',300,600);await limit(db,'login:'+key,10,600);await startLogin(db,res,config);return;
   }
   if(path==='/api/callback'&&req.method==='GET'){
    await limit(db,'callback:'+key,30,60);await finishLogin(db,req,res,config,url,verify,fetcher);return;
   }
   if(path==='/v1/logout'&&req.method==='POST'){
    check(origin&&config.allowedOrigins.has(origin),403,'An allowed origin is required');
    check(req.headers['content-type']?.split(';')[0]==='application/json',415,'Use application/json');
    check(!req.headers['transfer-encoding']&&Number(req.headers['content-length']||0)<=1024,413,'Request too large');req.resume();
    const token=cookie(req,cookieName(config));if(token)await db.query('DELETE FROM sessions WHERE hash=$1',[hash(token)]);
    setCookie(res,config,'session','',0);send(res,200,{ok:true});return;
   }
   send(res,404,{error:'Not found'});
  }catch(e){if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));send(res,e.status||500,{error:e.status?e.message:'Account service unavailable'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 installQuake3Socket(server,{db,config});installArcadeSocket(server,{db,config});
 installDrivingSocket(server,{db,config});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=configuration();if(!config.databaseUrl)throw Error('DATABASE_URL is required');
 const db=connect(config.databaseUrl);await db.query('SELECT 1');
 const server=createServer({db,config});server.listen(config.port,'127.0.0.1',()=>console.log('Matrix Games account service ready'));
 const timer=setInterval(()=>cleanup(db).catch(()=>console.error('Account cleanup failed')),300000);timer.unref();
 const stop=()=>{clearInterval(timer);server.closeQuake3Sockets();server.closeArcadeSockets();server.closeDrivingSockets();server.close(()=>db.end().then(()=>process.exit(0)));};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
