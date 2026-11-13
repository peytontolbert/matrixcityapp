// Keep collision downloads off the 20 Hz relay path. All active drivers retain
// a safety margin; distant immutable tiles can be reclaimed by the GC.
export class CollisionStream {
 constructor(collision,load){this.collision=collision;this.load=load;this.pending=new Map();this.active=0;this.waiting=[];}
 entries(point,radius){const c=this.collision,p=c.local(point);return c.index.tiles.filter(e=>c.distance(e,p)<radius).sort((a,b)=>c.distance(a,p)-c.distance(b,p));}
 ready(point){return this.entries(point,35).every(e=>this.collision.tiles.has(e.id));}
 async tile(entry){
  if(this.collision.tiles.has(entry.id))return;if(this.pending.has(entry.id))return this.pending.get(entry.id);
  const job=(async()=>{if(this.active>=2)await new Promise(r=>this.waiting.push(r));else this.active++;
   try{const world=await this.load(entry);this.collision.tiles.set(entry.id,{entry,world});this.collision.lastWall=null;}
   finally{const next=this.waiting.shift();if(next)next();else this.active--;}
  })();this.pending.set(entry.id,job);try{await job;}finally{this.pending.delete(entry.id);}
 }
 async focus(point){await Promise.all(this.entries(point,140).map(e=>this.tile(e)));}
 trim(points){const c=this.collision,locals=points.map(p=>c.local(p));for(const [id,{entry}] of c.tiles)if(locals.every(p=>c.distance(entry,p)>400)){c.tiles.delete(id);c.lastWall=null;}}
}
