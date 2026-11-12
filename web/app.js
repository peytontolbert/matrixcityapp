const canvas=document.querySelector('#city'),ctx=canvas.getContext('2d');
const density=document.querySelector('#density'),runtime=document.querySelector('#runtime');
const buttons=[...document.querySelectorAll('button')];
let core,seed=42,rotation=0;
buttons.forEach(b=>b.disabled=true);density.disabled=true;
function polygon(points,fill,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
function draw(){
 if(!core||!ctx)return;
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
 const bg=ctx.createRadialGradient(w*.55,h*.5,20,w*.55,h*.5,w*.65);bg.addColorStop(0,'#2e4234');bg.addColorStop(1,'#18251f');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 const unit=Math.min(w/35,h/20),cx=w*.54,cy=h*.53;
 const p=(x,y,z=0)=>[cx+(x-y)*unit,cy+(x+y-16)*unit*.48-z*unit*.035];
 polygon([p(-.4,-.4,-8),p(16.4,-.4,-8),p(16.4,16.4,-8),p(-.4,16.4,-8)],'#111d17');
 const shades=[['#92a77f','#687f60','#4b6550'],['#aec09b','#829973','#607b5c'],['#d2dab5','#a3b48c','#7b946e'],['#7f9e80','#577b63','#3f604d']];
 for(let sum=0;sum<31;sum++)for(let x=0;x<16;x++){
  const y=sum-x;if(y<0||y>=16)continue;
  let a=x,b=y;for(let r=0;r<rotation;r++)[a,b]=[b,15-a];
  const road=a%4===0||b%4===0,ht=core.block_height(a,b,seed,Number(density.value));
  polygon([p(x,y),p(x+1,y),p(x+1,y+1),p(x,y+1)],road?'#24342c':'#405941','#4c6250');
  if(road){if((a+b)%3===0)polygon([p(x+.44,y+.38),p(x+.56,y+.38),p(x+.56,y+.62),p(x+.44,y+.62)],'#718167');continue;}
  if(!ht){polygon([p(x+.25,y+.25),p(x+.75,y+.25),p(x+.75,y+.75),p(x+.25,y+.75)],'#56774b');continue;}
  const [top,left,right]=shades[core.block_tone(a,b,seed)],lo=.13,hi=.87;
  polygon([p(x+lo,y+hi),p(x+hi,y+hi),p(x+hi,y+hi,ht),p(x+lo,y+hi,ht)],left);
  polygon([p(x+hi,y+lo),p(x+hi,y+hi),p(x+hi,y+hi,ht),p(x+hi,y+lo,ht)],right);
  polygon([p(x+lo,y+lo,ht),p(x+hi,y+lo,ht),p(x+hi,y+hi,ht),p(x+lo,y+hi,ht)],top);
  for(let z=10;z<ht-4;z+=10){ctx.strokeStyle='#c7db9c66';ctx.lineWidth=Math.max(.6,unit*.035);ctx.beginPath();ctx.moveTo(...p(x+.28,y+hi,z));ctx.lineTo(...p(x+.7,y+hi,z));ctx.stroke();}
 }
 document.querySelector('#seed-label').textContent='SEED '+String(seed).padStart(3,'0');
 document.querySelector('#density-value').textContent=density.value+'%';
}
document.querySelector('#controls').addEventListener('submit',e=>e.preventDefault());
density.addEventListener('input',draw);
document.querySelector('#rotate').addEventListener('click',()=>{rotation=(rotation+1)%4;draw();});
document.querySelector('#regenerate').addEventListener('click',()=>{seed=crypto.getRandomValues(new Uint32Array(1))[0]%100000;draw();});
new ResizeObserver(draw).observe(canvas);
try{
 if(!ctx)throw Error('Canvas unavailable');
 const response=await fetch('/assets/city.wasm');if(!response.ok)throw Error('WASM request failed');
 const {instance}=await WebAssembly.instantiateStreaming(response,{});core=instance.exports;
 if(core.abi_version()!==1)throw Error('Incompatible WASM core');
 runtime.textContent='WASM ready';buttons.forEach(b=>b.disabled=false);density.disabled=false;draw();
}catch{runtime.textContent='Preview unavailable';const error=document.querySelector('#error');error.hidden=false;error.textContent='The city preview could not load. Please reload in a browser that supports WebAssembly.';}
