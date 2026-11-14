import {settings,mappedInput} from './control-settings.js';
export function sampleInput(keys,{focused=true,ready=true,stale=false,direction=1,gamepad=null,config=null,mouse=0,mouseActive=false}={}) {
 const active=focused&&ready&&!stale;
 const pressed=(...names)=>active&&names.some(n=>keys.has(n))?1:0;
 const cfg=config||settings({mode:'keyboard'}),pad=active?mappedInput(gamepad,cfg):null;
 const keyboard=pressed('KeyA','ArrowLeft')-pressed('KeyD','ArrowRight');
 const useMouse=active&&mouseActive&&(cfg.mode==='mouse'||cfg.mode==='auto');
 const usePad=active&&pad&&(cfg.mode==='device'||cfg.mode==='auto'||!config);
 const out={throttle:Math.max(pressed('KeyW','ArrowUp'),usePad?pad.throttle:0),brake:active?Math.max(pressed('KeyS','ArrowDown'),usePad?pad.brake:0):1,
  steer:active?(keyboard||(useMouse?Math.max(-1,Math.min(1,mouse)):usePad?pad.steer:0)):0,handbrake:Math.max(pressed('Space'),usePad?pad.handbrake:0),direction};
 if(config)Object.assign(out,{source:keyboard?'keyboard':useMouse?'mouse':usePad?pad.source:'keyboard',transmission:cfg.transmission,clutch:usePad?pad.clutch:0});
 return out;
}
