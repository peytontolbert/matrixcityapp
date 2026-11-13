// Prepare an inert catalog from already-published R2 objects. No upload/activation.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/merge-driving-packs.mjs INPUT OUTPUT');
const index=JSON.parse(await readFile(input,'utf8'));
for(const sha of ['315996a79a908e99dd29cadd541278184b8524aa614c4598f29c2655335d8f10','2bc11394c7d16b488d3c3dd75c5ffe1368e8b1e9700781c1adcef6970eff6183']){
 const r=await fetch('https://assets.peytontolbert.com/objects/sha256/'+sha+'.bin',{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Published track manifest unavailable');
 const bytes=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Track manifest integrity failed');
 const pack=JSON.parse(bytes);if(pack.schema!==1||!pack.ready)throw Error('Track pack is not ready');
 for(const asset of pack.assets){const path=asset.url.replace(/^\/(demo2\/)?assets\//,'');if(!/^matrix-universe\/world-packages\/(nohesi-110|nohesi-415-island-v[12])\//.test(path))continue;index[path]={bytes:asset.bytes,type:asset.type,parts:asset.parts};}
 console.log('Verified published pack',pack.id,pack.assets.length,'files');
}
await writeFile(output,JSON.stringify(index));console.log('Prepared',Object.keys(index).length,'public asset descriptors');
