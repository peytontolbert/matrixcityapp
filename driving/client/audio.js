import {GameAudioSystem as AudioSystem} from '../vendor/js/audio_system.js';
// Authored granular engine/exhaust, spatial emitters and impact events, via R2.
export class DrivingAudio {
 async enable(){
  if(!this.mixer){this.mixer=new AudioSystem({});this.mixer.ambientEnabled=false;this.mixer._ambientStarted=true;this.mixer._audioGesture=true;this.mixer.sfxVolume=.45;
   // City also preloads weapons and pedestrian events. Driving needs impacts only.
   this.mixer._preloadGtaEventAudio=async()=>{await this.mixer._loadGtaEventAudioManifest();await Promise.all(['vehicle_collision_low','vehicle_collision_high'].map(name=>this.mixer._ensureGtaEventAudio(name)));};
  }
  if(!await this.mixer.resume())throw Error(this.mixer.lastError||'Audio unavailable');this.enabled=true;
 }
 update(car,active,camera){
  const m=this.mixer;if(!m?.context)return;
  const playing=!!(this.enabled&&active&&car&&!car.streaming);m.master.gain.setTargetAtTime(playing?.75:0,m.context.currentTime,.04);
  if(!playing){m._updateEngine(null,false,1/60);return;}
  m._getAudioCameraPose=()=>({position:camera||[car.position[0]-5*Math.cos(car.heading),car.position[1]-5*Math.sin(car.heading),car.position[2]+2],direction:[Math.cos(car.heading),Math.sin(car.heading),0]});m._syncListenerToCamera();
  m._updateEngine({...car,audioNameHash:'ELEGY',physicsMode:'assetto',assettoHandling:{idleRpm:800,redlineRpm:7500},engineLoad:car.throttle,speed:Math.hypot(...car.velocity),headingRad:car.heading,occupied:true},true,1/60);
  if(this.lastId===car.id&&car.damage>this.damage+.2)m._playVehicleImpact(Math.min(1,(car.damage-this.damage)/25));this.damage=car.damage;this.lastId=car.id;
 }
 get status(){return this.mixer?.getVehicleAudioStatus()||{mode:'disabled'};}
 mute(){this.enabled=false;this.update(null,false);}
 dispose(){this.mute();if(this.mixer){this.mixer._requestedVehicleAudioBank='disposed';this.mixer.destroy();this.mixer=null;}}
}

