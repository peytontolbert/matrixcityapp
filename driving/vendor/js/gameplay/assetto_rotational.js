import {KEYS,thermalStep,awdTorqueLimit} from './assetto_car_systems.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rpmToOmega=v=>v*Math.PI/30;
// Rigid shafts with a stored gearbox input state. Unknown shaft inertia is
// omitted explicitly; it is never invented or counted a second time as wheels.
export function solveRotation(state,p,input,dt){
  if(!(dt>0&&dt<=.05))throw Error('Invalid rotational timestep');
  if(![input.ratio,input.finalDrive,input.engineTorqueNm,input.clutch,input.maximumRpm].every(Number.isFinite))throw Error('Invalid rotational input');
  const frontShare=p.driveType==='AWD2'?0:p.driveBiasFront;
  const shares=[frontShare/2,frontShare/2,(1-frontShare)/2,(1-frontShare)/2];
  const source=p.systems?.shaftInertias;
  const half=source?.halfShaftKgM2||[0,0,0,0];
  const prop=source?.propShaftKgM2||0;
  const inertias=[p.engineInertia,p.gearboxInertia,
    ...KEYS.map((k,i)=>p.tyres[i<2?'front':'rear'].angularInertia+half[i]),...(prop>0?[prop]:[])];
  if(!inertias.every(x=>Number.isFinite(x)&&x>0)||!(p.clutchMaxTorqueNm>0))throw Error('Missing rotational inertia/capacity');
  const inv=inertias.map(x=>1/x),r=input.ratio*input.finalDrive;
  const previous=state.driveline;
  const w=[previous?.engineOmega??rpmToOmega(state.rpm),previous?.gearboxInputOmega??r*KEYS.reduce((s,k,i)=>s+state.wheelOmega[k]*shares[i],0),...KEYS.map(k=>state.wheelOmega[k])];
  if(prop>0)w.push(previous?.propShaftOmega??input.finalDrive*KEYS.reduce((s,k,i)=>s+state.wheelOmega[k]*shares[i],0));
  const energy=()=>w.reduce((s,x,i)=>s+.5*inertias[i]*x*x,0);
  const initialEnergy=energy();
  w[0]=Math.max(0,w[0]+input.engineTorqueNm*dt/inertias[0]);
  const afterEngineEnergy=energy();
  const disengaged=input.shiftOpen||r===0;
  const engagement=disengaged?0:clamp(input.clutch,0,1);
  const heatMultiplier=previous?.thermal?.multiplier??1;
  const capacity=p.clutchMaxTorqueNm*engagement*heatMultiplier;
  let clutchImpulse=0,gearImpulse=0;
  const wheelImpulses=[0,0,0,0];
  // A supplied prop shaft is an independent angular state downstream of the
  // gearbox. It stays connected to the axle in neutral; reflecting it into the
  // gearbox alone would incorrectly disconnect its inertia in neutral.
  const gearJacobian=prop>0?[0,1,0,0,0,0,-input.ratio]:[0,1,...shares.map(s=>-r*s)];
  const propJacobian=prop>0?[0,0,...shares.map(s=>-input.finalDrive*s),1]:null;
  const constraints=[...(r!==0?[gearJacobian]:[]),...(propJacobian?[propJacobian]:[])];
  const gram=constraints.map(a=>constraints.map(b=>a.reduce((s,j,i)=>s+j*b[i]*inv[i],0)));
  const solve=rhs=>{
    if(!rhs.length)return [];
    if(rhs.length===1)return [rhs[0]/gram[0][0]];
    const det=gram[0][0]*gram[1][1]-gram[0][1]*gram[1][0];
    return [(rhs[0]*gram[1][1]-rhs[1]*gram[0][1])/det,(rhs[1]*gram[0][0]-rhs[0]*gram[1][0])/det];
  };
  const applyImpulse=(impulse,lambdas=[])=>{
    for(let i=0;i<w.length;i++){
      const j=impulse[i]+constraints.reduce((s,row,k)=>s+row[i]*lambdas[k],0);
      w[i]+=j*inv[i];if(i>=2&&i<6)wheelImpulses[i-2]+=j;
    }
    if(r!==0)gearImpulse+=lambdas[0]||0;
  };
  const zero=w.map(()=>0);
  const projectTransmission=()=>applyImpulse(zero,solve(constraints.map(j=>-j.reduce((s,x,i)=>s+x*w[i],0))));
  const clutchDirection=w.map((_,i)=>i===0?-1:i===1?1:0);
  const clutchLambdas=solve(constraints.map(j=>-j.reduce((s,x,i)=>s+x*inv[i]*clutchDirection[i],0)));
  const response=clutchDirection.map((v,i)=>(v+constraints.reduce((s,j,k)=>s+j[i]*clutchLambdas[k],0))*inv[i]);
  const solveClutch=()=>{
    if(capacity<=0)return;
    const correction=(w[0]-w[1])/(response[1]-response[0]);
    const next=clamp(clutchImpulse+correction,-capacity*dt,capacity*dt),change=next-clutchImpulse;
    clutchImpulse=next;
    applyImpulse(clutchDirection.map(v=>v*change),clutchLambdas.map(v=>v*change));
  };
  const centerLimit=p.driveType==='AWD2'?awdTorqueLimit(state,p,input.controls,dt):null;
  const startingSlip=w[0]-w[1];
  // Solve the one/two rigid shaft constraints directly, then apply clutch
  // impulse in their constrained mass space. No iteration-dependent slip.
  projectTransmission();
  solveClutch();
  // Passive differential coupling. Use implicit viscous torque so a stiff
  // authored AWD2 ramp cannot overshoot and amplify axle-speed differences.
  let centerTorque=0;
  if(centerLimit!==null){
    const slip=(w[4]+w[5]-w[2]-w[3])/2;
    const inverse=.25*(inv[2]+inv[3]+inv[4]+inv[5]),ramp=p.awd2Center.rampTorqueNmPerRadSec;
    const impulse=clamp(ramp*slip*dt/(1+ramp*dt*inverse),-centerLimit*dt,centerLimit*dt);
    centerTorque=impulse/dt;
    for(let i=0;i<4;i++){const j=i<2?impulse/2:-impulse/2;w[i+2]+=j*inv[i+2];wheelImpulses[i]+=j;}
  }
  const outputTorque=-gearImpulse*r/dt;
  for(const axle of [0,1]){
    const a=2+axle*2,b=a+1,config=p.differential?.[axle?'rear':'front']||{};
    const preload=config.preloadNm??p.differentialPreloadNm??0;
    // Select power/coast from transmitted torque in the selected gear direction.
    // Positive combustion can coexist with wheels back-driving the engine.
    const fraction=outputTorque*r>=0?(config.powerLock??p.differentialPower??0):(config.coastLock??p.differentialCoast??0);
    const limit=Math.max(0,preload+Math.abs(outputTorque)*(axle?1-frontShare:frontShare)*fraction*.5);
    const impulse=clamp((w[a]-w[b])/(inv[a]+inv[b]),-limit*dt,limit*dt);
    w[a]-=impulse*inv[a];w[b]+=impulse*inv[b];wheelImpulses[a-2]-=impulse;wheelImpulses[b-2]+=impulse;
  }
  // Axle couplings must not leave a supposedly locked clutch disconnected.
  // Respect the same total clutch impulse budget after restoring the shafts.
  projectTransmission();
  solveClutch();
  const finalSlip=w[0]-w[1],clutchTorque=clutchImpulse/dt;
  const slipPower=Math.max(0,clutchTorque*(startingSlip+finalSlip)*.5);
  const thermal=thermalStep(previous?.thermal,p.systems?.clutchThermal,slipPower,state.longitudinal,dt,input.controls?.assists?.damage!==false);
  const finalEnergy=energy();
  // The combustion limiter lives upstream. Clamping only this shaft here
  // would break the selected ratio and conceal road-driven mechanical overrev.
  KEYS.forEach((k,i)=>state.wheelOmega[k]=w[i+2]);state.rpm=Math.max(0,w[0]*30/Math.PI);
  const frontOmega=(w[2]+w[3])/2,rearOmega=(w[4]+w[5])/2;
  state.driveline={model:'matrix-rotational-constraints-v5',engineOmega:w[0],gearboxInputOmega:w[1],
    gearboxOutputOmega:r!==0?w[1]/input.ratio:null,frontShaftOmega:frontOmega,rearShaftOmega:rearOmega,
    clutchInputOmega:w[0],clutchOutputOmega:w[1],clutchSlipOmega:finalSlip,clutchEngagement:engagement,
    clutchTorqueNm:clutchTorque,clutchCapacityNm:capacity,clutchLocked:capacity>0&&Math.abs(finalSlip)<1e-6,
    outputTorqueNm:-gearImpulse*r/dt,wheelTorquesNm:wheelImpulses.map(j=>j/dt),centerCouplingTorqueNm:centerTorque,centerLimitNm:centerLimit,
    gearboxInertia:inertias[1],propShaftOmega:prop>0?w[6]:null,propShaftInertia:prop>0?prop:null,separateShaftInertiaAvailable:!!source,thermal,
    reflectedWheelInertia:r!==0?1/(r*r*shares.reduce((sum,s,i)=>sum+s*s/inertias[i+2],0)):0,
    initialEnergyJ:initialEnergy,engineWorkJ:afterEngineEnergy-initialEnergy,finalEnergyJ:finalEnergy,
    passiveEnergyDeltaJ:finalEnergy-afterEngineEnergy};
  state.driveline.shaftConstraintResidual=constraints.reduce((max,j)=>Math.max(max,Math.abs(j.reduce((s,x,i)=>s+x*w[i],0))),0);
  return state.driveline;
}
