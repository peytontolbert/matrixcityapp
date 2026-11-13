import {currentUser} from './auth.mjs';
import {check,send} from './security.mjs';
import {limit} from './limits.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function nativeSetupRoute(req,res,{db,config,url}){
 if(url.pathname!=='/v1/native-setup')return false;
 const user=await currentUser(db,req,config);check(user,401,'Sign in to save your native setup');
 if(req.method==='GET'){
  const result=await db.query('SELECT device_id AS "deviceId", settings FROM native_setups WHERE user_id=$1 ORDER BY updated_at DESC',[user.id]);
  send(res,200,{setups:result.rows});return true;
 }
 check(req.method==='POST',405,'Use GET or POST');check(config.allowedOrigins.has(req.headers.origin),403,'Origin not allowed');
 check(req.headers['content-type']?.split(';')[0]==='application/json',415,'Use application/json');
 await limit(db,'native-setup:'+user.id,20,60);
 let size=0,parts=[];for await(const p of req){size+=p.length;check(size<=2048,413,'Request too large');parts.push(p);}
 let body;try{body=JSON.parse(Buffer.concat(parts));}catch{check(false,400,'Invalid setup');}
 check(uuid.test(body?.deviceId||''),400,'Invalid device');
 if(body.remove===true){await db.query('DELETE FROM native_setups WHERE user_id=$1 AND device_id=$2',[user.id,body.deviceId]);send(res,200,{ok:true});return true;}
 const settings=body.settings;
 check(settings&&Object.keys(settings).sort().join(',')==='driver,gameFolder,steamFolder,steamId',400,'Invalid setup fields');
 for(const field of ['steamFolder','gameFolder','driver'])check(typeof settings[field]==='string'&&settings[field].trim().length>0&&settings[field].length<=(field==='driver'?32:160)&&!/[\x00-\x1f\x7f=\[\]]/.test(settings[field]),400,'Invalid '+field);
 check(/^7656119[0-9]{10}$/.test(settings.steamId),400,'Enter your 17-digit Steam ID');
 // A user row lock makes the device limit safe under concurrent requests.
 const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
  const count=await client.query('SELECT count(*) FROM native_setups WHERE user_id=$1 AND device_id<>$2',[user.id,body.deviceId]);check(Number(count.rows[0].count)<8,409,'Remove an old native setup before adding another');
  await client.query('INSERT INTO native_setups(user_id,device_id,settings) VALUES($1,$2,$3) ON CONFLICT(user_id,device_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()',[user.id,body.deviceId,settings]);await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 send(res,200,{ok:true});return true;
}
