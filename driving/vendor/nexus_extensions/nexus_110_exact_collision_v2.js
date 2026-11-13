import { ExactTriangleQueryIndex } from './exact_triangle_query_index.js';
// Authored CSP road/curb/terrain/barrier triangles, streamed independently of visuals.
export class Exact110Collision {
  constructor(collisionWorld, bounds, translation = [0, 0, 0]) {
    this.cw = collisionWorld; this.tiles = new Map(); this.pending = null;
    this.translation = [Number(translation[0]) || 0, Number(translation[1]) || 0, Number(translation[2]) || 0];
    const [tx, ty, tz] = this.translation;
    this.world = { id: '110-exact-collision-v2', ...bounds,
      minX: bounds.minX + tx, maxX: bounds.maxX + tx,
      minY: bounds.minY + ty, maxY: bounds.maxY + ty,
      minZ: bounds.minZ + tz, maxZ: bounds.maxZ + tz };
    this.query = Object.create(collisionWorld);
    Object.defineProperties(this.query, {
      derivedTrackGround: { value: null, writable: true },
      ybnGround: { value: null, writable: true },
      ybnGroundOffset: { value: 0, writable: true },
    });
    // NYC exclusions and doors cannot remove authentic highway collision.
    this.query._isYbnCollisionExcluded = () => false;
    this.query._isOpenDoorPassage = () => false;
    this.groundQuery = collisionWorld._getYbnGroundContactAtXY;
    this.wallQuery = collisionWorld._firstTriangleWorldWallHit;
    this.rayQuery = collisionWorld._raycastYbn;
    this.triangleIndex = new ExactTriangleQueryIndex(this.query);
  }
  local(point) { return [point[0]-this.translation[0], point[1]-this.translation[1], point[2]-this.translation[2]]; }
  globalHit(hit) {
    if (!hit) return hit;
    const value = { ...hit };
    if (Number.isFinite(value.x)) value.x += this.translation[0];
    if (Number.isFinite(value.y)) value.y += this.translation[1];
    if (Number.isFinite(value.z)) value.z += this.translation[2];
    if (Array.isArray(value.point)) value.point = value.point.map((n, i) => n + this.translation[i]);
    if (Array.isArray(value.position)) value.position = value.position.map((n, i) => n + this.translation[i]);
    return value;
  }
  async load(url, point) {
    this.url = new URL(url, globalThis.location?.href || import.meta.url);
    const response = await fetch(this.url, { cache: 'no-store' });
    if (!response.ok) throw Error('110 exact collision index: HTTP ' + response.status);
    this.index = await response.json();
    if (this.index.schema !== '110-exact-collision-zones-v1' || !this.index.tiles?.length) throw Error('Invalid 110 exact collision index');
    await this.focus(point);
    if (!this.ground(point[0], point[1], point[2]+2, {maxDrop:12})) throw Error('No authored road under AC_PIT_0');
    return this.world;
  }
  distance(entry, p) {
    return Math.hypot(Math.max(entry.min[0]-p[0],0,p[0]-entry.max[0]), Math.max(entry.min[1]-p[1],0,p[1]-entry.max[1]));
  }
  focus(point) {
    if (this.disposed) return Promise.resolve();
    if (!this.pending && this.last && Math.hypot(point[0]-this.last[0],point[1]-this.last[1])<96) return Promise.resolve();
    this.next = point.slice();
    if (this.pending) return this.pending;
    this.pending = (async()=>{
      while(this.next && !this.disposed) {
        const globalPoint=this.next; this.next=null; const p=this.local(globalPoint);
        const entries=this.index.tiles.filter(e=>this.distance(e,p)<750).sort((a,b)=>this.distance(a,p)-this.distance(b,p));
        for(const e of entries) {
          if(this.disposed) return;
          if(this.tiles.has(e.id)) continue;
          const loader=Object.create(this.query);
          Object.defineProperty(loader,'derivedTrackGround',{value:null,writable:true});
          const world=await loader.loadDerivedTrackGround(new URL(e.file,this.url).href);
          if(!world) throw Error(loader.derivedTrackGroundError || 'Exact 110 collision tile failed: '+e.id);
          this.tiles.set(e.id,{entry:e,world}); this.lastWall=null;
          await new Promise(r=>setTimeout(r,0));
        }
        for(const [id,tile] of this.tiles) if(this.distance(tile.entry,p)>1150) { this.tiles.delete(id); this.lastWall=null; }
        this.last=globalPoint;
      }
    })().finally(()=>{this.pending=null;});
    return this.pending;
  }
  ground(x,y,z,options={}) {
    [x,y,z] = this.local([x,y,z]);
    let best=null;
    for(const {entry,world} of this.tiles.values()) {
      if(x<entry.min[0] || x>entry.max[0] || y<entry.min[1] || y>entry.max[1]) continue;
      const hit=this.triangleIndex.ground(this.groundQuery,x,y,z,options.maxRise??1.5,{nearestToHint:true,maxDrop:options.maxDrop??options.maxSnapDistance??35},world);
      if(hit && (!best || Math.abs(hit.z-z)<Math.abs(best.z-z)-1e-5 || Math.abs(Math.abs(hit.z-z)-Math.abs(best.z-z))<1e-5 && hit.z>best.z)) best={...hit,roadId:world.id};
    }
    return this.globalHit(best);
  }
  resolveGround(x,y,z,options={}) {
    const hit=this.ground(x,y,z,options);
    return hit ? {...hit,source:'track',surfacePolicy:'110_authored_csp_triangles',trackRoadId:hit.roadId} : {z:NaN,source:'none',surfacePolicy:'110_authored_csp_triangles'};
  }
  wall(...args) {
    // Reuse only an identical query against unchanged, immutable track tiles.
    if(this.lastWall && args.length===this.lastWall.args.length && args.every((v,i)=>Object.is(v,this.lastWall.args[i]))) return this.lastWall.hit ? {...this.lastWall.hit} : null;
    const originalArgs=args.slice();
    const local = this.local(args); args[0]=local[0]; args[1]=local[1]; args[2]=local[2];
    for(const {entry,world} of this.tiles.values()) {
      if(this.distance(entry,args)>Math.max(1,args[3])) continue;
      const hit=this.triangleIndex.wall(this.wallQuery,world,0,'track_wall',...args);
      if(hit) { const result=this.globalHit(hit); this.lastWall={args:originalArgs,hit:result}; return {...result}; }
    }
    this.lastWall={args:originalArgs,hit:null};
    return null;
  }
  ray(origin,direction,distance) {
    origin=this.local(origin);
    let best=null;
    for(const {entry,world} of this.tiles.values()) {
      if(this.distance(entry,origin)>distance) continue;
      this.query.ybnGround=world;
      const hit=this.rayQuery.call(this.query,origin,direction,Math.min(distance,best?.distance??Infinity));
      if(hit && (!best || hit.distance<best.distance)) best={...hit,source:'track'};
    }
    this.query.ybnGround=null;
    return this.globalHit(best);
  }
  install() {
    if(this.restore) throw Error('Exact collision provider already installed');
    const previous={resolveGround:this.cw.resolveGround?.bind(this.cw),wall:this.cw._firstYbnWallHit?.bind(this.cw),ray:this.cw._raycastYbn?.bind(this.cw),derived:this.cw._getDerivedRoadContactAtXY?.bind(this.cw),blocker:this.cw._firstBlockerHit?.bind(this.cw)};
    const methods={resolveGround:(...a)=>{const hit=this.resolveGround(...a);return hit?.source==='track'?hit:previous.resolveGround?.(...a)||hit;},
      _firstYbnWallHit:(...a)=>this.wall(...a)||previous.wall?.(...a),
      _raycastYbn:(...a)=>{const local=this.ray(...a),other=previous.ray?.(...a);return !other||local&&local.distance<=other.distance?local:other;},
      _getDerivedRoadContactAtXY:(...a)=>previous.derived?.(...a)||null,
      // The retained NYC registry is for returning to NYC, not highway walls.
      _firstBlockerHit:(x,y,z,r,h=1.8,step=1.15,dx=0,dy=0,options={})=>this.wall(x,y,z,r,h,step,dx,dy,options.obstacleStepUp)||previous.blocker?.(x,y,z,r,h,step,dx,dy,options),
    };
    this.restore=Object.entries(methods).map(([name,value])=>[name,Object.getOwnPropertyDescriptor(this.cw,name)]);
    for(const [name,value] of Object.entries(methods)) Object.defineProperty(this.cw,name,{value,writable:true,configurable:true});
  }
  uninstall() {
    for(const [name,descriptor] of this.restore||[]) descriptor ? Object.defineProperty(this.cw,name,descriptor) : delete this.cw[name];
    this.restore=null;
  }
  status() {return {tiles:this.tiles.size,triangles:[...this.tiles.values()].reduce((n,t)=>n+t.world.indices.length/3,0),loading:!!this.pending};}
  dispose() {this.disposed=true;this.lastWall=null;this.next=null;this.uninstall();this.tiles.clear();}
}
