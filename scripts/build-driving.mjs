import {build} from 'esbuild';
import {resolve} from 'node:path';
export async function buildDriving(output=process.env.MATRIXCITY_BUILD_DIR||'dist'){
 await build({entryPoints:['driving/client/main.js'],bundle:true,format:'esm',target:'es2022',outfile:resolve(output,'driving/app.js'),legalComments:'inline'});
 await build({entryPoints:['driving/vendor/js/city_vehicle_audio_worklet.js'],bundle:true,format:'esm',target:'es2022',outfile:resolve(output,'driving/vehicle-audio-worklet.js')});
 await build({entryPoints:['driving/client/hash-worker.js'],bundle:true,format:'esm',target:'es2022',outfile:resolve(output,'driving/hash-worker.js'),legalComments:'inline'});
}
if(process.argv[1]?.endsWith('build-driving.mjs'))await buildDriving();
