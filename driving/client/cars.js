import {vehicle as vehicleDefinition,DEFAULT_MODEL,TRAFFIC_MODEL} from '../vehicles.js';
import {vehicleMatrix} from './vehicle-pose.js';
import {bindLighting} from './lighting.js';
import {carVertex,carFragment,emissionState} from './materials.js';
import {canRoll,wheelMatrix,WHEEL_TAGS} from './wheels.js';
import {mat4} from 'gl-matrix';
import {prepareMesh} from './mesh-prepare.js';
import {fetchArrayBufferPreferredCompressed} from '../vendor/js/asset_fetcher.js';
import {ASSET_BASE} from '../world.js';
import {extractFrustumPlanes,aabbIntersectsFrustum} from '../vendor/js/frustum_culling.js';
export class Cars {
 constructor(gl,assets){this.gl=gl;this.assets=assets;this.models=new Map();this.jobs=new Map();this.textures=new Map();this.resources=[];this.animation=new Map();this.history=new Map();}
 async init(model=DEFAULT_MODEL){
  const gl=this.gl,shader=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=shader(gl.VERTEX_SHADER,carVertex),fs=shader(gl.FRAGMENT_SHADER,carFragment);
  this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error('Vehicle shader failed');
  this.uniforms=Object.fromEntries(['instanced','previousModel','previousVP','previousView','unjitteredVP','historyValid','vp','model','minimum','extent','diffuse','color','alpha','useAlpha','useTexture','normalMap','emissionMap','eye','useNormal','useEmission','emissionGain','roughness','f0','normalAG','reconstructZ'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
  this.instanceBuffer=gl.createBuffer();this.resources.push(['buffer',this.instanceBuffer]);
  await this.ensureModels([model,TRAFFIC_MODEL]);
 }
 async ensureModels(models){for(const model of new Set(models)){if(this.models.has(model))continue;if(!this.jobs.has(model))this.jobs.set(model,this.loadModel(model));await this.jobs.get(model);}}
 async loadModel(model){
  const gl=this.gl,path=model===TRAFFIC_MODEL?'matrixgames/prius.json':vehicleDefinition(model).manifest,lift=model===TRAFFIC_MODEL?.50342:vehicleDefinition(model).groundOffset;
   const response=await fetch(new URL(path,ASSET_BASE));if(!response.ok)throw Error('Car manifest unavailable');const manifest=await response.json(),vehicle=manifest.vehicle||manifest.trafficModels?.prius,definition=manifest.meshes[vehicle.hash];
   // The published Prius medium LOD still references two retired meshes.
   // Its complete high LOD is published and hash-verified in the shared catalog.
   const highSubmeshes=(manifest.trafficModels?definition.lods.high:(definition.lods.med||definition.lods.high)).submeshes;
   const lowSubmeshes=manifest.trafficModels&&this.assets?await Promise.all(definition.lods.low.submeshes.map(async(sub,i)=>(await this.assets.describe('models/'+sub.file))?sub:highSubmeshes[i])):null;
   const meshRows=new Map();
   for(const [lod,submeshes] of [['high',highSubmeshes],...(lowSubmeshes?[['low',lowSubmeshes]]:[])]){
   await this.assets?.prefetch(submeshes.flatMap(sub=>{const mesh=new URL('models/'+sub.file,ASSET_BASE).href;return [mesh,...(mesh.endsWith('.gz')?[]:[mesh+'.gz']),...[sub.material?.diffuse,sub.material?.normal,...(sub.material?.assettoEmissionStates||[]).map(s=>s.emissive)].filter(Boolean).map(p=>new URL(p,ASSET_BASE).href)];}));
   const rows=[];
   for(let i=0;i<submeshes.length;i+=4){const results=await Promise.allSettled(submeshes.slice(i,i+4).map(async sub=>{
    if(meshRows.has(sub.file)){rows.push(meshRows.get(sub.file));return;}
    const url=new URL('models/'+sub.file,ASSET_BASE),prepared=prepareMesh(sub.file,await fetchArrayBufferPreferredCompressed(url));if(!prepared)throw Error('Invalid car mesh');
    if(this.disposed)throw Error('Join cancelled');const vao=gl.createVertexArray();gl.bindVertexArray(vao);this.resources.push(['vao',vao]);
    for(const [name,data,loc,size,type,normalized,stride] of prepared.specs){
     if(!data||loc>2)continue;const buffer=gl.createBuffer();this.resources.push(['buffer',buffer]);const target=loc<0?gl.ELEMENT_ARRAY_BUFFER:gl.ARRAY_BUFFER;gl.bindBuffer(target,buffer);gl.bufferData(target,data,gl.STATIC_DRAW);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,normalized,stride,0);}
    }
    const material=sub.material||{},texture=material.diffuse?await this.texture(new URL(material.diffuse,ASSET_BASE).href):null;
    const normal=material.normal?await this.texture(new URL(material.normal,ASSET_BASE).href):null,emissions=new Map();for(const state of material.assettoEmissionStates||[])if(state.emissive&&!emissions.has(state.emissive))emissions.set(state.emissive,await this.texture(new URL(state.emissive,ASSET_BASE).href));
    const row={normal,emissions,vao,mesh:prepared.mesh,material,texture,tag:sub.fragmentBoneTag,pivot:sub.fragmentPivot,canRoll:canRoll(sub.bounds)};meshRows.set(sub.file,row);rows.push(row);
   }));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
   if(lod==='high'){rows.forEach((row,index)=>row.historyKey=index);this.models.set(model,{rows,lift:vehicle.groundOffset??lift,wheelRadius:vehicle.wheelRadius||.325,wheelPivots:vehicle.wheelPivots||{}});}else this.models.get(model).lowRows=rows;
   }
 }
 async texture(url){
  if(this.textures.has(url))return this.textures.get(url);
  const job=(async()=>{const r=await fetch(url);if(!r.ok)throw Error('Car texture unavailable');const bitmap=await createImageBitmap(await r.blob(),{imageOrientation:'flipY'});if(this.disposed){bitmap.close();throw Error('Join cancelled');}const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,bitmap);bitmap.close();g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.generateMipmap(g.TEXTURE_2D);this.resources.push(['texture',t]);return t;})();this.textures.set(url,job);return job;
 }
 render(vp,cars,eye,dt=1/60){
  const live=new Set(cars.map(c=>c.id));for(const id of this.animation.keys())if(!live.has(id))this.animation.delete(id);
  for(const car of cars){const a=this.animation.get(car.id)||{spin:0,position:car.position};const teleport=Math.hypot(...car.position.map((v,i)=>v-a.position[i]))>30;const speed=car.velocity[0]*Math.cos(car.heading)+car.velocity[1]*Math.sin(car.heading);a.spin=teleport?0:(a.spin-speed*dt/(this.models.get(car.model)?.wheelRadius||.325))%(Math.PI*2);a.position=car.position;this.animation.set(car.id,a);}
  const frame=this.gl.__temporalFrame;const delta=(this.lastOrigin||this.origin||[0,0,0]).map((v,i)=>v-(this.origin?.[i]||0));const nextHistory=new Map();
  const planes=extractFrustumPlanes(vp);
  cars=cars.filter(c=>aabbIntersectsFrustum(planes,c.position.map(v=>v-4),c.position.map(v=>v+4)));
  const distance=c=>Math.hypot(...c.position.map((v,i)=>v-eye[i]));
  const sorted=[...cars].sort((a,b)=>distance(b)-distance(a));
  const distant=cars.filter(c=>c.kind==='traffic'&&distance(c)>55),batched=new Set(distant.map(c=>c.id));this.stats={visible:cars.length,instanced:distant.length,draws:0};
  const g=this.gl,u=this.uniforms;g.useProgram(this.program);bindLighting(g,this.program,this.environment);g.uniformMatrix4fv(u.vp,false,vp);g.uniform1i(u.diffuse,0);g.uniform1i(u.normalMap,1);g.uniform1i(u.emissionMap,2);g.uniform3fv(u.eye,eye);g.uniformMatrix4fv(u.previousVP,false,frame?.previousVP||vp);g.uniformMatrix4fv(u.previousView,false,frame?.previousView||mat4.create());g.uniformMatrix4fv(u.unjitteredVP,false,frame?.vp||vp);for(let i=0;i<3;i++)g.bindSampler(i,null);g.disable(g.CULL_FACE);g.enable(g.DEPTH_TEST);
  g.uniform1i(u.instanced,0);
  for(const transparent of [false,true]){
   if(transparent){g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);}else{g.disable(g.BLEND);g.depthMask(true);}
   for(const car of transparent?sorted:cars){if(!transparent&&batched.has(car.id))continue;const def=this.models.get(car.model);if(!def)continue;const model=vehicleMatrix(car,def.lift);g.uniformMatrix4fv(u.model,false,model);
    for(const row of def.rows){const m=row.material;if((m.alphaMode==='blend')!==transparent)continue;const pivot=row.pivot||def.wheelPivots[row.tag];const transform=pivot&&WHEEL_TAGS.includes(row.tag)?wheelMatrix(model,pivot,row.tag,this.animation.get(car.id).spin,car.steeringRad||0,row.canRoll):model;g.uniformMatrix4fv(u.model,false,transform);const key=car.id+':'+row.historyKey,previous=this.history.get(key);const old=previous?mat4.clone(previous):mat4.clone(transform);if(previous){old[12]+=delta[0];old[13]+=delta[1];old[14]+=delta[2];}g.uniformMatrix4fv(u.previousModel,false,old);g.uniform1f(u.historyValid,frame?.historyValid&&previous&&Math.hypot(old[12]-transform[12],old[13]-transform[13],old[14]-transform[14])<10?1:0);nextHistory.set(key,mat4.clone(transform));g.bindVertexArray(row.vao);g.uniform3fv(u.minimum,row.mesh.positionMin||[0,0,0]);g.uniform3fv(u.extent,row.mesh.positionExtent||[1,1,1]);g.uniform3fv(u.color,m.baseColor?.slice(0,3)||[1,1,1]);g.uniform1f(u.useAlpha,m.alphaMode==='opaque'||!m.alphaMode?0:1);g.uniform1f(u.alpha,transparent?(m.alphaScale??.4):1);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,row.texture);g.uniform1f(u.useTexture,row.texture?1:0);g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,row.normal||row.texture);g.uniform1f(u.useNormal,row.normal?1:0);g.uniform1f(u.normalAG,m.normalSwizzle==='ag'?1:0);g.uniform1f(u.reconstructZ,m.normalReconstructZ?1:0);const emission=emissionState(m,car),light=row.emissions.get(emission.emissive);g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,light||row.texture);g.uniform1f(u.useEmission,light?1:0);g.uniform1f(u.emissionGain,Math.min(4,emission.emissiveIntensity||0));g.uniform1f(u.roughness,Math.min(1,Math.max(.04,m.assettoRoughness??.6)));g.uniform1f(u.f0,Math.min(1,Math.max(0,m.assettoF0??.04)));g.drawElements(g.TRIANGLES,row.mesh.indexCount,row.mesh.indexType,0);this.stats.draws++;}
   }
   if(!transparent)this.renderBatches(distant,frame,delta,nextHistory);
  }g.depthMask(true);g.disable(g.BLEND);this.history=nextHistory;this.lastOrigin=[...(this.origin||[0,0,0])];
 }
 renderBatches(cars,frame,delta,nextHistory){
  const g=this.gl,u=this.uniforms,groups=new Map();
  for(const car of cars){const key=car.model+':'+((car.lights?1:0)|(car.brake>.01?2:0)|(car.gear===-1?4:0));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(car);}
  g.uniform1i(u.instanced,1);
  for(const group of groups.values()){
   const def=this.models.get(group[0].model);if(!def)continue;const data=new Float32Array(group.length*33);
   group.forEach((car,i)=>{const model=vehicleMatrix(car,def.lift),key=car.id+':batch',previous=this.history.get(key),old=mat4.clone(previous||model);if(previous){old[12]+=delta[0];old[13]+=delta[1];old[14]+=delta[2];}data.set(model,i*33);data.set(old,i*33+16);data[i*33+32]=frame?.historyValid&&previous&&Math.hypot(old[12]-model[12],old[13]-model[13],old[14]-model[14])<10?1:0;nextHistory.set(key,mat4.clone(model));});
   g.bindBuffer(g.ARRAY_BUFFER,this.instanceBuffer);g.bufferData(g.ARRAY_BUFFER,data,g.STREAM_DRAW);
   for(const row of def.lowRows||def.rows){const m=row.material;if(m.alphaMode==='blend')continue;g.bindVertexArray(row.vao);
    for(let j=0;j<9;j++){const loc=4+j;g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,j===8?1:4,g.FLOAT,false,132,j*16);g.vertexAttribDivisor(loc,1);}
    g.uniform3fv(u.minimum,row.mesh.positionMin||[0,0,0]);g.uniform3fv(u.extent,row.mesh.positionExtent||[1,1,1]);g.uniform3fv(u.color,m.baseColor?.slice(0,3)||[1,1,1]);g.uniform1f(u.useAlpha,m.alphaMode==='opaque'||!m.alphaMode?0:1);g.uniform1f(u.alpha,1);
    g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,row.texture);g.uniform1f(u.useTexture,row.texture?1:0);g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,row.normal||row.texture);g.uniform1f(u.useNormal,row.normal?1:0);g.uniform1f(u.normalAG,m.normalSwizzle==='ag'?1:0);g.uniform1f(u.reconstructZ,m.normalReconstructZ?1:0);
    const emission=emissionState(m,group[0]),light=row.emissions.get(emission.emissive);g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,light||row.texture);g.uniform1f(u.useEmission,light?1:0);g.uniform1f(u.emissionGain,Math.min(4,emission.emissiveIntensity||0));g.uniform1f(u.roughness,Math.min(1,Math.max(.04,m.assettoRoughness??.6)));g.uniform1f(u.f0,Math.min(1,Math.max(0,m.assettoF0??.04)));
    g.drawElementsInstanced(g.TRIANGLES,row.mesh.indexCount,row.mesh.indexType,0,group.length);this.stats.draws++;
    for(let j=4;j<=12;j++){g.disableVertexAttribArray(j);g.vertexAttribDivisor(j,0);}
   }
  }g.uniform1i(u.instanced,0);
 }
 dispose(){this.disposed=true;const g=this.gl;for(const [kind,item] of this.resources){if(kind==='vao')g.deleteVertexArray(item);else if(kind==='buffer')g.deleteBuffer(item);else g.deleteTexture(item);}this.resources=[];this.models.clear();this.textures.clear();this.animation.clear();if(this.program)g.deleteProgram(this.program);this.program=null;}
}
