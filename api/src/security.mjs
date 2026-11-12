import {createHash,randomBytes} from 'node:crypto';
export const randomToken=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const check=(ok,status,message)=>{if(!ok)throw Object.assign(Error(message),{status});};
export const cookieName=(config,kind='session')=>(config.production?'__Host-':'')+'mg_'+kind;
export const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
export function setCookie(res,config,kind,value,seconds){
 const previous=res.getHeader('Set-Cookie')||[];
 res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:[previous]),`${cookieName(config,kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.production?'; Secure':''}`]);
}
export const send=(res,status,value)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));
