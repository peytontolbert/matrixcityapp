import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,jwtVerify} from 'jose';
import {createHash} from 'node:crypto';
import {connect,migrate} from '../src/db.mjs';
import {configuration} from '../src/config.mjs';
import {createServer} from '../src/server.mjs';
import {clientKey} from '../src/limits.mjs';
import {hash} from '../src/security.mjs';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('An isolated TEST_DATABASE_URL ending in _test is required');
const db=connect(url),config=configuration({NODE_ENV:'production',APP_ORIGIN:'https://matrixgames.app',API_ORIGIN:'https://api.matrixgames.app',GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'test-only-fixture'});
let server,origin,keys,nonce,claims,exchange;
before(async()=>{
 await migrate(db);keys=await generateKeyPair('RS256');
 server=createServer({db,config,verify:(token,_keys,options)=>jwtVerify(token,keys.publicKey,options),fetcher:async(_url,options)=>{
  exchange=Object.fromEntries(options.body);assert.equal(options.redirect,'error');
  const token=await new SignJWT({sub:'fixture-google-sub',email:'fixture@example.test',email_verified:true,name:'Fixture Person',nonce,...claims})
   .setProtectedHeader({alg:'RS256'}).setIssuedAt().setExpirationTime(claims.exp??'5m').setIssuer(claims.iss??'https://accounts.google.com').setAudience(claims.aud??'fixture-client').sign(keys.privateKey);
  return Response.json({id_token:token});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
});
beforeEach(async()=>{await db.query('TRUNCATE sessions,oauth_states,api_rate_limits,users CASCADE');claims={};exchange=undefined;});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
const call=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
async function start(){const response=await call('/auth/google/start');assert.equal(response.status,302);const query=new URL(response.headers.get('location')).searchParams;nonce=query.get('nonce');const state=query.get('state');return {response,query,state,cookie:'__Host-mg_oauth='+state};}
async function complete(login){return call('/api/callback?'+new URLSearchParams({state:login.state,code:'fixture-authorization-code'}),{headers:{Cookie:login.cookie}});}
test('login uses PKCE, state and host-only secure cookies; callback creates a persisted account',async()=>{
 const login=await start();assert.equal(login.query.get('redirect_uri'),'https://api.matrixgames.app/api/callback');assert.equal(login.query.get('code_challenge_method'),'S256');
 const cookie=login.response.headers.get('set-cookie');for(const flag of ['__Host-mg_oauth=','HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(cookie.includes(flag));assert.ok(!cookie.includes('Domain='));
 const result=await complete(login);assert.equal(result.status,302);assert.equal(result.headers.get('location'),'https://matrixgames.app/account.html');
 assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'),login.query.get('code_challenge'));
 const cookies=result.headers.getSetCookie();assert.ok(cookies.some(x=>x.includes('__Host-mg_oauth=;')&&x.includes('Max-Age=0')));
 const session=cookies.find(x=>x.startsWith('__Host-mg_session=')).split(';')[0],raw=session.split('=')[1];
 const saved=(await db.query('SELECT hash FROM sessions')).rows[0];assert.equal(saved.hash,hash(raw));assert.notEqual(saved.hash,raw);
 const me=await (await call('/v1/me',{headers:{Cookie:session,Origin:config.appOrigin}})).json();assert.equal(me.user.email,'fixture@example.test');assert.deepEqual(Object.keys(me.user).sort(),['email','id','name']);
 assert.equal((await complete(login)).status,400,'single-use state rejects replay');
 await migrate(db);assert.equal((await db.query('SELECT count(*) FROM users')).rows[0].count,'1','migration preserves accounts');
});
test('forged, missing-cookie and expired OAuth states never reach Google exchange',async()=>{
 const login=await start();assert.equal((await call('/api/callback?state='+login.state+'&code=x')).status,400);
 await db.query("UPDATE oauth_states SET expires_at=now()-interval '1 second'");assert.equal((await complete(login)).status,400);assert.equal(exchange,undefined);
 assert.equal((await db.query('SELECT count(*) FROM sessions')).rows[0].count,'0');
});
test('Google nonce, verified email, audience, issuer and expiry are validated cryptographically',async()=>{
 for(const bad of [{nonce:'wrong'},{email_verified:false},{aud:'wrong-client'},{iss:'https://attacker.example.test'},{exp:1}]){
  claims=bad;const login=await start();assert.equal((await complete(login)).status,401);assert.equal((await db.query('SELECT count(*) FROM sessions')).rows[0].count,'0');
 }
});
test('CORS is exact and logout requires an allowed origin and JSON',async()=>{
 const login=await start(),result=await complete(login),session=result.headers.getSetCookie().find(x=>x.startsWith('__Host-mg_session=')).split(';')[0];
 assert.equal((await call('/v1/me',{headers:{Origin:'https://matrixgames.app.attacker.test',Cookie:session}})).status,403);
 assert.equal((await call('/v1/logout',{method:'POST',headers:{Cookie:session,'Content-Type':'application/json'},body:'{}'})).status,403);
 const preflight=await call('/v1/logout',{method:'OPTIONS',headers:{Origin:config.appOrigin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),config.appOrigin);
 const logout=await call('/v1/logout',{method:'POST',headers:{Cookie:session,Origin:config.appOrigin,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await (await call('/v1/me',{headers:{Cookie:session}})).json()).user,null);
});
test('session expiry is enforced and public responses cannot be cached',async()=>{
 const login=await start(),result=await complete(login),session=result.headers.getSetCookie().find(x=>x.startsWith('__Host-mg_session=')).split(';')[0];
 await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
 const response=await call('/v1/me',{headers:{Cookie:session}});assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.json()).user,null);
});
test('login initiation is rate limited and exposes a retry interval',async()=>{
 for(let i=0;i<10;i++)assert.equal((await call('/auth/google/start')).status,302);
 const response=await call('/auth/google/start');assert.equal(response.status,429);assert.ok(Number(response.headers.get('Retry-After'))>0);
 assert.equal((await db.query('SELECT count(*) FROM oauth_states')).rows[0].count,'10');
});
test('proxy identity is trusted only over loopback and IPv6 /64 shares a quota',()=>{
 const request=(remote,forwarded)=>({socket:{remoteAddress:remote},headers:{'cf-connecting-ip':forwarded}});
 assert.equal(clientKey(request('203.0.113.4','198.51.100.2'),config),hash('203.0.113.4'));
 assert.equal(clientKey(request('127.0.0.1','2001:db8:1:2::1'),config),clientKey(request('127.0.0.1','2001:db8:1:2::99'),config));
});
