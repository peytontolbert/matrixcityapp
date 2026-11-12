import {openGameSocket,session} from './session.js';
export function createRelay({onInput,onSnapshot,onStatus}={}){
 const state={connected:false,host:session.solo||!!session.room?.host,slot:0,slots:[0],lastInput:0,lastSnapshot:0};let socket;const pendingPressed=new Set();
 function notify(text){onStatus?.(text,state)}
 function connect(){socket=openGameSocket();socket.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.type==='welcome'){Object.assign(state,{connected:true,host:m.host,slot:m.slot,slots:m.slots});notify(session.solo?'SOLO':m.host?'PRIVATE LOBBY · YOU HOST':'PRIVATE LOBBY · PLAYER '+(m.slot+1));}
  else if(m.type==='roster'){state.slots=m.slots;notify('PRIVATE LOBBY · '+m.slots.length+' PLAYERS');}
  else if(m.type==='input'&&state.host)onInput?.(m.slot,m.input);
  else if(m.type==='snapshot'&&!state.host)onSnapshot?.(m.state);
 };socket.onclose=()=>{state.connected=false;notify('CONNECTION CLOSED')};socket.onerror=()=>notify('CONNECTION FAILED');}
 function send(type,value){if(socket?.readyState!==1)return false;const now=performance.now(),key=type==='input'?'lastInput':'lastSnapshot';if(now-state[key]<(type==='input'?30:66))return false;state[key]=now;socket.send(JSON.stringify(type==='input'?{type,input:value}:{type,state:value}));return true;}
 return {state,connect,sendInput(input){if(state.host)return;for(const k of input.pressed||[])pendingPressed.add(k);if(send('input',{...input,pressed:[...pendingPressed]}))pendingPressed.clear()},sendSnapshot(snapshot){if(state.host&&!session.solo)send('snapshot',snapshot)}};
}
