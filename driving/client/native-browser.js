// Local handles never leave the browser. The account API stores display metadata only.
export const STEAM_LAUNCH='steam://run/244210//%2Fspawn/';
export const MODEL='06_ygt_53_nissan_350z';
const token=/^[A-Za-z0-9_-]{1,80}$/;
export function supported(){return Boolean(globalThis.isSecureContext&&globalThis.showDirectoryPicker&&globalThis.indexedDB&&globalThis.navigator?.locks);}
export async function readText(handle,max=262144){const file=await handle.getFile();if(file.size>max)throw Error('Configuration file is too large');return file.text();}
export async function directory(root,path){for(const name of path.split('/').filter(Boolean))root=await root.getDirectoryHandle(name);return root;}
export async function findGame(root){
 for(const path of ['', 'steamapps/common/assettocorsa','common/assettocorsa'])try{const game=await directory(root,path);await game.getFileHandle('acs.exe');await game.getFileHandle('AssettoCorsa.exe');return {game,path};}catch(e){if(e.name!=='NotFoundError'&&e.name!=='TypeMismatchError')throw e;}
 throw Error('Assetto Corsa was not found. Select its Steam library folder or the assettocorsa folder.');
}
export function recentSteamId(text){
 const entries=[...text.matchAll(/"(7656119[0-9]{10})"\s*\{([^{}]*)\}/g)];
 const recent=entries.filter(m=>/"MostRecent"\s*"1"/i.test(m[2]));
 return recent.length===1?recent[0][1]:entries.length===1?entries[0][1]:'';
}
export function raceSteamId(text){return text.match(/(?:^|\n)\[REMOTE\]\s*\r?\n([^[]*)/i)?.[1]?.match(/^GUID=(7656119[0-9]{10})\s*$/m)?.[1]||'';}
export async function detectSteamId(root){
 if(!root)return '';
 try{const id=recentSteamId(await readText(await (await directory(root,'config')).getFileHandle('loginusers.vdf')));if(id)return id;}catch{}
 // A separately selected Steam library can identify the last account that used AC.
 for(const path of ['steamapps',''])try{const text=await readText(await (await directory(root,path)).getFileHandle('appmanifest_244210.acf'));const id=text.match(/"LastOwner"\s*"(7656119[0-9]{10})"/i)?.[1];if(id)return id;}catch{}
 return '';
}
export async function validateContent(game,track){
 if(!['nohesi_110','nohesi_415'].includes(track))throw Error('Unsupported track');
 const missing=[];
 for(const path of ['dwrite.dll','content/tracks/'+track,'content/cars/'+MODEL,'content/cars/nohesi_traffic_toyota_prius'])try{
  if(path.includes('/'))await directory(game,path);else await game.getFileHandle(path);
 }catch(e){if(e.name==='NotFoundError')missing.push(path);else throw e;}
 if(missing.length)throw Error('Install the required content first: '+missing.join(', '));
 const skins=await directory(game,'content/cars/'+MODEL+'/skins');let choices=[];
 for await(const [name,handle] of skins.entries())if(handle.kind==='directory'&&token.test(name))choices.push(name);
 if(!choices.length)throw Error('The 350Z has no installed skins');return choices.sort()[0];
}
export function validateSettings(d){
 if(d?.schema!==2||!(['nohesi-110','nohesi-415'].includes(d.room))||d.track!==d.room.replace('-','_')||d.model!==MODEL)throw Error('Unsupported server content');
 if(typeof d.host!=='string'||d.host.length>253||!(/^[A-Za-z0-9][A-Za-z0-9.-]*$/).test(d.host))throw Error('Invalid server address');
 for(const key of ['gamePort','httpPort'])if(!Number.isInteger(d[key])||d[key]<1||d[key]>65535)throw Error('Invalid server port');
 if(!Array.isArray(d.features)||d.features.length>64||d.features.some(f=>typeof f!=='string'||!(/^[A-Z0-9_]{1,64}$/).test(f)))throw Error('Invalid server features');
 return d;
}
export function raceConfig(d,{driver,steamId,skin},previous='',now=Date.now()){
 validateSettings(d);
 if(typeof driver!=='string'||!driver.trim()||driver.length>32||/[\x00-\x1f\x7f=\[\]]/.test(driver)||!/^7656119[0-9]{10}$/.test(steamId)||!token.test(skin))throw Error('Invalid driver settings');
 if(!/^mg1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(d.password||'')||d.password.length>512||!Number.isSafeInteger(d.expiresAt)||d.expiresAt<=now||d.expiresAt>now+120000)throw Error('Join authorization expired. Prepare a new join.');
 // Retain the driver's assist preferences without carrying over stale session keys.
 const assists=previous.match(/(?:^|\n)\[ASSISTS\]\s*\r?\n([^[]*)/i)?.[1]?.trim()||'AUTO_CLUTCH=0\nAUTO_BLIP=1\nAUTO_SHIFTER=0\nIDEAL_LINE=0\nSTABILITY_CONTROL=0\nABS=1\nTRACTION_CONTROL=1';
 return `[HEADER]\nVERSION=2\n__CM_FEATURE_SET=2\n[RACE]\nTRACK=${d.track}\nCONFIG_TRACK=\nMODEL=${d.model}\nMODEL_CONFIG=\nCARS=1\nAI_LEVEL=98\nFIXED_SETUP=0\nPENALTIES=0\n[REMOTE]\nACTIVE=1\n__CM_EXTENDED=1\n__FEATURES=${d.features.join(',')}\nSERVER_IP=${d.host}\nSERVER_PORT=${d.gamePort}\nSERVER_HTTP_PORT=${d.httpPort}\nREQUESTED_CAR=${d.model}\nNAME=${driver}\nGUID=${steamId}\nTEAM=\nPASSWORD=${d.password}\n[CAR_0]\nMODEL=-\nSKIN=${skin}\nDRIVER_NAME=${driver}\nNATIONALITY=USA\n[SESSION_0]\nNAME=Practice\nTYPE=1\nDURATION_MINUTES=0\nSPAWN_SET=PIT\n[REPLAY]\nACTIVE=0\n[GHOST_CAR]\nRECORDING=0\nPLAYING=0\n[WEATHER]\nNAME=3_clear\n[TEMPERATURE]\nAMBIENT=26\nROAD=32\n[LIGHTING]\nSUN_ANGLE=6\nTIME_MULT=1\n[ASSISTS]\n${assists}\n`.replace(/\r?\n/g,'\r\n');
}
export async function atomicWrite(handle,text){const writer=await handle.createWritable();try{await writer.write(text);await writer.close();}catch(e){try{await writer.abort();}catch{}throw e;}}
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
export class NativeStore {
 constructor(){this.db=new Promise((resolve,reject)=>{const r=indexedDB.open('matrixgames-native',1);r.onupgradeneeded=()=>r.result.createObjectStore('setups');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async operation(key,value,remove=false){const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('setups',value===undefined&&!remove?'readonly':'readwrite'),store=tx.objectStore('setups');const req=remove?store.delete(key):value===undefined?store.get(key):store.put(value,key);tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Browser storage unavailable'));});}
 get(key){return this.operation(key);}set(key,value){return this.operation(key,value);}delete(key){return this.operation(key,undefined,true);}
}
export async function prepareRace({setup,store,key,settings,identity,redeem}){
 const active=await store.get('active-race');if(active&&active!==key)throw Error('Another account has prepared a race in this browser. Restore it using that account first.');
 if(await store.get(key+':pending'))throw Error('Restore the previous race settings before preparing another join.');
 validateSettings(settings);const skin=await validateContent(setup.game,settings.track);
 const file=await setup.cfg.getFileHandle('race.ini'),original=await readText(file);
 if(!/^\[RACE\]/im.test(original)||!/^\[HEADER\]/im.test(original))throw Error('Select the cfg folder containing your existing Assetto Corsa race.ini.');
 // Durable backup comes first. Neither original contents nor the temporary password are uploaded.
 const backup='race.ini.matrixgames-'+crypto.randomUUID()+'.bak';
 await atomicWrite(await setup.cfg.getFileHandle(backup,{create:true}),original);
 const grant=await redeem(),written=raceConfig({...grant,features:settings.features}, {...identity,skin},original);
 for(const name of ['room','track','model','host','gamePort','httpPort'])if(grant[name]!==settings[name])throw Error('Server configuration changed. Prepare again.');
 if(await readText(file)!==original)throw Error('Race settings changed during preparation. Close Assetto and try again.');
 const pending={backup,originalHash:await digest(original),writtenHash:await digest(written),expiresAt:grant.expiresAt};
 await store.set(key+':pending',pending);await store.set('active-race',key);await atomicWrite(file,written);
 return pending;
}
export async function restoreRace({setup,store,key}){
 const pending=await store.get(key+':pending');if(!pending)return false;
 const file=await setup.cfg.getFileHandle('race.ini'),current=await readText(file),hash=await digest(current);
 if(hash===pending.originalHash){await store.delete(key+':pending');if(await store.get('active-race')===key)await store.delete('active-race');return true;}
 if(hash!==pending.writtenHash)throw Error('Assetto changed race.ini. It was left untouched; your backup is '+pending.backup+'.');
 const original=await readText(await setup.cfg.getFileHandle(pending.backup));
 if(await digest(original)!==pending.originalHash)throw Error('The backup changed. Race settings were left untouched.');
 if(await readText(file)!==current)throw Error('Race settings changed. Close Assetto before restoring.');
 await atomicWrite(file,original);await store.delete(key+':pending');if(await store.get('active-race')===key)await store.delete('active-race');return true;
}
