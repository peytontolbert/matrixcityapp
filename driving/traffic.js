import {routeInterest} from './traffic-interest.js';
import {TrafficOpenings,trafficWalls} from './traffic-openings.js';
import {reservesPassingCorridor} from './traffic-corridor.js';
const TRAFFIC_MODELS = Object.freeze([
  'prius', 'golf7r', 'focusrs', 'a6', 'e300', 'rs318', 'aqv', 'models',
]);

export const AUTHORITATIVE_110_TRAFFIC_PRESETS = Object.freeze({
  light: Object.freeze({
    population: 44, perAdditionalPlayer: 10, maximumPopulation: 72,
    minimumSpacingM: 42, speedKmh: [70, 110], streamRadiusM: 850,
    spawnDistanceM: [170, 650], recycleDistanceM: 1050,
    accelerationMps2: 2.2, decelerationMps2: 7.5, speedVariation: 0.12,
  }),
  heavy: Object.freeze({
    population: 96, perAdditionalPlayer: 18, maximumPopulation: 144,
    minimumSpacingM: 24, speedKmh: [58, 105], streamRadiusM: 1000,
    spawnDistanceM: [130, 720], recycleDistanceM: 1250,
    accelerationMps2: 2.4, decelerationMps2: 8.5, speedVariation: 0.17,
  }),
  rush: Object.freeze({
    population: 176, perAdditionalPlayer: 28, maximumPopulation: 240,
    minimumSpacingM: 14, speedKmh: [42, 92], streamRadiusM: 1150,
    spawnDistanceM: [90, 760], recycleDistanceM: 1400,
    accelerationMps2: 1.9, decelerationMps2: 9.0, speedVariation: 0.22,
  }),
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Bumper clearance and reaction time, rather than a fixed-radius slowdown.
// The quadratic includes distance travelled during reaction and braking.
export function followingSpeed(gap, leaderSpeed, deceleration, headway) {
  const space=Math.max(0,gap-2.2),b=deceleration;
  return Math.max(0,Math.sqrt((b*headway)**2+Math.max(0,leaderSpeed)**2+2*b*space)-b*headway);
}
export function playerObstacle(sample, player) {
  if(Math.abs(player[2]-sample.position[2])>1.8)return null;
  const c=Math.cos(sample.heading),s=Math.sin(sample.heading),dx=player[0]-sample.position[0],dy=player[1]-sample.position[1];
  const forward=dx*c+dy*s,lateral=Math.abs(-dx*s+dy*c);
  const angle=(player.heading??sample.heading)-sample.heading;
  const halfLength=Math.abs(Math.cos(angle))*2.25+Math.abs(Math.sin(angle))*.925;
  const halfWidth=Math.abs(Math.sin(angle))*2.25+Math.abs(Math.cos(angle))*.925;
  // A parallel car in the adjacent lane is not an obstacle, even on a close pass.
  if(forward<=0||lateral>.9+halfWidth+.15)return null;
  return {gap:forward-2.25-halfLength,speed:(player.velocity?.[0]||0)*c+(player.velocity?.[1]||0)*s};
}

function hashUnit(seed) {
  let value = (seed | 0) + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function prepareLane(source) {
  const points = source.points.map(point => [Number(point[0]), Number(point[1]), Number(point[2])]);
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
      points[index][2] - points[index - 1][2],
    ));
  }
  return { ...source, points, cumulative, lengthM: cumulative.at(-1) || 0 };
}

function sampleLane(lane, distance) {
  const d = clamp(distance, 0, Math.max(0, lane.lengthM - 0.001));
  let low = 0;
  let high = lane.cumulative.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (lane.cumulative[middle] <= d) low = middle;
    else high = middle;
  }
  const a = lane.points[low];
  const b = lane.points[Math.min(low + 1, lane.points.length - 1)];
  const span = Math.max(0.001, lane.cumulative[Math.min(low + 1, lane.cumulative.length - 1)] - lane.cumulative[low]);
  const t = (d - lane.cumulative[low]) / span;
  return {
    position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}

function nearestLanePair(from, to) {
  let best = { squared: Infinity, fromIndex: from.points.length - 1, toIndex: 0 };
  for (let fromIndex = 0; fromIndex < from.points.length; fromIndex++) {
    const a = from.points[fromIndex];
    for (let toIndex = 0; toIndex < to.points.length; toIndex++) {
      const b = to.points[toIndex];
      const squared = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
      if (squared < best.squared) best = { squared, fromIndex, toIndex };
    }
  }
  return {
    fromDistanceM: from.cumulative[best.fromIndex],
    toDistanceM: to.cumulative[best.toIndex],
    gapM: Math.sqrt(best.squared),
  };
}

function prepareConnections(network, lanesById) {
  const outgoing = new Map();
  for (const raw of network.connections || []) {
    const from = lanesById.get(Number(raw.lane1ID));
    const to = lanesById.get(Number(raw.lane2ID));
    if (!from || !to) continue;
    const resolved = Number.isFinite(raw.fromDistanceM) && Number.isFinite(raw.toDistanceM)
      ? { fromDistanceM: raw.fromDistanceM, toDistanceM: raw.toDistanceM, gapM: raw.gapM || 0 }
      : nearestLanePair(from, to);
    if(resolved.gapM>6 || resolved.fromDistanceM<0 || resolved.fromDistanceM>from.lengthM || resolved.toDistanceM<0 || resolved.toDistanceM>=to.lengthM)continue;
    const connection = { ...raw, ...resolved, from, to };
    const bucket = outgoing.get(from.id) || [];
    bucket.push(connection);
    outgoing.set(from.id, bucket);
  }
  for (const bucket of outgoing.values()) bucket.sort((a, b) => a.fromDistanceM - b.fromDistanceM);
  return outgoing;
}

function playerPosition(player) {
  const state = player?.state || player;
  if (![state?.x, state?.y].every(Number.isFinite)) return null;
  return Object.assign([Number(state.x), Number(state.y), Number(state.feetZ) || 0],{heading:state.heading,velocity:state.velocity});
}

export function createAuthoritative110Traffic(network, options = {}) {
  if (!['matrix-city-110-gameplay-v1','matrix-city-415-gameplay-v1'].includes(network?.schema) || !Array.isArray(network.lanes)) {
    throw new Error('Authoritative 110 traffic requires the recovered gameplay network');
  }
  const lanes = network.lanes.map(prepareLane).filter(lane => lane.points.length > 1 && lane.lengthM > 80);
  const lanesById = new Map(lanes.map(lane => [lane.id, lane]));
  const drivableLanes = lanes.filter(lane => lane.role !== 4);
  const outgoing = prepareConnections(network, lanesById);
  const spawnSamples = [];
  for (const [index,lane] of drivableLanes.entries()) {
    // Adjacent lanes must not all spawn on the same longitudinal 35 m grid.
    const phase=(index*.38196601125%1)*35;
    for (let distance = 20+phase; distance < lane.lengthM - 10; distance += 35) {
      spawnSamples.push({ lane, distance, sample: sampleLane(lane, distance) });
    }
  }
  const models = options.models || TRAFFIC_MODELS;
  if (!Array.isArray(models) || !models.length || models.some(m => !TRAFFIC_MODELS.includes(m))) throw Error('Invalid shared traffic models');
  const populationLimit = options.maximumPopulation ?? 240;
  if (!Number.isInteger(populationLimit) || populationLimit < 1 || populationLimit > 240) throw Error('Invalid shared traffic capacity');
  const agents = [];
  const openings=new TrafficOpenings();
  const surface=options.surface||((sample)=>sample);
  let corridorCache=new Map(),interestCache=new Map(),recycledCount=0,interestPlayers=[],interestAt=-Infinity;
  function interest(lane,player,distance){const key=interestPlayers.indexOf(player)+':'+lane.id;let row=interestCache.get(key);if(!row){row=routeInterest(lane,player,0);interestCache.set(key,row);}return {...row,ahead:row.ahead+distance};}
  let presetName = Object.hasOwn(AUTHORITATIVE_110_TRAFFIC_PRESETS,options.preset) ? options.preset : 'heavy';
  let serial = 0;
  let sequence = 0;
  let spawnCursor = 0;
  let ownerCursor=0;
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  let spawnStride=7919;while(spawnSamples.length>0&&gcd(spawnStride,spawnSamples.length)>1)spawnStride++;
  let lastPopulationUpdate = 0;
  let lastPlayerCount = 0;

  function preset() { return AUTHORITATIVE_110_TRAFFIC_PRESETS[presetName]; }

  function setPreset(name) {
    if (!Object.hasOwn(AUTHORITATIVE_110_TRAFFIC_PRESETS,name)) return false;
    presetName = name;
    for(const agent of agents){const range=preset().speedKmh;agent.cruiseMps=(range[0]+hashUnit(agent.seed*41)*(range[1]-range[0]))/3.6;}
    // A shared native entry slot is a persistent vehicle, never removed by presets.
    return true;
  }

  function activePlayers(players) {
    return Array.from(players || []).map(playerPosition).filter(Boolean);
  }

  function targetPopulation() { return populationLimit; }

  function reservedOpening(candidate,players,speed,now){
    for(const player of players){
      if(!Number.isFinite(player.heading))continue;
      const velocity=player.velocity||[0,0],playerSpeed=velocity[0]*Math.cos(player.heading)+velocity[1]*Math.sin(player.heading);
      if(playerSpeed-speed<8)continue;
      let group=corridorCache.get(players.indexOf(player));
      if(!group){
        const nearby=drivableLanes.map(lane=>({lane,...interest(lane,player,0)})).filter(row=>row.relevant&&Number.isFinite(row.side)&&Math.abs(row.height)<1.8&&row.alignment>.98).sort((a,b)=>a.side-b.side);
        let at=nearby.reduce((best,row,i)=>Math.abs(row.side)<Math.abs(nearby[best]?.side??Infinity)?i:best,0),lo=at,hi=at;
        while(lo>0&&nearby[lo].side-nearby[lo-1].side<5)lo--;
        while(hi+1<nearby.length&&nearby[hi+1].side-nearby[hi].side<5)hi++;
        group=nearby.slice(lo,hi+1);corridorCache.set(players.indexOf(player),group);
      }
      if(group.length<2)continue;
      const row=group.find(row=>row.lane===candidate.lane);if(!row)continue;
      if(reservesPassingCorridor(group,row,candidate.distance,playerSpeed,speed,preset().speedKmh[0]/3.6,now))return true;
    }
    return false;
  }
  function safeSpawn(candidate, players, config, recycled = null) {
    if (agents.some(agent => agent !== recycled && agent.lane.id === candidate.lane.id
      && Math.abs(agent.distance - candidate.distance) < config.minimumSpacingM)) return false;
    if(agents.some(agent=>agent!==recycled&&Math.abs(agent.sample.position[2]-candidate.sample.position[2])<2&&distance2(agent.sample.position,candidate.sample.position)<6))return false;
    const local=agents.filter(agent=>agent!==recycled&&distance2(agent.sample.position,candidate.sample.position)<24);
    const proposed={...candidate,id:'spawn-candidate',speedMps:0};
    if(trafficWalls([...local,proposed],{predict:false,clearance:20}).some(wall=>wall.some(item=>item.row===proposed)))return false;
    return players.every(player => distance2(candidate.sample.position, player) > 28);
  }

  function spawnOne(players, now, recycled = null) {
    const config = preset();
    if (!spawnSamples.length || !players.length) return false;
    const attempts = Math.min(spawnSamples.length, 500);
    const startOwner=ownerCursor++%players.length;
    for (let attempt = 0; attempt < attempts; attempt++) {
      // A coprime scan visits every candidate (the old stride could visit only
      // one sample when a network contained exactly 7919 samples).
      spawnCursor = (spawnCursor + spawnStride) % spawnSamples.length;
      const candidate = spawnSamples[spawnCursor];
      const nearestPlayer = Math.min(...players.map(player => distance2(candidate.sample.position, player)));
      const owner=players[(startOwner+Math.floor(attempt/64))%players.length],route=interest(candidate.lane,owner,candidate.distance);
      if(Number.isFinite(owner.heading)&&(!route.relevant||route.ahead<config.spawnDistanceM[0]||route.ahead>config.spawnDistanceM[1]))continue;
      const minimumDistance=config.spawnDistanceM[0];
      if (nearestPlayer < minimumDistance || nearestPlayer > config.spawnDistanceM[1]) continue;
      const speedRange = config.speedKmh;
      const cruiseKph = speedRange[0] + hashUnit((serial+1) * 41) * (speedRange[1] - speedRange[0]);
      if(reservedOpening(candidate,players,cruiseKph/3.6,now))continue;
      if (!safeSpawn(candidate, players, config, recycled)) continue;
      const grounded=surface(candidate.sample);if(!grounded)continue;
      const id = ++serial;

      const replacement = {
        id: recycled?.id || `traffic_${id}`, lane: candidate.lane, distance: candidate.distance,
        speedMps: cruiseKph / 3.6, cruiseMps: cruiseKph / 3.6,
        model: recycled?.model || models[id % models.length], protectedUntil: now + 4000 + hashUnit(id * 73) * 4000,
        sample: grounded, expired: false, wireSequence: -1, seed:id,spawnGeneration:id,
        brake:0,merge:null,headway:.7+hashUnit(id*97)*.45,
      };
      // Native slots retain their identity while an off-screen car is recycled.
      if(recycled){Object.assign(recycled,replacement);recycledCount++;}else agents.push(replacement);
      return true;
    }
    return false;
  }

  function mergeClear(agent,link,players) {
    const destination=sampleLane(link.to,link.toDistanceM);
    if(players.some(p=>distance2(destination.position,p)<Math.max(18,Math.hypot(...(p.velocity||[0,0]))*1.5)&&Math.abs(destination.position[2]-p[2])<2))return false;
    return !agents.some(other=>other!==agent && ((other.lane===link.to&&Math.abs(other.distance-link.toDistanceM)<Math.max(9,other.speedMps*1.25)) || (other.merge?.target===link.to&&Math.abs(other.merge.endDistance-link.toDistanceM)<25)));
  }
  function transitionAgent(agent, previousDistance,players) {
    const links = outgoing.get(agent.lane.id) || [];
    const reached = links.filter(link => previousDistance <= link.fromDistanceM && agent.distance > link.fromDistanceM + 0.01);
    if (reached.length) {
      const weighted = reached.filter(link => hashUnit(agent.seed * 101 + Number(link.lane2ID)) < (Number.isFinite(link.probability)?link.probability:1));
      const link = weighted[0] || (agent.distance>=agent.lane.lengthM-5?reached[0]:null);
      if(!link)return;
      if(!mergeClear(agent,link,players)){agent.distance=Math.max(previousDistance,link.fromDistanceM-.01);agent.speedMps=0;agent.brake=1;return;}
      const overshoot = Math.max(0, agent.distance - link.fromDistanceM);
      // An authored connection can bridge lane centres. Traverse its curve;
      // never jump the car sideways to the destination lane.
      if(link.gapM>.1){
        const start=sampleLane(agent.lane,link.fromDistanceM),endDistance=Math.min(link.to.lengthM-.01,link.toDistanceM+Math.max(12,agent.speedMps*1.5));
        const end=sampleLane(link.to,endDistance),length=Math.max(1,Math.hypot(...end.position.map((v,i)=>v-start.position[i])));
        agent.merge={start,end,length,progress:overshoot,target:link.to,endDistance,started:sequence};return;
      }
      agent.lane = link.to;
      agent.distance = link.toDistanceM + overshoot;
      return;
    }
    if (agent.distance < agent.lane.lengthM) return;
    const endLinks = links.filter(link => link.fromDistanceM >= agent.lane.lengthM - 20);
    if (endLinks.length) {
      const oldLength = agent.lane.lengthM;
      const link = endLinks[Math.floor(hashUnit(agent.seed * 131) * endLinks.length)];
      if(!mergeClear(agent,link,players)){agent.distance=Math.min(agent.distance,oldLength-.01);agent.speedMps=0;return;}
      agent.lane = link.to;
      agent.distance = link.toDistanceM + Math.max(0, agent.distance - oldLength);
    } else if (agent.lane.loop) agent.distance %= agent.lane.lengthM;
    else {agent.distance=agent.lane.lengthM-.01;agent.expired = true;}
  }

  function mergeSample(merge) {
    const t=clamp(merge.progress/merge.length,0,1),u=1-t,k=merge.length/3;
    const a=merge.start.position,d=merge.end.position;
    const b=[a[0]+Math.cos(merge.start.heading)*k,a[1]+Math.sin(merge.start.heading)*k,a[2]+(d[2]-a[2])/3];
    const c=[d[0]-Math.cos(merge.end.heading)*k,d[1]-Math.sin(merge.end.heading)*k,d[2]-(d[2]-a[2])/3];
    const position=a.map((v,i)=>u*u*u*v+3*u*u*t*b[i]+3*u*t*t*c[i]+t*t*t*d[i]);
    const derivative=a.map((v,i)=>3*u*u*(b[i]-v)+6*u*t*(c[i]-b[i])+3*t*t*(d[i]-c[i]));
    return {position,heading:Math.atan2(derivative[1],derivative[0])};
  }

  function enforceLaneSpacing(config) {
    const grouped = new Map();
    for (const agent of agents) {
      if (agent.expired) continue;
      const bucket = grouped.get(agent.lane.id) || [];
      bucket.push(agent);
      grouped.set(agent.lane.id, bucket);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => a.distance - b.distance);
      for (let index = bucket.length - 2; index >= 0; index--) {
        const behind = bucket[index];
        const ahead = bucket[index + 1];
        // Never correct density by teleporting an already visible car backwards.
        if(ahead.distance-behind.distance<6){behind.speedMps=Math.min(behind.speedMps,ahead.speedMps);behind.brake=1;}
      }
    }
  }

  function update(deltaSeconds, now, roomPlayers) {
    // The broker ticks at 120 Hz. A 10 ms minimum made traffic run 25% fast.
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    if (dt === 0) return;
    const players = activePlayers(roomPlayers);
    if(now-interestAt>=250||players.length!==interestPlayers.length){interestCache.clear();corridorCache.clear();interestAt=now;}interestPlayers=players;
    lastPlayerCount = players.length;
    const config = preset();
    openings.update(agents,players,now);
    const sorted = new Map();
    for (const agent of agents) {
      const bucket = sorted.get(agent.lane.id) || [];
      if(!agent.merge)bucket.push(agent);
      sorted.set(agent.lane.id, bucket);
    }
    for (const bucket of sorted.values()) bucket.sort((a, b) => a.distance - b.distance);
    for (const bucket of sorted.values()) {
      for (let index = bucket.length-1; index >= 0; index--) {
        const agent = bucket[index];
        if(agent.expired){agent.speedMps=0;continue;}
        const ahead = bucket[index + 1];
        let target = openings.cruise(agent,agent.cruiseMps,config.speedKmh[1]/3.6,dt,players);
        const headway=agent.headway*(presetName==='rush'?.8:presetName==='light'?1.5:1);
        if (ahead) {
          const gap = ahead.distance - agent.distance;
          target=Math.min(target,followingSpeed(gap-4.5,ahead.speedMps,config.decelerationMps2,headway));
        }
        const current = sampleLane(agent.lane, agent.distance);
        const lookAhead = sampleLane(agent.lane, agent.distance + clamp(agent.speedMps * 2, 22, 65));
        const bend = Math.abs(Math.atan2(Math.sin(lookAhead.heading - current.heading), Math.cos(lookAhead.heading - current.heading)));
        target *= clamp(1 - bend * 0.7, 0.38, 1);
        for (const player of players) {const obstacle=playerObstacle(current,player);if(obstacle)target=Math.min(target,followingSpeed(obstacle.gap,obstacle.speed,config.decelerationMps2,headway));}
        const links=outgoing.get(agent.lane.id)||[],next=links.find(l=>l.fromDistanceM>=agent.distance);
        if(next&&!mergeClear(agent,next,players))target=Math.min(target,followingSpeed(next.fromDistanceM-agent.distance,0,config.decelerationMps2,.5));
        if(!agent.lane.loop&&!links.some(l=>l.fromDistanceM>=agent.distance))target=Math.min(target,followingSpeed(agent.lane.lengthM-agent.distance,0,config.decelerationMps2,.5));
        target=openings.target(agent,target,dt,players);
        const rate = target < agent.speedMps ? config.decelerationMps2 : config.accelerationMps2;
        agent.brake=target<agent.speedMps-.3?1:0;
        agent.speedMps += clamp(target - agent.speedMps, -rate * dt, rate * dt);
        const previousDistance = agent.distance;
        let travel=Math.max(0,agent.speedMps)*dt;
        if(ahead)travel=Math.min(travel,Math.max(0,ahead.distance-agent.distance-4.8));
        agent.distance += travel;
        const oldLane=agent.lane;
        transitionAgent(agent, previousDistance,players);
        const nextSample=surface(agent.merge?mergeSample(agent.merge):sampleLane(agent.lane, Math.min(agent.distance,agent.lane.lengthM)));
        if(nextSample)agent.sample=nextSample;else{agent.lane=oldLane;agent.distance=previousDistance;agent.speedMps=0;agent.brake=1;agent.merge=null;}
        if(!agent.lane.loop&&agent.lane.lengthM-agent.distance<2.3&&!next){agent.expired=true;}
        if(agent.expired)agent.speedMps=0;
      }
    }
    for(const agent of agents.filter(a=>a.merge)){
      const m=agent.merge;let target=agent.cruiseMps;
      if(m.started===sequence)continue;
      for(const player of players){const obstacle=playerObstacle(agent.sample,player);if(obstacle)target=Math.min(target,followingSpeed(obstacle.gap,obstacle.speed,config.decelerationMps2,agent.headway));}
      for(const other of agents)if(other!==agent&&other.lane===m.target&&other.distance>=m.endDistance-4.5)target=Math.min(target,followingSpeed(m.length-m.progress+other.distance-m.endDistance-4.5,other.speedMps,config.decelerationMps2,agent.headway));
      agent.brake=target<agent.speedMps-.3?1:0;agent.speedMps+=clamp(target-agent.speedMps,-config.decelerationMps2*dt,config.accelerationMps2*dt);
      const previous=m.progress;m.progress=Math.min(m.length,m.progress+agent.speedMps*dt);const grounded=surface(mergeSample(m));if(!grounded){m.progress=previous;agent.speedMps=0;agent.brake=1;continue;}agent.sample=grounded;
      if(m.progress>=m.length){agent.lane=m.target;agent.distance=m.endDistance;agent.merge=null;}
    }
    if (players.length) {
      for (let index = agents.length - 1; index >= 0; index--) {
        const agent = agents[index];
        const nearest = Math.min(...players.map(player => distance2(agent.sample.position, player)));
        const useful=players.some(p=>{const r=interest(agent.lane,p,agent.distance);return r.relevant&&r.ahead> -90&&r.ahead<config.recycleDistanceM;});
        const behindEveryone=players.every(p=>{if(!Number.isFinite(p.heading))return false;const dx=agent.sample.position[0]-p[0],dy=agent.sample.position[1]-p[1];return dx*Math.cos(p.heading)+dy*Math.sin(p.heading)<-110;});
        if ((agent.expired && nearest > 150) || (now >= agent.protectedUntil && (nearest > config.recycleDistanceM || !useful&&nearest>180&&behindEveryone))) {
          // If no safe replacement exists, keep this slot parked rather than
          // disconnecting it or teleporting a car beside a player.
          if(now>=(agent.retrySpawnAt||0)){
            agent.retrySpawnAt=spawnOne(players,now,agent)?0:now+250;
          }
        }
      }
      if (now - lastPopulationUpdate >= 250) {
        lastPopulationUpdate = now;
        const wanted = targetPopulation(players.length);
        const budget = presetName === 'rush' ? 12 : 8;
        for (let count = 0; agents.length < wanted && count < budget; count++) if (!spawnOne(players, now)) break;
      }
    }
    enforceLaneSpacing(config);
    sequence++;
  }

  function snapshot(center = null) {
    const config = preset();
    const point = playerPosition(center);
    const visible = point ? agents.filter(agent => distance2(agent.sample.position, point) <= config.streamRadiusM + 120) : agents;
    return {
      type: network.schema==='matrix-city-415-gameplay-v1'?'matrix415_traffic_state':'matrix110_traffic_state', schema: 1, sequence, serverTime: Date.now(), preset: presetName,
      targetPopulation: targetPopulation(lastPlayerCount), totalPopulation: agents.length,recycledCount,
      streamRadiusM: config.streamRadiusM,
      agents: visible.map(agent => { if (agent.wireSequence === sequence && agent.wireRecord) return agent.wireRecord; agent.wireSequence = sequence; return agent.wireRecord = ({
        id: agent.id, model: agent.model, laneId: agent.lane.id, distance: agent.distance,
        x: agent.sample.position[0], y: agent.sample.position[1], feetZ: agent.sample.position[2],
        heading: agent.sample.heading,pitch:agent.sample.pitch||0,roll:agent.sample.roll||0,spawnGeneration:agent.spawnGeneration, speedMps: agent.speedMps,brake:agent.brake,
      }); }),
    };
  }

  return { update, snapshot, setPreset, get preset() { return presetName; }, get population() { return agents.length; }, lanes, outgoing };
}
