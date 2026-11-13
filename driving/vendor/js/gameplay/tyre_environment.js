// Experimental material models. Parameters are explicit hypotheses unless supplied from measurements.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function lookup(rows,x){if(!rows?.length)throw Error('Measured/configured curve required');if(x<=rows[0][0])return rows[0][1];for(let i=1;i<rows.length;i++)if(x<=rows[i][0])return rows[i-1][1]+(rows[i][1]-rows[i-1][1])*(x-rows[i-1][0])/(rows[i][0]-rows[i-1][0]);return rows.at(-1)[1];}
export const experimentalTyreParameters=Object.freeze({scope:'Uncalibrated lab assumptions',ambientC:20,coldPressurePa:220000,volumeM3:.025,heatCapacityJPerK:18000,coolingWPerK:35,speedCoolingWPerKMps:2,waterCoolingWPerK:180,initialTreadM:.007,wearEnergyJPerM3:8e10,treadAreaM2:.16,wetGrip:.65,waterLiftCoefficient:.7,waterDragCoefficient:1,treadDrainageEfficiency:1,textureDrainageEfficiency:1,thermalGrip:[[0,.7],[20,.85],[75,1],[100,.96],[140,.65]],pressureGrip:[[.1,.35],[.5,.7],[1,1],[1.5,.85],[2,.65]]});
export function stepTyreCondition(old,config,{dt,heatJ=0,wearWorkJ=heatJ,speed=0,wetness=0,punctureAreaM2=0}){
 if(!(dt>0&&dt<=.05)||heatJ<0||wearWorkJ<0||punctureAreaM2<0)throw Error('Invalid tyre condition step');
 const c=config,ambient=c.ambientC+273.15,R=287.05,gamma=1.4,atm=101325;
 if(![c.volumeM3,c.heatCapacityJPerK,c.wearEnergyJPerM3,c.treadAreaM2].every(x=>x>0))throw Error('Missing tyre material parameters');
 const initialMass=(c.coldPressurePa+atm)*c.volumeM3/(R*ambient),prior=old??{temperatureK:ambient,gasMassKg:initialMass,treadM:c.initialTreadM};
 const cooling=c.coolingWPerK+c.speedCoolingWPerKMps*Math.abs(speed)+c.waterCoolingWPerK*clamp(wetness,0,1);
 const temperatureK=(c.heatCapacityJPerK*prior.temperatureK+heatJ+dt*cooling*ambient)/(c.heatCapacityJPerK+dt*cooling);
 let mass=prior.gasMassKg;const pressure=mass*R*temperatureK/c.volumeM3;
 if(punctureAreaM2>0&&pressure>atm){const ratio=atm/pressure,critical=(2/(gamma+1))**(gamma/(gamma-1));
 const flowFactor=ratio<=critical?Math.sqrt(gamma)*(2/(gamma+1))**((gamma+1)/(2*(gamma-1))):Math.sqrt(Math.max(0,2*gamma/(gamma-1)*(ratio**(2/gamma)-ratio**((gamma+1)/gamma))));
 const flow=.65*punctureAreaM2*pressure/Math.sqrt(R*temperatureK)*flowFactor;
 mass=Math.max(atm*c.volumeM3/(R*temperatureK),mass*Math.exp(-flow*dt/Math.max(mass,1e-12)));}
 const gaugePa=Math.max(0,mass*R*temperatureK/c.volumeM3-atm),treadM=Math.max(0,prior.treadM-wearWorkJ/(c.wearEnergyJPerM3*c.treadAreaM2));
 return {temperatureK,temperatureC:temperatureK-273.15,gasMassKg:mass,gaugePa,treadM,punctured:punctureAreaM2>0,thermalGrip:lookup(c.thermalGrip,temperatureK-273.15),pressureGrip:lookup(c.pressureGrip,gaugePa/c.coldPressurePa),scope:c.scope};
}
export function wetContact(condition,config,{load,speed,width,waterDepthM=0,wetness=0,macrotextureDepthM=.001}){
 if(![load,speed,width,waterDepthM,wetness,macrotextureDepthM,condition.gaugePa,condition.treadM].every(Number.isFinite)||load<0||width<=0||waterDepthM<0||macrotextureDepthM<0||condition.treadM<0)throw Error('Invalid road contact');
 const pressure=Math.max(10000,condition.gaugePa),footprintM2=load/pressure;
 // Macrotexture drains the film; it is not chassis-scale roughness/bump height.
 const drainageDepthM=condition.treadM*(config.treadDrainageEfficiency??1)+macrotextureDepthM*(config.textureDrainageEfficiency??1);
 const flooded=waterDepthM>0?waterDepthM/(waterDepthM+drainageDepthM+1e-9):0;
 const waterLiftN=Math.min(load,.5*1000*speed*speed*footprintM2*config.waterLiftCoefficient*flooded);
 return {macrotextureDepthM,waterDepthM,treadM:condition.treadM,pressurePa:condition.gaugePa,drainageDepthM,flooded,waterSupportFraction:load>0?waterLiftN/load:0,waterLiftN,solidLoadN:Math.max(0,load-waterLiftN),waterDragN:.5*1000*config.waterDragCoefficient*width*waterDepthM*speed*speed,gripScale:condition.thermalGrip*condition.pressureGrip*(1-clamp(wetness,0,1)*(1-config.wetGrip)),footprintM2};
}
export function soilSinkage(load,width,length,{cohesiveModulus,frictionalModulus,exponent}){
 if(!(width>0&&length>0&&exponent>0&&cohesiveModulus>=0&&frictionalModulus>0))throw Error('Soil parameters required');
 return (Math.max(0,load)/(width*length)/(cohesiveModulus/width+frictionalModulus))**(1/exponent);
}
export function steeringGeometry({steer,wheelbase,track,left,toeDeg=0,camberDeg=0,travelM=0,kinematics}){
 let angle=steer;if(Math.abs(steer)>1e-8){const radius=wheelbase/Math.tan(Math.abs(steer)),inside=(steer>0)===left;angle=Math.sign(steer)*Math.atan2(wheelbase,Math.max(.05,radius+(inside?-1:1)*track/2));}
 return {steer:angle+(left?-1:1)*(toeDeg+(kinematics?lookup(kinematics.toe,travelM):0))*Math.PI/180,camberDeg:camberDeg+(kinematics?lookup(kinematics.camber,travelM):0),kinematicsAvailable:!!kinematics};
}
export function roadWater({initialDepthM=0,rainMps=0,drainMps=0,elapsedSec=0}){return Math.max(0,initialDepthM+(rainMps-drainMps)*Math.max(0,elapsedSec));}
