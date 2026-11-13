// Vehicle axes: X forward/Y lateral. Four simultaneous contacts share a
// conservative effective-inertia budget; fluid impulse is equal and opposite.
export function tireWaterForce(contact,wheel,longitudinal,lateral,dragN,mass,yawInertia,dt){
 const speed=Math.hypot(longitudinal,lateral),waterMass=contact.waterMassKg;
 if(!(speed>1e-8&&dragN>0&&mass>0&&yawInertia>0&&dt>0))return {x:0,y:0,yaw:0};
 const x=longitudinal/speed,y=lateral/speed,arm=wheel.y*y-wheel.x*x;
 const inverse=4/mass+4*arm*arm/yawInertia+(waterMass>0?4/waterMass:0),force=dragN/(1+dragN/speed*dt*inverse);
 const fx=-force*x,fy=-force*y,yaw=wheel.y*fy-wheel.x*fx;
 contact.applyWaterImpulse?.([-fx*dt,-fy*dt]);
 return {x:fx,y:fy,yaw};
}
