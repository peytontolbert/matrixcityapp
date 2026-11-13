const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
export function shadowCamera(model,center,sun,size=2048,radius=224){
 if(![...model,...center,...sun,size,radius].every(Number.isFinite)||Math.hypot(...sun)<.1||size<1||radius<1)throw Error('Invalid shadow camera');
 const z=norm(sun),x=norm(cross(Math.abs(z[1])>.95?[0,0,1]:[0,1,0],z)),y=cross(z,x);
 const world=p=>[0,1,2].map(i=>model[i]*p[0]+model[4+i]*p[1]+model[8+i]*p[2]+model[12+i]);
 const focus=world(center),texel=2*radius/size;
 const sx=Math.round(dot(x,focus)/texel)*texel,sy=Math.round(dot(y,focus)/texel)*texel,sz=dot(z,focus)+800;
 const origin=center.map(v=>Math.round(v/256)*256),wo=world(origin),matrix=new Float32Array(16);
 const near=1,far=1600;
 for(let c=0;c<3;c++){const axis=[model[c*4],model[c*4+1],model[c*4+2]];matrix[c*4]=dot(x,axis)/radius;matrix[c*4+1]=dot(y,axis)/radius;matrix[c*4+2]=-2*dot(z,axis)/(far-near);}
 matrix[12]=(dot(x,wo)-sx)/radius;matrix[13]=(dot(y,wo)-sy)/radius;matrix[14]=-2*(dot(z,wo)-sz)/(far-near)-(far+near)/(far-near);matrix[15]=1;
 return {origin,matrix,center:[...center],sun:[...z],size,radius,texel};
}
export function inShadowBounds(bounds,camera){
 if(!bounds)return true;
 const center=[0,1,2].map(i=>(bounds[i]+bounds[i+3])*.5-camera.origin[i]);
 const half=[0,1,2].map(i=>(bounds[i+3]-bounds[i])*.5),m=camera.matrix;
 for(let r=0;r<3;r++){const p=m[r]*center[0]+m[4+r]*center[1]+m[8+r]*center[2]+m[12+r];const extent=Math.abs(m[r])*half[0]+Math.abs(m[4+r])*half[1]+Math.abs(m[8+r])*half[2];if(Math.abs(p)>1+extent+.002)return false;}
 return true;
}
export function shadowNeedsUpdate(previous,center,sun,revision){return !previous||previous.revision!==revision||Math.hypot(...center.map((v,i)=>v-previous.center[i]))>8||dot(norm(sun),previous.sun)<.999995;}
