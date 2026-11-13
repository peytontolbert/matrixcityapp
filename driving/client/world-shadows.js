import {mat4} from 'gl-matrix';
import {shadowCamera,inShadowBounds,shadowNeedsUpdate} from '../vendor/js/shadow-math.js';
// City double-buffered, texel-snapped sun shadows. Indexed track casters retain
// alpha cutouts; large groups are split across a bounded incremental draw queue.
export class WorldShadows {
 constructor(gl){this.gl=gl;this.targets=[];this.stats={ready:false,updates:0,pending:0};}
 init(){
  const g=this.gl,program=g.createProgram();
  for(const [type,text] of [[g.VERTEX_SHADER,`#version 300 es
layout(location=0) in vec3 p;layout(location=3) in vec2 uv;
uniform mat4 matrix;uniform vec3 minimum,span;uniform float absolutePosition;
out vec2 tex;void main(){tex=uv;gl_Position=matrix*vec4(mix(minimum+p/65535.*span,p,absolutePosition),1.);}`],[g.FRAGMENT_SHADER,`#version 300 es
precision highp float;in vec2 tex;uniform sampler2D diffuse;uniform float cutoff;
void main(){if(cutoff>0.&&texture(diffuse,tex).a<cutoff)discard;}`]]){const s=g.createShader(type);g.shaderSource(s,text);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));g.attachShader(program,s);g.deleteShader(s);}
  g.linkProgram(program);if(!g.getProgramParameter(program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(program));this.program=program;this.u=Object.fromEntries(['matrix','minimum','span','absolutePosition','diffuse','cutoff'].map(k=>[k,g.getUniformLocation(program,k)]));
  for(let i=0;i<2;i++){const t={fbo:g.createFramebuffer(),texture:g.createTexture()};this.targets.push(t);g.bindTexture(g.TEXTURE_2D,t.texture);g.texImage2D(g.TEXTURE_2D,0,g.DEPTH_COMPONENT24,2048,2048,0,g.DEPTH_COMPONENT,g.UNSIGNED_INT,null);for(const [k,v] of [[g.TEXTURE_MIN_FILTER,g.NEAREST],[g.TEXTURE_MAG_FILTER,g.NEAREST],[g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE],[g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE]])g.texParameteri(g.TEXTURE_2D,k,v);g.bindFramebuffer(g.FRAMEBUFFER,t.fbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.TEXTURE_2D,t.texture,0);g.drawBuffers([g.NONE]);g.readBuffer(g.NONE);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('World shadow target unavailable');}
  g.bindFramebuffer(g.FRAMEBUFFER,null);g.bindTexture(g.TEXTURE_2D,null);
 }
 update(track,origin,sun,translation,visualY){
  const g=this.gl,revision=track.models;
  if(sun[2]<.035)return;
  if(this.job&&this.job.revision!==revision)this.job=null;
  if(!this.job&&shadowNeedsUpdate(this.active,origin,sun,revision)){
   const camera=shadowCamera(mat4.create(),origin,sun,2048,160);camera.revision=revision;camera.targetIndex=this.active?.targetIndex===0?1:0;
   const model=mat4.fromTranslation(mat4.create(),translation.map((v,i)=>v-camera.origin[i]));mat4.scale(model,model,[1,visualY,1]);
   const matrix=mat4.multiply(mat4.create(),camera.matrix,model),commands=[];
   const dataCamera={...camera,matrix,origin:[0,0,0]};
   for(const mesh of track.models)if(inShadowBounds([...mesh.boundsMin,...mesh.boundsMax],dataCamera))for(const group of mesh.groups)if(group.alphaMode!=='blend')for(let offset=0;offset<group.count;offset+=24576)commands.push({mesh,group,offset,count:Math.min(24576,group.count-offset)});
   this.job={camera,matrix,commands,index:0,revision};g.bindFramebuffer(g.FRAMEBUFFER,this.targets[camera.targetIndex].fbo);g.depthMask(true);g.clearDepth(1);g.clear(g.DEPTH_BUFFER_BIT);
  }
  const j=this.job;if(!j)return;
  g.activeTexture(g.TEXTURE12);g.bindTexture(g.TEXTURE_2D,null);g.bindFramebuffer(g.FRAMEBUFFER,this.targets[j.camera.targetIndex].fbo);g.viewport(0,0,2048,2048);g.disable(g.BLEND);g.disable(g.CULL_FACE);g.enable(g.DEPTH_TEST);g.depthMask(true);g.useProgram(this.program);g.uniformMatrix4fv(this.u.matrix,false,j.matrix);g.uniform1i(this.u.diffuse,0);g.activeTexture(g.TEXTURE0);g.bindSampler(0,null);
  const start=performance.now();let vertices=0,draws=0;
  while(j.index<j.commands.length&&vertices<196608&&draws<64&&(draws===0||performance.now()-start<1.5)){
   const {mesh,group,offset,count}=j.commands[j.index++];g.bindVertexArray(mesh.vao);g.uniform3fv(this.u.minimum,mesh.minimum);g.uniform3fv(this.u.span,mesh.span);g.uniform1f(this.u.absolutePosition,mesh.absolutePositions?1:0);g.bindTexture(g.TEXTURE_2D,track._textureFor(group.textures.diffuse)||track._fallbackTexture);g.uniform1f(this.u.cutoff,group.alphaMode==='cutout'?(group.properties.ksalpharef??.5):0);g.drawElements(g.TRIANGLES,count,g.UNSIGNED_INT,(group.offset+offset)*4);vertices+=count;draws++;
  }
  this.stats.pending=j.commands.length-j.index;
  if(!this.stats.pending){this.active=j.camera;this.job=null;this.stats.ready=true;this.stats.updates++;}
  g.bindVertexArray(null);g.bindFramebuffer(g.FRAMEBUFFER,null);
 }
 sample(origin,sun){const a=this.active;return {texture:this.targets[a?.targetIndex||0]?.texture,ready:!!a&&sun[2]>.035&&Math.hypot(...origin.map((v,i)=>v-a.center[i]))<130,matrix:a?mat4.translate(mat4.create(),a.matrix,origin.map((v,i)=>v-a.origin[i])):mat4.create()};}
 dispose(){const g=this.gl;g.deleteProgram(this.program);for(const t of this.targets){g.deleteTexture(t.texture);g.deleteFramebuffer(t.fbo);}this.targets=[];this.job=null;}
}
