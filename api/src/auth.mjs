import {randomUUID,createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {one,transaction} from './db.mjs';
import {check,randomToken,hash,cookie,cookieName,setCookie} from './security.mjs';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const currentUser=async(db,req,config)=>{
 const token=cookie(req,cookieName(config));
 return token&&/^[A-Za-z0-9_-]{43}$/.test(token)?one(db,'SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now()',[hash(token)]):undefined;
};
export async function startLogin(db,res,config){
 check(config.googleClientId&&config.googleClientSecret,503,'Google sign-in is not available yet');
 const state=randomToken(),nonce=randomToken(),verifier=randomToken();
 await db.query("INSERT INTO oauth_states VALUES($1,$2,$3,now()+interval '10 minutes')",[hash(state),nonce,verifier]);
 setCookie(res,config,'oauth',state,600);
 const query=new URLSearchParams({client_id:config.googleClientId,redirect_uri:config.googleRedirectUri,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
 res.writeHead(302,{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+query}).end();
}
export async function finishLogin(db,req,res,config,url,verify=jwtVerify,fetcher=fetch){
 const state=url.searchParams.get('state');
 check(state&&/^[A-Za-z0-9_-]{43}$/.test(state)&&state===cookie(req,cookieName(config,'oauth')),400,'Invalid login state');
 const saved=await one(db,'DELETE FROM oauth_states WHERE hash=$1 AND expires_at>now() RETURNING *',[hash(state)]);
 setCookie(res,config,'oauth','',0);
 const code=url.searchParams.get('code');
 check(saved&&!url.searchParams.has('error')&&code&&code.length<=4096,400,'Login expired or denied');
 const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),body:new URLSearchParams({code,client_id:config.googleClientId,client_secret:config.googleClientSecret,redirect_uri:config.googleRedirectUri,grant_type:'authorization_code',code_verifier:saved.verifier})});
 check(response.ok,401,'Google sign-in failed');
 const tokens=await response.json();
 let payload;try{({payload}=await verify(tokens.id_token,keys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.googleClientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub','nonce','email','email_verified']}));}catch{check(false,401,'Google identity could not be verified');}
 check(payload.nonce===saved.nonce&&typeof payload.sub==='string'&&payload.sub.length>0&&payload.sub.length<=255&&payload.email_verified===true&&typeof payload.email==='string'&&payload.email.length<=320,401,'Google identity could not be verified');
 const session=randomToken();
 await transaction(db,async client=>{
  const user=await one(client,`INSERT INTO users(id,google_sub,email,name) VALUES($1,$2,$3,$4) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name RETURNING id`,[randomUUID(),payload.sub,payload.email,String(payload.name||payload.email).slice(0,200)]);
  const old=cookie(req,cookieName(config));if(old)await client.query('DELETE FROM sessions WHERE hash=$1',[hash(old)]);
  await client.query("INSERT INTO sessions VALUES($1,$2,now()+interval '30 days')",[hash(session),user.id]);
 });
 setCookie(res,config,'session',session,30*86400);
 res.writeHead(302,{Location:config.appOrigin+'/account.html'}).end();
}
