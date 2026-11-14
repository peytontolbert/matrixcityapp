import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {ASSET_BASE} from './world.js';
import {VEHICLES} from './vehicles.js';
const carIds=new Set(VEHICLES.map(v=>v.id));
const allowed=path=>ALLOWED.test(path)||/^(?:physics\/assetto-corsa|custom_vehicles)\/([a-z0-9_-]+)\.json$/.test(path)&&carIds.has(path.split('/').at(-1).slice(0,-5))||/^models\/custom_vehicles\//.test(path)&&carIds.has(path.split('/')[2]);
const ALLOWED=/^(vehicle_audio\/|city_audio\/|matrix-universe\/world-packages\/(nohesi-110|nohesi-415-island-v[12])\/|physics\/assetto-corsa\/06_ygt_53_nissan_350z\.json$|custom_vehicles\/06_ygt_53_nissan_350z\.json$|models\/custom_vehicles\/06_ygt_53_nissan_350z\/|models\/traffic-110-v2\/prius-[a-z0-9.-]+$|models\/fleet-lods-v4\/[a-f0-9]{64}\.mesh(?:\.gz)?$|models\/car-lights-v3\/[a-f0-9]{24}\.png$|models_textures\/[0-9]+\.webp$|matrixgames\/)/;
const TYPES={json:'application/json',gz:'application/octet-stream',bin:'application/octet-stream',webp:'image/webp',png:'image/png',jpg:'image/jpeg'};
export class Assets {
 constructor({root,extraRoot,linkedRoots=[],index=null,fetcher=globalThis.fetch}){Object.assign(this,{root,extraRoot,linkedRoots,index,fetcher});this.cache=new Map();this.pending=new Map();this.cacheBytes=0;}
 catalog(){return {schema:1,mode:this.index?'r2':'local',revision:this.index?(this.revision??=createHash('sha256').update(JSON.stringify(this.index)).digest('hex')):null};}
 describe(path){
  if(typeof path!=='string'||!allowed(path)||path.split('/').some(s=>s==='..'||s==='.'||s.includes('\\'))||path.includes('%'))return null;
  const row=Object.hasOwn(this.index||{},path)?this.index[path]:null;if(!row)return null;
  return {path,bytes:row.bytes,type:row.type||TYPES[path.split('.').at(-1)]||'application/octet-stream',parts:row.parts.map(p=>({...p,offset:p.offset??0,length:p.length??p.bytes}))};
 }
 async get(path){
  if(!allowed(path)||path.split('/').some(s=>s==='..'||s==='.'||s.includes('\\'))||path.includes('%'))throw Error('Asset path not allowed');
  let bytes,type=TYPES[path.split('.').at(-1)]||'application/octet-stream';
  if(this.root||path==='matrixgames/415-network.json'){
   const root=await realpath(path.startsWith('matrixgames/')?this.extraRoot:this.root);
   const filename=await realpath(resolve(root,path.startsWith('matrixgames/')?path.slice(12):path));
   const allowedRoots=[root,...await Promise.all(this.linkedRoots.map(p=>realpath(p)))];
   if(!allowedRoots.some(p=>filename.startsWith(p+sep)))throw Error('Asset escaped root');
   if((await stat(filename)).size>100*1024*1024)throw Error('Asset too large');bytes=await readFile(filename);
  }else{
   const row=this.describe(path);if(!row)throw Error('Asset not published');
   const parts=[];for(const part of row.parts){const chunk=await this.chunk(part.sha256,part.bytes,part.url);parts.push(chunk.subarray(part.offset,part.offset+part.length));}
   bytes=Buffer.concat(parts);if(bytes.length!==row.bytes)throw Error('Asset length mismatch');type=row.type||type;
  }
  return {bytes,type};
 }
 async chunk(sha,size,url='https://assets.peytontolbert.com/objects/sha256/'+sha+'.bin'){
  const target=new URL(url);if(target.origin!=='https://assets.peytontolbert.com'||target.username||target.password||target.search||target.hash)throw Error('Invalid asset host');
  if(!/^[a-f0-9]{64}$/.test(sha)||!Number.isSafeInteger(size)||size<1||size>64*1024*1024)throw Error('Invalid asset chunk');
  if(this.cache.has(sha)){const v=this.cache.get(sha);this.cache.delete(sha);this.cache.set(sha,v);return v;}
  if(this.pending.has(sha))return this.pending.get(sha);
  const job=(async()=>{
   const r=await this.fetcher(target,{signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error('Shared asset unavailable');
   const parts=[];let n=0;for await(const b of r.body){n+=b.length;if(n>size)throw Error('Chunk too large');parts.push(b);}
   const bytes=Buffer.concat(parts);if(bytes.length!==size||createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Chunk integrity failed');
   while(this.cacheBytes+size>128*1024*1024&&this.cache.size){const key=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(key).length;this.cache.delete(key);}
   this.cache.set(sha,bytes);this.cacheBytes+=size;return bytes;
  })();this.pending.set(sha,job);try{return await job;}finally{this.pending.delete(sha);}
 }
 install(){const previous=globalThis.fetch;globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.origin!==new URL(ASSET_BASE).origin)return previous(input,init);
  const path=url.pathname.replace(/^\/assets\//,'');const {bytes,type}=await this.get(path);return new Response(bytes,{headers:{'content-type':type}});
 };return()=>{globalThis.fetch=previous;};}
}
