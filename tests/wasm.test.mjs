import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const bytes=await readFile(resolve(process.env.MATRIXCITY_BUILD_DIR||'dist','assets/city.wasm'));
const module=await WebAssembly.compile(bytes);
const {exports:core}=await WebAssembly.instantiate(module);
test('standalone WASM ABI has no host imports',()=>{
 assert.deepEqual(WebAssembly.Module.imports(module),[]);assert.equal(core.abi_version(),1);
});
test('city generation is deterministic, bounded and seed-dependent',()=>{
 const first=[],second=[];
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){
  const h=core.block_height(x,y,42,70);first.push(h);second.push(core.block_height(x,y,43,70));
  assert.equal(h,core.block_height(x,y,42,70));assert.ok(h>=0&&h<=76);
  if(x%4===0||y%4===0)assert.equal(h,0);
  assert.ok(core.block_tone(x,y,42)<4);
 }
 assert.notDeepEqual(first,second);
 assert.equal(core.block_height(16,1,42,100),0);
 assert.equal(core.block_height(1,1,42,0),0);
 assert.equal(core.block_height(1,1,42,1000),core.block_height(1,1,42,100));
});
test('Azure serves WASM with restrictive browser security headers',async()=>{
 const config=JSON.parse(await readFile('staticwebapp.config.json','utf8'));
 assert.equal(config.mimeTypes['.wasm'],'application/wasm');
 assert.match(config.globalHeaders['Content-Security-Policy'],/wasm-unsafe-eval/);
 assert.match(config.globalHeaders['Content-Security-Policy'],/connect-src 'self'/);
 assert.equal(config.globalHeaders['X-Content-Type-Options'],'nosniff');
});
