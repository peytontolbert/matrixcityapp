// Spawn-time reservation only: never teleport, remove or brake a live vehicle.
// A world/path-anchored wave moves with traffic at 24 m/s. Players encounter
// gradual openings instead of a corridor which resets at their current position.
const WAVE_M=1000,PATTERN_SPEED=24,CLEARANCE_M=2.6;
function sineRange(a,b){
  if(a>b)[a,b]=[b,a];
  let lo=Math.min(Math.sin(a),Math.sin(b)),hi=Math.max(Math.sin(a),Math.sin(b));
  if(Math.ceil((a-Math.PI/2)/(2*Math.PI))<=Math.floor((b-Math.PI/2)/(2*Math.PI)))hi=1;
  if(Math.ceil((a+Math.PI/2)/(2*Math.PI))<=Math.floor((b+Math.PI/2)/(2*Math.PI)))lo=-1;
  return [lo,hi];
}
export function reservesPassingCorridor(group,row,distance,playerSpeed,cruiseSpeed,minimumSpeed,now){
  if(group.length<2||playerSpeed-cruiseSpeed<8)return false;
  const ahead=distance-row.along;if(ahead<=0)return false;
  const early=ahead/(playerSpeed-Math.min(cruiseSpeed,minimumSpeed));
  const late=ahead/(playerSpeed-cruiseSpeed);if(late>35)return false;
  const reference=group.reduce((a,b)=>Number(a.lane.id)<Number(b.lane.id)?a:b);
  const mid=(group[0].side+group.at(-1).side)/2,radius=(group.at(-1).side-group[0].side)/2;
  const phase=t=>(reference.along+(playerSpeed-PATTERN_SPEED)*t-PATTERN_SPEED*now/1000)*Math.PI*2/WAVE_M;
  // Reserve the entire arrival interval, including half a car length either side.
  // Cruise-only predictions fail when an AI catches a slower vehicle before us.
  const [lo,hi]=sineRange(phase(Math.max(0,early-.2)),phase(late+.2));
  return row.side>=mid+radius*lo-CLEARANCE_M&&row.side<=mid+radius*hi+CLEARANCE_M;
}
