// Offline stop-duration replay on actual110 authored roads; no service mutations.
import fs from 'node:fs/promises';
import {createAuthoritative110Traffic as revised} from '../traffic.js';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const variants=[['revised',revised]];
if(process.env.MATRIX_TRAFFIC_BASELINE_MODULE)variants.unshift(['baseline',(await import(pathToFileURL(process.env.MATRIX_TRAFFIC_BASELINE_MODULE))).createAuthoritative110Traffic]);
if(!process.env.MATRIX_TRAFFIC_NETWORK)throw Error('Set MATRIX_TRAFFIC_NETWORK to the authored110 network');
const network=JSON.parse(await fs.readFile(process.env.MATRIX_TRAFFIC_NETWORK));
function sample(lane,d){let i=0;while(lane.cumulative[i+1]<d)i++;const a=lane.points[i],b=lane.points[i+1],f=(d-lane.cumulative[i])/(lane.cumulative[i+1]-lane.cumulative[i]),heading=Math.atan2(b[1]-a[1],b[0]-a[0]);return {x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,feetZ:a[2]+(b[2]-a[2])*f,heading,velocity:[50*Math.cos(heading),50*Math.sin(heading),0]};}

const results=[];
for(const [label,create] of variants)for(const [routeId,start,speed,seconds] of [[75,1000,50,180],[75,11000,25,60],[11,15000,25,120],[62,100,15,35],[35,5800,20,40]]){
 const t=create(network,{maximumPopulation:96,models:['prius']}),lane=t.lanes.find(l=>l.id===routeId),lanes=new Map(t.lanes.map(l=>[l.id,l]));
 let reasons={},previous=new Map(),knownIds=new Set(),maxPoseStep=0,bodyOverlaps=0,stoppedSeconds=0,nearStoppedSeconds=0,maxStop=0,byLane={},ids=new Set(),ticks=[],density=0;const streaks=new Map();
 for(let tick=0;tick<seconds*20;tick++){
  const d=Math.min(lane.lengthM-10,start+tick*.05*speed),p=sample(lane,d);p.velocity=[speed*Math.cos(p.heading),speed*Math.sin(p.heading),0];
  const before=performance.now();t.update(.05,1000+tick*50,[p]);ticks.push(performance.now()-before);
  const rows=t.snapshot().agents;const reasonById=new Map((t.diagnostics?.().stoppedAgents||[]).map(a=>[a.id,a.reason]));
  const activeIds=new Set(rows.map(a=>a.id));for(const id of knownIds)assert.ok(activeIds.has(id),'Live slot identity disappeared');knownIds=activeIds;
  for(const a of rows){const b=previous.get(a.id);if(b&&a.spawnGeneration===b.spawnGeneration){const step=Math.hypot(a.x-b.x,a.y-b.y);maxPoseStep=Math.max(maxPoseStep,step);assert.ok(step<1.8,'Active traffic teleported');}}
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   const a=rows[i],b=rows[j];if(Math.abs(a.feetZ-b.feetZ)>1.5||Math.cos(a.heading-b.heading)<.9)continue;
   const dx=b.x-a.x,dy=b.y-a.y,c=Math.cos(a.heading),s=Math.sin(a.heading);if(Math.abs(dx*c+dy*s)<4&&Math.abs(-dx*s+dy*c)<1.5)bodyOverlaps++;
  }
  previous=new Map(rows.map(a=>[a.id,a]));density+=rows.filter(a=>Math.hypot(a.x-p.x,a.y-p.y)<400).length;
  for(const a of rows){const key=a.id+':'+a.spawnGeneration;
   if(a.speedMps<1){const age=(streaks.get(key)||0)+.05;streaks.set(key,age);maxStop=Math.max(maxStop,age);stoppedSeconds+=.05;
    if(Math.hypot(a.x-p.x,a.y-p.y)<150){nearStoppedSeconds+=.05;const reason=reasonById.get(a.id)||"unavailable";reasons[reason]=(reasons[reason]||0)+.05;ids.add(key);const b=byLane[a.laneId]??={seconds:0,endpoint:0};b.seconds+=.05;if(lanes.get(a.laneId).lengthM-a.distance<5)b.endpoint+=.05;}
   }else streaks.delete(key);
  }
 }
 ticks.sort((a,b)=>a-b);const result={label,routeId,start,speed,seconds,population:t.population,stoppedSeconds,nearStoppedSeconds,maxStop,nearStoppedCars:ids.size,meanNearby:density/(seconds*20),p99TickMs:ticks[Math.floor(ticks.length*.99)],stableIds:true,maxPoseStep,bodyOverlapPairTicks:bodyOverlaps,byLane,reasons};results.push(result);console.log(JSON.stringify(result));
}
if(process.env.MATRIX_TRAFFIC_REPORT)await fs.writeFile(process.env.MATRIX_TRAFFIC_REPORT,JSON.stringify(results,null,2));
