import {session,game,call,API} from './session.js';
import {importDuck} from './duck-import.js';
const titles={'duck-game':'Duck Game',broforce:'Broforce',gungeon:'Enter the Gungeon','nuclear-throne':'Nuclear Throne'};
const entry={'duck-game':'game.js',broforce:'game-v4.js',gungeon:'game-v3.js','nuclear-throne':'game.js'};
if(!titles[game])throw Error('Unsupported game');
document.body.classList.add('mg-loading');
const style=document.createElement('link');style.rel='stylesheet';style.href='/arcade/launch.css';document.head.append(style);
const panel=document.createElement('div');panel.id='mg-launch';panel.innerHTML=`<div class="mg-wrap"><a href="/games.html">← All games</a><h1></h1><span class="mg-tag">COMMUNITY BROWSER ADAPTATION · 1–4 PLAYERS</span><p>Original game files stay on your computer. This adaptation contains a selected set of gameplay features; it is not the complete original game.</p><div class="mg-columns"><section><h2>1. Choose your local files</h2><p id="mg-files-help"></p><label>Game folder or prepared asset folder<input id="mg-files" type="file" webkitdirectory multiple></label><p id="mg-files-status">No files selected.</p><details id="mg-conversion"><summary>Prepare your assets once</summary><p>Run the local importer against your installed game, then select its output folder here. No upload is needed.</p><a href="/arcade/importers/index.html">Local importer and instructions →</a></details></section><section><h2>2. Play solo or with friends</h2><button id="mg-solo" disabled>Play solo</button><hr><a href="/account.html" target="_blank" rel="noopener">Sign in with Google</a><p>Everyone signs in and selects their own local files. Share a private invite; you do not need to be on the same network.</p><button id="mg-create" disabled>Create friend lobby</button><label>Invite code<input id="mg-code" maxlength="16" autocomplete="off" placeholder="16-character invite"></label><button id="mg-join" disabled>Join lobby</button><div id="mg-room" hidden><p id="mg-room-status"></p><button id="mg-copy">Copy invitation</button><button id="mg-enter">Enter game</button><button id="mg-leave">Leave lobby</button></div></section></div><p id="mg-message" role="status" aria-live="polite"></p></div>`;
panel.querySelector('h1').textContent=titles[game];document.body.append(panel);
const $=id=>document.getElementById('mg-'+id),message=t=>$('message').textContent=t;
$('files-help').textContent=game==='duck-game'?'Select your installed Duck Game folder. Textures and maps are decoded locally in this browser.':'Select the asset folder created by the local importer from your installed game.';
$('conversion').hidden=game==='duck-game';
const invite=location.hash.slice(1);if(/^[A-Fa-f0-9]{16}$/.test(invite))$('code').value=invite.toUpperCase();
let ready=false,busy=false,poller;
function controls(){if(!panel.isConnected)return;for(const id of ['solo','create','join'])$(id).disabled=!ready||busy||!!session.room;}
async function action(fn){if(busy)return;busy=true;controls();message('Working…');try{await fn()}catch(e){message(e.message)}finally{busy=false;controls()}}
$('files').addEventListener('change',()=>action(async()=>{
 ready=false;for(const url of session.urls.values())URL.revokeObjectURL(url);session.urls.clear();session.files.clear();
 const files=[...$('files').files];if(files.length>30000)throw Error('Select this game’s folder, not your whole Steam library.');
 if(game==='duck-game')await importDuck(files,session.files);
 else{
  for(const file of files){let path=file.webkitRelativePath.split('/').slice(1).join('/');const at=path.indexOf('assets/');if(at>=0)path=path.slice(at);else if(game==='broforce'||game==='gungeon')path='assets/'+path;else if(path.startsWith('sprites/')||path.startsWith('audio/'))path='assets/'+path;
   if(!/^(assets\/)[a-zA-Z0-9_./-]+\.(json|png|webp|wav|ogg|opus)$/.test(path)||path.split('/').includes('..'))continue;
   if(file.size>32000000)throw Error('An asset is too large');if(session.files.has(path))throw Error('Duplicate asset path');session.files.set(path,file);
  }
  const required=game==='broforce'?['rambro','rambro-gun','mook','mook-gun','jungle-parallax','jungle-dirt','jungle-destructibles','bridge','checkpoint','crate','flag','bullet','explosion'].map(n=>'assets/'+n+'.webp'):game==='gungeon'?['assets/manifest.json','assets/gungeon-atlas.webp']:['assets/sprites/manifest.json'];
  for(const path of required)if(!session.files.has(path))throw Error('Missing '+path+'. Use the local importer first.');
  if(game==='nuclear-throne'){
   const manifest=JSON.parse(await session.files.get(required[0]).text());if(!Array.isArray(manifest)||manifest.length>1024)throw Error('Invalid sprite manifest');
   for(const s of manifest){if(!Array.isArray(s.frames)||s.frames.length>1024)throw Error('Invalid frames');for(const f of s.frames)if(!/^[A-Za-z0-9_]+\.png$/.test(f)||!session.files.has('assets/sprites/'+f))throw Error('Incomplete sprite pack');}
  }
 }
 let total=0;for(const file of session.files.values())total+=file.size;if(total>256000000)throw Error('Asset pack exceeds 256 MB');
 ready=true;$('files-status').textContent=`${session.files.size} local assets ready. Nothing uploaded.`;message('Ready to play.');
}));
function showRoom(room){session.room=room;$('room').hidden=false;$('room-status').textContent=`${room.host?'Your lobby':'Friend lobby'} · ${room.code} · ${room.players}/4 players`;$('code').value=room.code;controls();}
function watch(){clearInterval(poller);poller=setInterval(async()=>{if(!session.room)return;try{showRoom((await call('room',{code:session.room.code})).room)}catch{clearInterval(poller);session.room=null;$('room').hidden=true;controls();message('Lobby closed. Create or join another lobby.')}},15000);}
$('create').onclick=()=>action(async()=>{showRoom((await call('create')).room);watch();message('Share your invitation. Each friend needs their own local game files.');});
$('join').onclick=()=>action(async()=>{showRoom((await call('join',{code:$('code').value.trim().toUpperCase()})).room);watch();message('Joined your friend’s lobby.');});
$('copy').onclick=()=>action(async()=>{const url=new URL(location.href);url.hash=session.room.code;await navigator.clipboard.writeText(url.href);message('Invitation copied.');});
$('leave').onclick=()=>action(async()=>{await call('leave',{code:session.room.code});session.room=null;clearInterval(poller);$('room').hidden=true;message('Left the lobby.');});
async function launch(solo){
 if(!ready)return;session.solo=solo;clearInterval(poller);
 if(!solo&&!session.room)throw Error('Create or join a lobby first');
 try{await import(`./${game}/${entry[game]}`)}catch{throw Error('The game could not load these assets. Check that the importer completed for this game version.');}
 panel.remove();document.body.classList.remove('mg-loading');
 const bar=document.createElement('div');bar.id='mg-bar';bar.innerHTML='<a href="/games.html">All games</a><span></span><button>Leave game</button>';
 bar.querySelector('span').textContent=solo?'Solo · local files only':`Private lobby ${session.room.code} · ${session.room.host?'you host':'friend hosts'}`;
 bar.querySelector('button').onclick=async()=>{if(session.room)try{await call('leave',{code:session.room.code})}catch{}location.reload()};document.body.append(bar);
}
$('solo').onclick=()=>action(()=>launch(true));$('enter').onclick=()=>action(()=>launch(false));
