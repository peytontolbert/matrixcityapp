import {VehicleShadows} from './vehicle-shadows.js';
import {WeatherEffects} from './weather-effects.js';
import {WorldShadows} from './world-shadows.js';
import {DrivingEnvironment} from '../environment.js';
import {mat4} from 'gl-matrix';
import {TrackSceneRenderer,decode,fetchGzipArrayBuffer} from '../vendor/js/track_scene_renderer.js';
import {TRACK_FILES,ASSET_BASE} from '../world.js';
import {TRACKS} from '../bridge/coordinates.mjs';
import {Cars} from './cars.js';
import {SkyRenderer} from '../vendor/js/sky_renderer.js';
import {PostFX} from './postfx.js';
import {ChaseCamera} from './camera.js';
import {ContactShadows} from './contact-shadows.js';
import {ResolutionBudget} from './quality.js';
const bounds=e=>e.bounds?.min?e.bounds:{min:[e.bounds?.minX??-Infinity,e.bounds?.minY??-Infinity],max:[e.bounds?.maxX??Infinity,e.bounds?.maxY??Infinity]};
const distance=(e,p)=>{const b=bounds(e);return Math.hypot(Math.max(b.min[0]-p[0],0,p[0]-b.max[0]),Math.max(b.min[1]-p[1],0,p[1]-b.max[1]));};
export class DrivingRenderer {
 constructor(canvas,room,assets){this.canvas=canvas;this.room=room;this.assets=assets;this.gl=canvas.getContext('webgl2',{antialias:true});if(!this.gl)throw Error('WebGL 2 is required');this.track=new TrackSceneRenderer(this.gl);this.loaded=new Map();this.busy=false;this.camera=null;this.ready=false;}
 async init(position){
  const t=TRACKS[this.room].translation,cfg=TRACK_FILES[this.room];this.translation=t;this.cfg=cfg;
  const matrix=mat4.create();mat4.translate(matrix,matrix,t);mat4.scale(matrix,matrix,[1,cfg.visualY,1]);await this.track.init(matrix);this.assertActive();
  this.url=new URL(cfg.root+cfg.scene,ASSET_BASE);const r=await fetch(this.url);if(!r.ok)throw Error('Track scenery unavailable');this.scene=await r.json();if(!Array.isArray(this.scene.models))throw Error('Invalid scene');
  this.assertActive();this.sky=new SkyRenderer(this.gl);if(!await this.sky.init())throw Error('Sky shader unavailable');
  this.post=new PostFX(this.gl);try{await this.post.init();}catch(e){this.post.error=e.message;this.post.enabled=false;}
  this.weatherEffects=new WeatherEffects(this.gl);await this.weatherEffects.init();this.rainRoof=new WorldShadows(this.gl);this.rainRoof.init();this.environment=new DrivingEnvironment(this.room);this.worldShadows=new WorldShadows(this.gl);this.worldShadows.init();
  this.vehicleShadows=new VehicleShadows(this.gl);this.vehicleShadows.init();this.shadows=new ContactShadows(this.gl);this.shadows.init();this.cars=new Cars(this.gl,this.assets);await this.cars.init();this.assertActive();await this.focus(position);this.ready=true;
 }
 assertActive(){if(this.disposed){this.track.dispose();this.cars?.dispose();this.shadows?.dispose();throw Error('Join cancelled');}}
 async focus(position){
  if(this.busy||this.disposed)return;this.busy=true;
  try{
   const p=position.map((v,i)=>v-this.translation[i]);p[1]*=this.cfg.visualY;
   const wanted=this.scene.models.filter(e=>distance(e,p)<420).sort((a,b)=>distance(a,p)-distance(b,p));
   const metadata=[];for(const e of wanted){const u=new URL(e.file,this.url);metadata.push(u.href);if(!u.pathname.endsWith('.gz'))metadata.push(u.href+'.gz');const materialUrl=this.room==='nohesi-110'?new URL(u.href.replace('/exact-v2/scene/','/scene/')):u;for(const g of e.groups||[])for(const path of Object.values(g.textures||{diffuse:g.texture}))if(path)metadata.push(new URL(path,materialUrl).href);}
   await this.assets?.prefetch(metadata);this.assertActive();
   for(const e of wanted){
    if(this.loaded.has(e.file))continue;const url=new URL(e.file,this.url),data=decode(await fetchGzipArrayBuffer(url));this.assertActive();
    // Exact 110 geometry moved into exact-v2; material paths still refer to the
    // original scene texture directory. Preserve the authored texture base.
    const materialUrl=this.room==='nohesi-110'?new URL(url.href.replace('/exact-v2/scene/','/scene/')):url;
    const model=this.track._upload(data,e.groups,materialUrl,e.bounds,{source:e.source,file:e.file});this.loaded.set(e.file,{model,entry:e});this.track.models=[...this.track.models,model];
    await new Promise(resolve=>setTimeout(resolve,0));this.assertActive();
   }
   for(const [key,{model,entry}] of this.loaded)if(distance(entry,p)>650){
    this.track.models=this.track.models.filter(m=>m!==model);this.gl.deleteVertexArray(model.vao);for(const name of ['positionBuffer','normalBuffer','tangentBuffer','uvBuffer','indexBuffer'])this.gl.deleteBuffer(model[name]);for(const group of model.groups)this.track._pickRecords.delete(group.pickId);this.loaded.delete(key);
   }
   const used=new Set(this.track.models.flatMap(m=>m.groups.flatMap(g=>Object.values(g.textures))));
   for(const [url,texture] of this.track.textureCache)if(!used.has(url)){if(texture.texture)this.gl.deleteTexture(texture.texture);this.track.textureCache.delete(url);}
  }finally{this.busy=false;}
 }
 render(cars,you,dt=1/60){
  const g=this.gl,c=you||cars[0];if(!c)return;
  this.quality??=new ResolutionBudget();const scale=this.quality.sample(performance.now()),ratio=Math.min(devicePixelRatio,1.5)*scale;
  const w=Math.max(1,Math.round(this.canvas.clientWidth*ratio)),h=Math.max(1,Math.round(this.canvas.clientHeight*ratio));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  this.chase??=new ChaseCamera();const {eye,target}=this.chase.update(c,dt);this.camera=eye;
  // Subtract in double precision before any Float32 matrix multiplication.
  // The placed 415 track is over 50 km from the world origin.
  const origin=c.position,relative=p=>p.map((v,i)=>v-origin[i]),localEye=relative(eye);
  const localCars=cars.map(car=>({...car,position:relative(car.position)}));
  mat4.identity(this.track.modelMatrix);mat4.translate(this.track.modelMatrix,this.track.modelMatrix,relative(this.translation));mat4.scale(this.track.modelMatrix,this.track.modelMatrix,[1,this.cfg.visualY,1]);
  const view=mat4.lookAt(mat4.create(),localEye,relative(target),[0,0,1]),projection=mat4.perspective(mat4.create(),Math.PI/3,w/h,.15,2200),vp=mat4.multiply(mat4.create(),projection,view);
  const e=this.environment.update(this.nativeEnvironment,performance.now());
  this.worldShadows.update(this.track,origin,e.sun,this.translation,this.cfg.visualY);
  if(e.rain>.01)this.rainRoof.update(this.track,origin,[0,0,1],this.translation,this.cfg.visualY);
  this.weatherEffects.prepare(e,eye,target,projection,w,h);this.vehicleShadows.update(this.cars,localCars,e.sun);
  const camera={viewProjectionMatrix:vp,projectionMatrix:projection,viewMatrix:view,position:eye,fieldOfView:60};
  const post=this.post.begin(w,h,camera,origin);if(!post){g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,w,h);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);}
  const lighting={...e,origin,vehicleShadow:this.vehicleShadows,headlights:localCars.filter(car=>car.lights).sort((a,b)=>Math.hypot(...a.position)-Math.hypot(...b.position)).slice(0,8),cloudShadow:this.weatherEffects.clouds,roof:this.rainRoof.sample(origin,[0,0,1]),eye:localEye,linear:post,shadow:this.worldShadows.sample(origin,e.sun)};this.track.environment=lighting;this.cars.environment=lighting;this.cars.origin=origin;
  const sun=e.sun,sunDir=[view[0]*sun[0]+view[4]*sun[1]+view[8]*sun[2],view[1]*sun[0]+view[5]*sun[1]+view[9]*sun[2],-(view[2]*sun[0]+view[6]*sun[1]+view[10]*sun[2])];
  g.disable(g.BLEND);g.disable(g.CULL_FACE);g.bindVertexArray(null);
  this.sky.render({sunDir,sunColor:e.sunColor,sunIntensity:1-e.cloud*.85,topColor:e.ambient.map((v,i)=>v*([.6,.8,1.3][i])*(1-e.cloud*.2)),bottomColor:e.ambient.map(v=>v*1.7),moonIntensity:(1-e.daylight)*.1,starIntensity:(1-e.daylight)*(1-e.cloud),fastStateRestore:true});
  this.weatherEffects.sky(post);this.track.render(vp);this.shadows.render(vp,localCars,localEye);this.cars.render(vp,localCars,localEye,dt);
  this.weatherEffects.precipitation(e,vp,localEye,lighting.roof);
  if(post)this.post.finish(w,h);
  this.frames=(this.frames||0)+1;if(this.frames%120===0)this.gpuError=g.getError();
  this.canvas.dataset.renderStatus=JSON.stringify({cars:this.cars.stats,hdr:this.post._scene.isHdr,temporal:this.post.temporal?.diagnostics,worldShadows:this.worldShadows.stats,vehicleShadows:this.vehicleShadows.stats,clouds:this.weatherEffects.clouds.stats,weather:e.weather,rain:e.rain,postProcessing:post,postError:this.post.error||null,sky:this.sky.ready,frames:this.frames,gpuError:this.gpuError||0,fps:Math.round(this.quality.fps),resolutionScale:scale});
  this.canvas.dataset.textureStatus=JSON.stringify({ready:[...this.track.textureCache.values()].filter(t=>t.ready).length,failed:[...this.track.textureCache.values()].filter(t=>t.failed).length});
 }
 dispose(){this.disposed=true;this.ready=false;this.track.dispose();this.cars?.dispose();this.sky?.dispose();this.post?.dispose();this.worldShadows?.dispose();this.vehicleShadows?.dispose();this.rainRoof?.dispose();this.weatherEffects?.dispose();this.shadows?.dispose();this.loaded.clear();}
}
