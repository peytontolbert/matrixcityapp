const preserveCloudShadowState=g=>preserveCloudState(g);
import {program,preserve as preserveBase} from './gl_util.js';
// Noise is uploaded once during the loading screen, before the render loop.
const enqueueUpload=async(g,job)=>job.run();
import {frameBudget} from './budget.js';
import {CLOUD_DENSITY_GLSL} from './cloud-density.js';
export function preserveCloudState(g){const active=g.getParameter(g.ACTIVE_TEXTURE);g.activeTexture(g.TEXTURE6);const old=g.getParameter(g.TEXTURE_BINDING_3D);g.activeTexture(active);const undo=preserveBase(g,{textureUnits:[0,1,2,3,4,5,6,7,21]});return()=>{g.activeTexture(g.TEXTURE6);g.bindTexture(g.TEXTURE_3D,old);undo();};}
const preserve=preserveCloudState;
const VS=`#version 300 es\nout vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const FS=`#version 300 es
precision highp float;precision highp sampler3D;in vec2 uv;out vec4 color;
uniform mat4 inverseProjection,inverseView;uniform vec3 eye,sun,sunColor,ambient;uniform int steps;
${CLOUD_DENSITY_GLSL}
void main(){vec4 q=inverseProjection*vec4(uv*2.-1.,1.,1.);vec3 ray=normalize(mat3(inverseView)*(q.xyz/q.w));
 // Derivatives must be evaluated before divergent exits. Include both the pixel
 // cone and the ray segment in the density footprint to prevent horizon shimmer.
 float cone=max(length(dFdx(ray)),length(dFdy(ray)));
 vec2 span=cloudInterval(eye,ray);if(span.y<=span.x){color=vec4(0.);return;}
 float ds=(span.y-span.x)/float(steps),transmission=1.;vec3 sum=vec3(0.);
 float mu=dot(ray,sun),phase=.55+1.8*pow(max(0.,mu),12.)+.15*pow(max(0.,-mu),2.);
 for(int i=0;i<40;i++){if(i>=steps)break;
  float distance=span.x+(float(i)+.5)*ds,footprint=max(ds*.5,cone*distance);
  vec3 p=eye+ray*distance;
  float density=cloudDensityFiltered(p,footprint)*(1.-smoothstep(50000.,60000.,distance));
  if(density<.000001)continue;
  float optical=0.,travel=0.;
  for(int j=0;j<3;j++){float segment=180.*exp2(float(j));optical+=cloudDensityFiltered(p+sun*(travel+segment*.5),max(footprint,segment*.5))*segment;travel+=segment;}
  float light=.82*exp(-optical)+.18*exp(-optical*.25);
  float opacity=1.-exp(-density*ds);
  float height=clamp((p.y-uCloudWeather.y)/(uCloudWeather.z-uCloudWeather.y),0.,1.);
  vec3 scatter=ambient*(.75+.6*height)+sunColor*light*phase;
  // Distant clouds inherit aerial perspective instead of a harsh cutoff band.
  float mist=1.-exp(-distance*.000018);
  scatter=mix(scatter,ambient*1.25,mist*.65);
  sum+=transmission*opacity*scatter;transmission*=1.-opacity;
  if(transmission<.008)break;
 }
 // Premultiplied radiance stays well-behaved at thin edges during upsampling.
 color=vec4(sum,1.-transmission);
}`;
const SHADOW=`#version 300 es
precision highp float;precision highp sampler3D;in vec2 uv;out vec4 color;
uniform vec2 center;uniform float ground;uniform vec3 sun;
${CLOUD_DENSITY_GLSL}
void main(){vec3 p=vec3(center.x+(uv.x-.5)*4096.,ground,center.y+(uv.y-.5)*4096.);float t=cloudSunTransmission(p,sun);color=vec4(t,t,t,1.);}`;
export class CloudVolume {
 constructor(gl){this.gl=gl;this.locations=new Map();this.lastShadow=-Infinity;this.stats={version:4,volumeFrames:0,shadowUpdates:0,noiseBytes:599186,noiseMipLevels:7,filter:'ray-and-pixel-footprint',premultiplied:true,reallocations:0};}
 async init(){const g=this.gl;let restore=preserve(g);try{
  this.volumeProgram=program(g,VS,FS);this.shadowProgram=program(g,VS,SHADOW);this.vao=g.createVertexArray();
  let seed=110415;const data=new Uint8Array(64*64*64*2);for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=seed>>>24;}
  this.noise=g.createTexture();restore();restore=()=>{};
  await enqueueUpload(g,{label:'mip-filtered volumetric cloud density',bytes:data.length,priority:30,run:()=>{const old=g.getParameter(g.TEXTURE_BINDING_3D),alignment=g.getParameter(g.UNPACK_ALIGNMENT);try{g.pixelStorei(g.UNPACK_ALIGNMENT,1);g.bindTexture(g.TEXTURE_3D,this.noise);g.texImage3D(g.TEXTURE_3D,0,g.RG8,64,64,64,0,g.RG,g.UNSIGNED_BYTE,data);for(const p of [g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T,g.TEXTURE_WRAP_R])g.texParameteri(g.TEXTURE_3D,p,g.REPEAT);g.texParameteri(g.TEXTURE_3D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_3D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.generateMipmap(g.TEXTURE_3D);}finally{g.bindTexture(g.TEXTURE_3D,old);g.pixelStorei(g.UNPACK_ALIGNMENT,alignment);}}});
  restore=preserve(g);
  this.shadow=this.target(256,256,false);this.center=[0,0];
 }finally{restore();}}
 target(w,h,hdr=true){const g=this.gl,texture=g.createTexture(),fbo=g.createFramebuffer();g.bindTexture(g.TEXTURE_2D,texture);const floating=hdr&&g.getExtension('EXT_color_buffer_float');g.texImage2D(g.TEXTURE_2D,0,floating?g.RGBA16F:g.RGBA8,w,h,0,g.RGBA,floating?g.HALF_FLOAT:g.UNSIGNED_BYTE,null);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.bindFramebuffer(g.FRAMEBUFFER,fbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Cloud framebuffer incomplete');return {texture,fbo,w,h};}
 bindDensity(p,e,unit=6){const g=this.gl;let u=this.locations.get(p);if(!u){u=Object.fromEntries(['uCloudNoise','uCloudWeather','uCloudWind','eye','sun','sunColor','ambient','center','ground','inverseProjection','inverseView'].map(n=>[n,g.getUniformLocation(p,n)]));this.locations.set(p,u);}g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_3D,this.noise);g.bindSampler(unit,null);g.uniform1i(u.uCloudNoise,unit);g.uniform4fv(u.uCloudWeather,[e.cloud,e.cloudBase,e.cloudTop,e.seconds]);g.uniform2fv(u.uCloudWind,e.wind);g.uniform3fv(u.sun,e.sun);g.uniform3fv(u.sunColor,e.sunColor);g.uniform3fv(u.ambient,e.ambient);return u;}
 draw(target,p){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,target.fbo);g.viewport(0,0,target.w,target.h);g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.disable(g.SCISSOR_TEST);g.disable(g.CULL_FACE);g.colorMask(true,true,true,true);g.useProgram(p);g.bindVertexArray(this.vao);}
 updateShadow(e,eye,now){if(now-this.lastShadow<500&&Math.hypot(eye[0]-this.center[0],eye[2]-this.center[1])<512)return;const b=frameBudget(this.gl);if(!b.canRun('aux'))return;b.run('aux',()=>{const g=this.gl,restore=preserveCloudShadowState(g);try{this.draw(this.shadow,this.shadowProgram);const u=this.bindDensity(this.shadowProgram,e);this.center=[Math.round(eye[0]/64)*64,Math.round(eye[2]/64)*64];g.uniform2fv(u.center,this.center);g.uniform1f(u.ground,e.groundHeight);g.drawArrays(g.TRIANGLES,0,3);this.lastShadow=now;this.stats.shadowUpdates++;}finally{restore();}},'cloud shadow');}
 render(e,camera,w,h,math,{stateOwned=false}={}){const g=this.gl,restore=stateOwned?()=>{}:preserve(g);try{const quality=g.__matrixRealism?.app?.textureStreamer?.quality||'medium',divisor=quality==='high'?2:quality==='low'?4:3,steps=quality==='high'?40:quality==='low'?20:28;
  // Use output size rather than the dynamically scaled scene size. Small render
  // scale changes must not move the cloud sampling grid or reallocate its target.
  // The game also resizes the canvas backing buffer for dynamic resolution.
  // CSS display dimensions stay fixed; use those (at device pixel ratio) first.
  const dpr=globalThis.devicePixelRatio||1;
  const outputW=Math.round((g.canvas.clientWidth||0)*dpr)||g.drawingBufferWidth||w;
  const outputH=Math.round((g.canvas.clientHeight||0)*dpr)||g.drawingBufferHeight||h;
  const scale=Math.min(1/divisor,(quality==='high'?960:quality==='low'?480:720)/Math.max(outputW,outputH),960/outputW,540/outputH);
  const width=Math.max(1,Math.ceil(outputW*scale)),height=Math.max(1,Math.ceil(outputH*scale));if(!this.volume||this.volume.w!==width||this.volume.h!==height){if(this.volume){g.deleteTexture(this.volume.texture);g.deleteFramebuffer(this.volume.fbo);}this.volume=this.target(width,height);this.stats.reallocations++;}
  this.draw(this.volume,this.volumeProgram);const u=this.bindDensity(this.volumeProgram,e),ip=math.mat4.create(),iv=math.mat4.create();if(u.steps===undefined)u.steps=g.getUniformLocation(this.volumeProgram,'steps');g.uniform1i(u.steps,steps);math.mat4.invert(ip,camera.projectionMatrix);math.mat4.invert(iv,camera.viewMatrix);g.uniformMatrix4fv(u.inverseProjection,false,ip);g.uniformMatrix4fv(u.inverseView,false,iv);g.uniform3fv(u.eye,camera.position);g.drawArrays(g.TRIANGLES,0,3);this.stats.volumeFrames++;this.stats.quality=quality;this.stats.steps=steps;this.stats.resolution=[width,height];return this.volume.texture;
 }finally{restore();}}
 dispose(){const g=this.gl;for(const t of [this.volume,this.shadow])if(t){g.deleteTexture(t.texture);g.deleteFramebuffer(t.fbo);}g.deleteTexture(this.noise);g.deleteProgram(this.volumeProgram);g.deleteProgram(this.shadowProgram);g.deleteVertexArray(this.vao);}
}
