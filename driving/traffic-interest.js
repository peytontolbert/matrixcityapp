const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
// Project onto the actual route near the driver so curved highways are not
// mistaken for the opposite carriageway by a single heading/radius test.
export function routeInterest(lane,player,distance){
 if(!Number.isFinite(player.heading))return {ahead:distance,relevant:true};
 const look=[Math.cos(player.heading),Math.sin(player.heading)];let best=null;
 for(let i=0;i<lane.points.length-1;i++){
  const a=lane.points[i],b=lane.points[i+1],v=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...v);if(length<.01)continue;
  const t=Math.max(0,Math.min(1,dot([player[0]-a[0],player[1]-a[1]],v)/(length*length))),z=a[2]+(b[2]-a[2])*t;
  if(Math.abs(z-player[2])>5||dot(v,look)/length<.55)continue;
  const lateral=Math.hypot(a[0]+v[0]*t-player[0],a[1]+v[1]*t-player[1]);
  if(lateral>28||best&&lateral>=best.lateral)continue;
  best={lateral,along:lane.cumulative[i]+(lane.cumulative[i+1]-lane.cumulative[i])*t};
 }
 if(!best)return {ahead:Infinity,relevant:false};let ahead=distance-best.along;
 if(lane.loop&&ahead< -lane.lengthM/2)ahead+=lane.lengthM;
 return {ahead,relevant:true};
}
