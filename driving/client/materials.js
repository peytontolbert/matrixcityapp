import {LIGHTING_GLSL} from './lighting.js';
// State bits from City's assetto_car_materials.js. Published per-state masks
// retain the authored light geometry instead of tinting whole car materials.
export function emissionState(material,car){
 const state=(car.lights?1:0)|(car.brake>.01?2:0)|(car.gear===-1?4:0);
 const states=material.assettoEmissionStates;
 return states?.[states.length>4?state:state&3]||{};
}
export const carVertex=`#version 300 es
layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec2 uv;
layout(location=4) in mat4 batchModel;layout(location=8) in mat4 batchPrevious;layout(location=12) in float batchHistory;
uniform bool instanced;
uniform mat4 vp,model,previousModel,previousVP,previousView,unjitteredVP;
uniform float historyValid;
out vec4 oldClip,currentClip;out float oldDepth,validMotion;uniform vec3 minimum,extent;
out vec3 normal,world;out vec2 tex;
void main(){mat4 current=instanced?batchModel:model;vec4 w=current*vec4(minimum+p*extent,1.);world=w.xyz;normal=mat3(current)*n;tex=uv;gl_Position=vp*w;vec4 old=(instanced?batchPrevious:previousModel)*vec4(minimum+p*extent,1.);oldClip=previousVP*old;currentClip=unjitteredVP*w;oldDepth=-(previousView*old).z;validMotion=instanced?batchHistory:historyValid;}`;
export const carFragment=`#version 300 es
precision highp float;
in vec4 oldClip,currentClip;in float oldDepth,validMotion;
in vec3 normal,world;in vec2 tex;
uniform sampler2D diffuse,normalMap,emissionMap;
uniform vec3 color,eye;
uniform float alpha,useAlpha,useTexture,useNormal,useEmission,emissionGain,roughness,f0,normalAG,reconstructZ;
${LIGHTING_GLSL}
layout(location=0) out vec4 frag;
layout(location=1) out vec4 motion;
void main(){
 vec4 t=mix(vec4(1.),texture(diffuse,tex),useTexture);float opacity=mix(1.,t.a*alpha,useAlpha);if(opacity<.06)discard;
 vec3 n=normalize(normal);
 if(useNormal>.5){
  vec3 dx=dFdx(world),dy=dFdy(world);vec2 ux=dFdx(tex),uy=dFdy(tex);
  float det=ux.x*uy.y-ux.y*uy.x;
  if(abs(det)>.000001){vec3 tangent=(dx*uy.y-dy*ux.y)/det;tangent-=n*dot(n,tangent);
   if(dot(tangent,tangent)>.000001){tangent=normalize(tangent);vec3 bitangent=normalize(cross(n,tangent))*sign(det);
    vec4 map=texture(normalMap,tex);vec3 mapped=map.rgb*2.-1.;mapped.x=mix(mapped.x,map.a*2.-1.,normalAG);if(reconstructZ>.5)mapped.z=sqrt(max(0.,1.-dot(mapped.xy,mapped.xy)));n=normalize(mat3(tangent,bitangent,n)*mapped);}
  }
 }
 vec3 light=normalize(sun),view=normalize(eye-world),halfway=normalize(light+view);
 float ndl=max(0.,dot(n,light)),fresnel=f0+(1.-f0)*pow(1.-max(0.,dot(n,view)),5.);
 float spec=pow(max(0.,dot(n,halfway)),mix(180.,8.,roughness))*fresnel*ndl;
 vec3 linearColor=pow(max(t.rgb*color,vec3(0.)),vec3(2.2))*(ambient+headlights(world,n)+sunColor*.65*ndl*visibility(world,n))+sunColor*spec*.6*visibility(world,n);
 linearColor+=pow(texture(emissionMap,tex).rgb,vec3(2.2))*useEmission*emissionGain;
 frag=vec4(outputColor(atmosphere(linearColor,world)),opacity);
 motion=validMotion>.5&&oldClip.w>0.&&currentClip.w>0.?vec4((oldClip.xy/oldClip.w-currentClip.xy/currentClip.w)*.5,oldDepth,opacity<.99?.8:0.):vec4(0.,0.,0.,1.);
}`;
