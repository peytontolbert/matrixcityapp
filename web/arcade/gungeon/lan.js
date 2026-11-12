import {openGameSocket,session} from '../session.js';
export function createGungeonLan(){
 const listeners=new Set();let id='',state=null,connected=false;const socket=openGameSocket();
 const notify=m=>listeners.forEach(fn=>fn(m));
 socket.onopen=()=>{connected=true;notify({type:'connected'})};
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='welcome'){id=m.id;state=m.state}else if(m.type==='snapshot')state=m.state;notify(m)};
 socket.onclose=()=>{connected=false;notify({type:'disconnected'})};
 const send=m=>{if(socket.readyState===1)socket.send(JSON.stringify(m))};
 return {on(fn){listeners.add(fn);return()=>listeners.delete(fn)},join(){},input(input){send({type:'input',input})},restart(){if(session.solo||session.room.host)send({type:'restart'})},get id(){return id},get state(){return state},get connected(){return connected},get room(){return 'PRIVATE'}};
}
