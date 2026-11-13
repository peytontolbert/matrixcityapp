import {validateAssettoProfile} from './vehicle_physics_modes.js';

// This gate certifies inputs for this browser solver, not AC algorithm parity.
export function validateAssettoDynamics(profile,vehicle=null) {
    const base=validateAssettoProfile(profile,vehicle),errors=[...base.errors];
    const p=profile||{};
    const required=(path,value,min,max=Infinity)=>{
        if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)errors.push(path+' requires authored finite data in '+min+'..'+max);
    };
    for(const [name,min,max] of [['finalDrive',.1,20],['reverseRatio',-20,20],['brakeTorqueNm',0,100000],['handbrakeTorqueNm',0,100000],
        ['engineInertia',.001,10],['gearboxInertia',.0001,10],['clutchMaxTorqueNm',1,100000],['centerOfGravityHeightM',.01,3],['centerOfGravityFrontFraction',.01,.99],
        ['aeroDragNPerMps2',0,100],['aeroDownforceFrontNPerMps2',0,100],['aeroDownforceRearNPerMps2',0,100],
        ['shiftTimeUpSec',.001,2],['shiftTimeDownSec',.001,2]])required(name,p[name],min,max);
    if(!Array.isArray(p.inertiaTensor)||p.inertiaTensor.length!==3)errors.push('inertiaTensor must contain three kg m^2 moments');
    else p.inertiaTensor.forEach((n,i)=>required('inertiaTensor.'+i,n,.01));
    if(p.inertiaSourceConvention!=='ac-equivalent-box-dimensions-v1')errors.push('inertia unit conversion has not been verified');
    for(const name of ['engineTorqueCurveNm','engineBrakingCurveNm']){
        const rows=p[name];
        if(!Array.isArray(rows)||rows.length<2||rows.some((r,i)=>!Array.isArray(r)||r.length!==2||r.some(n=>typeof n!=='number'||!Number.isFinite(n))||r[1]<0||(i>0&&r[0]<=rows[i-1][0])))errors.push(name+' has missing, invalid or unordered samples');
    }
    const fullThrottleRpm=p.idleRpm+(p.redlineRpm-p.idleRpm)*.68;
    if(Array.isArray(p.engineTorqueCurveNm)&&!p.engineTorqueCurveNm.some(r=>r[0]>=fullThrottleRpm&&r[1]>0))
        errors.push('Current engine model cannot operate this high-RPM zero-torque profile; real engine/EV controller support required');
    for(const axle of ['front','rear']){
        const t=p.tyres?.[axle]||{},s=p.suspension?.[axle]||{};
        for(const key of ['radius','angularInertia','peakLongitudinalMu','peakLateralMu','referenceLoadN','relaxationLength','peakSlipAngleDeg'])required('tyres.'+axle+'.'+key,t[key],.00001);
        for(const key of ['springRateNpm','bumpDampingNsPm','reboundDampingNsPm','bumpStopUpM','bumpStopDownM'])required('suspension.'+axle+'.'+key,s[key],0);
    }
    if(p.driveType==='AWD2'){
        required('awd2Center.rampTorqueNmPerRadSec',p.awd2Center?.rampTorqueNmPerRadSec,0);
        required('awd2Center.maxTorqueNm',p.awd2Center?.maxTorqueNm,0);
        if(p.awd2Center?.controllerRequired&&!p.systems?.awdControllers?.length)errors.push('AWD2 controller tables are missing for this car');
    }
    const inputs=new Set(['GEAR','BRAKE','GAS','SPEED_KMH','LONG','LATG','RPMS','STEER','REAR_SPEED_RATIO','OVERSTEER_FACTOR',
        'SLIPANGLE_FRONT_AVERAGE','SLIPANGLE_REAR_AVERAGE','SLIPANGLE_FRONT_MAX','SLIPANGLE_REAR_MAX']);
    for(const c of [...(p.systems?.awdControllers||[]),...(p.systems?.aeroControllers||[])]){
        if(!inputs.has(c.input)||!['ADD','MULT'].includes(c.combinator)||!c.points?.length)errors.push('Unsupported car controller '+c.id);
        if(!Number.isFinite(c.filter)||c.filter<0||c.filter>=1||!Number.isFinite(c.min)||!Number.isFinite(c.max)||c.min>c.max)errors.push('Invalid controller limits/filter '+c.id);
    }
    const table=(rows,name,optional=false)=>{
        if(optional&&rows==null)return;
        if(!Array.isArray(rows)||!rows.length||rows.some((r,i)=>!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||(i>0&&r[0]<=rows[i-1][0])))errors.push('Invalid LUT '+name);
    };
    for(const c of [...(p.systems?.awdControllers||[]),...(p.systems?.aeroControllers||[])])table(c.points,c.id);
    for(const wing of p.systems?.wings||[]){
        required('wing area',wing.areaM2,0);required('wing angle',wing.angleDeg,-360,360);
        if(!Array.isArray(wing.position)||wing.position.length!==3||!wing.position.every(Number.isFinite))errors.push('Invalid wing position');
        for(const key of ['clGain','cdGain'])required('wing '+key,wing[key],-1000,1000);
        for(const key of ['cl','cd','heightCl','heightCd'])table(wing[key],'wing '+wing.id+' '+key,true);
    }
    for(const c of p.systems?.aeroControllers||[])if(!p.systems.wings.some(w=>w.id===c.wing))errors.push('Controller references missing wing');
    for(const axle of ['front','rear']){
        const b=p.systems?.brakes?.thermal?.[axle];if(!b)continue;
        required('brake TORQUE_K',b.torqueK,.000001);required('brake cooling',b.coolTransfer,0);required('brake speed cooling',b.coolSpeedFactor,0);
        table(b.performance,'brake performance');if(!b.performance?.some(r=>r[1]>0))errors.push('Brake curve has no usable performance');
    }
    if(p.systems?.shaftInertias){
        required('prop shaft inertia',p.systems.shaftInertias.propShaftKgM2,0);
        const half=p.systems.shaftInertias.halfShaftKgM2;
        if(!Array.isArray(half)||half.length!==4||half.some(n=>!Number.isFinite(n)||n<0))errors.push('Four finite nonnegative half-shaft inertias required');
    }
    return {valid:errors.length===0,errors,warnings:[...base.warnings],
        scope:'browser-dynamics-inputs-v4',assettoParityVerified:false,
        unresolved:['AC reference telemetry and controller signal/filter calibration','clutch heat/wear/failure calibration','separately authored prop/half-shaft inertia',
            'full tyre thermal/pressure/wear and elastic state','full suspension kinematics','brake thermal/hydraulic calibration','mod aero gain conversion verification']};
}
