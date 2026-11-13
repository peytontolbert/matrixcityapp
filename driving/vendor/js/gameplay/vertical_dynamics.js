// Experimental seven-DOF vertical model: body heave/pitch/roll + four hubs.
// Small-angle geometry, authored linear wheel rates, backward Euler and
// unilateral tyre springs. Not a reconstruction of AC suspension linkages.
const keys=['27922','26418','27902','26398'];
function linearSolve(a,b){
 const n=b.length,A=a.map((r,i)=>[...r,b[i]]);
 for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[p][k]))p=i;[A[p],A[k]]=[A[k],A[p]];
  if(Math.abs(A[k][k])<1e-12)throw Error('Singular suspension system');
  const d=A[k][k];for(let j=k;j<=n;j++)A[k][j]/=d;
  for(let i=0;i<n;i++)if(i!==k){const f=A[i][k];for(let j=k;j<=n;j++)A[i][j]-=f*A[k][j];}
 }return A.map(r=>r[n]);
}
export function stepVertical(state,p,contacts,dt,{longAcceleration=0,latAcceleration=0,frontAero=0,rearAero=0}={}){
 if(!(dt>0&&dt<=.05))throw Error('Invalid suspension step');
 const hubs=keys.map((k,i)=>p.suspension[i<2?'front':'rear'].hubMassKg),ms=p.mass-hubs.reduce((a,b)=>a+b,0);
 const masses=[ms,p.inertiaTensor[0],p.inertiaTensor[1],...hubs];
 if(!masses.every(x=>Number.isFinite(x)&&x>0))throw Error('Vertical dynamics require authored hub mass and inertia');
 const wheels=keys.map((key,i)=>{const front=i<2,axle=front?'front':'rear',sp=p.suspension[axle],ty=p.tyres[axle],y=p.wheelbase*(front?1-p.centerOfGravityFrontFraction:-p.centerOfGravityFrontFraction),right=(i%2?1:-1)*(front?p.trackFront:p.trackRear)/2;
  const kt=ty.verticalRateNpm,ct=Number(ty.authoredParameters?.DAMP??0);
  if(![kt,ct,sp.springRateNpm,sp.bumpDampingNsPm,sp.reboundDampingNsPm].every(Number.isFinite)||kt<=0||ct<0)throw Error('Vertical tyre/spring parameters unavailable');
  return {key,y,right,sp,kt,ct,load:p.mass*9.81*(front?p.centerOfGravityFrontFraction:1-p.centerOfGravityFrontFraction)/2,aero:(front?frontAero:rearAero)/2};});
 state.vertical ||= {q:Array(7).fill(0),v:Array(7).fill(0),roadOrigin:keys.map(k=>contacts.contacts?.[k]?.suspensionOffset??0)};
 const old=state.vertical,q=old.q,v=old.v;
 const road=wheels.map((w,i)=>(contacts.contacts?.[w.key]?.suspensionOffset??old.roadOrigin[i])-old.roadOrigin[i]);
 const K=Array.from({length:7},()=>Array(7).fill(0)),C=K.map(r=>[...r]);
 const add=(matrix,j,k)=>{for(let a=0;a<7;a++)for(let b=0;b<7;b++)matrix[a][b]+=k*j[a]*j[b];};
 for(let i=0;i<4;i++){const w=wheels[i],j=[-1,-w.y,-w.right,0,0,0,0];j[i+3]=1;
  const rate=j.reduce((s,a,k)=>s+a*v[k],0);add(K,j,w.sp.springRateNpm);add(C,j,rate>=0?w.sp.bumpDampingNsPm:w.sp.reboundDampingNsPm);
 }
 for(const axle of [0,1]){const a=2*axle,b=a+1,track=axle?p.trackRear:p.trackFront,arb=p.suspension[axle?'rear':'front'].antiRollBarNm;
  const j=Array(7).fill(0);j[2]=track;j[3+a]=1;j[3+b]=-1;add(K,j,Math.max(0,arb)/(track*track));}
 let active=wheels.map(w=>contacts.contacts?.[w.key]?.grounded===true),nextV,nextQ,loads;
 for(let iteration=0;iteration<8;iteration++){
  const k=K.map(r=>[...r]),c=C.map(r=>[...r]);
  const force=[-frontAero-rearAero,ms*longAcceleration*p.centerOfGravityHeightM,-ms*latAcceleration*p.centerOfGravityHeightM,0,0,0,0];
  for(let i=0;i<4;i++){const w=wheels[i];force[1]-=w.y*w.aero;force[2]-=w.right*w.aero;
   if(active[i]){k[i+3][i+3]+=w.kt;c[i+3][i+3]+=w.ct;force[i+3]+=w.kt*road[i];}
   else force[i+3]-=w.load;
  }
  const A=k.map((row,i)=>row.map((x,j)=>(i===j?masses[i]:0)+dt*c[i][j]+dt*dt*x));
  const rhs=v.map((x,i)=>masses[i]*x+dt*(force[i]-k[i].reduce((s,a,j)=>s+a*q[j],0)));
  nextV=linearSolve(A,rhs);nextQ=q.map((x,i)=>x+dt*nextV[i]);
  loads=wheels.map((w,i)=>w.load+w.kt*(road[i]-nextQ[i+3])-w.ct*nextV[i+3]);
  const updated=loads.map((load,i)=>contacts.contacts?.[keys[i]]?.grounded===true&&load>0);
  if(updated.every((x,i)=>x===active[i]))break;active=updated;
 }
 const energy=nextQ.reduce((s,x,i)=>s+.5*x*K[i].reduce((a,k,j)=>a+k*nextQ[j],0)+.5*masses[i]*nextV[i]**2,0)
  +wheels.reduce((s,w,i)=>s+(active[i]?.5*w.kt*(road[i]-nextQ[i+3])**2:0),0);
 state.vertical={q:nextQ,v:nextV,roadOrigin:old.roadOrigin,normal:Object.fromEntries(keys.map((key,i)=>[key,active[i]?Math.max(0,loads[i]):0])),
  heave:nextQ[0],pitch:nextQ[1],roll:nextQ[2],hubTravel:nextQ.slice(3),energyJ:energy,scope:'experimental-small-angle-7dof'};
 return state.vertical;
}
