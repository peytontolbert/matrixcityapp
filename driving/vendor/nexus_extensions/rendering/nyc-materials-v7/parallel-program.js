// Exact shader-object reuse only. Programs remain owner-local because the
// existing renderers cache uniform values per owner, not per shared program.
// Versioned imports share shader objects, while programs remain owner-local.
const shared=globalThis[Symbol.for('matrix.shaderObjects.v1')]??= {contexts:new WeakMap(),watched:new WeakSet()};
const {contexts,watched}=shared;
function cacheFor(g){let c=contexts.get(g);if(!c){c={extension:g.getExtension('KHR_parallel_shader_compile'),shaders:new Map(),stats:{programs:0,shaderCompiles:0,shaderReuses:0,polls:0}};contexts.set(g,c);if(!watched.has(g)&&g.canvas?.addEventListener){watched.add(g);g.canvas.addEventListener('webglcontextlost',()=>contexts.delete(g));}}return c;}
export async function waitForProgram(g,p){const c=cacheFor(g),start=performance.now();while(true){if(g.isContextLost()||contexts.get(g)!==c)throw Error('Context lost during shader compilation');if(!c.extension||g.getProgramParameter(p,c.extension.COMPLETION_STATUS_KHR))return c;if(performance.now()-start>180000)throw Error('Shader compilation exceeded 180 seconds');c.stats.polls++;await new Promise(r=>setTimeout(r,16));}}
export async function createOwnedProgram(owner,vs,fs){
 const g=owner.gl,c=cacheFor(g);let p=null;
 const shader=(type,source)=>{const key=type+'\0'+source;let s=c.shaders.get(key);if(s){c.stats.shaderReuses++;return s;}s=g.createShader(type);if(!s)throw Error('Shader allocation failed');g.shaderSource(s,source);g.compileShader(s);c.stats.shaderCompiles++;c.shaders.set(key,s);return s;};
 try{
  const vertex=shader(g.VERTEX_SHADER,vs),fragment=shader(g.FRAGMENT_SHADER,fs);p=g.createProgram();if(!p)throw Error('Program allocation failed');g.attachShader(p,vertex);g.attachShader(p,fragment);
  for(const [i,n]of ['aPosition','aNormal','aTexcoord'].entries())g.bindAttribLocation(p,i,n);g.linkProgram(p);await waitForProgram(g,p);
  if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error('World program link failed: '+g.getProgramInfoLog(p)+'\nVertex: '+g.getShaderInfoLog(vertex)+'\nFragment: '+g.getShaderInfoLog(fragment));
  const old=owner.program;owner.program=p;owner.attributes={aPosition:0,aNormal:1,aTexcoord:2};owner.uniforms={};if(old)g.deleteProgram(old);c.stats.programs++;
  while(c.shaders.size>32){const key=c.shaders.keys().next().value;g.deleteShader(c.shaders.get(key));c.shaders.delete(key);}
  return true;
 }catch(e){if(p)g.deleteProgram(p);console.error('[world-program]',e);return false;}
}
export function programStats(g){const c=cacheFor(g);return {...c.stats,parallel:!!c.extension,cachedShaders:c.shaders.size};}
