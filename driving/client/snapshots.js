const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export class Snapshots {
 constructor(room,delay=100){this.room=room;this.delay=delay;this.frames=[];this.sequence=-1;this.cursor=-Infinity;}
 push(frame,received){
  if(frame.schema!==1||frame.room!==this.room||!Number.isSafeInteger(frame.sequence)||!Number.isFinite(frame.serverTime)||!Array.isArray(frame.cars)||frame.cars.length>255)throw Error('Invalid driving snapshot');
  if(frame.sequence<=this.sequence)return false;
  const ids=new Set();for(const c of frame.cars){
   if(typeof c.id!=='string'||ids.has(c.id)||!['browser','native','traffic'].includes(c.kind)||typeof c.model!=='string'||!vector(c.position)||!vector(c.velocity)||![c.heading,c.pitch,c.roll].every(Number.isFinite))throw Error('Invalid vehicle snapshot');
   ids.add(c.id);
  }
  if(this.frames.length&&frame.serverTime<this.frames.at(-1).serverTime)throw Error('Server clock moved backwards');
  this.sequence=frame.sequence;this.frames.push({...frame,received});if(this.frames.length>32)this.frames.shift();return true;
 }
 sample(now){
  if(!this.frames.length)return [];
  const latest=this.frames.at(-1),target=Math.min(latest.serverTime,Math.max(this.cursor,latest.serverTime+now-latest.received-this.delay));this.cursor=target;
  while(this.frames.length>2&&this.frames[1].serverTime<=target)this.frames.shift();
  const before=this.frames.filter(f=>f.serverTime<=target).at(-1)||this.frames[0],after=this.frames.find(f=>f.serverTime>=target)||latest;
  const t=before.serverTime>=after.serverTime?1:Math.max(0,Math.min(1,(target-before.serverTime)/(after.serverTime-before.serverTime))),old=new Map(before.cars.map(c=>[c.id,c]));
  return after.cars.map(c=>{const p=old.get(c.id);if(!p||Math.hypot(...c.position.map((n,i)=>n-p.position[i]))>30)return c;
   return {...c,position:c.position.map((n,i)=>p.position[i]+(n-p.position[i])*t),heading:angle(p.heading,c.heading,t),pitch:angle(p.pitch,c.pitch,t),roll:angle(p.roll,c.roll,t)};
  });
 }
}
