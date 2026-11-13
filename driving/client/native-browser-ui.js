import {NativeStore,supported,findGame,directory,detectSteamId,readText,prepareRace,restoreRace,STEAM_LAUNCH} from './native-browser.js';
export function nativeBrowserUI({api,profileApi,requireAccount,message}){
 const panel=document.querySelector('#native-setup'),summary=document.querySelector('#native-summary'),steam=document.querySelector('#select-steam'),cfg=document.querySelector('#select-cfg'),save=document.querySelector('#save-native'),restore=document.querySelector('#restore-native'),forget=document.querySelector('#forget-native'),keep=document.querySelector('#keep-native'),launch=document.querySelector('#steam-launch'),driver=document.querySelector('#native-driver'),id=document.querySelector('#native-steam-id'),closed=document.querySelector('#native-closed');
 let actor,key,setup={},busy=false,store,deviceId,pending;
 const available=supported();
 if(available){store=new NativeStore();deviceId=localStorage.getItem('matrixgames-native-device');if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('matrixgames-native-device',deviceId);}}
 const explain=()=>{summary.textContent=!available?'Use Chrome or Edge on Windows over HTTPS for browser setup, or use the optional launcher.':!actor?'Sign in to set up native play.':(setup.steam?setup.steam.name+' → '+(setup.gamePath||'assettocorsa'):'Choose your Steam library or Assetto Corsa folder')+' · '+(setup.cfg?'Race settings selected':'Choose Documents / Assetto Corsa / cfg')+(pending?' · Previous race settings are backed up. Close Assetto, then restore before another join.':'');
  for(const button of [steam,cfg,save,forget])button.disabled=!available||!actor||busy||Boolean(pending);
  restore.disabled=!pending||busy;keep.hidden=!pending;keep.disabled=busy;driver.disabled=id.disabled=busy;
 };
 const permission=async(handle,mode)=>{if(!handle)throw Error('Choose both folders and save your setup first.');if(await handle.queryPermission({mode})==='granted')return;if(await handle.requestPermission({mode})!=='granted')throw Error('Folder access was not granted. Click again to allow access, or select the folder again.');};
 async function sameAccount(){const user=await requireAccount();if(user.id!==actor)throw Error('Your account changed. Refresh before continuing.');return user;}
 async function run(action){if(busy)return;busy=true;explain();try{await action();}catch(e){message(e.name==='AbortError'?'Folder selection cancelled.':e.message);}finally{busy=false;explain();}}
 async function update(user){
  if(busy)return;if(!user){actor=null;key=null;setup={};pending=null;launch.hidden=true;explain();return;}
  if(user.id===actor)return;actor=user.id;key=actor+':'+deviceId;
  if(available){setup=await store.get(key)||{};pending=await store.get(key+':pending');
   const response=await profileApi();const saved=response.setups.find(s=>s.deviceId===deviceId)?.settings;
   driver.value=saved?.driver||user.name.slice(0,32);id.value=saved?.steamId||'';
  }explain();
 }
 steam.onclick=()=>void run(async()=>{
  const root=await showDirectoryPicker({id:'matrixgames-steam',mode:'read'}),found=await findGame(root);await sameAccount();
  setup={...setup,steam:root,game:found.game,gamePath:found.path};const detected=await detectSteamId(root);if(detected)id.value=detected;
  await store.set(key,setup);message('Steam location remembered on this device. Choose race settings and save your profile.');
 });
 cfg.onclick=()=>void run(async()=>{
  let folder=await showDirectoryPicker({id:'matrixgames-race',mode:'readwrite',startIn:'documents'});
  if(folder.name.toLowerCase()!=='cfg')try{folder=await directory(folder,'cfg');}catch{}
  const text=await readText(await folder.getFileHandle('race.ini'));
  if(!/^\[RACE\]/im.test(text)||!/^\[HEADER\]/im.test(text))throw Error('Choose Documents / Assetto Corsa / cfg. Run Assetto once if race.ini does not exist yet.');
  await sameAccount();setup={...setup,cfg:folder};if(!id.value)id.value=text.match(/^GUID=(7656119[0-9]{10})\s*$/m)?.[1]||'';
  await store.set(key,setup);message('Race settings remembered. Confirm your Steam ID and save your profile.');
 });
 async function saveProfile(){
  if(!setup.steam||!setup.cfg)throw Error('Select your Steam and race settings folders first.');
  if(!/^7656119[0-9]{10}$/.test(id.value))throw Error('Enter the 17-digit Steam ID of the account signed in to Steam.');
  const settings={steamFolder:setup.steam.name,gameFolder:setup.gamePath||setup.game.name,steamId:id.value,driver:driver.value.trim()};
  await sameAccount();await profileApi({deviceId,settings});setup={...setup,saved:settings};await store.set(key,setup);
 }
 save.onclick=()=>void run(async()=>{await saveProfile();message('Native setup saved to your profile. Folder access is remembered by this browser.');});
 restore.onclick=()=>void run(async()=>{
  if(!closed.checked)throw Error('Close Assetto and confirm it is closed before restoring.');
  await permission(setup.cfg,'readwrite');await sameAccount();await navigator.locks.request('matrixgames-race',async()=>{await restoreRace({setup,store,key});pending=null;});
  launch.hidden=true;message('Previous race settings restored. Backup retained in your cfg folder.');
 });
 keep.onclick=()=>void run(async()=>{
  if(!closed.checked)throw Error('Close Assetto and confirm it is closed first.');await sameAccount();
  await navigator.locks.request('matrixgames-race',async()=>{await store.delete(key+':pending');if(await store.get('active-race')===key)await store.delete('active-race');});pending=null;launch.hidden=true;message('Current race settings kept. The backup remains in your cfg folder.');
 });
 forget.onclick=()=>void run(async()=>{await sameAccount();await profileApi({deviceId,remove:true});await store.delete(key);setup={};id.value='';message('This device’s saved native setup was removed.');});
 launch.href=STEAM_LAUNCH;
 launch.onclick=e=>{if(!pending||pending.expiresAt<=Date.now()){e.preventDefault();message('Join expired. Restore settings, then prepare a new join.');return;}closed.checked=false;message('Allow Steam to open Assetto. Keep this page open; after exiting the game, restore your previous settings here.');};
 async function join(room){
  panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'center'});
  if(!available){explain();return;}
  await run(async()=>{
   if(!actor||!setup.game||!setup.cfg)throw Error('Choose your folders and save the setup below first.');
   if(!closed.checked)throw Error('Close Assetto and confirm it is closed before preparing a join.');
   await permission(setup.cfg,'readwrite');await permission(setup.game,'read');await saveProfile();
   await navigator.locks.request('matrixgames-race',async()=>{
    const settings=await api('/native-settings',{room});
    await prepareRace({setup,store,key,settings,identity:{driver:driver.value.trim(),steamId:id.value},redeem:async()=>{
     const grant=await api('/native-ticket',{room});return api('/native-redeem',{authorization:grant.authorization,steamId:id.value});
    }});
   });pending=await store.get(key+':pending');launch.hidden=false;message('Ready. Click Open Assetto in Steam within 90 seconds.');
  });pending=await store.get(key+':pending');explain();
 }
 explain();return {update,join};
}
