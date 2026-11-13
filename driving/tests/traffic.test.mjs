import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthoritative110Traffic,followingSpeed,playerObstacle} from '../traffic.js';
const network={schema:'matrix-city-110-gameplay-v1',lanes:[{id:1,points:[[0,0,0],[5000,0,0]]}],connections:[]};
test('traffic uses real elapsed time at high broker tick rates and remains capacity bounded',()=>{
 const traffic=createAuthoritative110Traffic(network,{maximumPopulation:8,models:['prius']});
 traffic.update(.008,1000,[{x:1000,y:0,feetZ:0}]);const before=traffic.snapshot().agents;assert.equal(before.length,8);
 traffic.update(.008,1008,[{x:1000,y:0,feetZ:0}]);const after=traffic.snapshot().agents;
 for(const a of after){const p=before.find(p=>p.id===a.id);assert.ok(Math.abs(a.distance-p.distance-a.speedMps*.008)<1e-8);}
 traffic.update(0,1010,[{x:1000,y:0,feetZ:0}]);assert.deepEqual(traffic.snapshot().agents,after);
});

test('close passes in adjacent lanes do not trigger braking; cut-ins and crosswise cars do',()=>{
 const sample={position:[0,0,0],heading:0};
 assert.equal(playerObstacle(sample,Object.assign([12,2.1,0],{heading:0,velocity:[40,0,0]})),null);
 assert.equal(playerObstacle(sample,[12,0,5]),null);
 assert.ok(playerObstacle(sample,Object.assign([12,1,0],{heading:0})).gap>0);
 assert.ok(playerObstacle(sample,Object.assign([12,2.1,0],{heading:Math.PI/2})));
 assert.equal(followingSpeed(1,0,8.5,1),0);
 assert.ok(followingSpeed(40,0,8.5,1)<followingSpeed(40,20,8.5,1));
});

test('stopped player queues traffic without backward corrections or adjacent-lane phantom braking',()=>{
 const make=()=>{const t=createAuthoritative110Traffic(network,{maximumPopulation:1,models:['prius']});t.update(.01,1000,[{x:1000,y:0,feetZ:0}]);return t;};
 const blocked=make(),clear=make(),start=blocked.snapshot().agents[0],obstacle=start.x+90;
 let last=start.x;for(let i=0;i<1200;i++){
  const now=1010+i*10;blocked.update(.01,now,[{x:obstacle,y:0,feetZ:0,velocity:[0,0,0],heading:0}]);clear.update(.01,now,[{x:obstacle,y:3.5,feetZ:0,velocity:[0,0,0],heading:0}]);
  const a=blocked.snapshot().agents[0];assert.ok(a.x>=last-1e-8,'Visible car moved backward');assert.ok(a.x<obstacle-4.4,'Traffic ran into a stopped player');last=a.x;
 }
 assert.ok(blocked.snapshot().agents[0].speedMps<.5);assert.ok(clear.snapshot().agents[0].x>obstacle+50);
});
test('traffic recycling retains every identity and model instead of disconnecting native slots',()=>{
 const traffic=createAuthoritative110Traffic(network,{maximumPopulation:8,models:['prius']});traffic.update(.05,1000,[{x:600,y:0,feetZ:0}]);
 const initial=traffic.snapshot().agents,ids=initial.map(a=>a.id).sort();assert.equal(ids.length,8);
 for(let i=0;i<200;i++){traffic.update(.05,10000+i*50,[{x:3600,y:0,feetZ:0}]);const rows=traffic.snapshot().agents;assert.deepEqual(rows.map(a=>a.id).sort(),ids);assert.ok(rows.every(a=>a.model==='prius'&&Number.isFinite(a.speedMps)));}
 assert.ok(traffic.snapshot().agents.some(a=>a.x>2500),'Traffic did not relocate to the players');
});
test('private preset changes retain the reserved traffic pool and reject unknown names',()=>{
 const traffic=createAuthoritative110Traffic(network,{maximumPopulation:8,models:['prius']});traffic.update(.05,1000,[{x:1000,y:0,feetZ:0}]);const ids=traffic.snapshot().agents.map(a=>a.id);
 for(const preset of ['light','rush','heavy']){assert.equal(traffic.setPreset(preset),true);traffic.update(.05,2000,[{x:1000,y:0,feetZ:0}]);assert.deepEqual(traffic.snapshot().agents.map(a=>a.id),ids);}
 for(const name of ['__proto__','constructor','off'])assert.equal(traffic.setPreset(name),false);
});

test('heavy traffic fills 96 stable native slots and light/rush changes do not remove them',()=>{
 const lanes=Array.from({length:6},(_,i)=>({id:i+1,points:[[0,i*4,0],[5000,i*4,0]]}));
 const traffic=createAuthoritative110Traffic({...network,lanes},{maximumPopulation:96,models:['prius'],preset:'heavy'});
 for(let i=0;i<80;i++)traffic.update(.05,1000+i*50,[{x:2000,y:8,feetZ:0}]);
 assert.equal(traffic.population,96);const ids=traffic.snapshot().agents.map(a=>a.id).sort();
 for(const preset of ['light','rush','heavy']){traffic.setPreset(preset);for(let i=0;i<20;i++)traffic.update(.05,6000+i*50,[{x:2000,y:8,feetZ:0}]);assert.deepEqual(traffic.snapshot().agents.map(a=>a.id).sort(),ids);}
});

test('authored lane merges are continuous and blocked destinations wait without crossing cars',()=>{
 const map={schema:network.schema,lanes:[{id:1,points:[[0,0,0],[1000,0,0]]},{id:2,role:4,points:[[0,4,0],[5000,4,0]]}],connections:[{lane1ID:1,lane2ID:2,fromDistanceM:950,toDistanceM:950,gapM:4,probability:1}]};
 const t=createAuthoritative110Traffic(map,{maximumPopulation:1,models:['prius']});t.update(.01,1000,[{x:0,y:0,feetZ:0}]);let before=t.snapshot().agents[0],merged=false;
 for(let i=0;i<8000;i++){t.update(.01,1010+i*10,[{x:0,y:0,feetZ:0}]);const a=t.snapshot().agents[0];assert.ok(Math.hypot(a.x-before.x,a.y-before.y)<.7,'Junction teleported');before=a;if(a.laneId===2){merged=true;break;}}
 assert.ok(merged,'Authored merge never completed');
 const blocked=createAuthoritative110Traffic(map,{maximumPopulation:1,models:['prius']});blocked.update(.01,1000,[{x:0,y:0,feetZ:0}]);
 for(let i=0;i<8000;i++)blocked.update(.01,1010+i*10,[{x:950,y:4,feetZ:0,velocity:[0,0,0]}]);
 const car=blocked.snapshot().agents[0];assert.equal(car.laneId,1);assert.ok(car.x<950);assert.ok(car.speedMps<.5);
});
