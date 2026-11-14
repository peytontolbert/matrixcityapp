import {settings,readSettings,writeSettings,devices,chooseDevice,deviceKind,defaultProfile,mappedInput,detectBinding} from './control-settings.js';
import {sampleInput} from './input.js';
export class DrivingControls {
 constructor(canvas,keys,notify){
  this.canvas=canvas;this.keys=keys;this.notify=notify;this.gear=1;this.mouse=0;this.blocked=false;this.previous={};
  try{this.storage=localStorage;}catch{}this.config=readSettings(this.storage);
  this.dialog=document.querySelector('#controls-dialog');this.device=document.querySelector('#control-device');
  this.help=document.querySelector('#control-help');this.telemetry=document.querySelector('#control-values');
  for(const name of ['mode','transmission','sensitivity','deadzone','gamma']){
   const el=document.querySelector('#control-'+name);el.value=this.config[name];
   el.onchange=()=>{this.config[name]=el.type==='range'?Number(el.value):el.value;this.save();this.reset();};
  }
  document.querySelector('#controls-open').onclick=()=>{this.release();this.dialog.showModal();this.refresh();};
  document.querySelector('#controls-close').onclick=()=>this.dialog.close();
  this.dialog.addEventListener('close',()=>{this.calibration=null;this.reset();});
  this.device.onchange=()=>{this.config.device=this.device.value;this.calibration=null;this.save();this.refresh();};
  document.querySelector('#control-kind').onchange=e=>{const p=this.selected();if(p){this.profile(p).kind=e.target.value;this.save();}};
  document.querySelector('#controls-reset').onclick=()=>{this.config=settings();this.save();for(const name of ['mode','transmission','sensitivity','deadzone','gamma'])document.querySelector('#control-'+name).value=this.config[name];this.refresh();this.reset();};
  for(const button of document.querySelectorAll('[data-bind]'))button.onclick=()=>{
   const p=this.selected();if(!p){this.help.textContent='Connect a device and press a button, then choose it above.';return;}
   this.calibration={id:p.id,action:button.dataset.bind,rest:{axes:[...p.axes],buttons:p.buttons.map(b=>({value:b.value}))},until:performance.now()+15000,binding:null};
   this.help.textContent=button.dataset.bind==='steer'?'Turn fully RIGHT from center, then click Save binding.':'Fully press only this pedal or button, then click Save binding.';
  };
  document.querySelector('#binding-save').onclick=()=>{
   const c=this.calibration,p=this.selected();if(!c||!c.binding||p?.id!==c.id){this.help.textContent='No motion captured. Start again with controls released.';return;}
   this.profile(p).bindings[c.action]=c.binding;this.calibration=null;this.save();this.help.textContent='Binding saved. Release controls before binding the next action.';
  };
  document.querySelector('#controls-resume').onclick=()=>{this.blocked=false;this.reset();};
  document.querySelector('#shift-up').onclick=()=>this.shift(1);
  document.querySelector('#shift-down').onclick=()=>this.shift(-1);
  canvas.addEventListener('click',()=>{
   if(!document.body.classList.contains('playing')||!['auto','mouse'].includes(this.config.mode))return;
   this.blocked=false;this.mouse=0;
   try{const request=canvas.requestPointerLock?.();request?.catch(()=>this.notify('Mouse capture unavailable. Select keyboard or controller in Controls.'));if(!canvas.requestPointerLock)this.notify('Mouse capture unavailable. Select keyboard in Controls.');}catch{this.notify('Click the road again to capture the mouse.');}
  });
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)this.mouse=Math.max(-1,Math.min(1,this.mouse-e.movementX*this.config.sensitivity/450));});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas){this.reset();this.blocked=true;}});
  document.addEventListener('pointerlockerror',()=>this.notify('Mouse capture failed. Click the road again or choose keyboard in Controls.'));
  addEventListener('gamepadconnected',()=>this.refresh());
  addEventListener('gamepaddisconnected',e=>{if(this.activeDevice===e.gamepad.id){this.blocked=true;this.reset();this.notify('Controller disconnected. Reconnect and press Resume controls.');}this.refresh();});
  addEventListener('blur',()=>this.release());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();});
  addEventListener('keydown',e=>{
   if(!document.body.classList.contains('playing')||this.dialog.open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
   if(['KeyF','KeyR'].includes(e.code)){e.preventDefault();if(!e.repeat&&!this.blocked)this.shift(e.code==='KeyF'?1:-1);}
   if(e.code==='KeyC')this.mouse=0;
  });
  this.timer=setInterval(()=>this.refresh(),150);this.refresh();
 }
 selected(){const pads=devices(navigator);return this.config.device?pads.find(p=>p.id===this.config.device):chooseDevice(pads,this.config)||pads[0];}
 profile(p){return this.config.profiles[p.id]??=(defaultProfile(p)||{kind:deviceKind(p),bindings:{}});}
 save(){this.config=settings(this.config);if(!writeSettings(this.storage,this.config))this.help.textContent='Settings work for this visit; browser storage is unavailable.';}
 reset(){this.keys.clear();this.mouse=0;const p=chooseDevice(devices(navigator),this.config),m=p?mappedInput(p,this.config):null;this.previous={up:!!m?.up,down:!!m?.down};}
 release(){this.reset();if(document.pointerLockElement===this.canvas)document.exitPointerLock();}
 start(){this.gear=1;this.blocked=false;this.activeDevice=null;this.reset();}
 shift(delta){if(this.config.transmission==='automatic')return;this.gear=Math.max(-1,Math.min(this.maxGear||6,this.gear+delta));}
 refresh(){
  const pads=devices(navigator),signature=JSON.stringify(pads.map(p=>[p.id,p.index]));
  if(signature!==this.signature){this.signature=signature;this.device.replaceChildren(new Option('Auto detect',''));
   for(const p of pads)this.device.add(new Option(p.id,p.id));
   if(this.config.device&&!pads.some(p=>p.id===this.config.device))this.device.add(new Option(this.config.device+' (disconnected)',this.config.device));this.device.value=this.config.device;
  }
  const p=this.selected();if(p)document.querySelector('#control-kind').value=this.profile(p).kind;
  const c=this.calibration;
  if(c){if(performance.now()>c.until||p?.id!==c.id){this.calibration=null;this.help.textContent='Calibration ended. Release controls and try again.';}else{const b=detectBinding(c.rest,p,c.action);if(b&&(!c.binding||Math.abs((b.end??1)-(b.rest??0))>Math.abs((c.binding.end??1)-(c.binding.rest??0))))c.binding=b;}}
  if(this.dialog.open){const input=p?mappedInput(p,this.config):null;
   this.telemetry.textContent=p?`${p.id}\nAxes: ${p.axes.map((v,i)=>i+': '+v.toFixed(2)).join(' · ')}\n${input?`Steer ${input.steer.toFixed(2)} · Gas ${input.throttle.toFixed(2)} · Brake ${input.brake.toFixed(2)}`:'Bind steering, throttle and brake to enable this device.'}${c?.binding?'\nMotion captured. Hold full travel and save.':''}`:'No device visible. Press a device button. If none appears, use HTTPS or localhost and check browser/device support.';
  }
  document.querySelector('#controls-resume').hidden=!this.blocked;
 }
 sample({focused,ready,stale,direction}){
  const pad=chooseDevice(devices(navigator),this.config),mouseActive=document.pointerLockElement===this.canvas;
  const wantsPad=['auto','device'].includes(this.config.mode)&&!mouseActive;
  if(this.activeDevice&&wantsPad&&pad?.id!==this.activeDevice){this.blocked=true;this.reset();}
  this.activeDevice=wantsPad?pad?.id:null;
  const active=focused&&ready&&!stale&&!this.dialog.open&&!this.blocked;
  const mapped=pad?mappedInput(pad,this.config):null;
  const usable=!(this.config.mode==='device'&&!mapped)&&!(this.config.mode==='mouse'&&!mouseActive);
  if(active&&usable&&wantsPad&&mapped){for(const [k,d] of [['up',1],['down',-1]]){if(mapped[k]&&!this.previous[k])this.shift(d);this.previous[k]=mapped[k];}}else this.previous={up:!!mapped?.up,down:!!mapped?.down};
  const input=sampleInput(this.keys,{focused:active&&usable,ready,stale,direction,config:this.config,gamepad:wantsPad?pad:null,mouse:this.mouse,mouseActive});
  input.gear=this.config.transmission==='sequential'?this.gear:direction;
  return input;
 }
}
