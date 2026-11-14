import {nativeLaunchUrl} from './native-launch.js';
import {DrivingRenderer} from './renderer.js';
import {sampleInput} from './input.js';
import {R2Assets} from './r2-cache.js';
import {Snapshots} from './snapshots.js';
import {DrivingAudio} from './audio.js';
import {ASSET_BASE} from '../world.js';
const status=document.querySelector('#status'),list=document.querySelector('#sessions'),canvas=document.querySelector('canvas');
const local=location.protocol==='http:';
const origin='https://api.matrixgames.app',prefix='/v1/driving',contentBase=local?location.origin:origin+prefix;
let socket,renderer,snapshots,current=[],you,received=0,sequence=0,keys=new Set(),direction=1,joining=false,ready=false,generation=0,connectTimer;
const fetcher=globalThis.fetch.bind(globalThis);
const assets=new R2Assets({base:contentBase,fetcher});
document.querySelector('#direction').onclick=()=>{direction=direction===1?-1:1;document.querySelector('#direction').textContent=direction===1?'Forward':'Reverse';};
let lights=false;document.querySelector('#lights').onclick=()=>{lights=!lights;document.querySelector('#lights').textContent=lights?'Lights on':'Lights off';};
let boardSignature='';
function updateScores(data){const score=data.scores?.find(row=>row.id===data.you);document.querySelector('#run-score').textContent=String(score?.score||0);document.querySelector('#combo').textContent='x'+(score?.combo||1).toFixed(1);document.querySelector('#run-passes').textContent=(score?.passes||0)+' clean passes · 70+ km/h · collisions end the run';const rows=data.leaderboard||[],signature=JSON.stringify(rows);if(signature!==boardSignature){boardSignature=signature;const list=document.querySelector('#leaderboard');list.replaceChildren();for(const row of rows){const item=document.createElement('li');item.textContent=row.driver+' — '+row.score.toLocaleString();list.append(item);}if(!rows.length){const item=document.createElement('li');item.textContent='Be the first to set a score.';list.append(item);}}}
let account=null,audio=new DrivingAudio(),noticeUntil=0;
const sound=document.querySelector('#sound');sound.onclick=async()=>{try{if(audio.enabled)audio.mute();else await audio.enable();sound.textContent=audio.enabled?'Sound on':'Sound off';}catch(e){message(e.message);}};
async function requireAccount(){let r;try{r=await fetcher(origin+'/v1/me',{credentials:'include',cache:'no-store'});}catch{throw Error('Sign-in service unavailable. Please try again shortly.');}if(!r.ok)throw Error('Unable to check your login');account=(await r.json()).user;if(!account)throw Error('Sign in to Matrix Games before joining.');return account;}
const graphics=document.querySelector('#graphics');
graphics.onchange=()=>{if(renderer?.post)renderer.post.enabled=graphics.value==='enhanced';};
globalThis.fetch=(input,options)=>{
 const url=new URL(input instanceof Request?input.url:input,location.href);
 if(url.origin===new URL(ASSET_BASE).origin||url.pathname.startsWith('/demo2/assets/')){
  const path=url.pathname.replace(/^\/(demo2\/)?assets\//,'');return assets.response(path);
 }return fetcher(input,options);
};
const api=async(path,body)=>{const r=await fetcher(origin+prefix+path,{credentials:'include',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const result=await r.json();if(!r.ok)throw Error(result.error||'Request failed');return result;};

function message(text){status.textContent=text;}
function stop(text='Session ended.'){
 ++generation;clearTimeout(connectTimer);ready=false;joining=false;keys.clear();current=[];snapshots=null;you=null;
 const ws=socket;socket=null;if(ws){ws.onclose=null;ws.onmessage=null;ws.onerror=null;ws.close();}
 renderer?.dispose();renderer=null;audio.dispose();audio=new DrivingAudio();sound.textContent='Sound off';document.body.classList.remove('playing','loading');
 document.querySelector('#leave').textContent='Leave session';message(text);void refresh();
}
async function refresh(){
 try{let loginError;try{await requireAccount();}catch(e){account=null;loginError=e.message;}
 const r=await fetcher(contentBase+'/sessions');if(!r.ok)throw Error('Sessions unavailable');const data=await r.json();list.replaceChildren();for(const s of data.sessions){
  const card=document.createElement('section'),title=document.createElement('h2');title.textContent=s.room==='nohesi-110'?'110 · Los Angeles':'415 · Island';const note=document.createElement('p');note.textContent=s.ready?`${s.browserPlayers}/${s.capacity} browser seats · shared native session`:'Server unavailable';
  const browser=document.createElement('button');browser.textContent='Drive in browser';browser.disabled=!account||!s.ready||s.browserPlayers>=s.capacity;browser.onclick=()=>void join(s);
  const native=document.createElement('button');native.textContent='Join with Assetto Corsa';native.disabled=!s.ready;
  const help=document.createElement('p');help.hidden=true;
  native.onclick=async()=>{native.disabled=true;try{
   const url=nativeLaunchUrl(s.room);
   help.replaceChildren();help.hidden=false;
   const retry=document.createElement('a');retry.href=url;retry.textContent='Open launcher again';retry.referrerPolicy='no-referrer';
   const install=document.createElement('a');install.href='/driving/MatrixGamesLauncher.exe';install.textContent='Install launcher';
   help.append(retry,' · ',install,'. First time? Run the launcher, sign in, then choose Settings and Enable browser joins, then click Join here again. No JSON file is needed.');
   message('Opening Matrix Games Launcher. Allow your browser to open it if prompted.');
   try{retry.click();}catch{message('Click Open launcher again, or install the launcher first.');}
  }catch(e){message(e.message);}finally{native.disabled=false;}};
  card.append(title,note,browser,native,help);list.append(card);
 }if(!joining&&!socket){if(loginError)message(loginError);else if(status.textContent==='Checking servers…')message('Choose browser driving or join with Assetto Corsa using Matrix Games Launcher.');}}catch(e){if(!joining&&!socket)message(e.message);}
}
async function join(session){
 if(joining||socket)return;joining=true;direction=1;document.querySelector('#direction').textContent='Forward';keys.clear();current=[];snapshots=new Snapshots(session.room);message('Loading track scenery…');
 const attempt=++generation;ready=false;document.body.classList.add('loading');document.querySelector('#leave').textContent='Cancel join';
 try{
 await requireAccount();if(attempt!==generation)return;
 await assets.init();
 renderer=new DrivingRenderer(canvas,session.room,assets);await renderer.init(session.spawn.position);if(attempt!==generation)return;renderer.post.enabled=graphics.value==='enhanced';
 const ticket=await api('/ticket',{room:session.room});if(attempt!==generation)return;const url=new URL(origin+prefix+'/socket');url.protocol='wss:';
 const protocols=['json','mg-ticket.'+ticket.ticket,'room.'+session.room];
 socket=new WebSocket(url,protocols);connectTimer=setTimeout(()=>{if(attempt===generation)stop('Connection timed out. Please rejoin.');},10000);
 socket.onmessage=e=>{if(attempt!==generation)return;let data;try{data=JSON.parse(e.data);}catch{stop('Invalid server response. Please rejoin.');return;}if(data.type==='state'){
  ready=data.ready===true;if(!ready){keys.clear();message('Connection to native server interrupted. Driving paused.');return;}
  clearTimeout(connectTimer);document.body.classList.remove('loading');document.querySelector('#leave').textContent='Leave session';
  try{if(!snapshots.push(data,performance.now()))return;}catch{stop('Invalid driving state. Please rejoin.');return;}
  updateScores(data);renderer.nativeEnvironment=data.environment;current=data.cars;you=data.you;received=performance.now();document.body.classList.add('playing');message('Connected · W/S throttle/brake · A/D steer · Space handbrake · R reverse · F forward');
  document.querySelector('#population').textContent=data.cars.filter(c=>c.kind==='browser').length+' browser · '+data.cars.filter(c=>c.kind==='native').length+' native · '+data.cars.filter(c=>c.kind==='traffic').length+' traffic';
 }else if(data.type==='notice'){message(data.message);noticeUntil=performance.now()+4000;}else if(data.type==='error')stop(data.error);};
 socket.onclose=()=>{if(attempt===generation)stop('Disconnected. Rejoin to continue.');};socket.onerror=()=>{if(attempt===generation)stop('Unable to connect. Check sign-in and try again.');};joining=false;
 }catch(e){if(attempt===generation)stop(e.message);}
}
addEventListener('keydown',e=>{if(!socket)return;if(['KeyW','KeyS','KeyA','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyR','KeyF'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(e.code==='KeyR')direction=-1;if(e.code==='KeyF')direction=1;document.querySelector('#direction').textContent=direction===1?'Forward':'Reverse';});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();audio.update(null,false);});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();audio.update(null,false);}});
document.querySelector('#recover').onclick=()=>{if(socket?.readyState===WebSocket.OPEN){keys.clear();socket.send(JSON.stringify({type:'recover'}));}};
for(const button of document.querySelectorAll('[data-key]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);};button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>keys.delete(button.dataset.key);}
document.querySelector('#leave').onclick=()=>stop(joining?'Join cancelled.':'Session ended.');document.querySelector('#refresh').onclick=refresh;
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stop('Graphics context interrupted. Rejoin after it recovers.');});
canvas.addEventListener('webglcontextrestored',()=>message('Graphics recovered. You can rejoin.'));
setInterval(()=>{if(socket?.readyState!==WebSocket.OPEN)return;if(socket.bufferedAmount>8192){stop('Connection is too slow. Please rejoin.');return;}const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected&&p.mapping==='standard');if(document.hasFocus()&&!document.hidden){if(pad?.buttons[3]?.pressed)direction=-1;if(pad?.buttons[0]?.pressed)direction=1;document.querySelector('#direction').textContent=direction===1?'Forward':'Reverse';}const input=sampleInput(keys,{gamepad:pad,ready,focused:document.hasFocus()&&!document.hidden,stale:performance.now()-received>1200,direction});socket.send(JSON.stringify({type:'input',sequence:sequence++,lights,...input}));},33);
let lastFocus=0,lastDraw=performance.now();
function draw(){
 requestAnimationFrame(draw);if(!renderer||!current.length)return;
 const now=performance.now(),dt=Math.min(.1,(now-lastDraw)/1000);lastDraw=now;
 const cars=snapshots.sample(now);
 const own=cars.find(c=>c.id===you),attempt=generation;
 try{
  renderer.render(cars,own,dt);audio.update(own,ready&&document.hasFocus()&&!document.hidden&&now-received<1200,renderer.camera);
  if(own){document.querySelector('#speed').textContent=Math.round(Math.hypot(...own.velocity)*3.6)+' km/h';
   if(now-lastFocus>1000){lastFocus=now;renderer.focus(own.position).catch(e=>{if(attempt===generation)stop(e.message);});}
  }
 }catch(e){stop('Rendering interrupted. Please rejoin.');console.warn(e);}
 if(ready&&now-received>1200)message('Waiting for server. Controls released.');
}
draw();void refresh();
setInterval(()=>{const stats=assets.status();canvas.dataset.assetStatus=JSON.stringify(stats);if(joining)message('Loading assets · '+(stats.downloadedBytes/1024/1024).toFixed(1)+' MB downloaded · '+stats.diskHits+' reused from storage'+(stats.cacheError?' · '+stats.cacheError:''));},1000);
