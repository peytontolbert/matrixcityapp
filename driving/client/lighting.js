// Shared linear-light contract for track and vehicles, adapted from City.
export const LIGHTING_GLSL=`
uniform vec3 sun, sunColor, ambient, cameraEye;
uniform float wetness, haze, linearOutput;
uniform sampler2D worldShadow,cloudShadow,roofShadow,vehicleShadow;
uniform mat4 vehicleShadowMatrix;uniform float vehicleShadowReady;
uniform vec3 headPosition[8],headDirection[8];uniform int headCount;
vec3 headlights(vec3 p,vec3 n){vec3 light=vec3(0.);for(int i=0;i<8;i++){if(i>=headCount)break;vec3 d=p-headPosition[i];float distance=length(d);float cone=smoothstep(.86,.975,dot(normalize(d),headDirection[i]));light+=vec3(1.,.94,.82)*cone*max(0.,dot(n,-normalize(d)))*180./(1.+distance*distance);}return min(light,vec3(4.));}
float vehicleVisibility(vec3 position){if(vehicleShadowReady<.5)return 1.;vec3 p=(vehicleShadowMatrix*vec4(position,1.)).xyz*.5+.5;if(any(lessThanEqual(p,vec3(0.)))||any(greaterThanEqual(p,vec3(1.))))return 1.;float sum=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)sum+=step(p.z-.00014,texture(vehicleShadow,p.xy+vec2(x,y)/1024.).r)/9.;return sum;}

uniform vec2 cloudCenter;uniform vec3 worldOrigin;uniform mat4 roofMatrix;uniform float roofReady;
float rainExposure(vec3 p){if(roofReady<.5)return 1.;vec3 q=(roofMatrix*vec4(p+vec3(0.,0.,.3),1.)).xyz*.5+.5;return step(q.z-.0001,texture(roofShadow,q.xy).r);}
float clouds(vec3 p){vec2 uv=(vec2(p.x+worldOrigin.x,-p.y-worldOrigin.y)-cloudCenter)/4096.+.5;return texture(cloudShadow,uv).r;}
uniform mat4 worldShadowMatrix;
uniform float shadowReady;
float visibility(vec3 position,vec3 normal){
 if(shadowReady<.001)return vehicleVisibility(position)*clouds(position);vec3 p=(worldShadowMatrix*vec4(position,1.)).xyz*.5+.5;
 if(any(lessThanEqual(p,vec3(0.)))||any(greaterThanEqual(p,vec3(1.))))return 1.;
 float bias=.00010+.00028*(1.-max(0.,dot(normal,sun))),sum=0.;vec2 texel=1./vec2(textureSize(worldShadow,0));
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)sum+=step(p.z-bias,texture(worldShadow,p.xy+vec2(x,y)*texel).r)/9.;
 return vehicleVisibility(position)*clouds(position)*mix(1.,sum,shadowReady*smoothstep(0.,.12,min(min(p.x,p.y),min(1.-p.x,1.-p.y))));
}
vec3 atmosphere(vec3 color,vec3 position){float fog=1.-exp(-length(position-cameraEye)*haze);return mix(color,ambient*1.8,clamp(fog,0.,.92));}
vec3 outputColor(vec3 c){return linearOutput>.5?max(c,vec3(0.)):pow(max(c,vec3(0.)),vec3(1./2.2));}
`;
const locations=new WeakMap();
export function bindLighting(gl,program,environment){
 let u=locations.get(program);if(!u){u=Object.fromEntries(['sun','sunColor','ambient','cameraEye','wetness','haze','linearOutput','worldShadow','worldShadowMatrix','shadowReady','cloudShadow','cloudCenter','worldOrigin','roofShadow','roofMatrix','roofReady','vehicleShadow','vehicleShadowMatrix','vehicleShadowReady','headPosition[0]','headDirection[0]','headCount'].map(k=>[k,gl.getUniformLocation(program,k)]));locations.set(program,u);}
 const e=environment||{};const positions=new Float32Array(24),directions=new Float32Array(24);for(const [i,c] of (e.headlights||[]).entries()){const f=[Math.cos(c.heading),Math.sin(c.heading),-.04+(c.pitch||0)];const len=Math.hypot(...f);positions.set([c.position[0]+f[0]*1.8,c.position[1]+f[1]*1.8,c.position[2]+.65],i*3);directions.set(f.map(x=>x/len),i*3);}gl.uniform3fv(u['headPosition[0]'],positions);gl.uniform3fv(u['headDirection[0]'],directions);gl.uniform1i(u.headCount,(e.headlights||[]).length);
 gl.activeTexture(gl.TEXTURE15);gl.bindSampler(15,null);gl.bindTexture(gl.TEXTURE_2D,e.vehicleShadow?.texture||e.fallback);gl.uniform1i(u.vehicleShadow,15);gl.uniform1f(u.vehicleShadowReady,e.vehicleShadow?.ready?1:0);if(e.vehicleShadow?.matrix)gl.uniformMatrix4fv(u.vehicleShadowMatrix,false,e.vehicleShadow.matrix);gl.uniform3fv(u.sun,e.sun||[.4,-.5,1]);gl.uniform3fv(u.sunColor,e.sunColor||[1,1,1]);gl.uniform3fv(u.ambient,e.ambient||[.35,.4,.5]);gl.uniform3fv(u.cameraEye,e.eye||[0,0,0]);gl.uniform1f(u.wetness,e.wetness||0);gl.uniform1f(u.haze,e.haze||0);gl.uniform1f(u.linearOutput,e.linear?1:0);
 gl.activeTexture(gl.TEXTURE12);gl.bindSampler(12,null);gl.bindTexture(gl.TEXTURE_2D,e.shadow?.texture||e.fallback);gl.uniform1i(u.worldShadow,12);gl.uniform1f(u.shadowReady,e.shadow?.ready?1:0);if(e.shadow?.matrix)gl.uniformMatrix4fv(u.worldShadowMatrix,false,e.shadow.matrix);gl.activeTexture(gl.TEXTURE13);gl.bindSampler(13,null);gl.bindTexture(gl.TEXTURE_2D,e.cloudShadow?.shadow?.texture||e.fallback);gl.uniform1i(u.cloudShadow,13);gl.uniform2fv(u.cloudCenter,e.cloudShadow?.center||[0,0]);gl.uniform3fv(u.worldOrigin,e.origin||[0,0,0]);
 gl.activeTexture(gl.TEXTURE14);gl.bindSampler(14,null);gl.bindTexture(gl.TEXTURE_2D,e.roof?.texture||e.fallback);gl.uniform1i(u.roofShadow,14);gl.uniform1f(u.roofReady,e.roof?.ready?1:0);if(e.roof?.matrix)gl.uniformMatrix4fv(u.roofMatrix,false,e.roof.matrix);gl.activeTexture(gl.TEXTURE0);
}
