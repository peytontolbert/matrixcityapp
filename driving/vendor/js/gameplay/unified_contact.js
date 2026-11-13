import {solveImpulseSystem} from './impulse_system.js';
import {prepareUnifiedSystem,finishUnifiedSystem} from './unified_system.js';
// Debug-only simultaneous compliant contact. All tyre impulses share one
// chassis/wheel effective-mass matrix and a per-wheel friction ellipse.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function postPeakScale(demand,level=.88,rate=2){
 if(![demand,level,rate].every(Number.isFinite)||demand<0||level<0||level>1||rate<0)throw Error('Invalid post-peak parameters');
 const beyond=Math.max(0,demand-1);return level+(1-level)*Math.exp(-rate*beyond*beyond);
}
export function solveUnifiedContacts({longitudinal,lateral,yawRate,mass,yawInertia,wheels,dt,postPeak=false,iterations=160,elastic=false,tyreState={},convectiveOnly=false,unified}){
 if(![longitudinal,lateral,yawRate,mass,yawInertia,dt].every(Number.isFinite)||mass<=0||yawInertia<=0||dt<=0||dt>.05||wheels.length!==4)throw Error('Invalid combined contact state');
 if(unified.normalLoads)wheels=wheels.map((w,i)=>({...w,capLong:w.frictionLongPerN*unified.normalLoads[i],capLat:w.frictionLatPerN*unified.normalLoads[i]}));
 const n=8; const system=prepareUnifiedSystem({longitudinal,lateral,yawRate,mass,yawInertia,wheels,dt,...unified}); const inv=system.inverseMass;
 for(const w of wheels)if(![w.inertia,w.radius,w.omega,w.brakeTorque,w.x,w.y,w.steer,w.capLong,w.capLat,w.shape,w.relaxationLength].every(Number.isFinite)||w.inertia<=0||w.radius<=0||w.brakeTorque<0||w.capLong<0||w.capLat<0||w.shape<=0||w.relaxationLength<=0)throw Error('Invalid combined wheel');
 const velocity=system.velocity;
 const J=[],caps=[],compliance=[],raw=[],scales=[],springs=[],oldEnergy=[];
 for(let i=0;i<4;i++){
  const w=wheels[i],c=Math.cos(w.steer),s=Math.sin(w.steer),armX=w.y*s-w.x*c,armY=w.y*c+w.x*s;
  const jx=[c,s,armX,0,0,0,0];jx[3+i]=-w.radius;J.push(jx,[ -s,c,armY,0,0,0,0]); for(const row of J.slice(-2))while(row.length<velocity.length)row.push(0); if(system.vertical){J[2*i][10]=system.height*c;J[2*i][11]=-system.height*s;J[2*i+1][10]=-system.height*s;J[2*i+1][11]=-system.height*c;}
  const speed=(longitudinal-yawRate*w.x)*c+(lateral+yawRate*w.y)*s;
  const slipX=J[2*i].reduce((v,j,k)=>v+j*velocity[k],0),slipY=J[2*i+1].reduce((v,j,k)=>v+j*velocity[k],0);
  const longScale=Math.max(3,Math.abs(speed))*.105,latScale=Math.max(1,Math.abs(speed))*w.shape;
  const demand=Math.hypot(slipX/longScale,slipY/latScale)/1.82;
  const scale=postPeak?postPeakScale(demand,w.falloffLevel??.88,w.falloffSpeed??2):1;scales.push(scale);
  const rate=(convectiveOnly?Math.abs(speed):Math.max(.75,Math.abs(speed)))/w.relaxationLength; // Pure rolling transport is opt-in pending full convergence.
  const relaxationBlend=dt*rate/(1+dt*rate); // Backward-Euler Maxwell relaxation.
  const previous=tyreState[w.key];
  const k=[Math.max(1,w.capLong/(.105*w.relaxationLength)),Math.max(1,w.capLat/(w.shape*w.relaxationLength))];
  let e=previous?.deformation?[...previous.deformation]:[0,0];
  const E=previous?.energyJ??0;
  if(previous){const delta=(previous.steer??w.steer)-w.steer,c=Math.cos(delta),s=Math.sin(delta);e=[c*e[0]-s*e[1],s*e[0]+c*e[1]];}
  const trial=.5*(k[0]*e[0]**2+k[1]*e[1]**2);
  if(trial>E&&trial>0)e=e.map(x=>x*Math.sqrt(E/trial));
  if(w.capLong<=0||w.capLat<=0)e=[0,0];
  springs.push({k,e,rate,relaxationBlend,steer:w.steer});oldEnergy.push(E);
  const capX=w.capLong*scale,capY=w.capLat*scale;
  caps.push(capX*dt,capY*dt);
  compliance.push(...(elastic?k.map(x=>(1+dt*rate)/(dt*dt*x)):[longScale/Math.max(1e-12,dt*capX),latScale/Math.max(1e-12,dt*capY)]));
  raw.push(slipX+(elastic?e[0]/dt:0),slipY+(elastic?e[1]/dt:0));
 }
 const bounded=J.map((jacobian,i)=>({jacobian,limit:caps[i],compliance:compliance[i],bias:raw[i]-J[i].reduce((s,j,k)=>s+j*velocity[k],0)}));
 const solved=solveImpulseSystem({velocity,inverseMass:inv,externalImpulse:system.externalImpulse,bilateral:system.bilateral,bounded:[...bounded,...system.bounded],groups:[[0,1],[2,3],[4,5],[6,7]],method:'block',iterations:Math.max(400,iterations),tolerance:1e-10});
 const impulses=solved.boundedImpulse.slice(0,8),after=solved.velocity,q=impulses.map((x,i)=>caps[i]>0?x/caps[i]:0),energy=v=>v.reduce((sum,x,i)=>sum+.5*x*x/inv[i],0);
 const nextLoads=system.vertical?system.normalIndices.map(i=>solved.boundedImpulse[8+i]/dt):null;
 const usedLoads=unified.normalLoads??wheels.map(w=>w.normalReference),loadError=nextLoads?Math.max(...nextLoads.map((x,i)=>Math.abs(x-usedLoads[i]))):0;
 const nextTorque=-(solved.bilateralImpulse[0]??0)*system.ratio/dt,torqueError=Math.abs(nextTorque-system.outputEstimate);
 if(loadError>1e-7*Math.max(1,...(nextLoads??[0])) || torqueError>1e-7*Math.max(1,Math.abs(nextTorque))){
  if((unified.outerIteration??0)>=20)throw Error('Shared load/differential coupling did not converge');
  return solveUnifiedContacts({longitudinal,lateral,yawRate,mass,yawInertia,wheels,dt,postPeak,iterations,elastic,tyreState,convectiveOnly,unified:{...unified,normalLoads:nextLoads,outputTorqueEstimate:nextTorque,outerIteration:(unified.outerIteration??0)+1}});
 }
 system.normalCouplingResidualN=loadError;system.normalCouplingIterations=(unified.outerIteration??0)+1;
 const brakeApplied=finishUnifiedSystem(system,solved,dt);
 const nextTyres=Object.fromEntries(wheels.map((w,i)=>{const spring=springs[i],deformation=elastic?[-impulses[2*i]/(dt*spring.k[0]),-impulses[2*i+1]/(dt*spring.k[1])]:[0,0];return [w.key,{deformation,energyJ:.5*deformation.reduce((s,x,j)=>s+spring.k[j]*x*x,0),steer:w.steer,relaxationBlend:spring.relaxationBlend,relaxationRatePerSec:spring.rate,impliedCarcassStiffnessNpm:spring.k,calibrated:false}];}));
 const elasticBefore=elastic?oldEnergy.reduce((a,b)=>a+b,0):0,elasticAfter=Object.values(nextTyres).reduce((a,t)=>a+t.energyJ,0);
 const totalDelta=solved.passiveEnergyDeltaJ+elasticAfter-elasticBefore;
 const heatRaw=wheels.map((w,i)=>2*nextTyres[w.key].energyJ*springs[i].rate*dt),heatSum=heatRaw.reduce((a,b)=>a+b,0),heatScale=heatSum>0?Math.min(1,Math.max(0,-totalDelta)/heatSum):0;
 wheels.forEach((w,i)=>nextTyres[w.key].heatJ=heatRaw[i]*heatScale);
 return {tyreState:nextTyres,elasticEnergyJ:elasticAfter,totalContactEnergyDeltaJ:totalDelta,dissipationJ:Math.max(0,-totalDelta),longitudinal:after[0],lateral:after[1],yawRate:after[2],passiveEnergyDeltaJ:energy(after)-energy(velocity),
  sharedSolve:solved,projectedResidual:solved.projectedResidual,iterations:solved.iterations,
  wheels:wheels.map((w,i)=>({key:w.key,fx:impulses[2*i]/dt,fy:impulses[2*i+1]/dt,omega:after[3+i],brakeApplied:brakeApplied[i],
   slipRatio:-(J[2*i].reduce((s,a,k)=>s+a*after[k],0))/Math.max(3,Math.abs(longitudinal)),
   slipAngle:Math.atan2(J[2*i+1].reduce((s,a,k)=>s+a*after[k],0),Math.max(1,Math.abs(longitudinal))),
   utilization:Math.hypot(q[2*i],q[2*i+1]),postPeakScale:scales[i]}))};
}

