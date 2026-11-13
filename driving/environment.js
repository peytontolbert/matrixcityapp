import {WorldWeather} from './vendor/js/weather-coupled-v3.js';
const clamp=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
export function nativeEnvironment(raw){
 if(!raw)return null;
 return {dayOfYear:clamp(raw.dayOfYear,1,366,172),latitude:clamp(raw.latitude,-90,90,34.05),hour:clamp(raw.hour,0,24,14),rain:clamp(raw.rain,0,1,0),wetness:clamp(raw.wetness,0,1,0),water:clamp(raw.water,0,1,0),cloud:clamp(raw.cloud,0,1,.2),grip:clamp(raw.grip,.1,1.5,1),wind:clamp(raw.wind,0,60,0),windDirection:clamp(raw.windDirection,0,360,0),temperature:clamp(raw.temperature,-40,60,20)};
}
export class DrivingEnvironment {
 constructor(room){this.room=room;this.weather=new WorldWeather();}
 update(raw,now){
  const n=nativeEnvironment(raw);if(n){this.weather.values.cloud=n.cloud;this.weather.values.rain=n.rain;this.weather.water=n.wetness;this.weather.values.wind=[Math.cos(n.windDirection*Math.PI/180)*n.wind,Math.sin(n.windDirection*Math.PI/180)*n.wind];}
  const e=this.weather.update(n?.hour??14,now,this.room,n);
  // City solar math is Y-up; driving source geometry is Z-up.
  e.sun=[e.sun[0],-e.sun[2],e.sun[1]];
  if(n){e.weather=n.rain>.01?'rain':n.cloud>.8?'overcast':n.cloud>.25?'fair':'clear';e.cloud=n.cloud;e.rain=n.rain;e.wetness=n.wetness;e.water=n.water;e.haze=.000045+n.cloud*.00012+n.rain*.0002;}
  return e;
 }
}
