// Longitudinal wheel/tyre coupling. No ground-speed RPM blending.
// Backward-Euler slip relaxation and an implicit reaction torque keep the
// small wheel inertia stable at 120 Hz, including zero-speed brake locking.
export function solveLongitudinalContact({omega, radius, inertia, driveTorque,
    brakeTorque, speed, previousSlip, relaxationLength, capacity, dt, inverseMass = 0}) {
    const values={omega,radius,inertia,driveTorque,brakeTorque,speed,previousSlip,relaxationLength,capacity,dt,inverseMass};
    for(const [key,value] of Object.entries(values)) if(!Number.isFinite(value)) throw Error('Invalid tyre contact '+key);
    if(radius<=0||inertia<=0||dt<=0||relaxationLength<=0||capacity<0||brakeTorque<0||inverseMass<0) throw Error('Invalid tyre contact dimensions');
    const freeOmega=omega+driveTorque*dt/inertia;
    const brakeDelta=brakeTorque*dt/inertia;
    const afterBrake=value=>Math.sign(value)*Math.max(0,Math.abs(value)-brakeDelta);
    // Fix the relaxation rate for this solve, keeping its residual monotone.
    const rate=Math.max(.75,Math.abs(speed),Math.abs(radius*omega))/relaxationLength;
    const blend=dt*rate/(1+dt*rate);
    const evaluate=force=>{
        const torqueOmega=freeOmega-force*radius*dt/inertia;
        const nextOmega=afterBrake(torqueOmega);
        const nextSpeed=speed+force*dt*inverseMass;
        const rawSlip=(radius*nextOmega-nextSpeed)/Math.max(3,Math.abs(speed));
        const relaxed=previousSlip+(rawSlip-previousSlip)*blend;
        // This model has no elastic tyre-energy reservoir. A history filter
        // must therefore not drive the patch when slip reverses or vanishes.
        // Bound it by instantaneous slip to keep contact work dissipative.
        const slip=relaxed*rawSlip>0 ? Math.sign(rawSlip)*Math.min(Math.abs(relaxed),Math.abs(rawSlip)) : 0;
        return {nextOmega,nextSpeed,rawSlip,slip,brakeApplied:(torqueOmega-nextOmega)*inertia/dt,
            residual:force-capacity*Math.tanh(slip/.105)};
    };
    if(capacity===0){const r=evaluate(0);return {...r,force:0,slip:0,rawSlip:0,reactionTorque:0};}
    const zero=evaluate(0);
    if(zero.residual===0)return {...zero,force:0,reactionTorque:0};
    let low=-capacity,high=capacity;
    for(let i=0;i<36;i++){
        const mid=(low+high)*.5;
        if(evaluate(mid).residual>0)high=mid;else low=mid;
    }
    const force=(low+high)*.5,r=evaluate(force);
    return {...r,force,reactionTorque:-force*radius};
}

// Controller velocities are horizontal heading/right coordinates. Contact
// pitch rises forward; roll rises right (drawable local +X points left).
// Project gravity onto z=a*right+b*forward rather than treating slopes flat.
export function roadGravity(contacts) {
    const grounded=Object.values(contacts?.contacts||{}).some(c=>c?.grounded===true);
    if(!grounded||contacts?.roadPlaneValid!==true) return {longitudinal:0,lateral:0,normalScale:1,active:false};
    if(!Number.isFinite(contacts.pitch)||!Number.isFinite(contacts.roll)) throw Error('Invalid exact road plane');
    const forward=Math.tan(contacts.pitch),right=Math.tan(contacts.roll);
    const normSquared=1+forward*forward+right*right;
    return {longitudinal:-9.81*forward/normSquared,lateral:-9.81*right/normSquared,
        normalScale:1/Math.sqrt(normSquared),active:true};
}

// Implicit lateral contact with chassis translation AND yaw in its effective
// inverse mass. No untracked elastic reservoir: stale slip cannot do work.
export function solveLateralContact({speed,longSpeed,previousSlip,relaxationLength,
    capacity,shape,inverseMass,dt}) {
    for(const v of [speed,longSpeed,previousSlip,relaxationLength,capacity,shape,inverseMass,dt])
        if(!Number.isFinite(v))throw Error('Invalid lateral contact input');
    if(relaxationLength<=0||capacity<0||shape<=0||inverseMass<=0||dt<=0)throw Error('Invalid lateral contact dimensions');
    const blend=-Math.expm1(-Math.max(.75,Math.abs(longSpeed))/relaxationLength*dt);
    const evaluate=force=>{
        const nextSpeed=speed+force*dt*inverseMass;
        const rawSlip=Math.atan2(nextSpeed,Math.max(1,Math.abs(longSpeed)));
        const relaxed=previousSlip+(rawSlip-previousSlip)*blend;
        const slip=relaxed*rawSlip>0?Math.sign(rawSlip)*Math.min(Math.abs(rawSlip),Math.abs(relaxed)):0;
        return {nextSpeed,rawSlip,slip,residual:force+capacity*Math.tanh(slip/shape)};
    };
    if(capacity===0)return {...evaluate(0),force:0,slip:0};
    const zero=evaluate(0);
    if(zero.residual===0)return {...zero,force:0,reactionTorque:0};
    let low=-capacity,high=capacity;
    for(let i=0;i<36;i++){const mid=(low+high)/2;if(evaluate(mid).residual>0)high=mid;else low=mid;}
    const force=(low+high)/2;
    return {...evaluate(force),force};
}
