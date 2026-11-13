import {mat4} from 'gl-matrix';
import {CloudVolume} from '../vendor/js/cloud-volume.js';
import {program} from '../vendor/js/gl_util.js';
const full=`#version 300 es
out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
export class WeatherEffects {
 constructor(gl){this.gl=gl;this.clouds=new CloudVolume(gl);}
 async init(){
  await this.clouds.init();const g=this.gl;
  this.composite=program(g,full,`#version 300 es
precision highp float;in vec2 uv;uniform sampler2D cloud;uniform bool linearOutput;
layout(location=0) out vec4 color;layout(location=1) out vec4 motion;
void main(){color=texture(cloud,uv);if(!linearOutput)color.rgb=pow(max(color.rgb,vec3(0.)),vec3(1./2.2));motion=vec4(0.,0.,0.,1.);}`);
  this.cloud=g.getUniformLocation(this.composite,'cloud');this.linear=g.getUniformLocation(this.composite,'linearOutput');this.vao=g.createVertexArray();
  this.rain=program(g,`#version 300 es
uniform mat4 vp;uniform vec3 center,wind;uniform float time;out float alpha;out vec3 world;
float hash(float n){return fract(sin(n*127.1)*43758.5453);}
void main(){float id=float(gl_VertexID/2),end=float(gl_VertexID%2);vec3 p=vec3(hash(id+1.)*60.-30.,hash(id+1024.)*60.-30.,mod(hash(id+2048.)*24.-time*16.,24.));p.xy+=wind.xy*p.z*.04;alpha=(1.-length(p.xy)/43.)*.25;p+=center;p.z+=end*.7;world=p;gl_Position=vp*vec4(p,1.);}`,`#version 300 es
precision highp float;in float alpha;in vec3 world;uniform float amount,roofReady;uniform mat4 roofMatrix;uniform sampler2D roofShadow;
layout(location=0) out vec4 color;layout(location=1) out vec4 motion;
void main(){vec3 q=(roofMatrix*vec4(world,1.)).xyz*.5+.5;if(roofReady>.5&&q.z>texture(roofShadow,q.xy).r+.0001)discard;color=vec4(.45,.55,.65,alpha*amount);motion=vec4(0.,0.,0.,1.);}`);
  this.rainU=Object.fromEntries(['vp','center','wind','time','amount','roofMatrix','roofShadow','roofReady'].map(n=>[n,g.getUniformLocation(this.rain,n)]));
 }
 prepare(e,eye,target,projection,w,h){
  const toCity=p=>[p[0],p[2],-p[1]],environment={...e,sun:toCity(e.sun),wind:[e.wind[0],-e.wind[1]]},cityEye=toCity(eye);
  const camera={position:cityEye,projectionMatrix:projection,viewMatrix:mat4.lookAt(mat4.create(),cityEye,toCity(target),[0,1,0])};
  this.clouds.updateShadow(environment,cityEye,performance.now());this.cloudTexture=this.clouds.render(environment,camera,w,h,{mat4});
 }
 sky(linear){const g=this.gl;g.disable(g.DEPTH_TEST);g.depthMask(false);g.enable(g.BLEND);g.blendFunc(g.ONE,g.ONE_MINUS_SRC_ALPHA);g.useProgram(this.composite);g.bindVertexArray(this.vao);g.activeTexture(g.TEXTURE0);g.bindSampler(0,null);g.bindTexture(g.TEXTURE_2D,this.cloudTexture);g.uniform1i(this.cloud,0);g.uniform1i(this.linear,linear?1:0);g.drawArrays(g.TRIANGLES,0,3);g.disable(g.BLEND);g.enable(g.DEPTH_TEST);g.depthMask(true);}
 precipitation(e,vp,eye,roof){if(e.rain<.01)return;const g=this.gl,u=this.rainU;g.useProgram(this.rain);g.activeTexture(g.TEXTURE14);g.bindSampler(14,null);g.bindTexture(g.TEXTURE_2D,roof.texture);g.uniform1i(u.roofShadow,14);g.uniform1f(u.roofReady,roof.ready?1:0);g.uniformMatrix4fv(u.roofMatrix,false,roof.matrix);g.bindVertexArray(this.vao);g.uniformMatrix4fv(u.vp,false,vp);g.uniform3fv(u.center,[eye[0],eye[1],eye[2]-3]);g.uniform3fv(u.wind,[...e.wind,0]);g.uniform1f(u.time,e.seconds);g.uniform1f(u.amount,e.rain);g.enable(g.DEPTH_TEST);g.depthMask(false);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.drawArrays(g.LINES,0,Math.floor(2048*e.rain)*2);g.disable(g.BLEND);g.depthMask(true);}
 dispose(){this.clouds.dispose();this.gl.deleteProgram(this.composite);this.gl.deleteProgram(this.rain);this.gl.deleteVertexArray(this.vao);}
}
