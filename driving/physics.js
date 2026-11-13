import {createAssettoVehicleState,stepAssettoVehicle} from './vendor/js/gameplay/assetto_vehicle_solver.js';
import {validateAssettoDynamics} from './vendor/js/gameplay/assetto_dynamics_validation.js';

export const STEP=1/120;
export const MODEL='06_ygt_53_nissan_350z';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function controls(raw) {
 if(!raw||raw.type!=='input'||!Number.isSafeInteger(raw.sequence)||raw.sequence<0)throw Error('Invalid input');
 for(const k of ['throttle','brake','steer','handbrake'])if(!Number.isFinite(raw[k])||raw[k]<(k==='steer'?-1:0)||raw[k]>1)throw Error('Invalid control');
 if(raw.lights!==undefined&&typeof raw.lights!=='boolean')throw Error('Invalid lights');
 if(![-1,0,1].includes(raw.direction))throw Error('Invalid direction');
 return {lights:raw.lights===true,throttle:raw.throttle,brake:raw.brake,steer:raw.steer,handbrake:raw.handbrake,gearRequest:raw.direction,autoReverse:false,automaticLaunch:true,autoClutch:true,source:'keyboard'};
}
export const NEUTRAL={throttle:0,brake:1,steer:0,handbrake:0,gearRequest:1,autoReverse:false,autoClutch:true,source:'keyboard'};
export function createCar(id,spawn,profile) {
 const validation=validateAssettoDynamics(profile);if(!validation.valid)throw Error('Invalid car dynamics: '+validation.errors.join('; '));
 return {id,kind:'browser',model:MODEL,position:[...spawn.position],heading:spawn.heading,velocity:[0,0,0],verticalSpeed:0,
  state:createAssettoVehicleState(),mass:profile.mass,length:4.4,width:1.85,height:1.5,profile,input:{...NEUTRAL},lastInput:0,lastSequence:-1,pitch:0,roll:0,contacts:0,damage:0};
}
export function wheelContacts(car,ground) {
 const p=car.profile,c=Math.cos(car.heading),s=Math.sin(car.heading),contacts={},hits=[];
 const front=p.wheelbase*(1-p.centerOfGravityFrontFraction),rear=-p.wheelbase*p.centerOfGravityFrontFraction;
 for(const [key,f,left] of [['27922',true,true],['26418',true,false],['27902',false,true],['26398',false,false]]){
  const along=f?front:rear,side=(left?1:-1)*(f?p.trackFront:p.trackRear)/2;
  const x=car.position[0]+c*along-s*side,y=car.position[1]+s*along+c*side;
  const hit=ground(x,y,car.position[2]+.4,{maxRise:.6,maxDrop:2});
  const grounded=!!hit&&Number.isFinite(hit.z)&&Math.abs(hit.z-car.position[2])<.65;
  if(grounded&&!Number.isFinite(hit.grip))throw Error('Authored surface grip is missing');
  contacts[key]={grounded,grip:grounded?hit.grip:0,suspensionOffset:grounded?hit.z-car.position[2]:0,x,y,z:hit?.z};
  if(grounded)hits.push({z:hit.z,f,left});
 }
 const mean=rows=>rows.reduce((n,h)=>n+h.z,0)/Math.max(1,rows.length);
 const average=mean(hits),fh=hits.filter(h=>h.f),rh=hits.filter(h=>!h.f),lh=hits.filter(h=>h.left),rr=hits.filter(h=>!h.left);
 return {contacts,average,groundedCount:hits.length,roadPlaneValid:hits.length===4,
  pitch:fh.length&&rh.length?Math.atan2(mean(fh)-mean(rh),p.wheelbase):car.pitch,
  roll:lh.length&&rr.length?Math.atan2(mean(lh)-mean(rr),(p.trackFront+p.trackRear)/2):car.roll};
}
export function stepCar(car,world,dt=STEP) {
 const contact=wheelContacts(car,world.ground.bind(world));
 for(const wheel of Object.values(contact.contacts)){wheel.grip*=world.grip??1;wheel.wetness=wheel.grounded?clamp(world.wetness??0,0,1):0;}
 const result=stepAssettoVehicle(car.state,car.profile,contact,car.input,dt);
 car.tireSlip=result.tireSlip||0;
 car.steeringRad=result.steeringRad||0;
 car.heading+=result.headingDelta;car.pitch=contact.pitch;car.roll=contact.roll;car.contacts=contact.groundedCount;
 const c=Math.cos(car.heading),s=Math.sin(car.heading);
 car.velocity=[c*car.state.longitudinal-s*car.state.lateral,s*car.state.longitudinal+c*car.state.lateral,car.verticalSpeed];
 const distance=Math.hypot(car.velocity[0],car.velocity[1])*dt,substeps=Math.max(1,Math.ceil(distance/.2));
 for(let i=0;i<substeps;i++){
  const dx=car.velocity[0]*dt/substeps,dy=car.velocity[1]*dt/substeps;
  car.position[0]+=dx;car.position[1]+=dy;
  // Three overlapping chassis capsules cover nose, cabin and tail. Sweep in
  // <=20cm increments so a high speed car cannot skip an authored barrier.
  for(const offset of [-1.35,0,1.35]){
   const h=world.wall?.(car.position[0]+c*offset,car.position[1]+s*offset,car.position[2]+.12,.88,1.25,.24,dx,dy,.24);
   if(!h)continue;
   const nx=h.normalX,ny=h.normalY,penetration=clamp(.88-Math.sqrt(h.distanceSq??.7),0,.9);
   if(!Number.isFinite(nx+ny))continue;
   car.position[0]+=nx*(penetration+.005);car.position[1]+=ny*(penetration+.005);
   const vn=car.velocity[0]*nx+car.velocity[1]*ny;
   if(vn<0){car.velocity[0]-=1.08*vn*nx;car.velocity[1]-=1.08*vn*ny;car.damage=clamp(car.damage+vn*vn*.015,0,100);}
  }
 }
 if(contact.groundedCount>=2&&car.verticalSpeed<=1){car.position[2]=contact.average;car.verticalSpeed=0;}
 else {car.verticalSpeed-=9.81*dt;car.position[2]+=car.verticalSpeed*dt;}
 car.state.longitudinal=car.velocity[0]*c+car.velocity[1]*s;
 car.state.lateral=-car.velocity[0]*s+car.velocity[1]*c;
 if(![...car.position,...car.velocity,car.heading].every(Number.isFinite))throw Error('Non-finite simulation');
}
function axes(car){const c=Math.cos(car.heading),s=Math.sin(car.heading);return [[c,s],[-s,c]];}
export function resolveCars(a,b) {
 if(Math.abs(a.position[2]-b.position[2])>(a.height+b.height)/2)return false;
 const aa=axes(a),bb=axes(b),d=[b.position[0]-a.position[0],b.position[1]-a.position[1]];
 let depth=Infinity,normal;
 for(const axis of [...aa,...bb]){
  const radius=(car,ax)=>Math.abs(axis[0]*ax[0][0]+axis[1]*ax[0][1])*car.length/2+Math.abs(axis[0]*ax[1][0]+axis[1]*ax[1][1])*car.width/2;
  const distance=d[0]*axis[0]+d[1]*axis[1],overlap=radius(a,aa)+radius(b,bb)-Math.abs(distance);
  if(overlap<=0)return false;
  if(overlap<depth){depth=overlap;normal=axis.map(n=>n*(distance>=0?1:-1));}
 }
 const ia=a.kinematic||a.streaming?0:1/a.mass,ib=b.kinematic||b.streaming?0:1/b.mass,total=ia+ib;if(!total)return true;
 const relative=((b.streaming?0:b.velocity[0])-(a.streaming?0:a.velocity[0]))*normal[0]+((b.streaming?0:b.velocity[1])-(a.streaming?0:a.velocity[1]))*normal[1];
 // External traffic follows a route; reflecting a native car off that infinite
 // mass creates an artificial rebound. Match contact-normal speed instead.
 const restitution=(a.kind==='native'&&b.kind==='traffic'||b.kind==='native'&&a.kind==='traffic')?0:.08;
 const impulse=relative<0?-(1+restitution)*relative/total:0;
 for(const [car,inv,sign] of [[a,ia,-1],[b,ib,1]])if(inv){
  for(let k=0;k<2;k++){car.position[k]+=sign*normal[k]*(depth+.002)*inv/total;car.velocity[k]+=sign*normal[k]*impulse*inv;}
  const c=Math.cos(car.heading),s=Math.sin(car.heading);
  if(car.state){car.state.longitudinal=car.velocity[0]*c+car.velocity[1]*s;car.state.lateral=-car.velocity[0]*s+car.velocity[1]*c;}
  car.damage=clamp((car.damage||0)+Math.max(0,-relative)**2*.01,0,100);
 }
 return true;
}
export function wireCar(car){return {id:car.id,kind:car.kind,model:car.model,position:car.position,velocity:car.streaming?[0,0,0]:car.velocity,streaming:!!car.streaming,heading:car.heading,pitch:car.pitch||0,roll:car.roll||0,rpm:car.state?.rpm||car.rpm||800,gear:car.state?.gear??car.gear??1,throttle:car.input?.throttle??car.throttle??0,brake:car.input?.brake??car.brake??0,steer:car.input?.steer??car.steer??0,tireSlip:car.tireSlip||0,steeringRad:car.steeringRad||0,cameraDistance:car.cameraDistance??5.5,lights:(car.input?.lights??car.lights)===true,grounded:car.contacts>=2||car.kind==='traffic',damage:car.damage||0};}
