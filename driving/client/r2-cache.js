import {AssetStore} from './asset-store.js';
const HOST='https://assets.peytontolbert.com',MAX=64*1024*1024;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function validateDescriptor(row,path){
 if(!row||row.path!==path||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>100*1024*1024||!Array.isArray(row.parts)||row.parts.length>64)throw Error('Invalid asset metadata');
 let total=0;for(const p of row.parts){
  const u=new URL(p.url||HOST+'/objects/sha256/'+p.sha256+'.bin');
  if(u.origin!==HOST||u.username||u.password||u.search||u.hash||!/^\/(objects|releases)\//.test(u.pathname)||!(/^[a-f0-9]{64}$/).test(p.sha256)||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>MAX||!Number.isSafeInteger(p.offset)||p.offset<0||!Number.isSafeInteger(p.length)||p.length<0||p.offset+p.length>p.bytes)throw Error('Invalid R2 asset proof');
  total+=p.length;
 }if(total!==row.bytes)throw Error('Invalid asset slices');return row;
}
export class DownloadQueue {
 constructor({concurrency=2,interval=125,wait=sleep,now=Date.now}={}){Object.assign(this,{concurrency,interval,wait,now});this.active=0;this.peak=0;this.next=0;this.waiters=[];}
 async run(task){
  if(this.active>=this.concurrency)await new Promise(resolve=>this.waiters.push(resolve));else this.active++;
  this.peak=Math.max(this.peak,this.active);
  try{const at=Math.max(this.now(),this.next);this.next=at+this.interval;await this.wait(Math.max(0,at-this.now()));return await task();}
  finally{const next=this.waiters.shift();if(next)next();else this.active--;}
 }
 async backoff(response,attempt){
  const header=response?.headers?.get('retry-after');let delay=header?(Number(header)*1000||Date.parse(header)-this.now()):500*2**attempt;
  delay=Math.max(250,Number.isFinite(delay)?delay:500*2**attempt);if(delay>30000)throw Error('R2 is rate-limiting downloads. Please retry later.');
  this.next=Math.max(this.next,this.now()+delay);await this.wait(delay);
 }
}
function checksumWorker(){
 let worker,id=0;const jobs=new Map();
 return async blob=>{
  worker??=new Worker('/driving/hash-worker.js',{type:'module'});
  worker.onmessage=({data})=>{const j=jobs.get(data.id);if(!j)return;jobs.delete(data.id);clearTimeout(j.timer);data.error?j.reject(Error(data.error)):j.resolve(data.hash);};
  worker.onerror=()=>{for(const j of jobs.values()){clearTimeout(j.timer);j.reject(Error('Asset verification failed'));}jobs.clear();worker.terminate();worker=null;};
  const buffer=await blob.arrayBuffer();return new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{jobs.delete(key);reject(Error('Asset verification timed out'));},30000);jobs.set(key,{resolve,reject,timer});worker.postMessage({id:key,buffer},[buffer]);});
 };
}
export class R2Assets {
 constructor({base,fetcher=globalThis.fetch.bind(globalThis),store=new AssetStore(),checksum=checksumWorker(),queue=new DownloadQueue()}={}){
  Object.assign(this,{base,fetcher,store,checksum,queue});this.pending=new Map();this.memory=new Map();this.memoryBytes=0;this.proofs=new Map();this.requests=new Map();this.metadataBusy=false;
  this.stats={mode:'r2',downloads:0,downloadedBytes:0,diskHits:0,memoryHits:0,corrupt:0,retries:0,metadataRequests:0};
 }
 async init(){
  return this.ready??=(async()=>{const r=await this.fetcher(this.base+'/asset-catalog',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Asset catalog unavailable');const c=await r.json();if(c.mode!=='r2'||!(/^[a-f0-9]{64}$/).test(c.revision))throw Error('R2 assets are not configured for this server');this.revision=c.revision;})();
 }
 async describe(path){
  await this.init();if(this.proofs.has(path))return this.proofs.get(path);
  const job=(async()=>{
   const key=this.revision+':'+path,saved=await this.store.get('proofs',key);
   if(saved)try{return validateDescriptor(saved,path);}catch{await this.store.remove('proofs',key);}
   return new Promise((resolve,reject)=>{this.requests.set(path,{resolve,reject,key});this.scheduleMetadata();});
  })();this.proofs.set(path,job);try{return await job;}catch(e){this.proofs.delete(path);throw e;}
 }
 async prefetch(urls){
  const paths=[...new Set(urls.map(value=>new URL(value,'https://matrixgames-assets.invalid/assets/').pathname.replace(/^\/assets\//,'')))];
  await Promise.all(paths.map(path=>this.describe(path)));
 }
 scheduleMetadata(){if(this.metadataBusy||this.metadataTimer)return;this.metadataTimer=setTimeout(()=>{this.metadataTimer=null;void this.metadata();},8);}
 async metadata(){
  if(this.metadataBusy||!this.requests.size)return;this.metadataBusy=true;
  const batch=[...this.requests].slice(0,64);for(const [path] of batch)this.requests.delete(path);
  try{
   this.stats.metadataRequests++;const r=await this.fetcher(this.base+'/asset-proofs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paths:batch.map(([p])=>p)}),credentials:'omit',signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('Asset metadata unavailable ('+r.status+')');const data=await r.json();if(data.revision!==this.revision||!Array.isArray(data.entries))throw Error('Asset catalog changed. Reload to continue.');
   const rows=new Map(data.entries.map(e=>[e.path,e.asset]));
   for(const [path,j] of batch){const row=rows.get(path);if(!row){j.resolve(null);continue;}try{validateDescriptor(row,path);await this.store.put('proofs',j.key,row);j.resolve(row);}catch(e){j.reject(e);}}
  }catch(e){for(const [,j] of batch)j.reject(e);}finally{this.metadataBusy=false;this.scheduleMetadata();}
 }
 remember(key,blob){
  if(this.memory.has(key))this.memoryBytes-=this.memory.get(key).size;this.memory.delete(key);this.memory.set(key,blob);this.memoryBytes+=blob.size;
  while(this.memoryBytes>96*1024*1024&&this.memory.size>1){const key=this.memory.keys().next().value;this.memoryBytes-=this.memory.get(key).size;this.memory.delete(key);}return blob;
 }
 async chunk(p){
  if(this.memory.has(p.sha256)){this.stats.memoryHits++;return this.remember(p.sha256,this.memory.get(p.sha256));}
  if(this.pending.has(p.sha256))return this.pending.get(p.sha256);
  const work=async()=>{
   const saved=await this.store.get('objects',p.sha256);
   if(saved instanceof Blob){if(saved.size===p.bytes&&await this.checksum(saved)===p.sha256){this.stats.diskHits++;void this.store.touch?.(p.sha256,saved.size);return this.remember(p.sha256,saved);}this.stats.corrupt++;await this.store.remove('objects',p.sha256);}
   return this.queue.run(async()=>{
    const url=p.url||HOST+'/objects/sha256/'+p.sha256+'.bin';let blob;
    for(let attempt=0;attempt<3;attempt++){
     let r;try{r=await this.fetcher(url,{mode:'cors',credentials:'omit',redirect:'error',cache:attempt?'reload':'force-cache',signal:AbortSignal.timeout(45000)});}catch(e){if(attempt===2)throw e;this.stats.retries++;await this.queue.backoff(null,attempt);continue;}
     if([429,502,503,504].includes(r.status)&&attempt<2){await r.body?.cancel();this.stats.retries++;await this.queue.backoff(r,attempt);continue;}
     if(r.status!==200||!r.body)throw Error('R2 asset download failed ('+r.status+')');
     const reader=r.body.getReader(),parts=[];let bytes=0;
     try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>p.bytes)throw Error('Oversize R2 asset');parts.push(value);}}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
     blob=new Blob(parts);if(blob.size!==p.bytes||await this.checksum(blob)!==p.sha256)throw Error('R2 asset integrity check failed');break;
    }
    if(!blob)throw Error('R2 download did not complete');this.stats.downloads++;this.stats.downloadedBytes+=blob.size;await this.store.put('objects',p.sha256,blob);return this.remember(p.sha256,blob);
   });
  };
  const job=globalThis.navigator?.locks?.request?navigator.locks.request('matrixgames-asset-'+p.sha256,work):work();
  this.pending.set(p.sha256,job);try{return await job;}finally{this.pending.delete(p.sha256);}
 }
 async response(path){
  const row=await this.describe(path);if(!row)return new Response('Asset not published',{status:404});
  const parts=[];for(const p of row.parts){const blob=await this.chunk(p);parts.push(blob.slice(p.offset,p.offset+p.length));}
  return new Response(new Blob(parts,{type:row.type}),{headers:{'Content-Type':row.type,'Content-Length':String(row.bytes)}});
 }
 status(){return {...this.stats,active:this.queue.active,peakActive:this.queue.peak,queued:this.queue.waiters.length,cacheError:this.store.error||null};}
}
