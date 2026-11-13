// Debug-only simultaneous compliant contact. All tyre impulses share one
// chassis/wheel effective-mass matrix and a per-wheel friction ellipse.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Fixed eight-contact rows. Preserve summation order, avoiding closures in the hot loop.
function dot8(a,b){let sum=0;for(let i=0;i<8;i++)sum+=a[i]*b[i];return sum;}
export function postPeakScale(demand,level=.88,rate=2){
 if(![demand,level,rate].every(Number.isFinite)||demand<0||level<0||level>1||rate<0)throw Error('Invalid post-peak parameters');
 const beyond=Math.max(0,demand-1);return level+(1-level)*Math.exp(-rate*beyond*beyond);
}
export function solveCombinedContacts({longitudinal,lateral,yawRate,mass,yawInertia,wheels,dt,postPeak=false,iterations=160,elastic=false,tyreState={},convectiveOnly=false}){
 if(![longitudinal,lateral,yawRate,mass,yawInertia,dt].every(Number.isFinite)||mass<=0||yawInertia<=0||dt<=0||dt>.05||wheels.length!==4)throw Error('Invalid combined contact state');
 const n=8,dof=7,inv=[1/mass,1/mass,1/yawInertia,...wheels.map(w=>1/w.inertia)];
 for(const w of wheels)if(![w.inertia,w.radius,w.omega,w.brakeTorque,w.x,w.y,w.steer,w.capLong,w.capLat,w.shape,w.relaxationLength].every(Number.isFinite)||w.inertia<=0||w.radius<=0||w.brakeTorque<0||w.capLong<0||w.capLat<0||w.shape<=0||w.relaxationLength<=0)throw Error('Invalid combined wheel');
 const hasBrakes=wheels.some(w=>w.brakeTorque>0);
 const velocity=[longitudinal,lateral,yawRate,...wheels.map(w=>w.omega)];
 const J=[],caps=[],compliance=[],raw=[],scales=[],springs=[],oldEnergy=[];
 for(let i=0;i<4;i++){
  const w=wheels[i],c=Math.cos(w.steer),s=Math.sin(w.steer),armX=w.y*s-w.x*c,armY=w.y*c+w.x*s;
  const jx=[c,s,armX,0,0,0,0];jx[3+i]=-w.radius;J.push(jx,[ -s,c,armY,0,0,0,0]);
  const speed=(longitudinal-yawRate*w.x)*c+(lateral+yawRate*w.y)*s;
  const slipX=J[2*i].reduce((v,j,k)=>v+j*velocity[k],0),slipY=J[2*i+1].reduce((v,j,k)=>v+j*velocity[k],0);
  const longScale=Math.max(3,Math.abs(speed))*.105,latScale=Math.max(1,Math.abs(speed))*w.shape;
  const demand=Math.hypot(slipX/longScale,slipY/latScale)/1.82;
  const scale=postPeak?postPeakScale(demand,w.falloffLevel??.88,w.falloffSpeed??2):1;scales.push(scale);
  // Tread still passes through the contact patch during a stationary burnout.
  // Locked, stationary wheels retain static carcass deflection; rolling wheels
  // retain their original transport rate when hub and tread speeds agree.
  const transportSpeed=Math.max(Math.abs(speed),Math.abs(w.omega*w.radius));
  const rate=(convectiveOnly?transportSpeed:Math.max(.75,transportSpeed))/w.relaxationLength;
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
 const A=Array.from({length:n},()=>Array(n).fill(0)),b=raw.map((v,i)=>v*caps[i]);
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)A[i][j]=caps[i]*caps[j]*J[i].reduce((v,a,k)=>v+a*inv[k]*J[j][k],0)+(i===j?caps[i]**2*compliance[i]:0);
 const L=Math.max(1e-12,...A.map(row=>row.reduce((v,a)=>v+Math.abs(a),0)));
 const project=q=>{for(let i=0;i<n;i+=2){const size=Math.max(1,Math.hypot(q[i],q[i+1]));q[i]/=size;q[i+1]/=size;}return q;};
 // Minimize each bounded brake impulse exactly for the current tyre impulses.
 // This is the Schur reduction of four static/kinetic brake constraints, not
 // a speed clamp: held wheels can oppose contact torque up to authored capacity.
 const brakeImpulse=(q,i)=>{
  const w=wheels[i],freeOmega=velocity[3+i]-w.radius*caps[2*i]*q[2*i]*inv[3+i];
  return clamp(-freeOmega/inv[3+i],-w.brakeTorque*dt,w.brakeTorque*dt);
 };
 const brakeGradient=(q,i)=>i%2===0?-wheels[i/2].radius*caps[i]*inv[3+i/2]*brakeImpulse(q,i/2):0;
 const objective=q=>{
  let value=q.reduce((sum,v,i)=>sum+v*(b[i]+.5*dot8(A[i],q)),0);
  if(hasBrakes)for(let i=0;i<4;i++){const p=brakeImpulse(q,i),omega=velocity[3+i]-wheels[i].radius*caps[2*i]*q[2*i]*inv[3+i];value+=p*omega+.5*p*p*inv[3+i];}
  return value;
 };
 let q=Array(n).fill(0),y=[...q],t=1,best=[...q],bestObjective=objective(q),next=Array(n).fill(0);
 for(let it=0;it<iterations;it++){
  for(let i=0;i<n;i++)next[i]=y[i]-(b[i]+dot8(A[i],y)+(hasBrakes?brakeGradient(y,i):0))/L;
  project(next);
  const value=objective(next);if(value<bestObjective){bestObjective=value;for(let i=0;i<n;i++)best[i]=next[i];}
  const nextT=(1+Math.sqrt(1+4*t*t))/2;
  for(let i=0;i<n;i++)y[i]=next[i]+(t-1)/nextT*(next[i]-q[i]);
  const previous=q;q=next;next=previous;t=nextT;
 }
 q=best;const impulses=q.map((v,i)=>v*caps[i]);
 const brakeImpulses=wheels.map((w,i)=>brakeImpulse(q,i));
 const brakeApplied=brakeImpulses.map(p=>-p/dt);
 const after=velocity.map((v,k)=>v+inv[k]*(J.reduce((sum,row,i)=>sum+row[k]*impulses[i],0)+(k>=3?brakeImpulses[k-3]:0)));
 const energy=v=>v.reduce((sum,x,i)=>sum+.5*x*x/inv[i],0);
 const projected=project(q.map((v,i)=>v-(b[i]+dot8(A[i],q)+(hasBrakes?brakeGradient(q,i):0))/L));
 const nextTyres=Object.fromEntries(wheels.map((w,i)=>{const spring=springs[i],deformation=elastic?[-impulses[2*i]/(dt*spring.k[0]),-impulses[2*i+1]/(dt*spring.k[1])]:[0,0];return [w.key,{deformation,energyJ:.5*deformation.reduce((s,x,j)=>s+spring.k[j]*x*x,0),steer:w.steer,relaxationBlend:spring.relaxationBlend,relaxationRatePerSec:spring.rate,impliedCarcassStiffnessNpm:spring.k,calibrated:false}];}));
 const elasticBefore=elastic?oldEnergy.reduce((a,b)=>a+b,0):0,elasticAfter=Object.values(nextTyres).reduce((a,t)=>a+t.energyJ,0);
 const totalDelta=energy(after)-energy(velocity)+elasticAfter-elasticBefore;
 const heatRaw=wheels.map((w,i)=>2*nextTyres[w.key].energyJ*springs[i].rate*dt),heatSum=heatRaw.reduce((a,b)=>a+b,0),heatScale=heatSum>0?Math.min(1,Math.max(0,-totalDelta)/heatSum):0;
 wheels.forEach((w,i)=>nextTyres[w.key].heatJ=heatRaw[i]*heatScale);
 return {tyreState:nextTyres,elasticEnergyJ:elasticAfter,totalContactEnergyDeltaJ:totalDelta,dissipationJ:Math.max(0,-totalDelta),longitudinal:after[0],lateral:after[1],yawRate:after[2],passiveEnergyDeltaJ:energy(after)-energy(velocity),
  projectedResidual:Math.max(...projected.map((v,i)=>Math.abs(v-q[i]))),iterations,
  wheels:wheels.map((w,i)=>({key:w.key,fx:impulses[2*i]/dt,fy:impulses[2*i+1]/dt,omega:after[3+i],brakeApplied:brakeApplied[i],
   slipRatio:-(J[2*i].reduce((s,a,k)=>s+a*after[k],0))/Math.max(3,Math.abs(longitudinal)),
   slipAngle:Math.atan2(J[2*i+1].reduce((s,a,k)=>s+a*after[k],0),Math.max(1,Math.abs(longitudinal))),
   utilization:Math.hypot(q[2*i],q[2*i+1]),postPeakScale:scales[i]}))};
}
