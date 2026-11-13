// Shared impulse solve: v+ = v* + M^-1 J^T lambda.
// Bilateral constraints are eliminated exactly; bounded friction/clutch/brake
// impulses minimize kinetic energy in the remaining constrained velocity space.
const dot=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
function factor(matrix){
 const n=matrix.length,a=matrix.map(row=>[...row]),piv=Array.from({length:n},(_,i)=>i),scale=Math.max(1,...matrix.flat().map(Math.abs));
 for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;if(Math.abs(a[p][k])<1e-12*scale)throw Error('Dependent or ill-conditioned bilateral constraints');[a[k],a[p]]=[a[p],a[k]];[piv[k],piv[p]]=[piv[p],piv[k]];for(let i=k+1;i<n;i++){a[i][k]/=a[k][k];for(let j=k+1;j<n;j++)a[i][j]-=a[i][k]*a[k][j];}}
 return rhs=>{const x=piv.map(i=>rhs[i]);for(let i=0;i<n;i++)for(let j=0;j<i;j++)x[i]-=a[i][j]*x[j];for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)x[i]-=a[i][j]*x[j];x[i]/=a[i][i];}return x;};
}
export function solveImpulseSystem({velocity,inverseMass,externalImpulse=velocity.map(()=>0),bilateral=[],bilateralBias=bilateral.map(()=>0),bounded=[],groups=[],iterations=4000,tolerance=1e-10,method='fista',cache,initialImpulse}){
 if(!Number.isInteger(iterations)||iterations<1||!Number.isFinite(tolerance)||tolerance<=0)throw Error('Positive iteration budget and tolerance required');
 const n=velocity.length;if(!n||inverseMass.length!==n||externalImpulse.length!==n||!velocity.every(Number.isFinite)||!externalImpulse.every(Number.isFinite)||!inverseMass.every(x=>Number.isFinite(x)&&x>0))throw Error('Finite velocities, momenta and positive inverse masses required');
 const valid=row=>Array.isArray(row)&&row.length===n&&row.every(Number.isFinite);if(!bilateral.every(valid)||!bounded.every(c=>valid(c.jacobian)&&(Number.isFinite(c.limit)||c.limit===Infinity)&&c.limit>=0&&(c.compliance===undefined||(Number.isFinite(c.compliance)&&c.compliance>=0))&&(c.bias===undefined||Number.isFinite(c.bias))))throw Error('Invalid impulse constraint');
 if(bounded.some(c=>c.lowerImpulse!==undefined&&(!Number.isFinite(c.lowerImpulse)||c.lowerImpulse>c.limit)))throw Error('Invalid lower impulse bound');
 if(!['block','fista'].includes(method))throw Error('Unknown shared solve method');
 const claimed=new Set();for(const group of groups)for(const i of group){if(!Number.isInteger(i)||i<0||i>=bounded.length||claimed.has(i))throw Error('Invalid or overlapping friction group');if(!Number.isFinite(bounded[i].limit)||bounded[i].lowerImpulse!==undefined)throw Error('Friction groups require finite symmetric limits');claimed.add(i);}
 const kinetic=v=>.5*v.reduce((s,x,i)=>s+x*x/inverseMass[i],0),initialEnergy=kinetic(velocity),kicked=velocity.map((v,i)=>v+inverseMass[i]*externalImpulse[i]),kickEnergy=kinetic(kicked);
 const sparse=new Map(),metric=(a,b)=>{let entries=sparse.get(a);if(!entries){entries=[];for(let i=0;i<a.length;i++)if(a[i]!==0)entries.push(i);sparse.set(a,entries);}let sum=0;for(const i of entries)sum+=a[i]*inverseMass[i]*b[i];return sum;},solveB=cache?.solveB??factor(bilateral.map(a=>bilateral.map(b=>metric(a,b))));if(cache)cache.solveB=solveB;
 const initialB=solveB(bilateral.map((j,i)=>-dot(j,kicked)-bilateralBias[i])),base=kicked.map((v,i)=>v+inverseMass[i]*bilateral.reduce((s,j,k)=>s+j[i]*initialB[k],0));
 const response=cache?.response??bounded.map(c=>{const cross=bilateral.map(j=>metric(j,c.jacobian)),correction=solveB(cross);return c.jacobian.map((j,i)=>inverseMass[i]*(j-bilateral.reduce((s,row,k)=>s+row[i]*correction[k],0)));});
 if(cache)cache.response=response;
 const m=bounded.length,limits=bounded.map((c,i)=>Number.isFinite(c.limit)?c.limit:1/Math.sqrt(Math.max(1e-30,dot(c.jacobian,response[i])+(c.compliance??0)))),b=bounded.map((c,i)=>(dot(c.jacobian,base)+(c.bias??0))*limits[i]),A=bounded.map((c,i)=>bounded.map((d,j)=>(dot(c.jacobian,response[j])+(i===j?(c.compliance??0):0))*limits[i]*limits[j]));
 // The reduced mass operator is reciprocal. Remove only roundoff asymmetry
 // introduced by separate bilateral-elimination dot products.
 for(let i=0;i<m;i++)for(let j=0;j<i;j++)A[i][j]=A[j][i]=.5*(A[i][j]+A[j][i]);
 const L=Math.max(1e-30,...A.map(row=>row.reduce((s,x)=>s+Math.abs(x),0)));
 // Group projection must precede scalar clipping: a friction disk is not a box.
 const projection=v=>{
  const out=[...v];
  for(let i=0;i<m;i++){
   if(limits[i]===0){out[i]=0;continue;}
   if(!claimed.has(i)){const lower=bounded[i].lowerImpulse??-bounded[i].limit,upper=bounded[i].limit;out[i]=Math.max(lower/limits[i],Math.min(upper/limits[i],out[i]));}
  }
  for(const group of groups){const length=Math.max(1,Math.hypot(...group.map(i=>out[i])));for(const i of group)out[i]/=length;}
  return out;
 };
 const gradient=q=>{const g=Array(m);for(let i=0;i<m;i++)g[i]=b[i]+dot(A[i],q);return g;},objective=q=>{let value=0;for(let i=0;i<m;i++)value+=q[i]*(b[i]+.5*dot(A[i],q));return value;};
 if(initialImpulse!==undefined&&(!Array.isArray(initialImpulse)||initialImpulse.length!==m||!initialImpulse.every(Number.isFinite)))throw Error('Invalid initial impulse');
 let q=projection(initialImpulse?initialImpulse.map((v,i)=>limits[i]>0?v/limits[i]:0):Array(m).fill(0)),y=[...q],t=1,best=[...q],bestValue=objective(q),residual=0,used=0;
 if(method==='block' && groups.every(g=>g.length===2)){
  const blocks=[...groups,...Array.from({length:m},(_,i)=>i).filter(i=>!claimed.has(i)).map(i=>[i])];
  for(let k=0;k<iterations&&m;k++){
   for(const block of (k%2?[...blocks].reverse():blocks)){
    if(block.length===1){const i=block[0];if(A[i][i]>0){q[i]-=(b[i]+dot(A[i],q))/A[i][i];q[i]=Math.max((bounded[i].lowerImpulse??-bounded[i].limit)/limits[i],Math.min(bounded[i].limit/limits[i],q[i]));}if(limits[i]===0)q[i]=0;continue;}
    const [i,j]=block,a=A[i][i],d=A[j][j],c=A[i][j],g=b[i]+dot(A[i],q)-a*q[i]-c*q[j],h=b[j]+dot(A[j],q)-c*q[i]-d*q[j];
    if(limits[i]===0||limits[j]===0){q[i]=a>0?Math.max(-1,Math.min(1,-g/a)):0;q[j]=d>0?Math.max(-1,Math.min(1,-h/d)):0;continue;}
    const at=mu=>{const aa=a+mu,dd=d+mu,det=aa*dd-c*c;return [(-dd*g+c*h)/det,(c*g-aa*h)/det];};
    let x=at(0);
    if(!x.every(Number.isFinite)||Math.hypot(...x)>1){let low=0,high=Math.max(1,Math.hypot(g,h));while(Math.hypot(...at(high))>1)high*=2;for(let n=0;n<48;n++){const mid=(low+high)/2;if(Math.hypot(...at(mid))>1)low=mid;else high=mid;}x=at(high);}
    q[i]=x[0];q[j]=x[1];
   }
   const g=gradient(q),test=projection(q.map((v,i)=>v-g[i]/L));residual=Math.max(0,...q.map((v,i)=>Math.abs(v-test[i])));used=k+1;if(residual<=tolerance)break;
  }
  best=q;
 }else{
 for(let k=0;k<iterations&&m;k++){const g=gradient(y),next=projection(y.map((v,i)=>v-g[i]/L)),value=objective(next);if(value<=bestValue){bestValue=value;best=[...next];}const nt=(1+Math.sqrt(1+4*t*t))/2;y=next.map((v,i)=>v+(t-1)/nt*(v-q[i]));q=next;t=nt;used=k+1;const bg=gradient(best),test=projection(best.map((v,i)=>v-bg[i]/L));residual=Math.max(0,...best.map((v,i)=>Math.abs(v-test[i])));if(residual<tolerance)break;}
 }
 const lambda=best.map((v,i)=>v*limits[i]),final=base.map((v,i)=>v+response.reduce((s,r,j)=>s+r[i]*lambda[j],0));
 const correction=solveB(bilateral.map(row=>bounded.reduce((s,c,j)=>s+metric(row,c.jacobian)*lambda[j],0))),bilateralImpulse=initialB.map((v,i)=>v-correction[i]);
 const totalImpulse=externalImpulse.map((v,i)=>v+bilateral.reduce((s,row,j)=>s+row[i]*bilateralImpulse[j],0)+bounded.reduce((s,c,j)=>s+c.jacobian[i]*lambda[j],0));
 const elasticBeforeJ=bounded.reduce((sum,c)=>sum+(c.spring?.stiffness??0)*(c.spring?.extension??0)**2/2,0),elasticAfterJ=bounded.reduce((sum,c)=>sum+(c.spring?c.spring.stiffness*(c.spring.extension+c.spring.dt*dot(c.jacobian,final))**2/2:0),0);
 const finalEnergy=kinetic(final),equalityResidual=Math.max(0,...bilateral.map((row,i)=>Math.abs(dot(row,final)+bilateralBias[i])));
 return {velocity:final,bilateralImpulse,boundedImpulse:lambda,totalImpulse,initialEnergyJ:initialEnergy,externalWorkJ:kickEnergy-initialEnergy,finalEnergyJ:finalEnergy,constraintKineticDeltaJ:finalEnergy-kickEnergy,elasticBeforeJ,elasticAfterJ,passiveEnergyDeltaJ:finalEnergy-kickEnergy+elasticAfterJ-elasticBeforeJ,projectedResidual:residual,equalityResidual,iterations:used,converged:residual<=tolerance};
}
export function lockedDrivetrainFixture({mass=1500,wheelInertia=2,engineInertia=.3,gearInertia=.05,radius=.33,ratio=12}={}){
 const inverseMass=[1/mass,1/engineInertia,1/gearInertia,...Array(4).fill(1/wheelInertia)],bilateral=[];
 for(let i=0;i<4;i++){const row=Array(7).fill(0);row[0]=1;row[3+i]=-radius;bilateral.push(row);}
 bilateral.push([0,0,1,0,0,-ratio/2,-ratio/2],[0,1,-1,0,0,0,0]);
 const effectiveMass=mass+4*wheelInertia/radius**2+(engineInertia+gearInertia)*ratio**2/radius**2;
 return {inverseMass,bilateral,effectiveMass,radius,ratio};
}

export function springImpulseConstraint(jacobian,{extension,stiffness,damping=0,dt}){
 if(![extension,stiffness,damping,dt].every(Number.isFinite)||stiffness<=0||damping<0||dt<=0)throw Error('Invalid spring parameters');
 const rate=stiffness*dt+damping;return {jacobian,limit:Infinity,compliance:1/(dt*rate),bias:stiffness*extension/rate,spring:{extension,stiffness,dt}};
}

export function impactConstraint(jacobian,{closingVelocity,restitution=0}){
 if(!Number.isFinite(closingVelocity)||!Number.isFinite(restitution)||restitution<0||restitution>1)throw Error('Invalid restitution state');
 return {jacobian,limit:Infinity,lowerImpulse:0,bias:restitution*Math.min(0,closingVelocity)};
}
