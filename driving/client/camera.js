// Adapted from City's vehicle_chase_v2: carry the camera with translation,
// smooth turns independently of frame rate, and reset after a teleport.
export class ChaseCamera {
 update(car,dt){
  const center=car.position,forward=[Math.cos(car.heading),Math.sin(car.heading)];
  const length=Math.min(5.5,Math.max(.2,car.cameraDistance??5.5));
  const desired=[center[0]-forward[0]*length,center[1]-forward[1]*length,center[2]+1.6];
  const reset=!this.center||this.id!==car.id||Math.hypot(...center.map((v,i)=>v-this.center[i]))>30;
  const alpha=1-Math.exp(-14*Math.max(0,Math.min(.1,dt)));
  this.eye=reset?desired:desired.map((v,i)=>{const carried=this.eye[i]+center[i]-this.center[i];return carried+(v-carried)*alpha;});
  // Clip promptly; smooth only when moving away from an obstruction.
  const horizontal=Math.hypot(this.eye[0]-center[0],this.eye[1]-center[1]);
  if(horizontal>length){for(let i=0;i<2;i++)this.eye[i]=center[i]+(this.eye[i]-center[i])*length/horizontal;}
  this.center=[...center];this.id=car.id;
  return {eye:this.eye,target:[center[0]+forward[0],center[1]+forward[1],center[2]+.8]};
 }
}
