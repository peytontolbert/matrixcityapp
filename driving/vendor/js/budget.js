const budgets=new WeakMap();
export class FrameBudget{
 constructor(schedule=fn=>requestAnimationFrame(fn),clock=()=>performance.now()){this.schedule=schedule;this.clock=clock;this.open=false;this.spent=0;this.counts={};this.skipped={};this.stats={frames:0,deferred:0,overruns:0,maxSubmissionMs:0,jobs:{},slowJobs:[]};}
 canRun(kind){const limit=kind==='upload'?2:4;if(!this.open){this.open=true;this.schedule(()=>{this.open=false;this.spent=0;this.counts={};this.stats.frames++;});}
  const allowed=(this.spent<limit&&(kind==='upload'||!this.counts.aux))||((this.skipped[kind]||0)>=8&&!this.counts[kind]);
  if(!allowed){this.skipped[kind]=(this.skipped[kind]||0)+1;this.stats.deferred++;}return allowed;
 }
 run(kind,fn,label=kind){const start=this.clock();try{return fn();}finally{const ms=Math.max(0,this.clock()-start);const key=Object.hasOwn(this.stats.jobs,label)||Object.keys(this.stats.jobs).length<64?label:'other';const item=this.stats.jobs[key]??={calls:0,totalMs:0,maxMs:0};item.calls++;item.totalMs+=ms;item.maxMs=Math.max(item.maxMs,ms);if(ms>4){this.stats.slowJobs.push({kind,label,ms,at:this.clock()});if(this.stats.slowJobs.length>32)this.stats.slowJobs.shift();}this.spent+=ms;this.counts[kind]=(this.counts[kind]||0)+1;this.skipped[kind]=0;this.stats.maxSubmissionMs=Math.max(this.stats.maxSubmissionMs,ms);if(this.spent>4)this.stats.overruns++;}}
}
export function frameBudget(gl){let b=budgets.get(gl);if(!b){b=new FrameBudget(fn=>globalThis.document?.hidden?setTimeout(fn,16):requestAnimationFrame(fn));budgets.set(gl,b);}return b;}
