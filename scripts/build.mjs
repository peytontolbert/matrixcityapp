import {mkdir,copyFile,readdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildQuake3} from './build-quake3.mjs';
const output=resolve(process.env.MATRIXCITY_BUILD_DIR||'dist');
await mkdir(join(output,'assets'),{recursive:true});
const compiler=process.env.CLANG||'clang-18';
const compiled=spawnSync(compiler,['--target=wasm32','-O3','-nostdlib','-Wl,--no-entry','-Wl,--strip-all','-Wl,--export=abi_version','-Wl,--export=block_height','-Wl,--export=block_tone','-Wl,-z,stack-size=16384','-Wl,--initial-memory=65536','-Wl,--max-memory=65536','native/city.c','-o',join(output,'assets/city.wasm')],{stdio:'inherit'});
if(compiled.error)throw compiled.error;
if(compiled.status!==0)process.exit(compiled.status||1);
for(const file of await readdir('web')){
 if(!/^[a-z0-9.-]+$/.test(file))throw Error('Unexpected frontend filename');
 await copyFile(join('web',file),join(output,file));
}
await copyFile('staticwebapp.config.json',join(output,'staticwebapp.config.json'));
const bytes=await readFile(join(output,'assets/city.wasm'));
if(!WebAssembly.validate(bytes))throw Error('Invalid WASM build');
console.log(`Built static site; WASM core ${bytes.length} bytes`);
await buildQuake3(output);
