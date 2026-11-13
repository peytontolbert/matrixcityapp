// Offline counterfactual path search using actual future AI poses on authored curves.
// Requires the private network; does not contact services or modify installed assets.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createAuthoritative110Traffic as revised} from '../traffic.js';
if(!process.env.MATRIX_TRAFFIC_NETWORK)throw Error('Set MATRIX_TRAFFIC_NETWORK to the authored110 network');
const network=JSON.parse(await fs.readFile(process.env.MATRIX_TRAFFIC_NETWORK));
const variants=[['revised',revised]];
if(process.env.MATRIX_TRAFFIC_BASELINE_MODULE)variants.unshift(['baseline',(await import(pathToFileURL(process.env.MATRIX_TRAFFIC_BASELINE_MODULE))).createAuthoritative110Traffic]);
function sample(lane,d){let i=0;while(lane.cumulative[i+1]<d)i++;const a=lane.points[i],b=lane.points[i+1],f=(d-lane.cumulative[i])/(lane.cumulative[i+1]-lane.cumulative[i]),heading=Math.atan2(b[1]-a[1],b[0]-a[0]);return {x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,feetZ:a[2]+(b[2]-a[2])*f,heading,velocity:[50*Math.cos(heading),50*Math.sin(heading),0]};}
function corridor(lanes,p){const sides=[0],c=Math.cos(p.heading),s=Math.sin(p.heading);for(const lane of lanes){if(lane.role===4)continue;let best=Infinity,side=null;for(let i=0;i<lane.points.length-1;i++){const a=lane.points[i],b=lane.points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;if(len2<.01||(dx*c+dy*s)/Math.sqrt(len2)<.96)continue;const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/len2)),x=a[0]+dx*t-p.x,y=a[1]+dy*t-p.y,z=a[2]+(b[2]-a[2])*t-p.feetZ,d=x*x+y*y;if(d>400||d>=best||Math.abs(z)>1.8||Math.abs(x*c+y*s)>3)continue;best=d;side=-x*s+y*c;}if(side!==null&&!sides.some(x=>Math.abs(x-side)<1.8))sides.push(side);}
 sides.sort((a,b)=>a-b);let at=sides.findIndex(x=>Math.abs(x)<.1),lo=at,hi=at;while(lo>0&&sides[lo]-sides[lo-1]<=5)lo--;while(hi<sides.length-1&&sides[hi+1]-sides[hi]<=5)hi++;return [sides[lo],sides[hi]];}
function mask(p,rows,range){const bad=new Uint8Array(257),c=Math.cos(p.heading),s=Math.sin(p.heading);for(let i=0;i<257;i++){const lateral=i*.125-16;if(lateral<range[0]||lateral>range[1])bad[i]=1;}
 for(const a of rows){if(Math.abs(a.feetZ-p.feetZ)>1.8||Math.cos(a.heading-p.heading)<.8)continue;const x=a.x-p.x,y=a.y-p.y,along=x*c+y*s;if(Math.abs(along)>5.5)continue;const side=-x*s+y*c;for(let i=Math.max(0,Math.ceil((side-2.2+16)*8));i<=Math.min(256,Math.floor((side+2.2+16)*8));i++)bad[i]=1;}return bad;}
function reachable(masks,start,centerOnly,steps=80){let states=new Set();for(let i=0;i<129;i++)if(!masks[start][2*i]&&(!centerOnly||i===64))states.add(i*5+2);if(!states.size)return null;for(let t=start+2;t<=start+steps;t+=2){const next=new Set();for(const key of states){const pos=Math.floor(key/5),v=key%5-2;for(let dv=-1;dv<=1;dv++){const delta=v+dv;if(delta< -2||delta>2)continue;const to=pos+delta,mid=pos*2+delta;if(to<0||to>=129||masks[t-1][mid]||masks[t][to*2])continue;next.add(to*5+delta+2);}}states=next;if(!states.size)return false;}return true;}

// Guard the path-search oracle itself against vacuous success/failure.
const empty=Array.from({length:81},()=>mask({x:0,y:0,feetZ:0,heading:0},[],[-4,4]));
assert.equal(reachable(empty,0,true),true);
const blocked=empty.map(m=>m.slice());blocked[20].fill(1);
assert.equal(reachable(blocked,0,false),false);
const results=[];
for(const [label,create]of variants)for(const playerCount of [1,2]){
 const traffic=create(network,{maximumPopulation:96,models:['prius']}),lane=traffic.lanes.find(l=>l.id===75),masks=[],frames=[],ranges=[];
 // Precompute road bounds on the real route; no flat/straight-road extrapolation.
 for(let i=0;i<1800;i++)ranges.push(corridor(traffic.lanes,sample(lane,1000+i*5)));
 for(let tick=0;tick<3600;tick++){
  const p=sample(lane,1000+tick*2.5),players=[p];if(playerCount===2)players.push(sample(lane,840+tick*2.5));
  traffic.update(.05,1000+tick*50,players);
  if(tick%2===0){const rows=traffic.snapshot().agents;frames.push(rows);masks.push(mask(p,rows,ranges[tick/2]));}
 }
 for(const scenario of ['constant180-8s','constant180-4s','brake180to151-4s']){
  const steps=scenario==='constant180-8s'?80:40;
  let windows=0,blocked=0,centerWindows=0,centerBlocked=0;
  for(let at=0;at<masks.length-steps;at+=10){
   let pathMasks=masks,start=at;
   if(scenario.startsWith('brake')){
    pathMasks=[];start=0;
    for(let i=0;i<=steps;i++){
     // Gentle2m/s^2 braking:180?151km/h over4seconds, never a full stop.
     const t=i*.1,d=1000+at*5+50*t-t*t,p=sample(lane,d);
     const range=ranges[Math.max(0,Math.min(ranges.length-1,Math.round((d-1000)/5)))];
     pathMasks.push(mask(p,frames[at+i],range));
    }
   }
   const result=reachable(pathMasks,start,false,steps),center=reachable(pathMasks,start,true,steps);
   if(result!==null){windows++;if(!result)blocked++;}if(center!==null){centerWindows++;if(!center)centerBlocked++;}
  }
  const result={label,playerCount,route:75,seconds:180,scenario,lateralSpeedLimitMps:2.5,lateralAccelerationLimitMps2:6.25,windows,blocked,centerWindows,centerBlocked,fullBlockedFrames:masks.filter(m=>m.every(v=>v===1)).length,allFrames:masks.length};results.push(result);console.log(JSON.stringify(result));
 }
}
if(process.env.MATRIX_TRAFFIC_REPORT)await fs.writeFile(process.env.MATRIX_TRAFFIC_REPORT,JSON.stringify(results,null,2));
