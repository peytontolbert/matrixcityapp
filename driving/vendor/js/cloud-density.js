// The sky, reflected clouds and ground shadows sample one world-space density field.
export const CLOUD_DENSITY_GLSL=`
uniform sampler3D uCloudNoise;
uniform vec4 uCloudWeather; // coverage, base altitude, top altitude, elapsed seconds
uniform vec2 uCloudWind;
float cloudNoise(vec3 p,float scale,float footprint,bool detail){
 float lod=clamp(log2(max(1.,footprint*64./scale)),0.,6.);
 vec2 n=textureLod(uCloudNoise,p/scale,lod).rg;
 return detail?n.g:n.r;
}
float cloudDensityFiltered(vec3 p,float footprint){
 float h=(p.y-uCloudWeather.y)/max(1.,uCloudWeather.z-uCloudWeather.y);
 if(h<=0.||h>=1.||uCloudWeather.x<.001)return 0.;
 p.xz-=uCloudWind*uCloudWeather.w;
 // Broad formations with smaller billows; unresolved detail is mip-filtered,
 // not sampled at LOD zero as kilometres-long march segments move through it.
 float shape=.65*cloudNoise(p,110000.,footprint,false)
            +.25*cloudNoise(p,38000.,footprint,true)
            +.10*cloudNoise(p,15000.,footprint,false);
 float threshold=mix(.76,.30,uCloudWeather.x);
 float width=.16+.10*smoothstep(400.,2200.,footprint);
 float body=smoothstep(threshold-width*.15,threshold+width,shape);
 float vertical=smoothstep(0.,.10,h)*(1.-smoothstep(.35+.4*body,.98,h));
 return body*vertical*.0028;
}
float cloudDensity(vec3 p){return cloudDensityFiltered(p,0.);}
vec2 cloudInterval(vec3 origin,vec3 direction){
 if(abs(direction.y)<.0001)return vec2(1.,0.);
 float a=(uCloudWeather.y-origin.y)/direction.y,b=(uCloudWeather.z-origin.y)/direction.y;
 return vec2(max(0.,min(a,b)),min(60000.,max(a,b)));
}
float cloudSunTransmission(vec3 origin,vec3 direction){
 vec2 t=cloudInterval(origin,direction);if(direction.y<.02||t.y<=t.x)return 1.;
 float optical=0.,ds=(t.y-t.x)/8.;
 for(int i=0;i<8;i++)optical+=cloudDensityFiltered(origin+direction*(t.x+(float(i)+.5)*ds),ds*.5)*ds;
 return exp(-optical);
}
`;
