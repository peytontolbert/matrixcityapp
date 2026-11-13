export function sampleInput(keys,{focused=true,ready=true,stale=false,direction=1,gamepad=null}={}) {
 const active=focused&&ready&&!stale;
 const pressed=(...names)=>active&&names.some(n=>keys.has(n))?1:0;
 const pad=active&&gamepad?.connected&&gamepad.mapping==='standard'?gamepad:null;
 const button=i=>Math.min(1,Math.max(0,Number(pad?.buttons?.[i]?.value)||0));
 const axis=Math.min(1,Math.max(-1,Number(pad?.axes?.[0])||0));
 const analog=Math.abs(axis)>.12?-Math.sign(axis)*(Math.abs(axis)-.12)/.88:0;
 const keyboard=pressed('KeyA','ArrowLeft')-pressed('KeyD','ArrowRight');
 return {throttle:Math.max(pressed('KeyW','ArrowUp'),button(7)),brake:active?Math.max(pressed('KeyS','ArrowDown'),button(6)):1,
  steer:keyboard||analog,handbrake:Math.max(pressed('Space'),button(1)),direction};
}
