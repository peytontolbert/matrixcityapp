// Matrix Games owns its browser cache; no Matrix City account/runtime dependency.
export class AssetStore {
 constructor(){
  this.error=null;this.writes=Promise.resolve();this.budget=512*1024*1024;
  this.ready=new Promise(resolve=>{
   if(!globalThis.indexedDB)return resolve(null);
   let abandoned=false;
   const request=indexedDB.open('matrixgames-driving-assets-v1',1),timer=setTimeout(()=>{abandoned=true;this.error='Browser asset storage timed out';resolve(null);},5000);
   request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('objects');db.createObjectStore('proofs');db.createObjectStore('sizes');};
   request.onsuccess=()=>{clearTimeout(timer);if(abandoned){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};
   request.onerror=request.onblocked=()=>{clearTimeout(timer);abandoned=true;this.error='Browser asset storage is unavailable';resolve(null);};
  });
  globalThis.navigator?.storage?.estimate?.().then(v=>{if(v.quota)this.budget=Math.max(64*1024*1024,Math.min(2*1024**3,Math.floor(v.quota*.15)));}).catch(()=>{});
 }
 async get(store,key){const db=await this.ready;if(!db)return null;return new Promise(resolve=>{try{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>resolve(null);}catch{resolve(null);}});}
 async remove(store,key){const db=await this.ready;if(!db)return;await new Promise(resolve=>{try{const t=db.transaction([store,'sizes'],'readwrite');t.objectStore(store).delete(key);if(store==='objects')t.objectStore('sizes').delete(key);t.oncomplete=t.onerror=t.onabort=resolve;}catch{resolve();}});}
 async put(store,key,value){
  const job=this.writes.then(async()=>{
   const db=await this.ready;if(!db)return;
   if(store==='objects')await this.prune(db,value.size,key);
   await new Promise(resolve=>{try{
    const t=db.transaction(store==='objects'?['objects','sizes']:[store],'readwrite');t.objectStore(store).put(value,key);
    if(store==='objects')t.objectStore('sizes').put({key,bytes:value.size,touched:Date.now()},key);
    t.oncomplete=resolve;t.onerror=t.onabort=()=>{this.error='Browser cache could not save an asset';resolve();};
   }catch{this.error='Browser cache could not save an asset';resolve();}});
  });this.writes=job.catch(()=>{});return this.writes;
 }
 async touch(key,size){const db=await this.ready;if(!db)return;try{db.transaction('sizes','readwrite').objectStore('sizes').put({key,bytes:size,touched:Date.now()},key);}catch{}}
 async prune(db,incoming,key){
  const rows=await new Promise(resolve=>{const r=db.transaction('sizes').objectStore('sizes').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve([]);});
  let bytes=rows.reduce((sum,r)=>sum+(r.key===key?0:r.bytes),0);if(bytes+incoming<=this.budget)return;
  const t=db.transaction(['objects','sizes'],'readwrite');
  for(const row of rows.sort((a,b)=>a.touched-b.touched)){if(row.key===key)continue;t.objectStore('objects').delete(row.key);t.objectStore('sizes').delete(row.key);bytes-=row.bytes;if(bytes+incoming<=this.budget)break;}
  await new Promise(resolve=>{t.oncomplete=t.onerror=t.onabort=resolve;});
 }
}
