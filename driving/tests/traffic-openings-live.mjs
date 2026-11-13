// Offline authored-road simulation. No live players, services or game assets are modified.
// Grounding is deliberately separate: this evaluates traffic planning on lane geometry.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {trafficWalls} from '../traffic-openings.js';
import {routeInterest} from '../traffic-interest.js';
import {createAuthoritative110Traffic as revised} from '../traffic.js';
import {pathToFileURL} from 'node:url';
const variants=[['revised',revised]];
if(process.env.MATRIX_TRAFFIC_BASELINE_MODULE)variants.unshift(['baseline',(await import(pathToFileURL(process.env.MATRIX_TRAFFIC_BASELINE_MODULE))).createAuthoritative110Traffic]);
if(!process.env.MATRIX_TRAFFIC_NETWORK)throw Error('Set MATRIX_TRAFFIC_NETWORK to the private authored 110 traffic-network.json');
const network=JSON.parse(await fs.readFile(process.env.MATRIX_TRAFFIC_NETWORK));
function sample(lane,d){let i=0;while(lane.cumulative[i+1]<d)i++;const a=lane.points[i],b=lane.points[i+1],f=(d-lane.cumulative[i])/(lane.cumulative[i+1]-lane.cumulative[i]),heading=Math.atan2(b[1]-a[1],b[0]-a[0]);return {x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,feetZ:a[2]+(b[2]-a[2])*f,heading,velocity:[50*Math.cos(heading),50*Math.sin(heading),0]};}
const results=[];
for(const [label,create] of variants)for(const routeId of [75,11]){
 const t=create(network,{maximumPopulation:96,models:['prius']}),lane=t.lanes.find(l=>l.id===routeId),byId=new Map(t.lanes.map(l=>[l.id,l]));
 let total=0,walls=0,n=0,maxStreak=0,active=new Map(),ticks=[],ids,identityStable=true,continuous=true,previous=new Map();
 for(let i=0;i<3600;i++){
  const p=sample(lane,1000+i*2.5),followers=sample(lane,840+i*2.5),before=performance.now();t.update(.05,1000+i*50,[p,followers]);ticks.push(performance.now()-before);
  const snapshot=t.snapshot(),rows=snapshot.agents;if(rows.length===96&&!ids)ids=rows.map(a=>a.id).sort().join('|');if(ids&&ids!==rows.map(a=>a.id).sort().join('|'))identityStable=false;
  for(const a of rows){const b=previous.get(a.id);if(b&&a.spawnGeneration===b.spawnGeneration&&Math.hypot(a.x-b.x,a.y-b.y)>1.8)continuous=false;}previous=new Map(rows.map(a=>[a.id,a]));
  if(i%10===0){
   const player=Object.assign([p.x,p.y,p.feetZ],{heading:p.heading});
   const a=rows.filter(a=>{const r=routeInterest(byId.get(a.laneId),player,a.distance);return r.relevant&&r.ahead>40&&r.ahead<400;}).map(a=>({...a,lane:{id:a.laneId},sample:{position:[a.x,a.y,a.feetZ],heading:a.heading}}));
   total++;n+=a.length;const w=trafficWalls(a,{predict:false,clearance:12});walls+=w.length;const next=new Map();for(const g of w){const k=g.map(x=>x.row.id+':'+x.row.spawnGeneration).sort().join('|'),age=(active.get(k)||0)+.5;next.set(k,age);maxStreak=Math.max(maxStreak,age);}active=next;
  }
 }
 ticks.sort((a,b)=>a-b);const result={label,routeId,playerCount:2,population:t.population,simulatedSeconds:180,observations:total,tightWallObservations:walls,longestTightWallSeconds:maxStreak,meanAheadTraffic:n/total,p99TickMs:ticks[Math.floor(ticks.length*.99)],maxTickMs:ticks.at(-1),identityStable,continuous};assert.ok(identityStable,'Traffic identity changed');assert.ok(continuous,'Active traffic jumped');results.push(result);console.log(JSON.stringify(result));
}
if(process.env.MATRIX_TRAFFIC_REPORT)await fs.writeFile(process.env.MATRIX_TRAFFIC_REPORT,JSON.stringify(results,null,2));
