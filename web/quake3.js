import {selectPaks,readPaks,findGameFolder} from './quake3-files.js';
const $=id=>document.getElementById(id),API='https://api.matrixgames.app';
let selection=null,user=null,room=null,busy=false,playing=false;
const status=text=>$('status').textContent=text;
document.addEventListener('keydown',event=>{if(event.code==='Escape'&&document.pointerLockElement)document.exitPointerLock();},true);
function saveProfile(){try{const profile=window.ioq3?.readLocalProfile?.();if(typeof profile==='string'&&profile.length<=65536)localStorage.setItem('matrixgames.q3.profile',profile);}catch{}}
setInterval(saveProfile,5000);document.addEventListener('visibilitychange',saveProfile);window.addEventListener('pagehide',saveProfile);
const update=()=>{for(const id of ['solo','play'])$(id).disabled=!selection||busy||playing;for(const id of ['host','join'])$(id).disabled=!user||busy||playing;};
async function api(action,body={}){const response=await fetch(API+'/v1/quake3/'+action,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error||'The room service is unavailable');return value;}
async function task(fn){if(busy)return;busy=true;update();try{await fn();}catch(error){if(error.name!=='AbortError')status(error.message||'Something went wrong');}finally{busy=false;update();}}
function selected(value){selection=value;$('file-status').textContent='All 9 game archives found. Files will be read locally when you press Play.';status('Game files connected. Play solo or invite your friends.');update();}
$('folder').onclick=()=>task(async()=>{if(!window.showDirectoryPicker){$('files').click();return;}selected(await findGameFolder(await window.showDirectoryPicker({mode:'read'})));});
$('files').onchange=()=>task(async()=>selected(selectPaks([...$('files').files])));
function displayRoom(value){room=value;$('room').hidden=false;$('room-title').textContent=value.host?'You’re hosting':'Friend’s arena';$('room-count').textContent=`${value.players}/${value.settings.players} players · ${value.settings.map}`;const url=new URL('/quake3.html',location.origin);url.hash='room='+value.code;$('invite').value=url.href;$('leave').textContent=value.host?'Close lobby':'Leave lobby';$('room-note').textContent=value.host?'Share this link with friends. Each player selects their own game files before entering.':'Choose your own game files, then enter the arena.';}
$('create').onsubmit=event=>{event.preventDefault();task(async()=>{status('Starting your private arena…');const {room:r}=await api('create',{settings:{map:$('map').value,mode:Number($('mode').value),players:Number($('players').value),timelimit:Number($('minutes').value)}});displayRoom(r);status('Your private lobby is ready. Share the invite link.');});};
$('mode').onchange=()=>{if($('mode').value==='4')$('map').value='q3ctf1';else if($('map').value==='q3ctf1')$('map').value='q3dm7';if($('mode').value==='1')$('players').value='2';};
$('join').onclick=()=>task(async()=>{const code=$('code').value.trim().toUpperCase();const {room:r}=await api('join',{code});displayRoom(r);history.replaceState(null,'',location.pathname);status('Joined the lobby. Select your game files and enter the arena.');});
$('copy').onclick=()=>task(async()=>{try{await navigator.clipboard.writeText($('invite').value);status('Invite link copied.');}catch{$('invite').select();status('Select and copy the invite link.');}});
$('leave').onclick=()=>task(async()=>{if(room)await api(room.host?'close':'leave',{code:room.code});room=null;$('room').hidden=true;if(playing)location.replace('/quake3.html');else status('You left the lobby.');});
async function start(multiplayer){
 if(playing)return;if(!selection)throw Error('Choose your game files first');
 const paks=await readPaks(selection,status);let ticket;
 if(multiplayer){if(!room)throw Error('Join or create a lobby first');({ticket}=await api('ticket',{code:room.code}));}
 $('game').hidden=false;$('setup').hidden=true;playing=true;status('Starting Quake III Arena…');
 const gameMessage=line=>{const text=String(line);if(text.includes('CL_InitCGame'))status('Arena ready. Click the game to play.');if(/Server disconnected|Server connection timed out|Disconnected from server/i.test(text))status('Disconnected. Exit the game to rejoin your lobby.');};
 window.ioq3={viewport:$('viewport-frame'),canvas:$('viewport'),elementPointerLock:true,noInitialRun:true,localPaks:paks,gameSocketUrl:multiplayer?API.replace(/^http/,'ws')+'/v1/quake3/socket':null,gameTicket:ticket,print:gameMessage,printErr:gameMessage};
 try{window.ioq3.localProfile=localStorage.getItem('matrixgames.q3.profile');}catch{}
 window.ioq3.onGameDisconnect=()=>{saveProfile();if(document.pointerLockElement)document.exitPointerLock();status('Match disconnected. Exit the game to return to your lobby.');};
 const script=document.createElement('script');script.src='/assets/quake3-engine.js';await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(Error('Could not load the Quake III engine'));document.head.append(script);});
 const args=['+set','fs_homepath','/base','+set','fs_basepath','/base','+set','com_hunkMegs','96','+set','r_mode','-1','+set','r_customwidth','960','+set','r_customheight','600','+set','r_fullscreen','0','+set','cl_allowDownload','0','+set','s_volume','0.5','+set','name',multiplayer?'Player':'Player'];
 if(multiplayer)args.push('+connect','127.0.0.1:27960');
 window.ioq3.callMain(args);status(multiplayer?'Connecting to your private arena…':'Quake III is running. Click the game to use the original menu.');$('game').scrollIntoView({behavior:'smooth',block:'start'});$('viewport').focus();
}
$('solo').onclick=()=>task(()=>start(false));$('play').onclick=()=>task(()=>start(true));
$('fullscreen').onclick=()=>task(async()=>{$('viewport').focus();await $('viewport-frame').requestFullscreen();});
$('exit').onclick=()=>location.replace('/quake3.html');
const invite=new URLSearchParams(location.hash.slice(1)).get('room');if(invite&&/^[A-Fa-f0-9]{16}$/.test(invite)){$('code').value=invite.toUpperCase();status('Your friend invited you. Sign in, join the lobby, and choose your game files.');}
try{const r=await fetch(API+'/v1/me',{credentials:'include',cache:'no-store'});if(!r.ok)throw Error();user=(await r.json()).user;$('account-status').textContent=user?'Signed in. Create a room or enter an invite code.':'Sign in to create or join private lobbies. Solo play needs no account.';$('signin').hidden=Boolean(user);if(user){const mine=await api('mine');if(mine.rooms[0])displayRoom(mine.rooms[0]);}}catch{$('account-status').textContent='Account or room service is unavailable. You can still play solo.';$('signin').hidden=false;}
update();
setInterval(async()=>{if(!room||document.hidden||busy)return;try{const result=await api('room',{code:room.code});displayRoom(result.room);}catch(e){status(e.message);room=null;$('room').hidden=true;}},15000);
