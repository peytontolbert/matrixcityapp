import {DrivingLeaderboard,driverLabel as label,MAX_SCORE} from './leaderboard.mjs';
export {DrivingLeaderboard} from './leaderboard.mjs';
export class CutUpScoring {
 constructor(room,board=new DrivingLeaderboard()){this.room=room;this.board=board;this.runs=new Map();}
 reset(actor){this.runs.delete(actor);}
 update(actor,car,traffic,now,collision=false){
  let run=this.runs.get(actor);if(!run){run={score:0,passes:0,combo:1,lastPass:0,previous:null,encounters:new Map(),seen:new Set()};this.runs.set(actor,run);}
  const p=car.position,v=Math.hypot(...car.velocity),dt=run.previous?(now-run.previous.time)/1000:0;
  const discontinuity=run.previous&&(dt<=0||dt>1||Math.hypot(...p.map((x,i)=>x-run.previous.position[i]))>Math.max(4,Math.max(v,run.previous.speed)*dt+3));
  if(collision||discontinuity||v>110||car.streaming||car.kind==='native'&&!car.coupled){run.score=0;run.passes=0;run.combo=1;run.encounters.clear();run.lastPass=0;}
  if(now-run.lastPass>10000)run.combo=1;
  const c=Math.cos(car.heading),s=Math.sin(car.heading),live=new Set();
  if(!collision&&!discontinuity&&v<=110&&!car.streaming&&(car.kind!=='native'||car.coupled))for(const other of traffic){
   const key=other.id+':'+other.spawnGeneration;live.add(key);const dx=other.position[0]-p[0],dy=other.position[1]-p[1],forward=dx*c+dy*s,lateral=Math.abs(-dx*s+dy*c),height=Math.abs(other.position[2]-p[2]);
   if(height>1.5||Math.cos(other.heading-car.heading)<.75)continue;
   const relative=v-(other.velocity[0]*c+other.velocity[1]*s);let encounter=run.encounters.get(key);
   if(forward>5&&forward<70&&!run.seen.has(key)){encounter??={front:true,closest:Infinity,eligible:true};run.encounters.set(key,encounter);}
   if(!encounter)continue;
   if(v<70/3.6||relative<3)encounter.eligible=false;
   if(Math.abs(forward)<5){encounter.closest=Math.min(encounter.closest,lateral);if(lateral<(car.width||1.85)/2+(other.width||1.8)/2+.08)encounter.eligible=false;}
   if(forward< -5){run.encounters.delete(key);run.seen.add(key);if(encounter.eligible&&encounter.closest<3.8){const clearance=Math.max(.08,encounter.closest-1.825);const points=Math.round(100*(1+Math.max(0,1.8-clearance))*(1+Math.min(1,(v*3.6-70)/130))*run.combo);run.score=Math.min(MAX_SCORE,run.score+points);run.passes=Math.min(MAX_SCORE,run.passes+1);run.combo=Math.min(5,1+Math.floor(run.passes/3)*.5);run.lastPass=now;this.board.record(this.room,actor,run.score,run.passes);}}
  }
  for(const key of run.encounters.keys())if(!live.has(key))run.encounters.delete(key);
  for(const key of run.seen)if(!live.has(key))run.seen.delete(key);
  run.previous={position:[...p],time:now,speed:v};return {driver:label(actor),score:run.score,passes:run.passes,combo:run.combo};
 }
}
