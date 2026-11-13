// Conservative broad phase for immutable authored triangle worlds.
// Preserve original cell order and use the existing solver for every surviving
// triangle, including material selection, tolerances, steps and wall normals.
const overlaps = (a,b) => a[0]<=b[3] && a[3]>=b[0] && a[1]<=b[4] && a[4]>=b[1] && a[2]<=b[5] && a[5]>=b[2];
function tree(items) {
  const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(const item of items) for(let k=0;k<3;k++){bounds[k]=Math.min(bounds[k],item.bounds[k]);bounds[k+3]=Math.max(bounds[k+3],item.bounds[k+3]);}
  if(items.length<=12) return {bounds,items};
  let axis=0;for(let k=1;k<3;k++) if(bounds[k+3]-bounds[k]>bounds[axis+3]-bounds[axis])axis=k;
  items.sort((a,b)=>(a.bounds[axis]+a.bounds[axis+3])-(b.bounds[axis]+b.bounds[axis+3])||a.order-b.order);
  const mid=items.length>>1;
  return {bounds,left:tree(items.slice(0,mid)),right:tree(items.slice(mid))};
}
function collect(node,box,out) {
  if(!overlaps(node.bounds,box))return;
  if(node.items){for(const item of node.items)if(overlaps(item.bounds,box))out.push(item);}
  else {collect(node.left,box,out);collect(node.right,box,out);}
}
export class ExactTriangleQueryIndex {
  constructor(query) {
    this.query=query;this.worlds=new WeakMap();this.stats={cells:0,queries:0,originalCandidates:0,candidates:0};
    this.groundReceiver=Object.create(query);this.wallReceiver=Object.create(query);
    this.groundReceiver._ybnCellCandidates=(world,gx,gy)=>this.candidates(world,gx,gy,false,this.groundBox);
    this.wallReceiver._ybnWallCellCandidates=(world,gx,gy)=>this.candidates(world,gx,gy,true,this.wallBox);
  }
  candidates(world,gx,gy,wall,box) {
    const original=(wall?this.query._ybnWallCellCandidates:this.query._ybnCellCandidates).call(this.query,world,gx,gy);
    if(!original?.length)return original;
    let state=this.worlds.get(world);
    if(!state||state.vertices!==world.vertices||state.indices!==world.indices||state.grid!==world.grid||state.wallGrid!==world.wallGrid){
      state={vertices:world.vertices,indices:world.indices,grid:world.grid,wallGrid:world.wallGrid,ground:new Map(),walls:new Map()};this.worlds.set(world,state);
    }
    const cache=wall?state.walls:state.ground,key=gx+':'+gy;
    let entry=cache.get(key);
    if(!entry){
      const items=Array.from(original,(offset,order)=>{
        const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
        for(let j=0;j<3;j++)for(let k=0;k<3;k++){const v=world.vertices[world.indices[offset+j]*3+k];bounds[k]=Math.min(bounds[k],v);bounds[k+3]=Math.max(bounds[k+3],v);}
        // Barycentric coordinates may reach -1e-4 in the original ground test.
        // Two negative weights extend the projected AABB by at most 2e-4*span.
        if(!wall)for(let k=0;k<2;k++){const pad=(bounds[k+3]-bounds[k])*0.00021+1e-7;bounds[k]-=pad;bounds[k+3]+=pad;}
        return {offset,order,bounds};
      });
      entry=tree(items);cache.set(key,entry);this.stats.cells++;
    }
    const out=[];collect(entry,box,out);out.sort((a,b)=>a.order-b.order);
    this.stats.queries++;this.stats.originalCandidates+=original.length;this.stats.candidates+=out.length;
    return out.map(item=>item.offset);
  }
  ground(fn,x,y,z,rise,options,world) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return fn.call(this.query,x,y,z,rise,options,world);
    this.groundBox=[x,y,-Infinity,x,y,Infinity];
    return fn.call(this.groundReceiver,x,y,z,rise,options,world);
  }
  wall(fn,world,offset,source,x,y,z,radius,height,...rest) {
    const r=Math.max(.05,Number.isFinite(Number(radius))?Number(radius):.38);
    const h=Math.max(.2,Number.isFinite(Number(height))?Number(height):1.8),dz=Number(offset)||0;
    if(![Number(x),Number(y),Number(z)].every(Number.isFinite))return fn.call(this.query,world,offset,source,x,y,z,radius,height,...rest);
    this.wallBox=[Number(x)-r,Number(y)-r,Number(z)-dz-.0400001,Number(x)+r,Number(y)+r,Number(z)+h-dz+.0400001];
    return fn.call(this.wallReceiver,world,offset,source,x,y,z,radius,height,...rest);
  }
}
