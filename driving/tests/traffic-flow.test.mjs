import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthoritative110Traffic,mergePlayerConflict} from '../traffic.js';
const schema='matrix-city-110-gameplay-v1';
const network={schema,lanes:[{id:1,points:[[0,0,0],[1000,0,0]]},{id:2,role:4,points:[[0,4,0],[5000,4,0]]}],connections:[{lane1ID:1,lane2ID:2,fromDistanceM:1000.0003,toDistanceM:1000,gapM:4,probability:1}]};
const driver=(x,y,speed=0)=>({x,y,feetZ:0,heading:0,velocity:[speed,0,0]});
const player=(x,y,speed=0,heading=0,z=0)=>Object.assign([x,y,z],{heading,velocity:[speed,0,0]});
test('millimeter-rounded authored endpoints retain a continuous valid connection',()=>{
 const t=createAuthoritative110Traffic(network,{maximumPopulation:1,models:['prius']});
 assert.equal(t.outgoing.get(1).length,1);assert.ok(t.outgoing.get(1)[0].fromDistanceM<1000);
 const invalid=createAuthoritative110Traffic({...network,connections:[{...network.connections[0],fromDistanceM:1000.02}]},{models:['prius']});assert.equal(invalid.outgoing.has(1),false);
 let previous,merged=false;
 for(let i=0;i<1600;i++){
  t.update(.05,1000+i*50,[driver(0,8)]);const a=t.snapshot().agents[0];assert.ok(a);
  if(previous&&a.spawnGeneration===previous.spawnGeneration)assert.ok(Math.hypot(a.x-previous.x,a.y-previous.y)<1.8,'Endpoint transfer teleported');
  if(a.laneId===2){merged=true;break;}previous=a;
 }
 assert.ok(merged,'Rounded endpoint left traffic parked at a valid continuation');
});
test('authored converging end merges start before lane footprints overlap, with no new road links',()=>{
 const map={...network,lanes:[{id:1,points:[[0,0,0],[900,0,0],[1000,4,0]]},network.lanes[1]],connections:[{...network.connections[0],fromDistanceM:1000.08,toDistanceM:1000,gapM:.1}]};
 const t=createAuthoritative110Traffic(map,{maximumPopulation:24,models:['prius']}),link=t.outgoing.get(1)[0];
 assert.ok(link.authoredFromDistanceM-link.fromDistanceM>20);assert.ok(link.authoredFromDistanceM-link.fromDistanceM<=80);assert.ok(link.gapM>=3&&link.gapM<=6);assert.equal(link.mandatory,true);
 const raised={...map,lanes:[map.lanes[0],{...map.lanes[1],points:map.lanes[1].points.map(p=>[p[0],p[1],5])}]};
 const unchanged=createAuthoritative110Traffic(raised,{models:['prius']}).outgoing.get(1)[0];assert.equal(unchanged.fromDistanceM,unchanged.authoredFromDistanceM,'Adjusted an unrelated deck');
});
test('straight and high-speed adjacent players do not block merges; swept conflicts still yield',()=>{
 const start={position:[0,0,0],heading:0},destination={position:[0,4,0],heading:0};
 assert.equal(mergePlayerConflict(start,destination,20,player(10,8,50)),false);
 assert.equal(mergePlayerConflict(start,destination,20,player(-15,8,70)),false);
 assert.equal(mergePlayerConflict(start,destination,20,player(30,4,50)),false);
 assert.equal(mergePlayerConflict(start,destination,20,player(-25,4,50)),true);
 assert.equal(mergePlayerConflict(start,destination,20,player(10,4,0)),true);
 assert.equal(mergePlayerConflict(start,destination,20,player(0,6,0,Math.PI/2)),true);
 assert.equal(mergePlayerConflict(start,destination,20,player(10,4,0,0,8)),false);
});
test('an unchosen optional junction cannot stop through traffic for a blocked destination',()=>{
 const map={...network,lanes:[{id:1,points:[[0,0,0],[2000,0,0]]},network.lanes[1]],connections:[{...network.connections[0],fromDistanceM:800,toDistanceM:800,probability:0}]};
 const t=createAuthoritative110Traffic(map,{maximumPopulation:1,models:['prius']});t.update(.05,1000,[driver(0,8)]);let passed=false;
 for(let i=0;i<1000;i++){t.update(.05,1050+i*50,[driver(800,4)]);const a=t.snapshot().agents[0];if(a.x>700&&a.x<900)assert.ok(a.speedMps>10);if(a.x>900){passed=true;assert.equal(a.laneId,1);break;}}
 assert.ok(passed);
});
test('new traffic has useful runway before an unconnected terminus',()=>{
 const t=createAuthoritative110Traffic({schema,lanes:[network.lanes[0]],connections:[]},{maximumPopulation:24,models:['prius']});const seen=new Set();
 for(let i=0;i<20;i++){t.update(.05,1000+i*50,[driver(200,0)]);for(const a of t.snapshot().agents)if(!seen.has(a.spawnGeneration)){seen.add(a.spawnGeneration);assert.ok(1000-a.distance>=Math.max(180,a.speedMps*12)-1e-8);}}
 assert.ok(seen.size>0,'Runway rule removed all traffic');
});
test('dense zipper merges progress without identity churn, pose jumps or penetrating cars',()=>{
 const map={...network,lanes:network.lanes.map(({role,...lane})=>lane)},t=createAuthoritative110Traffic(map,{maximumPopulation:32,models:['prius']});
 let previous=new Map(),known=new Set(),merged=new Set();
 for(let i=0;i<1600;i++){
  t.update(.05,1000+i*50,[driver(600,8)]);const rows=t.snapshot().agents,ids=new Set(rows.map(a=>a.id));for(const id of known)assert.ok(ids.has(id));known=ids;
  for(const a of rows){const b=previous.get(a.id);if(b&&a.spawnGeneration===b.spawnGeneration){assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1.8);if(b.laneId===1&&a.laneId===2)merged.add(a.id+':'+a.spawnGeneration);}}
  for(let j=0;j<rows.length;j++)for(let k=j+1;k<rows.length;k++)assert.ok(Math.abs(rows[j].x-rows[k].x)>=4||Math.abs(rows[j].y-rows[k].y)>=1.5,'Traffic bodies penetrated during merge');
  previous=new Map(rows.map(a=>[a.id,a]));
 }
 assert.ok(merged.size>=10,'Dense traffic starved the entering lane');assert.equal(t.population,32);
});
test('private stop diagnostics attribute a stopped player without adding wire fields',()=>{
 const t=createAuthoritative110Traffic({schema,lanes:[{id:1,points:[[0,0,0],[5000,0,0]]}],connections:[]},{maximumPopulation:1,models:['prius']});t.update(.05,1000,[driver(1000,0)]);
 const x=t.snapshot().agents[0].x+90;for(let i=0;i<500;i++)t.update(.05,1050+i*50,[driver(x,0)]);
 const d=t.diagnostics();assert.equal(d.stopped,1);assert.equal(d.reasons.player,1);assert.ok(d.longestStopSeconds>1);assert.equal(d.stoppedAgents[0].reason,'player');
 assert.equal('brakingReason' in t.snapshot().agents[0],false);assert.equal('stoppedFor' in t.snapshot().agents[0],false);
});
