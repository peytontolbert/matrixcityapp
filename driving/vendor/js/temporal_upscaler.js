import { glMatrix } from './glmatrix.js';

// Browser-native temporal reconstruction. Motion is previousUV-currentUV.
// motion.z is previous view-space depth; a negative z marks exact static reprojection.
// motion.w is graded reactivity [0,1], where 1 rejects history.
const VS = `#version 300 es
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D colorTex,depthTex,motionTex,historyTex,historyDepthTex;
uniform vec2 renderSize,jitter;
uniform mat4 inverseVP,currentView,previousVP,previousView;
uniform bool validHistory;
layout(location=0) out vec4 resolved;
layout(location=1) out float savedDepth;
vec3 yc(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),c.r-c.b,c.g-(c.r+c.b)*.5);}
vec3 rgb(vec3 c){return vec3(c.x+c.y*.5-c.z*.5,c.x+c.z*.5,c.x-c.y*.5-c.z*.5);}
void main(){
 vec2 sampleUV=uv+jitter/renderSize;
 ivec2 size=textureSize(depthTex,0), base=clamp(ivec2(sampleUV*renderSize),ivec2(0),size-1);
 float nearest=1.;ivec2 guide=base;
 vec3 lo=vec3(1.e20),hi=vec3(-1.e20),mean=vec3(0.),square=vec3(0.);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  ivec2 p=clamp(base+ivec2(x,y),ivec2(0),size-1);
  float d=texelFetch(depthTex,p,0).r;if(d<nearest){nearest=d;guide=p;}
  vec3 c=yc(texelFetch(colorTex,p,0).rgb);lo=min(lo,c);hi=max(hi,c);mean+=c;square+=c*c;
 }
 vec3 now=max(texture(colorTex,sampleUV).rgb,vec3(0.));
 // Depth, motion and saved history must describe the same nearest surface.
 // Mixing centre depth with dilated motion alternated foreground/background
 // identities at jittered silhouettes and caused visible edge flicker.
 vec2 guideUV=(vec2(guide)+.5)/renderSize;
 vec4 guideWorld=inverseVP*vec4(guideUV*2.-1.,nearest*2.-1.,1.);guideWorld/=guideWorld.w;
 savedDepth=max(0.,-(currentView*guideWorld).z);
 vec4 motion=texelFetch(motionTex,guide,0);
 if(motion.z<-.5){
  vec4 previousClip=previousVP*guideWorld;
  motion=previousClip.w>0.?vec4(previousClip.xy/previousClip.w*.5+.5-(guideUV-jitter/renderSize),-(previousView*guideWorld).z,0.):vec4(0.,0.,0.,1.);
 }
 // Reject an uninstrumented surface only at the pixel it actually covers. Dilate
 // graded material reactivity, but do not spread a binary invalid marker across
 // neighboring stable geometry (that caused visibly shimmering silhouettes).
 float centerReactive=texelFetch(motionTex,base,0).w;
 float reactive=centerReactive>=.999?1.:max(0.,centerReactive);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  float r=texelFetch(motionTex,clamp(base+ivec2(x,y),ivec2(0),size-1),0).w;
  if(r<.999)reactive=max(reactive,max(0.,r));
 }
 vec2 previousUV=uv+motion.xy;
 bool accept=validHistory&&motion.w<.999&&reactive<.999&&nearest<.9999999&&motion.z>0.&&all(greaterThanEqual(previousUV,vec2(0.)))&&all(lessThanEqual(previousUV,vec2(1.)));
 float oldDepth=texture(historyDepthTex,previousUV).r;
 accept=accept&&abs(oldDepth-motion.z)<max(.025,motion.z*.008);
 vec4 previous=texture(historyTex,previousUV);
 mean/=9.;vec3 sigma=sqrt(max(square/9.-mean*mean,vec3(0.)));
 vec3 history=rgb(clamp(yc(previous.rgb),max(lo,mean-sigma*1.5),min(hi,mean+sigma*1.5)));
 float count=accept?min(previous.a+1.,16.):1.;
 float weight=accept?min((count-1.)/count,.93):0.;
 // Lighting/signage changes reduce history even when geometry motion is valid.
 float change=abs(yc(now).x-yc(history).x)/max(.1,abs(yc(now).x));
 weight*=1.-smoothstep(.15,.7,change);
 // Preserve some stable history for glass, water, decals and emissive effects while
 // increasing the current-frame contribution in proportion to material reactivity.
 weight*=1.-clamp(reactive,0.,.95);
 resolved=vec4(max(mix(now,history,weight),vec3(0.)),count);
}`;
const halton=(i,b)=>{let f=1,r=0;for(;i>0;i=Math.floor(i/b)){f/=b;r+=f*(i%b);}return r;};
export class TemporalUpscaler {
 constructor(gl){
  this.gl=gl;this.targets=[];this.frame=0;this.valid=false;this.generation=0;this.resetReason='initial';this.pending=null;
  if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Temporal reconstruction requires EXT_color_buffer_float');
  const shader=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(e);}return s;};
  this.program=gl.createProgram();const v=shader(gl.VERTEX_SHADER,VS),f=shader(gl.FRAGMENT_SHADER,FS);gl.attachShader(this.program,v);gl.attachShader(this.program,f);gl.linkProgram(this.program);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.validationTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.validationTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,new Float32Array(4));gl.bindTexture(gl.TEXTURE_2D,null);
  this.vao=gl.createVertexArray();this.u={};for(const n of ['colorTex','depthTex','motionTex','historyTex','historyDepthTex','renderSize','jitter','inverseVP','currentView','previousVP','previousView','validHistory'])this.u[n]=gl.getUniformLocation(this.program,n);
 }
 bindValidationTextures(){const gl=this.gl;for(const unit of []){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.validationTexture);}gl.activeTexture(gl.TEXTURE0);}
 reset(reason='explicit'){this.valid=false;this.resetReason=reason;}
 resize(w,h){
  if(this.width===w&&this.height===h)return;
  const gl=this.gl;this.releaseTargets();this.width=w;this.height=h;
  if(w>gl.getParameter(gl.MAX_TEXTURE_SIZE)||h>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('Temporal output exceeds texture limits');
  for(let i=0;i<2;i++){
   const target={fbo:gl.createFramebuffer()};this.targets.push(target);gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);
   for(const [name,format,external,attachment] of [['color',gl.RGBA16F,gl.RGBA,0],['depth',gl.R32F,gl.RED,1]]){
    const t=gl.createTexture();target[name]=t;gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,name==='color'?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,name==='color'?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,format,w,h,0,external,gl.FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+attachment,gl.TEXTURE_2D,t,0);
   }
   gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Temporal history framebuffer incomplete');
   gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));gl.clearBufferfv(gl.COLOR,1,new Float32Array(4));
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);this.index=0;this.generation++;this.reset('resize');
 }
 begin(camera,rw,rh,ow,oh,time=performance.now()){
  if(this.pending)throw Error('Temporal frame already open');this.resize(ow,oh);
  const vp=new Float32Array(camera.viewProjectionMatrix),projection=new Float32Array(camera.projectionMatrix),view=new Float32Array(camera.viewMatrix);
  if(this.lastTime!==undefined&&(time-this.lastTime>250||time<this.lastTime))this.reset('frame-gap');
  if(this.lastPosition&&Math.hypot(...Array.from(camera.position,(v,i)=>v-this.lastPosition[i]))>25)this.reset('camera-cut');
  if(this.lastFov!==undefined&&Math.abs(camera.fieldOfView-this.lastFov)>5)this.reset('fov');
  if(this.renderWidth!==rw||this.renderHeight!==rh)this.reset('render-resize');
  this.renderWidth=rw;this.renderHeight=rh;
  // A reduced 0.7-pixel Halton footprint preserves subpixel coverage without making
  // rejected or newly revealed high-contrast silhouettes visibly crawl.
  const jitter=[(halton(this.frame%16+1,2)-.5)*.7,(halton(this.frame%16+1,3)-.5)*.7];
  const shift=(m)=>{for(let i=0;i<4;i++){m[i*4]+=2*jitter[0]/rw*m[i*4+3];m[i*4+1]+=2*jitter[1]/rh*m[i*4+3];}};
  shift(camera.viewProjectionMatrix);shift(camera.projectionMatrix);
  const inverseVP=glMatrix.mat4.create();if(!glMatrix.mat4.invert(inverseVP,camera.viewProjectionMatrix))throw Error('Temporal camera matrix is singular');
  this.pending={id:++this.frame,camera,vp,projection,view,inverseVP,jitter,time,position:Array.from(camera.position),fov:camera.fieldOfView,previousVP:this.previousVP||vp,previousView:this.previousView||view,historyValid:this.valid};
  for(const history of Array.from(this.gl.__temporalHistories||[]))if(history.frame<this.frame-60)history.destroy();
  this.bindValidationTextures();this.gl.__temporalFrame=this.pending;return this.pending;
 }
 resolve(color,depth,motion){
  const gl=this.gl,p=this.pending;if(!p||!color||!depth||!motion)throw Error('Temporal resolve requires color, depth, motion and an open frame');
  const next=this.targets[1-this.index],old=this.targets[this.index];gl.bindFramebuffer(gl.FRAMEBUFFER,next.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,this.width,this.height);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.bindVertexArray(this.vao);gl.useProgram(this.program);
  [color,depth,motion,old.color,old.depth].forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(this.u[['colorTex','depthTex','motionTex','historyTex','historyDepthTex'][i]],i);});
  gl.uniform2f(this.u.renderSize,this.renderWidth,this.renderHeight);gl.uniform2fv(this.u.jitter,p.jitter);gl.uniformMatrix4fv(this.u.inverseVP,false,p.inverseVP);gl.uniformMatrix4fv(this.u.currentView,false,p.view);gl.uniformMatrix4fv(this.u.previousVP,false,p.previousVP);gl.uniformMatrix4fv(this.u.previousView,false,p.previousView);gl.uniform1i(this.u.validHistory,this.valid?1:0);gl.drawArrays(gl.TRIANGLES,0,3);
  for(let i=0;i<5;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,null);}gl.activeTexture(gl.TEXTURE0);gl.bindVertexArray(null);
  this.index=1-this.index;this.valid=true;this.previousVP=p.vp;this.previousView=p.view;this.lastTime=p.time;this.lastPosition=p.position;this.lastFov=p.fov;p.resolved=true;return next.color;
 }
 end(){const p=this.pending;if(!p)return;p.camera.viewProjectionMatrix.set(p.vp);p.camera.projectionMatrix.set(p.projection);if(!p.resolved)this.reset('incomplete-frame');this.pending=null;this.gl.__temporalFrame=null;}
 releaseTargets(){for(const t of this.targets){this.gl.deleteTexture(t.color);this.gl.deleteTexture(t.depth);this.gl.deleteFramebuffer(t.fbo);}this.targets=[];}
 destroy(){this.end();for(const history of Array.from(this.gl.__temporalHistories||[]))history.destroy();this.releaseTargets();this.gl.deleteTexture(this.validationTexture);this.gl.deleteProgram(this.program);this.gl.deleteVertexArray(this.vao);}
 get diagnostics(){return {frames:this.frame,historyValid:this.valid,resetReason:this.resetReason,outputWidth:this.width,outputHeight:this.height,historyBytes:(this.width||0)*(this.height||0)*24,reactivity:'graded-motion-alpha-v1'};}
}
