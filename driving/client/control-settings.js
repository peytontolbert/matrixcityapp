const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const number=(v,f,a,b)=>Number.isFinite(v)?clamp(v,a,b):f;
export const DEFAULTS={mode:'auto',transmission:'sequential',sensitivity:1,deadzone:.12,gamma:1,device:'',profiles:{}};
export function settings(raw={}) {
 raw=raw&&typeof raw==='object'?raw:{};
 const profiles=Object.create(null);
 for(const [id,p] of Object.entries(raw.profiles||{}).slice(0,32)){
  if(!p||!['wheel','controller'].includes(p.kind))continue;
  const bindings={};
  for(const action of ['steer','throttle','brake','clutch','handbrake','up','down']){
   const b=p.bindings?.[action];
   if(!b||!['axis','button'].includes(b.type)||!Number.isInteger(b.index)||b.index<0||b.index>63)continue;
   if(b.type==='axis'&&(!Number.isFinite(b.rest)||!Number.isFinite(b.end)||Math.abs(b.end-b.rest)<.2))continue;
   bindings[action]={type:b.type,index:b.index,rest:number(b.rest,0,-1,1),end:number(b.end,1,-1,1)};
  }
  profiles[id]={kind:p.kind,bindings};
 }
 return {mode:['auto','mouse','keyboard','device'].includes(raw.mode)?raw.mode:DEFAULTS.mode,
  transmission:raw.transmission==='automatic'?'automatic':'sequential',sensitivity:number(raw.sensitivity,1,.2,3),
  deadzone:number(raw.deadzone,.12,0,.4),gamma:number(raw.gamma,1,.5,3),device:typeof raw.device==='string'?raw.device:'',profiles};
}
export function readSettings(storage){try{return settings(JSON.parse(storage.getItem('matrixgames.controls.v1')||'{}'));}catch{return settings();}}
export function writeSettings(storage,value){try{storage.setItem('matrixgames.controls.v1',JSON.stringify(settings(value)));return true;}catch{return false;}}
export function devices(navigator){try{return Array.from(navigator.getGamepads?.()||[]).filter(p=>p?.connected);}catch{return [];}}
export function deviceKind(p){return /wheel|g29|g920|g923|g27|driving force|thrustmaster|fanatec|moza|simagic|t300|t150|t248/i.test(p?.id||'')?'wheel':'controller';}
export function defaultProfile(p){return p?.mapping==='standard'?{kind:deviceKind(p),bindings:{steer:{type:'axis',index:0,rest:0,end:1},throttle:{type:'button',index:7},brake:{type:'button',index:6},handbrake:{type:'button',index:1},up:{type:'button',index:5},down:{type:'button',index:4}}}:null;}
export function chooseDevice(pads,config){return config.device?pads.find(p=>p.id===config.device)||null:pads.find(p=>mappedInput(p,config))||null;}
export function bindingValue(p,b,steering=false){
 if(!b)return 0;
 if(b.type==='button')return number(p?.buttons?.[b.index]?.value,0,0,1);
 const v=p?.axes?.[b.index];if(!Number.isFinite(v))return 0;
 return clamp((v-b.rest)/(b.end-b.rest),steering?-1:0,1);
}
export function mappedInput(p,config){
 const profile=config.profiles[p?.id]||defaultProfile(p);if(!profile||!p?.connected)return null;
 const b=profile.bindings;if(!b.steer||!b.throttle||!b.brake)return null;
 let steer=bindingValue(p,b.steer,true),dz=config.deadzone;
 steer=Math.abs(steer)<=dz?0:Math.sign(steer)*((Math.abs(steer)-dz)/(1-dz))**config.gamma;
 return {source:profile.kind,steer:-steer||0,throttle:bindingValue(p,b.throttle),brake:bindingValue(p,b.brake),clutch:bindingValue(p,b.clutch),handbrake:bindingValue(p,b.handbrake),up:bindingValue(p,b.up)>.5,down:bindingValue(p,b.down)>.5};
}
// Capture rest and full travel, supporting inverted pedals and combined axes.
export function detectBinding(rest,current,action){
 let best=null,score=.35;
 for(let i=0;i<current.axes.length;i++){
  const start=rest.axes[i],end=current.axes[i],delta=Math.abs(end-start);
  if(Number.isFinite(start)&&delta>score){score=delta;best={type:'axis',index:i,rest:start,end};}
 }
 if(action!=='steer')for(let i=0;i<current.buttons.length;i++){
  const delta=current.buttons[i].value-(rest.buttons[i]?.value||0);
  if(delta>score){score=delta;best={type:'button',index:i};}
 }
 return best;
}
