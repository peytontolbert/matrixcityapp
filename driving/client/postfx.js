import {PostFxRenderer} from '../vendor/js/postfx_renderer.js';
import {mat4} from 'gl-matrix';
// City HDR, asynchronous exposure, bloom and temporal reconstruction.
export class PostFX extends PostFxRenderer {
 constructor(gl){super(gl);this.enabled=true;this.exposure=1;this.avgLum=1.35;this.enableBloom=true;this.bloomThreshold=1.2;this.bloomStrength=.12;this.enableAutoExposure=true;this.sampleableDepth=!!gl.getExtension('EXT_color_buffer_float');this.temporalEnabled=this.sampleableDepth;}
 begin(w,h,camera,origin){
  if(!this.enabled||!this.ready)return false;
  if(this.temporalEnabled){
   if(this.temporal&&this.origin){const delta=origin.map((v,i)=>v-this.origin[i]);for(const key of ['previousVP','previousView'])if(this.temporal[key])mat4.translate(this.temporal[key],this.temporal[key],delta);}
   this.beginTemporal(camera,w,h,w,h);this.origin=[...origin];
  }
  try{return !!this.beginScene({w,h});}catch(e){this.error=e.message;this.temporal?.end();this.temporalEnabled=false;this.sampleableDepth=false;return !!this.beginScene({w,h});}
 }
 finish(w,h){for(let i=0;i<5;i++)this.gl.bindSampler(i,null);try{this.endScene({canvasW:w,canvasH:h});}finally{this.temporal?.end();}}
 dispose(){
  const g=this.gl;this.temporal?.destroy();this._asyncLuminance?.dispose();
  g.deleteTexture(this._scene.tex);g.deleteTexture(this._scene.motion);g.deleteFramebuffer(this._scene.fbo);
  if(this._scene.depthIsTexture)g.deleteTexture(this._scene.depth);else g.deleteRenderbuffer(this._scene.depth);
  for(const k of ['texA','texB'])g.deleteTexture(this._bloom[k]);for(const k of ['fboA','fboB'])g.deleteFramebuffer(this._bloom[k]);
  for(const t of this._lum.levels){g.deleteTexture(t.tex);g.deleteFramebuffer(t.fbo);}
  for(const p of [this._tonemapProg,this._bloomExtractProg,this._bloomBlurProg,this._lumExtractProg,this._lumDownProg])g.deleteProgram(p.program);g.deleteVertexArray(this._fsVao);
 }
}
