// Route splines describe navigation, not tyre contact height.
export class TrafficSurface {
 constructor(world){this.world=world;this.pending=new Map();this.keep=new Map();this.cache=new Map();}
 request(position){const key=position.slice(0,2).map(v=>Math.floor(v/100)).join(':');this.keep.delete(key);this.keep.set(key,position);while(this.keep.size>32)this.keep.delete(this.keep.keys().next().value);
  if(!this.pending.has(key)&&this.pending.size<4){const job=Promise.resolve().then(()=>this.world.focus(position)).catch(()=>{}).finally(()=>this.pending.delete(key));this.pending.set(key,job);}
 }
 sample(sample){
  const p=sample.position,c=Math.cos(sample.heading),s=Math.sin(sample.heading);
  if(this.world.readyAt?.(p)===false){this.request(p);return null;}
  const key=[Math.round(p[0]*2),Math.round(p[1]*2),Math.round(p[2]),Math.round(sample.heading*20)].join(':');
  const cached=this.cache.get(key);if(cached)return {...sample,position:[p[0],p[1],cached.z+cached.dx*(p[0]-cached.x)+cached.dy*(p[1]-cached.y)],pitch:cached.pitch,roll:cached.roll};
  const hits=[];for(const [along,side] of [[1.35,.76],[1.35,-.76],[-1.35,.76],[-1.35,-.76]]){
   const x=p[0]+c*along-s*side,y=p[1]+s*along+c*side,hit=this.world.ground(x,y,p[2],{maxRise:2,maxDrop:4});
   if(!hit||!Number.isFinite(hit.z)||hit.material&&!/road|asphalt|tarmac|concrete/i.test(hit.material))return null;hits.push(hit.z);
  }
  const z=hits.reduce((n,v)=>n+v,0)/4,pitch=Math.atan2((hits[0]+hits[1]-hits[2]-hits[3])/2,2.7),roll=Math.atan2((hits[0]+hits[2]-hits[1]-hits[3])/2,1.52);
  if(Math.abs(pitch)>.35||Math.abs(roll)>.35)return null;
  const dx=Math.tan(pitch)*c-Math.tan(roll)*s,dy=Math.tan(pitch)*s+Math.tan(roll)*c;
  this.cache.set(key,{x:p[0],y:p[1],z,pitch,roll,dx,dy});if(this.cache.size>8192)this.cache.delete(this.cache.keys().next().value);
  return {...sample,position:[p[0],p[1],z],pitch,roll};
 }
}
