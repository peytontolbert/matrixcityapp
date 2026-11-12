import {isIP} from 'node:net';
import {hash} from './security.mjs';
import {one} from './db.mjs';
export function clientKey(req,config){
 const remote=req.socket.remoteAddress||'unknown',forwarded=req.headers['cf-connecting-ip'];
 let ip=config.trustCloudflareProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:remote;
 if(isIP(ip)===6&&!ip.includes('.')){
  const [left,right='']=ip.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
  const parts=ip.includes('::')?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a;
  ip=parts.slice(0,4).map(x=>parseInt(x||'0',16).toString(16)).join(':')+'::/64';
 }
 return hash(ip.replace(/^::ffff:/,''));
}
export async function limit(db,key,maximum,seconds){
 const row=await one(db,`INSERT INTO api_rate_limits(key,hits,expires_at) VALUES($1,1,now()+($3::int * interval '1 second'))
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN api_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(api_rate_limits.hits+1,$2::int+1) END,
 expires_at=CASE WHEN api_rate_limits.expires_at<=now() THEN now()+($3::int * interval '1 second') ELSE api_rate_limits.expires_at END
 RETURNING hits,GREATEST(1,ceil(extract(epoch FROM expires_at-now())))::int AS retry_after`,[key,maximum,seconds]);
 if(row.hits>maximum)throw Object.assign(Error('Too many requests; retry later'),{status:429,retryAfter:row.retry_after});
}
