import {build} from 'esbuild';
import {resolve} from 'node:path';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function buildDriving(output=process.env.MATRIXCITY_BUILD_DIR||'dist'){
 await build({entryPoints:['driving/client/main.js'],bundle:true,format:'esm',target:'es2022',outfile:resolve(output,'driving/app.js'),legalComments:'inline'});
 const bundle=resolve(output,'driving/app.js'),revision=createHash('sha256').update(await readFile(bundle)).digest('hex').slice(0,16),name='app-'+revision+'.js';
 await copyFile(bundle,resolve(output,'driving',name));
 // A unique URL prevents older browser/CDN cache entries from running against new HTML.
 const css=await readFile(resolve(output,'driving/style.css'));
 const cssName='style-'+createHash('sha256').update(css).digest('hex').slice(0,16)+'.css';
 await writeFile(resolve(output,'driving',cssName),css);
 const page=resolve(output,'driving/index.html');
 try{const html=await readFile(page,'utf8');await writeFile(page,html.replace(/\/driving\/style(?:-[a-f0-9]{16})?\.css/g,'/driving/'+cssName).replace(/\/driving\/app(?:-[a-f0-9]{16})?\.js/g,'/driving/'+name));}catch(e){if(e.code!=='ENOENT')throw e;}
 await build({entryPoints:['driving/vendor/js/city_vehicle_audio_worklet.js'],bundle:true,format:'esm',target:'es2022',outfile:resolve(output,'driving/vehicle-audio-worklet.js')});
 await build({entryPoints:['driving/client/hash-worker.js'],bundle:true,format:'esm',target:'es2022',outfile:resolve(output,'driving/hash-worker.js'),legalComments:'inline'});
}
if(process.argv[1]?.endsWith('build-driving.mjs'))await buildDriving();
