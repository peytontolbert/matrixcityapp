// Cross-lane cooperation runs on the authoritative traffic simulation only.
// It changes desired speeds, never positions, lanes, vehicle IDs or native slots.
const CELL=40,PLANNING_MS=250,OPENING_M=34;
const key=(x,y)=>Math.floor(x/CELL)+':'+Math.floor(y/CELL);
function indexRows(rows){
 const cells=new Map();
 for(const row of rows){const p=row.sample.position,k=key(p[0],p[1]),bucket=cells.get(k)||[];bucket.push(row);cells.set(k,bucket);}
 return cells;
}
function nearby(cells,center){
 const p=center.sample.position,x=Math.floor(p[0]/CELL),y=Math.floor(p[1]/CELL),rows=[];
 for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)rows.push(...(cells.get((x+i)+':'+(y+j))||[]));
 return rows;
}
function relative(center,other,c,s){
 const a=center.sample,b=other.sample,dx=b.position[0]-a.position[0],dy=b.position[1]-a.position[1];
 if(center.lane.id===other.lane.id||Math.abs(a.position[2]-b.position[2])>1.8||Math.cos(a.heading-b.heading)<.98)return null;
 return {row:other,along:dx*c+dy*s,side:-dx*s+dy*c};
}
function projectedSpan(group,t){
 const a=group[0].along+group[0].row.speedMps*t,b=group[1].along+group[1].row.speedMps*t,c=group[2].along+group[2].row.speedMps*t;
 return Math.max(a,b,c)-Math.min(a,b,c);
}
const PREDICTION_TIMES=[0,1,2,3,4,5,6],CURRENT_TIME=[0];
// Three contiguous lanes must not form a sustained, full-width traffic wall.
// Local road coordinates also work on curves and reject opposite carriageways.
export function trafficWalls(rows,{predict=true,clearance=OPENING_M}={}){
 const active=rows.filter(a=>!a.expired&&!a.merge),cells=indexRows(active),walls=[],seen=new Set();
 for(const center of active){
  const c=Math.cos(center.sample.heading),s=Math.sin(center.sample.heading);
  const neighbors=nearby(cells,center).map(a=>relative(center,a,c,s)).filter(a=>a&&Math.abs(a.along)<65);
  const left=neighbors.filter(a=>a.side>=2.6&&a.side<=4.9),right=neighbors.filter(a=>a.side<=-2.6&&a.side>=-4.9);
  for(const a of left)for(const b of right){
   const group=[a,{row:center,along:0,side:0},b];
   if(!(predict?PREDICTION_TIMES:CURRENT_TIME).some(t=>projectedSpan(group,t)<clearance))continue;
   const id=group.map(a=>a.row.id).sort().join('|');if(seen.has(id))continue;seen.add(id);
   walls.push(group);
  }
 }
 return walls;
}
// A faster player following this car gets priority over opening another lane.
// Do not introduce cooperative braking inside four seconds of closing distance.
export function safeToYield(agent,players){
 const p=agent.sample.position,c=Math.cos(agent.sample.heading),s=Math.sin(agent.sample.heading);
 return players.every(player=>{
  if(Math.abs(player[2]-p[2])>1.8)return true;
  const dx=player[0]-p[0],dy=player[1]-p[1],ahead=dx*c+dy*s,lateral=Math.abs(-dx*s+dy*c);
  if(ahead>=0||lateral>2)return true;
  const closing=(player.velocity?.[0]||0)*c+(player.velocity?.[1]||0)*s-agent.speedMps;
  return -ahead>Math.max(35,Math.max(0,closing)*4+10);
 });
}
export class TrafficOpenings{
 constructor(){this.yields=new Map();this.boosts=new Map();this.nextPlan=0;this.plans=0;}
 update(rows,players,now){
  if(now<this.nextPlan)return this.yields;
  this.nextPlan=now+PLANNING_MS;this.plans++;
  const live=new Map(rows.map(a=>[a.id,a]));
  for(const [id,entry] of this.yields){
   const agent=live.get(id);
   if(!agent||agent.spawnGeneration!==entry.generation||agent.expired||agent.merge||entry.until<now||!safeToYield(agent,players))this.yields.delete(id);
  }
  for(const [id,entry] of this.boosts){const agent=live.get(id);
   if(!agent||agent.spawnGeneration!==entry.generation||agent.expired||agent.merge){this.boosts.delete(id);continue;}
   if(entry.until<now||this.yields.has(id))entry.releasing=true;
   if(entry.releasing&&agent.speedMps<=agent.cruiseMps)this.boosts.delete(id);
  }
  for(const wall of trafficWalls(rows)){
   // Keep a chosen yielding vehicle until the formation is separated, avoiding
   // alternating brakes across lanes every time the planner runs.
   const existing=wall.find(item=>this.yields.has(item.row.id));
   let chosen=existing;
   if(existing)this.yields.get(existing.row.id).until=now+2500;
   else{
    const candidates=wall.filter(item=>safeToYield(item.row,players)).sort((a,b)=>a.along-b.along||String(a.row.id).localeCompare(String(b.row.id)));
    chosen=candidates[0];if(!chosen)continue;
    const speed=Math.min(chosen.row.speedMps,...wall.map(item=>item.row.speedMps));
    if(speed<10)continue; // A stopped queue has no safe artificial escape route.
    this.yields.set(chosen.row.id,{cap:Math.max(8,speed-4.5),until:now+2500,generation:chosen.row.spawnGeneration});
    if(this.boosts.has(chosen.row.id))this.boosts.get(chosen.row.id).releasing=true;
   }
   const lead=wall.filter(item=>!this.yields.has(item.row.id)).sort((a,b)=>b.along-a.along||String(b.row.id).localeCompare(String(a.row.id)))[0];
   if(lead)this.boosts.set(lead.row.id,{speed:lead.row.cruiseMps+3,until:now+2500,generation:lead.row.spawnGeneration});
  }
  return this.yields;
 }
 // Let the leading vehicle separate too, within the preset speed limit. Apply
 // this before normal following/curve/player limits, which always take priority.
 cruise(agent,normalCruise,maximum,dt,players=[]){const entry=this.boosts.get(agent.id);return entry&&entry.generation===agent.spawnGeneration?Math.min(maximum,Math.max(normalCruise,entry.releasing?agent.speedMps-(safeToYield(agent,players)?1.2*dt:0):entry.speed)):normalCruise;}
 // This cap only eases speed at 1.2 m/s². Normal obstacle braking still wins.
 target(agent,normalTarget,dt,players){
  const entry=this.yields.get(agent.id);
  if(!entry||entry.generation!==agent.spawnGeneration||!safeToYield(agent,players))return normalTarget;
  return Math.min(normalTarget,Math.max(entry.cap,agent.speedMps-1.2*dt));
 }
}
