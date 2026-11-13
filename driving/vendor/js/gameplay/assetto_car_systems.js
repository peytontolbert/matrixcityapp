// Matrix implementations of recovered AC data. Signal/filter and thermal
// calibration remain explicitly distinct from the proprietary AC solver.
export const SYSTEMS_REVISION='matrix-car-systems-v4';
export const KEYS=['27922','26418','27902','26398'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x,f=0)=>Number.isFinite(x)?x:f;
export function lookup(rows,x,fallback=0){
  if(!rows?.length)return fallback;
  if(x<=rows[0][0])return rows[0][1];
  for(let i=1;i<rows.length;i++)if(x<=rows[i][0]){
    const [a,b]=rows[i-1],[c,d]=rows[i];return b+(d-b)*(x-a)/(c-a);
  }return rows.at(-1)[1];
}
export function controllerSignals(state,profile,input){
  const slips=KEYS.map(k=>Math.abs(finite(state.relaxedSlipAngle?.[k]))*180/Math.PI);
  const front=(slips[0]+slips[1])/2,rear=(slips[2]+slips[3])/2;
  const rearSpeed=(Math.abs(finite(state.wheelOmega?.[KEYS[2]]))+Math.abs(finite(state.wheelOmega?.[KEYS[3]])))*.5*profile.tyres.rear.radius;
  return {GEAR:finite(state.displayGear,state.gear),BRAKE:clamp(finite(input.brake),0,1),GAS:clamp(Math.abs(finite(state.throttle)),0,1),
    SPEED_KMH:Math.hypot(state.longitudinal,state.lateral)*3.6,LONG:finite(state.previousLongitudinalAcceleration)/9.81,
    LATG:finite(state.previousLateralAcceleration)/9.81,RPMS:state.rpm,STEER:finite(state.steering),
    // Matrix signal definitions, pending comparison with AC reference telemetry.
    REAR_SPEED_RATIO:rearSpeed/Math.max(1,Math.abs(state.longitudinal)),
    OVERSTEER_FACTOR:rear-front,SLIPANGLE_FRONT_AVERAGE:front,SLIPANGLE_REAR_AVERAGE:rear,
    SLIPANGLE_FRONT_MAX:Math.max(slips[0],slips[1]),SLIPANGLE_REAR_MAX:Math.max(slips[2],slips[3])};
}
export function runControllers(rows,memory,signals,dt,initial=0){
  let value=initial;
  for(const row of rows){
    if(!Number.isFinite(signals[row.input]))throw Error('Unsupported controller input: '+row.input);
    const target=lookup(row.points,signals[row.input]);
    // AC FILTER is retained per 333 Hz tick; convert the pole to elapsed time.
    const blend=1-Math.pow(clamp(row.filter,0,.999999),333*dt);
    const filtered=finite(memory[row.id],0)+(target-finite(memory[row.id],0))*blend;
    memory[row.id]=filtered;
    value=clamp(row.combinator==='ADD'?value+filtered:value*filtered,row.min,row.max);
  }return value;
}
export function awdTorqueLimit(state,profile,input,dt){
  const config=profile.awd2Center;
  if(!config)return null;
  const rows=profile.systems?.awdControllers;
  if(config.controllerRequired&&!rows?.length)throw Error('AWD2 controller tables missing');
  return rows?.length?Math.max(0,runControllers(rows,state.awdControllerState||={},controllerSignals(state,profile,input),dt)):
    config.maxTorqueNm;
}

export function thermalStep(previous,config,powerW,speedMps,dt,damage=true){
  const ambient=finite(config?.ambientC,20),energyJ=finite(previous?.energyJ)+Math.max(0,powerW)*dt;
  if(!config)return {temperatureC:null,energyJ,wear:0,failed:false,multiplier:1,calibration:'unavailable'};
  if(!(config.heatCapacityJPerK>0)||!(config.coolingWPerK>=0))throw Error('Invalid thermal calibration');
  const old=finite(previous?.temperatureC,ambient),cool=config.coolingWPerK*(1+finite(config.speedCoolingFactor)*Math.abs(speedMps));
  const rate=cool/config.heatCapacityJPerK;
  const t=rate>0?ambient+(old-ambient)*Math.exp(-rate*dt)+Math.max(0,powerW)/cool*(-Math.expm1(-rate*dt)):
    old+Math.max(0,powerW)*dt/config.heatCapacityJPerK;
  const wear=damage&&config.wearJoulesToFailure>0?clamp(finite(previous?.wear)+Math.max(0,powerW)*dt/config.wearJoulesToFailure,0,1):finite(previous?.wear);
  const failed=previous?.failed===true||(damage&&(wear>=1||(Number.isFinite(config.failureTemperatureC)&&t>=config.failureTemperatureC)));
  return {temperatureC:t,energyJ,wear,failed,multiplier:failed?0:clamp(lookup(config.fadeCurve,t,1),0,1)*(1-wear),calibration:config.calibration};
}
export function brakeConfig(profile,axle){
  const source=profile.systems?.brakes?.thermal?.[axle];
  if(!source||!(source.torqueK>0))return null;
  // Imported TORQUE_K is mapped to an effective K/kJ heat gain. It is a
  // documented Matrix approximation, not a measured disc heat capacity.
  const peak=Math.max(...source.performance.map(r=>r[1]));
  return {heatCapacityJPerK:1000/source.torqueK,coolingWPerK:1000/source.torqueK*source.coolTransfer,
    speedCoolingFactor:source.coolSpeedFactor,ambientC:20,fadeCurve:source.performance.map(([x,y])=>[x,y/peak]),
    calibration:'matrix-thermal-scaling-from-ac-parameters-v1'};
}
export function brakeTorqueForWheel(state,profile,key,demand,bias,power,handbrake){
  const i=KEYS.indexOf(key),front=i<2,axle=front?'front':'rear';
  const heat=state.brakeThermal?.[key],config=brakeConfig(profile,axle);
  const fade=heat?.failed?0:lookup(config?.fadeCurve,finite(heat?.temperatureC,20),1);
  const hydraulic=profile.systems?.brakes?.hydraulics?.[key];
  let serviceTorque;
  if(hydraulic){
    const {maxPressurePa,pistonAreaM2,effectiveRadiusM,frictionCoefficient}=hydraulic;
    if(![maxPressurePa,pistonAreaM2,effectiveRadiusM,frictionCoefficient].every(n=>Number.isFinite(n)&&n>0))throw Error('Incomplete hydraulic data');
    serviceTorque=demand*maxPressurePa*pistonAreaM2*effectiveRadiusM*frictionCoefficient*power;
  }else{
    const perSide=profile.systems?.brakes?.torqueConvention==='max-torque-per-side';
    serviceTorque=profile.brakeTorqueNm*demand*(front?bias:1-bias)*power*(perSide?1:.5);
  }
  return Math.max(0,serviceTorque*fade+(!front?profile.handbrakeTorqueNm*handbrake*.5:0));
}
export function updateBrakeHeat(state,profile,key,actualTorque,omegaBefore,omegaAfter,speed,dt,damage){
  state.brakeThermal||={};const config=brakeConfig(profile,KEYS.indexOf(key)<2?'front':'rear');
  const power=Math.abs(actualTorque)*.5*(Math.abs(omegaBefore)+Math.abs(omegaAfter));
  return state.brakeThermal[key]=thermalStep(state.brakeThermal[key],config,power,speed,dt,damage);
}

export function stepAero(state,profile,contacts,input,dt){
  const config=profile.systems;
  if(!config?.wings?.length){const v2=state.longitudinal**2;return {front:profile.aeroDownforceFrontNPerMps2*v2,rear:profile.aeroDownforceRearNPerMps2*v2,drag:profile.aeroDragNPerMps2*v2,wings:[]};}
  const signals=controllerSignals(state,profile,input),memory=state.aeroControllerState||={};
  const frontDistance=profile.wheelbase*(1-profile.centerOfGravityFrontFraction),rearDistance=profile.wheelbase-frontDistance;
  // Car-space vertical airflow from measured chassis attitude relative to the
  // road. Absolute hill angle must not change angle of attack on a steady hill.
  const pitch=finite(input.chassis?.pitch)-finite(contacts.pitch),roll=finite(input.chassis?.roll)-finite(contacts.roll);
  const v=Math.hypot(state.longitudinal,state.lateral),q=.5*1.225*v*v;
  let front=0,rear=0,drag=0;const wings=[];
  for(const wing of config.wings){
    const rows=config.aeroControllers.filter(c=>c.wing===wing.id);
    const angle=rows.length?runControllers(rows,memory[wing.id]||={},signals,dt,wing.angleDeg):wing.angleDeg;
    const aoa=angle+pitch*180/Math.PI;
    const baseHeight=Number.isFinite(input.chassis?.cgAboveRoadM)?input.chassis.cgAboveRoadM:profile.centerOfGravityHeightM;
    const height=Math.max(0,baseHeight+wing.position[1]+wing.position[2]*Math.sin(pitch)+wing.position[0]*Math.sin(roll));
    // AC wing CL uses positive downforce. Preserve signed lift, including an
    // unloading axle when a wing acts outside the wheelbase.
    const load=q*wing.areaM2*wing.clGain*lookup(wing.cl,aoa)*lookup(wing.heightCl,height,1);
    const resistance=Math.max(0,q*wing.areaM2*wing.cdGain*lookup(wing.cd,aoa)*lookup(wing.heightCd,height,1));
    const frontLoad=load*(wing.position[2]+rearDistance)/profile.wheelbase;
    front+=frontLoad;rear+=load-frontLoad;drag+=resistance;
    wings.push({id:wing.id,angleDeg:angle,aoaDeg:aoa,heightM:height,downforceN:load,dragN:resistance,gainConvention:wing.gainConvention});
  }return {front,rear,drag,wings};
}
