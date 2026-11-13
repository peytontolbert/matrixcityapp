import test from 'node:test';
import assert from 'node:assert/strict';
import {TrafficOpenings,trafficWalls,safeToYield} from '../traffic-openings.js';
import {createAuthoritative110Traffic} from '../traffic.js';
const car=(id,x,y,speed=24,z=0,heading=0)=>({id,lane:{id},sample:{position:[x,y,z],heading},speedMps:speed,cruiseMps:speed,spawnGeneration:1});
const player=(x,y,speed=50)=>Object.assign([x,y,0],{heading:0,velocity:[speed,0,0]});

test('lookahead finds converging lanes, while other decks, directions and divided roads are isolated',()=>{
 const rows=[car('left',80,0,30),car('middle',100,4,25),car('right',120,8,20)];
 assert.equal(trafficWalls(rows,{predict:false}).length,0);
 assert.equal(trafficWalls(rows).length,1);
 const aligned=[car('a',100,0),car('b',100,4),car('c',100,8)];
 assert.equal(trafficWalls(aligned).length,1);
 assert.equal(trafficWalls([aligned[0],aligned[1],car('c',100,8,24,8)]).length,0);
 assert.equal(trafficWalls([aligned[0],aligned[1],car('c',100,8,24,0,Math.PI)]).length,0);
 assert.equal(trafficWalls([aligned[0],aligned[1],car('c',100,12)]).length,0);
 // Rotating onto a curved road's local tangent must not change the decision.
 for(const angle of [Math.PI/5,Math.PI/2,Math.PI,-Math.PI/3]){
  const curved=aligned.map(a=>({...a,sample:{heading:angle,position:[300+a.sample.position[0]*Math.cos(angle)-a.sample.position[1]*Math.sin(angle),-500+a.sample.position[0]*Math.sin(angle)+a.sample.position[1]*Math.cos(angle),0]}}));
  assert.equal(trafficWalls(curved).length,1);
 }
});

test('cooperative braking yields to closing players on every lane and cannot outvote normal braking',()=>{
 const rows=[car('a',100,0),car('b',100,4),car('c',100,8)],planner=new TrafficOpenings();
 const players=[player(50,0),player(50,4),player(50,8)];
 assert.equal(safeToYield(rows[0],players),false);
 planner.update(rows,players,1000);assert.equal(planner.yields.size,0);
 planner.update(rows,[players[1]],1300);assert.ok(planner.yields.size>0);assert.equal(planner.yields.has('b'),false);
 const yielding=rows.find(a=>planner.yields.has(a.id));
 assert.ok(planner.target(yielding,24,.1,[])>=23.88-1e-9);
 assert.equal(planner.target(yielding,5,.1,[]),5,'Emergency obstacle braking must win');
 assert.equal(planner.target(yielding,24,.1,players),24,'A new following player cancels gentle braking immediately');
 for(const row of rows)assert.ok(planner.cruise(row,24,25,.1)<=25,'The preset speed limit must win');
 const oldPlans=planner.plans;planner.update(rows,[],1308);assert.equal(planner.plans,oldPlans,'Planner ran at native 120 Hz');
 yielding.spawnGeneration++;assert.equal(planner.target(yielding,24,.1,[]),24,'Recycled slots retained an old intervention');
 const boosted=rows.find(a=>planner.boosts.has(a.id));assert.ok(boosted);boosted.speedMps=27;
 planner.update([boosted],players,10000);
 assert.equal(planner.cruise(boosted,24,30,.1,players),27,'Ending a speed-up braked into a following player');
 assert.ok(planner.cruise(boosted,24,30,.1,[])>=26.88-1e-9,'Ending a speed-up braked abruptly');
});

function traverseWall(cooperate){
 const rows=[car('a',350,0),car('b',350,4),car('c',350,8)],planner=new TrafficOpenings(),dt=.1;
 // Time-expanded reachable-path search: 180 km/h, <=2.5 m/s lateral motion.
 // Require a practical 0.375 m lateral margin, not a zero-margin lane split.
 let reachable=new Set([16]),maximumBraking=0,maximumAcceleration=0;
 for(let tick=0;tick<180;tick++){
  const old=rows.map(a=>[...a.sample.position]);if(cooperate)planner.update(rows,[],tick*100);
  for(const row of rows){
   const normal=cooperate?planner.cruise(row,row.cruiseMps,105/3.6,dt):row.cruiseMps;
   const target=cooperate?planner.target(row,normal,dt,[]):normal,before=row.speedMps;
   row.speedMps+=Math.max(-8.5*dt,Math.min(2.4*dt,target-row.speedMps));
   maximumBraking=Math.max(maximumBraking,(before-row.speedMps)/dt);maximumAcceleration=Math.max(maximumAcceleration,(row.speedMps-before)/dt);
   row.sample.position[0]+=row.speedMps*dt;
  }
  const next=new Set();
  for(const previous of reachable)for(let delta=-1;delta<=1;delta++){
   const to=previous+delta;if(to<0||to>32)continue;
   let safe=true;
   for(const fraction of [0,.5,1])for(let n=0;n<rows.length;n++){
    const x=(tick+fraction)*dt*50,y=(previous+delta*fraction)*.25;
    const trafficX=old[n][0]+(rows[n].sample.position[0]-old[n][0])*fraction;
    if(Math.abs(x-trafficX)<5.5&&Math.abs(y-rows[n].sample.position[1])<2.2)safe=false;
   }
   if(safe)next.add(to);
  }
  reachable=next;
 }
 return {reachable:reachable.size,maximumBraking,maximumAcceleration,plans:planner.plans};
}
test('a 180 km/h driver has a reachable path through a moving wall without violent traffic braking',()=>{
 assert.equal(traverseWall(false).reachable,0,'The fixture must actually block the practical route');
 const result=traverseWall(true);
 assert.ok(result.reachable>0,'No traversable opening was produced');
 assert.ok(result.maximumBraking<=1.2+1e-8);
 assert.ok(result.maximumAcceleration<=2.4+1e-8);
 assert.ok(result.plans<=73);
});

test('five minutes of heavy three-lane traffic retains slots and limits sustained walls with two players',()=>{
 const lanes=Array.from({length:3},(_,i)=>({id:i+1,points:[[0,i*4,0],[50000,i*4,0]]}));
 const traffic=createAuthoritative110Traffic({schema:'matrix-city-110-gameplay-v1',lanes,connections:[]},{maximumPopulation:48,models:['prius']});
 let ids,previous=new Map(),active=new Map(),wallObservations=0,longest=0;
 for(let tick=0;tick<6000;tick++){
  const p={x:1000+tick*.05*50,y:4,feetZ:0,heading:0,velocity:[50,0,0]};
  traffic.update(.05,1000+tick*50,[{state:p},{...p,x:p.x-160,y:0}]);
  const rows=traffic.snapshot().agents;
  if(rows.length===48&&!ids)ids=rows.map(a=>a.id).sort();
  if(ids)assert.deepEqual(rows.map(a=>a.id).sort(),ids);
  for(const row of rows){
   const old=previous.get(row.id);
   if(old&&old.spawnGeneration===row.spawnGeneration){
    assert.ok(row.x>=old.x-1e-8,'An active vehicle moved backwards');
    assert.ok(row.x-old.x<1.6,'An active vehicle jumped ahead');
    assert.equal(row.y,old.y,'An opening was created by jumping lanes');
   }
   assert.ok(row.speedMps>=0&&row.speedMps<=105/3.6+1e-8);
  }
  previous=new Map(rows.map(a=>[a.id,a]));
  if(tick%10!==0)continue;
  const ahead=rows.filter(a=>a.x>p.x+40&&a.x<p.x+400).map(a=>({...a,lane:{id:a.laneId},sample:{position:[a.x,a.y,a.feetZ],heading:a.heading}}));
  const walls=trafficWalls(ahead,{predict:false,clearance:12}),next=new Map();wallObservations+=walls.length;
  for(const wall of walls){
   const key=wall.map(a=>a.row.id+':'+a.row.spawnGeneration).sort().join('|'),age=(active.get(key)||0)+.5;
   next.set(key,age);longest=Math.max(longest,age);
  }
  active=next;
 }
 assert.equal(traffic.population,48);
 // The old independent-lane simulation produced 548 observations / 11 seconds.
 assert.ok(wallObservations<275,'Full-width alignments became too frequent: '+wallObservations);
 assert.ok(longest<=7,'Full-width alignment lasted too long: '+longest);
});
