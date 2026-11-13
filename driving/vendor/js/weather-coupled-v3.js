export const presets=Object.freeze({
 clear:{cloud:.08,humidity:.3,rain:0,haze:.000045,wind:[2,1]},
 fair:{cloud:.44,humidity:.5,rain:0,haze:.000075,wind:[4,1.5]},
 overcast:{cloud:.92,humidity:.8,rain:0,haze:.00016,wind:[5,2]},
 superrain:{cloud:1,humidity:.98,rain:1,rainMmPerHour:3000,haze:.0003,wind:[7,3]},
 rain:{cloud:.98,humidity:.95,rain:.7,haze:.0003,wind:[7,3]}
});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function solarDirection(hour,day=172,latitude=40.71){const r=Math.PI/180,d=23.44*r*Math.sin(2*Math.PI*(284+day)/365),l=latitude*r,h=(hour-12)*15*r;return [Math.cos(d)*Math.sin(h),Math.sin(l)*Math.sin(d)+Math.cos(l)*Math.cos(d)*Math.cos(h),Math.cos(l)*Math.sin(d)-Math.sin(l)*Math.cos(d)*Math.cos(h)];}
export class WorldWeather {
 constructor(){this.name='fair';this.values={...presets.fair,wind:[...presets.fair.wind]};this.last=null;this.water=0;this.seconds=0;}
 // Compatibility for /rainrate: visual rain and physical rain share one value.
 get rainRateOverride(){return this.rainRateMmPerHour??null;}
 set rainRateOverride(value){this.setRainRateMmPerHour(value);}
 setRainRateMmPerHour(value=null){if(value!==null&&(!Number.isFinite(value)||value<0||value>10000))throw Error('Rainfall must be 0 to 10000 mm/hour, or null for preset weather');this.rainRateMmPerHour=value;}
 setPreset(name){if(!presets[name])throw Error('Unknown weather: '+name);this.name=name;this.rainRateMmPerHour=null;}
 update(hour,now=performance.now(),district='nyc',native=null){
  const dt=this.last===null?0:clamp((now-this.last)/1000,0,.25);this.last=now;this.seconds+=dt;
  const target={...presets[this.name],...(this.rainRateMmPerHour!=null?{rain:Math.min(1,this.rainRateMmPerHour/30)}:{})},f=1-Math.exp(-dt/8);for(const k of ['cloud','humidity','rain','haze'])this.values[k]+=(target[k]-this.values[k])*f;
  this.values.wind=this.values.wind.map((v,i)=>v+(target.wind[i]-v)*f);
  this.water=clamp(this.water+dt*(this.values.rain*.025-(1-this.values.rain)*.003));
  const h=Number.isFinite(Number(hour))?Number(hour):14,sun=solarDirection(h,native?.dayOfYear??172,native?.latitude??(district==='nohesi-110'?34.05:37.77)),daylight=clamp(sun[1]*5+.15);
  // Linear scene units normalized to daytime sun=1, not a claim of absolute photometric lux.
  const elevation=Math.max(0,sun[1]),airMass=1/(elevation+.025*Math.exp(-11*elevation));
  const visible=clamp((sun[1]+.015)/.065),solarVisibility=visible*visible*(3-2*visible);
  const aerosol=.025*this.values.humidity;
  const sunColor=[1,.97,.91].map((v,i)=>v*Math.exp(-([.055,.105,.21][i]+aerosol)*Math.max(0,airMass-1))*solarVisibility);
  const ambient=[.008+.287*daylight,.012+.343*daylight,.022+.438*daylight].map(v=>v*(1-this.values.cloud*.16));
  return {hour:h,sun,daylight,sunColor,ambient,airMass,cloud:this.values.cloud,rain:this.values.rain,rainMmPerHour:this.rainRateMmPerHour??presets[this.name].rainMmPerHour??this.values.rain*30,water:this.water,wetness:this.water,wind:[...this.values.wind],humidity:this.values.humidity,haze:this.values.haze,seconds:this.seconds,cloudBase:1000,cloudTop:2400,groundHeight:district==='nyc'?50:0,weather:this.name,nativeEnvironment:native};
 }
}
