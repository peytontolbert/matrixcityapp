const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Fuel/ignition limits positive engine work. Road-driven overspeed is not
// disguised by clamping RPM after the shafts have already been solved.
export function limitCombustion(state,{rpm,redline,inertia,requestedTorque,dt,frequency=50}) {
    if(![rpm,redline,inertia,requestedTorque,dt,frequency].every(Number.isFinite)||redline<=0||inertia<=0||dt<=0)throw Error('Invalid rev-limiter input');
    const prior=state.revLimiter||{cut:false,remaining:0};
    let cut=prior.cut,remaining=Math.max(0,prior.remaining-dt);
    const hysteresis=Math.max(50,redline*.012);
    if(rpm>=redline&&!cut){cut=true;remaining=1/Math.max(1,frequency);}
    if(cut&&remaining<=0&&rpm<=redline-hysteresis)cut=false;
    const headroomTorque=Math.max(0,(redline-rpm)*Math.PI/30*inertia/dt);
    const torque=cut?0:Math.min(Math.max(0,requestedTorque),headroomTorque);
    state.revLimiter={cut,remaining,active:cut||torque<requestedTorque-1e-6,redlineRpm:redline,
        combustionTorqueNm:torque,requestedTorqueNm:Math.max(0,requestedTorque)};
    return torque;
}
// GTA profiles author a speed envelope, not AC shaft inertias/ratios. Apply
// that existing per-gear envelope to propulsion, never directly to velocity.
export function gtaGearDriveFraction(speed,gearTopSpeed){
    if(!Number.isFinite(speed)||!Number.isFinite(gearTopSpeed)||gearTopSpeed<=0)throw Error('Invalid GTA gear envelope');
    const t=clamp((Math.abs(speed)/gearTopSpeed-.97)/.03,0,1);
    return 1-t*t*(3-2*t);
}
