// Bounded resolution control, with hysteresis to avoid reallocating targets
// every frame. It changes pixel cost only; simulation and visibility stay fixed.
export class ResolutionBudget {
 constructor(){this.scale=1;this.start=null;this.frames=0;this.lastChange=-Infinity;this.fps=0;}
 sample(now){
  if(this.start===null)this.start=now;this.frames++;
  const elapsed=now-this.start;if(elapsed<2000)return this.scale;
  this.fps=this.frames*1000/elapsed;this.frames=0;this.start=now;
  if(now-this.lastChange<6000)return this.scale;
  const next=this.fps<28?Math.max(.6,this.scale-.1):this.fps>55?Math.min(1,this.scale+.1):this.scale;
  if(Math.abs(next-this.scale)>.001){this.scale=Math.round(next*10)/10;this.lastChange=now;}return this.scale;
 }
}
