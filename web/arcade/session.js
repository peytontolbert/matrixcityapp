export const API='https://api.matrixgames.app';
export const game=location.pathname.split('/')[2];
export const session={room:null,solo:true,files:new Map(),urls:new Map()};
export async function call(action,body={}){
 const r=await fetch(`${API}/v1/arcade/${game}/${action}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const value=await r.json();if(!r.ok)throw Error(value.error||'Game service unavailable');return value;
}
export function assetUrl(path,optional=false){
 const key=path.replace(/^\.\//,'');if(session.urls.has(key))return session.urls.get(key);
 const file=session.files.get(key);if(!file){if(optional)return '';throw Error('Missing local asset: '+key);}
 const url=URL.createObjectURL(file);session.urls.set(key,url);return url;
}
export async function assetJson(path){const file=session.files.get(path.replace(/^\.\//,''));if(!file||file.size>4000000)throw Error('Missing or oversized asset manifest');return JSON.parse(await file.text());}
export function openGameSocket(){
 const target=new EventTarget();let upstream,timer,ended=false;
 const wrapper={readyState:0,onopen:null,onmessage:null,onclose:null,onerror:null,
  addEventListener:(...args)=>target.addEventListener(...args),
  send(data){if(wrapper.readyState===1)upstream?.send(data)},
  close(){ended=true;clearInterval(timer);upstream?.close();wrapper.readyState=3;emit('close');}
 };
 function emit(type,data){if(type==='close'&&!session.solo&&!ended){ended=true;const notice=document.createElement('div');notice.id='mg-launch';notice.innerHTML='<div class="mg-wrap"><h1>Connection closed</h1><p>The lobby ended or the connection was lost. Return to the game page to reconnect.</p><a href="/arcade/'+game+'/index.html">Return to lobby setup</a></div>';document.body.append(notice);}const e=type==='message'?new MessageEvent(type,{data:JSON.stringify(data)}):new Event(type);target.dispatchEvent(e);wrapper['on'+type]?.(e);}
 setTimeout(async()=>{try{
  if(!session.solo){
   const {ticket}=await call('ticket',{code:session.room.code});if(ended)return;
   upstream=new WebSocket(API.replace('https:','wss:')+`/v1/arcade/${game}/socket`,['json','mg-ticket.'+ticket]);
   upstream.onopen=()=>{wrapper.readyState=1;emit('open')};
   upstream.onmessage=e=>{try{emit('message',JSON.parse(e.data))}catch{wrapper.close()}};
   upstream.onclose=()=>{wrapper.readyState=3;emit('close')};upstream.onerror=()=>emit('error');
  }else{
   const simulation=['gungeon','nuclear-throne'].includes(game)?await import(`./${game}/shared-game.js`):null;
   let state=simulation?.createRun();if(simulation)simulation.addPlayer(state,'p0','PLAYER 1');
   wrapper.readyState=1;emit('open');emit('message',{type:'welcome',id:'p0',slot:0,host:true,state:simulation?.snapshot(state),slots:[0]});
   upstream={send(raw){const m=JSON.parse(raw);if(m.type==='input')simulation?.setInput(state,'p0',m.input);if(m.type==='mutation')simulation?.chooseMutation?.(state,'p0',m.key);if(m.type==='restart'&&simulation){state=simulation.createRun();simulation.addPlayer(state,'p0','PLAYER 1');}},close(){clearInterval(timer)}};
   if(simulation){let n=0;timer=setInterval(()=>{simulation.tick(state,1/30);if(++n%2===0)emit('message',{type:'snapshot',state:simulation.snapshot(state)})},1000/30);}
  }
 }catch{emit('error');wrapper.close()}},0);
 addEventListener('pagehide',()=>wrapper.close(),{once:true});return wrapper;
}
