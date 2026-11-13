import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {R2Assets,DownloadQueue,validateDescriptor} from '../client/r2-cache.js';
import {sha256} from '../vendor/sha256.js';
const checksum=async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
class MemoryStore{constructor(){this.rows=new Map();}async get(store,key){return this.rows.get(store+key);}async put(store,key,value){this.rows.set(store+key,value);}async remove(store,key){this.rows.delete(store+key);}}
const descriptor=(text,path='models/test.mesh')=>{const b=Buffer.from(text),sha=createHash('sha256').update(b).digest('hex');return {path,bytes:b.length,type:'application/octet-stream',parts:[{sha256:sha,bytes:b.length,offset:0,length:b.length,url:'https://assets.peytontolbert.com/objects/sha256/'+sha+'.bin'}]};};
const client=(store,fetcher,queue=new DownloadQueue({interval:0}))=>new R2Assets({base:'https://example.test',store,fetcher,checksum,queue});
test('LAN SHA-256 fallback matches native hashing across block boundaries',()=>{
 for(const length of [0,1,55,56,63,64,65,1024*1024+7]){const bytes=new Uint8Array(length).map((_,i)=>i%251);assert.equal(sha256(bytes.buffer),createHash('sha256').update(bytes).digest('hex'));}
});
test('cold requests coalesce, aliases reuse bytes, and reload checks disk before R2',async()=>{
 const store=new MemoryStore(),row=descriptor('shared vehicle'),part=row.parts[0];let downloads=0;
 const fetcher=async()=>{downloads++;await new Promise(r=>setTimeout(r,5));return new Response('shared vehicle');};
 const cold=client(store,fetcher);await Promise.all([cold.chunk(part),cold.chunk(part)]);assert.equal(downloads,1);
 const warm=client(store,fetcher);assert.equal(await(await warm.chunk(part)).text(),'shared vehicle');assert.equal(downloads,1);assert.equal(warm.stats.diskHits,1);assert.equal(warm.stats.downloads,0);
});
test('corrupt cache is discarded and invalid network bytes are never persisted',async()=>{
 const store=new MemoryStore(),p=descriptor('correct').parts[0];await store.put('objects',p.sha256,new Blob(['corrupt']));
 const c=client(store,async()=>new Response('correct'));assert.equal(await(await c.chunk(p)).text(),'correct');assert.equal(c.stats.corrupt,1);
 const bad=client(new MemoryStore(),async()=>new Response('invalid'));await assert.rejects(bad.chunk(p),/integrity/);assert.equal(await bad.store.get('objects',p.sha256),undefined);
});
test('R2 reads are bounded and unapproved hosts or slices are rejected',async()=>{
 const row=descriptor('bounded');assert.equal(validateDescriptor(row,row.path),row);
 assert.throws(()=>validateDescriptor({...row,parts:[{...row.parts[0],url:'https://other.example/file'}]},row.path),/proof/);
 assert.throws(()=>validateDescriptor({...row,parts:[{...row.parts[0],offset:999}]},row.path),/proof/);
 await assert.rejects(client(new MemoryStore(),async()=>new Response('oversize response')).chunk(row.parts[0]),/Oversize/);
});
test('download queue never exceeds two concurrent R2 requests',async()=>{
 let active=0,peak=0;const data=new Map();const parts=Array.from({length:8},(_,i)=>{const p=descriptor('asset-'+i).parts[0];data.set(p.url,'asset-'+i);return p;});
 const c=client(new MemoryStore(),async url=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(data.get(url));});
 await Promise.all(parts.map(p=>c.chunk(p)));assert.equal(peak,2);assert.equal(c.queue.peak,2);
});
test('429 respects Retry-After while permanent failures are not retried',async()=>{
 const waits=[],p=descriptor('ok').parts[0];let attempts=0;
 const queue=new DownloadQueue({interval:0,wait:async ms=>{waits.push(ms);}});
 const c=client(new MemoryStore(),async()=>++attempts===1?new Response('',{status:429,headers:{'Retry-After':'2'}}):new Response('ok'),queue);
 await c.chunk(p);assert.equal(attempts,2);assert.ok(waits.includes(2000));assert.equal(c.stats.retries,1);
 for(const status of [403,404]){let requests=0;const c=client(new MemoryStore(),async()=>{requests++;return new Response('',{status});});await assert.rejects(c.chunk(p),/download failed/);assert.equal(requests,1);}
});

test('metadata batches at 64 paths and a reload reuses proofs for the same revision',async()=>{
 const store=new MemoryStore(),revision='a'.repeat(64),paths=Array.from({length:65},(_,i)=>'models/'+i+'.mesh'),batches=[];
 const fetcher=async(url,options)=>{
  if(url.endsWith('/asset-catalog'))return Response.json({mode:'r2',revision});
  assert.ok(url.endsWith('/asset-proofs'));
  const {paths}=JSON.parse(options.body);batches.push(paths.length);
  return Response.json({revision,entries:paths.map(path=>({path,asset:descriptor('shared',path)}))});
 };
 const cold=client(store,fetcher);await cold.prefetch(paths);assert.deepEqual(batches,[64,1]);
 const warm=client(store,fetcher);await warm.prefetch(paths);assert.deepEqual(batches,[64,1]);assert.equal(warm.stats.metadataRequests,0);
});
