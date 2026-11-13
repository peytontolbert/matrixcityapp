import {mat4} from 'gl-matrix';
import {shadowCamera} from '../vendor/js/shadow-math.js';
import {vehicleMatrix} from './vehicle-pose.js';
// Moving casters use a small independent map; scenery keeps its amortized map.
export class VehicleShadows {
 constructor(gl){this.gl=gl;this.stats={cars:0,draws:0};}
 init(){
  const g=this.gl;this.program=g.createProgram();
  for(const [type,source] of [[g.VERTEX_SHADER,`#version 300 es
layout(location=0)in vec3 p;layout(location=2)in vec2 uv;
uniform mat4 matrix;uniform vec3 minimum,extent;out vec2 tex;
void main(){tex=uv;gl_Position=matrix*vec4(minimum+p*extent,1.);}`],[g.FRAGMENT_SHADER,`#version 300 es
precision highp float;uniform sampler2D diffuse;uniform float cutoff;in vec2 tex;
void main(){if(cutoff>0.&&texture(diffuse,tex).a<cutoff)discard;}`]]){
   const s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));g.attachShader(this.program,s);g.deleteShader(s);
  }
  g.linkProgram(this.program);if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(this.program));
  this.u=Object.fromEntries(['matrix','minimum','extent','diffuse','cutoff'].map(k=>[k,g.getUniformLocation(this.program,k)]));
  this.texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.texture);g.texImage2D(g.TEXTURE_2D,0,g.DEPTH_COMPONENT24,1024,1024,0,g.DEPTH_COMPONENT,g.UNSIGNED_INT,null);
  for(const [k,v]of [[g.TEXTURE_MIN_FILTER,g.NEAREST],[g.TEXTURE_MAG_FILTER,g.NEAREST],[g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE],[g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE]])g.texParameteri(g.TEXTURE_2D,k,v);
  this.fbo=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,this.fbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.TEXTURE_2D,this.texture,0);g.drawBuffers([g.NONE]);g.readBuffer(g.NONE);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Vehicle shadows unavailable');g.bindFramebuffer(g.FRAMEBUFFER,null);g.bindTexture(g.TEXTURE_2D,null);
 }
 update(renderer,cars,sun){
  this.ready=sun[2]>.035;this.stats={cars:0,draws:0};if(!this.ready)return;
  const g=this.gl,u=this.u;this.matrix=shadowCamera(mat4.create(),[0,0,0],sun,1024,70).matrix;
  g.activeTexture(g.TEXTURE15);g.bindTexture(g.TEXTURE_2D,null);g.bindFramebuffer(g.FRAMEBUFFER,this.fbo);g.viewport(0,0,1024,1024);g.depthMask(true);g.clearDepth(1);g.clear(g.DEPTH_BUFFER_BIT);g.disable(g.BLEND);g.disable(g.CULL_FACE);g.enable(g.DEPTH_TEST);g.useProgram(this.program);g.uniform1i(u.diffuse,0);g.activeTexture(g.TEXTURE0);g.bindSampler(0,null);
  const distance=c=>Math.hypot(...c.position);
  for(const car of cars.filter(c=>distance(c)<65).sort((a,b)=>distance(a)-distance(b)).slice(0,8)){
   const model=renderer.models.get(car.model);if(!model)continue;this.stats.cars++;
   g.uniformMatrix4fv(u.matrix,false,mat4.multiply(mat4.create(),this.matrix,vehicleMatrix(car,model.lift)));
   for(const row of model.rows){if(row.material.alphaMode==='blend')continue;g.bindVertexArray(row.vao);g.uniform3fv(u.minimum,row.mesh.positionMin||[0,0,0]);g.uniform3fv(u.extent,row.mesh.positionExtent||[1,1,1]);g.bindTexture(g.TEXTURE_2D,row.texture);g.uniform1f(u.cutoff,row.material.alphaMode==='cutout'?.5:0);g.drawElements(g.TRIANGLES,row.mesh.indexCount,row.mesh.indexType,0);this.stats.draws++;}
  }
  g.bindVertexArray(null);g.bindFramebuffer(g.FRAMEBUFFER,null);
 }
 dispose(){const g=this.gl;g.deleteTexture(this.texture);g.deleteFramebuffer(this.fbo);g.deleteProgram(this.program);}
}
