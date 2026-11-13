// Real published collision/physics data; private runtime config is required.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Assets} from '../assets.js';
import {loadWorld,jsonAsset} from '../world.js';
import {DrivingSession} from '../sessions.js';
import {stepCar,STEP} from '../physics.js';
const config=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8'));
if(config.assets.indexFile)config.assets.index=JSON.parse(await readFile(config.assets.indexFile,'utf8'));
new Assets(config.assets).install();const profile=(await jsonAsset('physics/assetto-corsa/06_ygt_53_nissan_350z.json')).assettoHandling,reports=[];
for(const room of ['nohesi-110','nohesi-415']){
 const world=await loadWorld(room),session=new DrivingSession({room,world,profile,relay:{nativeVehicles:()=>[{position:world.spawn.position}],exchange:async()=>({ready:true})}});session.ready=true;
 const starts=[];for(let i=0;i<4;i++){const actor='fixture-'+i,t=session.ticket(actor);session.admit(actor,t.ticket,()=>{});starts.push([...session.players.get(actor).car.position]);}
 for(let tick=0;tick<600;tick++)for(const {car} of session.players.values())stepCar(car,world,STEP);
 const idleMovement=[...session.players.values()].map(({car},i)=>Math.hypot(...car.position.map((v,j)=>v-starts[i][j])));
 reports.push({room,fourBrowserSpawnsWithOccupiedNativePit:true,idleMovement});assert.ok(idleMovement.every(m=>m<1),'A stationary car drifted or spawned in collision: '+JSON.stringify(reports.at(-1)));
}
console.log(JSON.stringify({passed:true,reports},null,2));
