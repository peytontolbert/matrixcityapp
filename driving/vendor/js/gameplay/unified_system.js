import {springImpulseConstraint} from './impulse_system.js';
import {KEYS,thermalStep} from './assetto_car_systems.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export function prepareUnifiedSystem({state,profile:p,rotation:r,contacts,frontAero=0,rearAero=0,outputTorqueEstimate,longitudinal,lateral,yawRate,mass,yawInertia,wheels,dt}){
 if(p.physicsDebug?.full3d||p.physicsDebug?.linkage)throw Error('Shared small-angle solver cannot be combined with the articulated force handoff');
 if(p.driveType==='AWD2'||p.systems?.shaftInertias?.propShaftKgM2>0)throw Error('Shared solver: AWD2 and separate prop shaft adapter not implemented');
 const vertical=p.physicsDebug?.vertical===true,previous=state.driveline,shares=[p.driveBiasFront/2,p.driveBiasFront/2,(1-p.driveBiasFront)/2,(1-p.driveBiasFront)/2],ratio=r.ratio*r.finalDrive;
 const velocity=[longitudinal,lateral,yawRate,...wheels.map(w=>w.omega),previous?.engineOmega??state.rpm*Math.PI/30,previous?.gearboxInputOmega??ratio*wheels.reduce((s,w,i)=>s+w.omega*shares[i],0)];
 const inverseMass=[1/mass,1/mass,1/yawInertia,...wheels.map((w,i)=>1/w.inertia),1/p.engineInertia,1/p.gearboxInertia];
 let old,wheelData;
 if(vertical){
  const hubs=wheels.map((w,i)=>p.suspension[i<2?'front':'rear'].hubMassKg),sprung=mass-hubs.reduce((a,b)=>a+b,0);
  old=state.vertical??{q:Array(7).fill(0),v:Array(7).fill(0),roadOrigin:KEYS.map(k=>contacts.contacts[k]?.suspensionOffset??0)};
  velocity.push(...old.v);inverseMass.push(...[sprung,p.inertiaTensor[0],p.inertiaTensor[1],...hubs].map(m=>1/m));
 }
 const row=()=>Array(velocity.length).fill(0),externalImpulse=row(),bilateral=[],bounded=[];
 // Do not let a coast impulse drive the engine through zero.
 externalImpulse[7]=Math.max(-velocity[7]/inverseMass[7],r.engineTorqueNm*dt);
 if(ratio!==0){const j=row();j[8]=1;shares.forEach((s,i)=>j[3+i]=-ratio*s);bilateral.push(j);}
 const engagement=r.shiftOpen||ratio===0?0:Math.max(0,Math.min(1,r.clutch)),capacity=p.clutchMaxTorqueNm*engagement*(previous?.thermal?.multiplier??1);
 const clutch=row();clutch[7]=1;clutch[8]=-1;const clutchIndex=bounded.length;bounded.push({jacobian:clutch,limit:capacity*dt});
 const brakeIndices=wheels.map((w,i)=>{const j=row();j[i+3]=1;const index=bounded.length;bounded.push({jacobian:j,limit:w.brakeTorque*dt});return index;});
 // The outer iteration resolves lock capacity against this step's transmitted torque.
 const outputEstimate=outputTorqueEstimate??previous?.outputTorqueNm??r.engineTorqueNm*ratio;
 for(let axle=0;axle<2;axle++){const config=p.differential?.[axle?'rear':'front']??{},fraction=r.engineTorqueNm>=0?(config.powerLock??p.differentialPower??0):(config.coastLock??p.differentialCoast??0),preload=config.preloadNm??p.differentialPreloadNm??0;
  const j=row();j[3+2*axle]=1;j[4+2*axle]=-1;bounded.push({jacobian:j,limit:Math.max(0,preload+Math.abs(outputEstimate)*(axle?1-p.driveBiasFront:p.driveBiasFront)*fraction*.5)*dt});}
 const normalIndices=[];
 if(vertical){
  const q=old.q;
  wheelData=wheels.map((w,i)=>{const axle=i<2?'front':'rear',sp=p.suspension[axle],ty=p.tyres[axle],load=mass*9.81*(i<2?p.centerOfGravityFrontFraction:1-p.centerOfGravityFrontFraction)/2;
   const j=row();j[9]=-1;j[10]=-w.y;j[11]=w.x;j[12+i]=1;const local=j.slice(9),rate=dot(local,old.v);
   bounded.push(springImpulseConstraint(j,{extension:dot(local,q),stiffness:sp.springRateNpm,damping:rate>=0?sp.bumpDampingNsPm:sp.reboundDampingNsPm,dt}));
   const road=(contacts.contacts[w.key]?.suspensionOffset??old.roadOrigin[i])-old.roadOrigin[i];
   externalImpulse[12+i]-=load*dt;
   const normal=row();normal[12+i]=1;
   const constraint=springImpulseConstraint(normal,{extension:q[3+i]-road-load/ty.verticalRateNpm,stiffness:ty.verticalRateNpm,damping:Number(ty.authoredParameters?.DAMP??0),dt});constraint.lowerImpulse=0;
   if(contacts.contacts[w.key]?.grounded!==true){constraint.limit=0;delete constraint.spring;}
   normalIndices.push(bounded.length);bounded.push(constraint);
   return {load,road};
  });
  for(let axle=0;axle<2;axle++){const track=axle?p.trackRear:p.trackFront,k=Math.max(0,p.suspension[axle?'rear':'front'].antiRollBarNm)/(track*track);if(k>0){const j=row();j[11]=track;j[12+2*axle]=1;j[13+2*axle]=-1;bounded.push(springImpulseConstraint(j,{extension:dot(j.slice(9),q),stiffness:k,dt}));}}
  externalImpulse[9]-=(frontAero+rearAero)*dt;externalImpulse[10]-=(wheels[0].y*frontAero+wheels[2].y*rearAero)*dt;
 }
 return {velocity,inverseMass,externalImpulse,bilateral,bounded,vertical,old,wheelData,normalIndices,clutchIndex,brakeIndices,state,p,r,shares,ratio,capacity,engagement,outputEstimate,height:p.centerOfGravityHeightM};
}
export function finishUnifiedSystem(s,result,dt){
 const {state,p,r,velocity:before,ratio,shares}=s,v=result.velocity,offset=8,clutchImpulse=result.boundedImpulse[offset+s.clutchIndex],clutchTorque=-clutchImpulse/dt;
 const slip=v[7]-v[8],slipPower=Math.max(0,clutchTorque*((before[7]-before[8])+slip)*.5),thermal=thermalStep(state.driveline?.thermal,p.systems?.clutchThermal,slipPower,state.longitudinal,dt,r.controls?.assists?.damage!==false);
 const gearImpulse=result.bilateralImpulse[0]??0;
 state.rpm=v[7]*30/Math.PI;
 state.driveline={model:'matrix-shared-impulse-v11',engineOmega:v[7],gearboxInputOmega:v[8],clutchSlipOmega:slip,clutchTorqueNm:clutchTorque,clutchCapacityNm:s.capacity,clutchEngagement:s.engagement,clutchLocked:s.capacity>0&&Math.abs(slip)<.1,outputTorqueNm:-gearImpulse*ratio/dt,wheelTorquesNm:shares.map(share=>-gearImpulse*ratio*share/dt),centerCouplingTorqueNm:0,centerLimitNm:null,thermal,passiveEnergyDeltaJ:result.passiveEnergyDeltaJ};
 if(s.vertical){const q=s.old.q.map((x,i)=>x+dt*v[9+i]);state.vertical={q,v:v.slice(9),roadOrigin:s.old.roadOrigin,normal:Object.fromEntries(KEYS.map((k,i)=>[k,result.boundedImpulse[offset+s.normalIndices[i]]/dt])),heave:q[0],pitch:q[1],roll:q[2],hubTravel:q.slice(3),energyJ:result.elasticAfterJ,scope:'shared-small-angle-7dof'};}
 state.sharedSolve={converged:result.converged,projectedResidual:result.projectedResidual,equalityResidual:result.equalityResidual,iterations:result.iterations,normalCapacityLagged:false,normalCouplingResidualN:s.normalCouplingResidualN??0,normalCouplingIterations:s.normalCouplingIterations??1,differentialCapacityLagged:false,scope:'contacts-drivetrain-small-angle-suspension'};
 return s.brakeIndices.map(i=>-result.boundedImpulse[offset+i]/dt);
}
