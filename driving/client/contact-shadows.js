import {mat4} from 'gl-matrix';
// Small depth-tested ground-contact shadows. They follow the authoritative road
// plane and disappear when airborne; they do not replace world shadow maps.
export class ContactShadows {
 constructor(gl){this.gl=gl;}
 init(){const g=this.gl,compile=(type,source)=>{const s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s;};
  const v=compile(g.VERTEX_SHADER,`#version 300 es
uniform mat4 vp,model;out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID==1||gl_VertexID==3)?1.:-1.,gl_VertexID>=2?1.:-1.);uv=p;gl_Position=vp*model*vec4(p*vec2(1.3,2.6),0.,1.);}`),f=compile(g.FRAGMENT_SHADER,`#version 300 es
precision highp float;in vec2 uv;layout(location=0) out vec4 frag;layout(location=1) out vec4 motion;void main(){float opacity=(1.-smoothstep(.25,1.,dot(uv,uv)))*.38;if(opacity<.01)discard;frag=vec4(0.,0.,0.,opacity);motion=vec4(0.,0.,0.,1.);}`);
  this.program=g.createProgram();g.attachShader(this.program,v);g.attachShader(this.program,f);g.linkProgram(this.program);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw Error('Contact shadow shader failed');this.vp=g.getUniformLocation(this.program,'vp');this.model=g.getUniformLocation(this.program,'model');this.vao=g.createVertexArray();
 }
 render(vp,cars,eye){const g=this.gl;g.useProgram(this.program);g.bindVertexArray(this.vao);g.uniformMatrix4fv(this.vp,false,vp);g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);
  for(const c of cars){if(c.kind==='native'||c.grounded===false||Math.hypot(...c.position.map((v,i)=>v-eye[i]))>160)continue;const m=mat4.create();mat4.translate(m,m,[c.position[0],c.position[1],c.position[2]+.035]);mat4.rotateZ(m,m,c.heading-Math.PI/2);mat4.rotateX(m,m,c.pitch||0);mat4.rotateY(m,m,c.roll||0);g.uniformMatrix4fv(this.model,false,m);g.drawArrays(g.TRIANGLE_STRIP,0,4);}
  g.depthMask(true);g.disable(g.BLEND);
 }
 dispose(){if(this.program)this.gl.deleteProgram(this.program);if(this.vao)this.gl.deleteVertexArray(this.vao);}
}
