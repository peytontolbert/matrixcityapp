// Real R2 road validation. Never connects players or mutates a live session.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {Assets} from '../assets.js';import {loadWorld} from '../world.js';import {TrafficSurface} from '../traffic-surface.js';import {createAuthoritative110Traffic} from '../traffic.js';
const c=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8'));c.assets.index=JSON.parse(await readFile(c.assets.indexFile,'utf8'));new Assets(c.assets).install();
for(const room of ['nohesi-110']){
 const w=await loadWorld(room),surface=new TrafficSurface(w),traffic=createAuthoritative110Traffic(w.network,{maximumPopulation:96,models:['prius'],surface:s=>surface.sample(s)}),p={x:w.spawn.position[0],y:w.spawn.position[1],feetZ:w.spawn.position[2],heading:w.spawn.heading,velocity:[40*Math.cos(w.spawn.heading),40*Math.sin(w.spawn.heading),0]};
 // Pits need not lie on a traffic lane. Verify a real authored road segment.
 const lane=w.network.lanes.filter(l=>l.role!==4&&l.points.length>100).sort((a,b)=>Math.hypot(a.points[0][0]-p.x,a.points[0][1]-p.y)-Math.hypot(b.points[0][0]-p.x,b.points[0][1]-p.y))[0];
 assert.ok(lane);const at=Math.floor(lane.points.length/2),a=lane.points[at],b=lane.points[at+1];p.x=a[0];p.y=a[1];p.feetZ=a[2];p.heading=Math.atan2(b[1]-a[1],b[0]-a[0]);await w.focus(a);
 let maxTick=0;for(let i=0;i<160;i++){const start=performance.now();traffic.update(.05,1000+i*50,[p]);maxTick=Math.max(maxTick,performance.now()-start);await Promise.all([...surface.pending.values()]);}
 const cars=traffic.snapshot().agents;assert.ok(cars.length>0,'No grounded same-direction traffic in '+room);let maxGroundError=0;
 for(const car of cars){const g=w.ground(car.x,car.y,car.feetZ,{maxRise:.5,maxDrop:.5});assert.ok(g,'Floating traffic '+car.id);maxGroundError=Math.max(maxGroundError,Math.abs(g.z-car.feetZ));assert.ok(Math.abs(g.z-car.feetZ)<.15,'Incorrect tyre elevation');}
 console.log(JSON.stringify({room,groundedTraffic:cars.length,maxGroundError,maxTickMs:maxTick,roadTiles:w.collision.tiles.size,routeHeading:p.heading}));
}
// The supplied 415 capture contains positions outside its collision geometry.
// It must not produce floating cars on those unvalidated route segments.
{const w=await loadWorld('nohesi-415'),surface=new TrafficSurface(w),lane=w.network.lanes[0],p=lane.points[Math.floor(lane.points.length/2)];await w.focus(p);assert.equal(surface.sample({position:p,heading:0}),null);console.log(JSON.stringify({room:'nohesi-415',invalidCapturedRouteRejected:true,fullTrafficNetworkVerified:false}));}
