import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Assets} from '../assets.js';
test('asset gateway rejects traversal and unapproved project files',async()=>{
 const assets=new Assets({index:{}});
 for(const path of ['matrixgames/../service.key','matrixgames/%2e%2e/key','matrixgames/..\\key','private/config.json','models/fleet-lods-v4/other.mesh.gz'])await assert.rejects(assets.get(path),/not allowed/);
});
test('published authored light masks are included in the scoped asset catalog',()=>{
 const path='models/car-lights-v3/2715f9383d4cb4256974352d.png';
 const assets=new Assets({index:{[path]:{bytes:1,parts:[]}}});assert.equal(assets.describe(path).type,'image/png');assert.equal(assets.describe('models/car-lights-v3/private.json'),null);
});
test('shared chunks verify hashes and coalesce concurrent loads',async()=>{
 const bytes=Buffer.from('shared-test-asset'),sha=createHash('sha256').update(bytes).digest('hex');let requests=0;
 const assets=new Assets({fetcher:async()=>{requests++;await new Promise(r=>setTimeout(r,5));return new Response(bytes);}});
 const values=await Promise.all([assets.chunk(sha,bytes.length),assets.chunk(sha,bytes.length)]);
 assert.equal(requests,1);assert.deepEqual(values[0],bytes);assert.deepEqual(values[1],bytes);
 await assert.rejects(new Assets({fetcher:async()=>new Response('corrupt')}).chunk(sha,7),/integrity/);
});
