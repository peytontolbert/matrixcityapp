// Physical contact/timing foundation. GTA continues using its original path.
import { vehicleSuspensionTravel } from './vehicle_physics_modes.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>typeof v==='number' && Number.isFinite(v);
const mean=rows=>rows.reduce((s,v)=>s+v,0)/rows.length;

export {stepFixedAssetto} from './driving_lifecycle.js';

export function wheelPoint(pivot,pitch,roll) {
    const [x,y,z]=pivot, cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const py=cp*y-sp*z,pz=sp*y+cp*z;
    return [cr*x+sr*pz,py,-sr*x+cr*pz];
}

// Least-squares road plane in the yaw-local frame; no terrain is fabricated.
function plane(rows) {
    if(rows.length<3)return null;
    const mx=mean(rows.map(r=>r.lx)),my=mean(rows.map(r=>r.ly)),mz=mean(rows.map(r=>r.z));
    let xx=0,xy=0,yy=0,xz=0,yz=0;
    for(const r of rows){const x=r.lx-mx,y=r.ly-my,z=r.z-mz;xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;}
    const d=xx*yy-xy*xy;if(Math.abs(d)<1e-8)return null;
    const a=(xz*yy-yz*xy)/d,b=(yz*xx-xz*xy)/d;
    return {pitch:Math.atan(b),roll:-Math.atan(a),z:mz-a*mx-b*my};
}

export function sampleAssettoContacts(controller,vehicle,surfaceProfile) {
    const layout=controller._wheelLayout(vehicle),h=vehicle.assettoHandling;
    if(!h?.tyres || !h?.suspension)throw Error('Assetto contact data is incomplete');
    const heading=vehicle.headingRad-Math.PI/2,cos=Math.cos(heading),sin=Math.sin(heading);
    const feet=vehicle.position[2]-vehicle.groundOffset;
    const probe=(pitch,roll)=>layout.map(w=>{
        const p=wheelPoint(w.pivot,pitch,roll),x=vehicle.position[0]+cos*p[0]-sin*p[1],y=vehicle.position[1]+sin*p[0]+cos*p[1];
        const g=controller._resolveGround(x,y,feet);
        const valid=finite(g?.z)&&g.source!=='none'&&g.source!=='runtime';
        return {w,p,x,y,lx:p[0],ly:p[1],g,valid,z:valid?g.z:NaN};
    });
    let pitch=finite(vehicle.bodyPitch)?vehicle.bodyPitch:0,roll=finite(vehicle.bodyRoll)?vehicle.bodyRoll:0;
    let rows=probe(pitch,roll);
    const nearby=()=>rows.filter(r=>r.valid&&Math.abs(r.z-feet)<1.5);
    let road=plane(nearby());
    // Initialize a newly spawned/reset chassis to the real supporting slope.
    // Never initialize while airborne or follow a lower deck across a gap.
    if(!vehicle._assettoAttitudeInitialized && road && Math.abs(road.z-feet)<0.35){
        pitch=road.pitch;roll=road.roll;vehicle.bodyPitch=pitch;vehicle.bodyRoll=roll;
        vehicle._assettoAttitudeInitialized=true;rows=probe(pitch,roll);road=plane(nearby());
    }
    const contacts={},support=[],validRows=nearby();
    for(const r of rows){
        const axle=r.w.front?'front':'rear',tyre=h.tyres[axle];
        const radius=tyre?.radius;
        if(!finite(radius)||radius<=0)throw Error('Assetto wheel radius missing: '+axle);
        const travel=vehicleSuspensionTravel(vehicle,axle);
        const axisZ=Math.cos(pitch)*Math.cos(roll);
        const wanted=r.valid?(r.z+radius-vehicle.position[2]-r.p[2])/Math.max(.2,axisZ):travel.lower;
        const grounded=r.valid&&wanted>=travel.lower-.05&&wanted<=travel.upper+radius;
        const offset=clamp(wanted,travel.lower,travel.upper);
        const surface=r.valid?surfaceProfile(r.g):null;
        const grip=surface?.grip??null;
        // A missing grip record is not an invented asphalt contact.
        if(grounded && grip===null)throw Error('Assetto contact surface has no authored grip');
        const c={x:r.x,y:r.y,z:r.z,source:r.valid?r.g.source:'none',material:r.g?.material||null,grip,
            damping:surface?.damping??0,validTrack:r.g?.validTrack===true,pitlane:r.g?.pitlane===true,
            grounded,suspensionOffset:offset,compression:clamp((offset-travel.lower)/(travel.upper-travel.lower),0,1),front:r.w.front,left:r.w.left};
        contacts[r.w.tag]=c;if(grounded)support.push(c);
    }
    const average=support.length?mean(support.map(r=>r.z)):feet;
    // Road attitude uses nearby geometric hits, not just loaded wheels.
    const height=(test)=>{const a=validRows.filter(r=>test(r.w));return a.length?mean(a.map(r=>r.z)):average;};
    const materials=new Map();for(const s of support)materials.set(s.material,(materials.get(s.material)||0)+1);
    return {contacts,average,front:height(w=>w.front),rear:height(w=>!w.front),left:height(w=>w.left),right:height(w=>!w.left),
        chassisGroundZ:road?.z??average,material:[...materials].sort((a,b)=>b[1]-a[1])[0]?.[0]??null,
        grip:support.length?mean(support.map(r=>r.grip)):0,damping:support.length?mean(support.map(r=>r.damping)):0,
        validTrack:support.length===4&&support.every(r=>r.validTrack),pitlane:support.some(r=>r.pitlane),
        groundedCount:support.length,frontGrounded:support.filter(r=>r.front).length,rearGrounded:support.filter(r=>!r.front).length,
        pitch:road?.pitch??pitch,roll:road?.roll??roll,roadPlaneValid:!!road};
}

export function viscousCenterTorque(center,frontOmega,rearOmega) {
    const ramp=center?.rampTorqueNmPerRadSec,max=center?.maxTorqueNm;
    if(!finite(ramp)||ramp<0||!finite(max)||max<0)throw Error('AWD2 requires authored ramp/max coupling torque');
    return clamp((rearOmega-frontOmega)*ramp,-max,max);
}
