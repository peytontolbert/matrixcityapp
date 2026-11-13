export function authoredTravel(vehicle,axle){if(vehicle?.physicsMode!=='assetto')return null;const s=vehicle.assettoHandling?.suspension?.[String(axle||'').toLowerCase()==='front'?'front':'rear'];if(!s||!Number.isFinite(Number(s.bumpStopDownM))||!Number.isFinite(Number(s.bumpStopUpM)))return null;return {lower:-Math.max(.02,Math.min(.3,Math.abs(Number(s.bumpStopDownM)))),upper:Math.max(.02,Math.min(.3,Math.abs(Number(s.bumpStopUpM))))};}
export function followRoad(contacts,v,dt,response,raise,longitudinal,lateral){
 const feet=v.position[2]-v.groundOffset,rows=Object.values(contacts.contacts||{}).filter(c=>Number.isFinite(c.z)&&c.source!=='none'&&Math.abs(c.z-feet)<1.5);
 if(rows.length<3||!contacts.groundedCount)return null;
 let mx=0,my=0,mz=0;for(const p of rows){mx+=p.x;my+=p.y;mz+=p.z;}mx/=rows.length;my/=rows.length;mz/=rows.length;
 let xx=0,xy=0,yy=0,xz=0,yz=0;for(const p of rows){const x=p.x-mx,y=p.y-my,z=p.z-mz;xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;}
 const det=xx*yy-xy*xy;if(Math.abs(det)<1e-8)return null;const a=(xz*yy-yz*xy)/det,b=(yz*xx-xz*xy)/det;
 if(Math.hypot(a,b)>.5||rows.some(p=>Math.abs(p.z-(mz+a*(p.x-mx)+b*(p.y-my)))>.12))return null;
 const c=Math.cos(v.headingRad),s=Math.sin(v.headingRad),rate=a*(c*longitudinal-s*lateral)+b*(s*longitudinal+c*lateral);
 const target=mz+a*(v.position[0]-mx)+b*(v.position[1]-my)+v.groundOffset+raise;
 contacts.pitch=Math.atan(a*c+b*s);contacts.roll=Math.atan(-a*s+b*c);
 v.roadFollowing={rateMps:rate,targetZ:target,mode:'moving-road-reference'};
 return target+(v.position[2]-(target-rate*dt))*Math.exp(-response*dt);
}
