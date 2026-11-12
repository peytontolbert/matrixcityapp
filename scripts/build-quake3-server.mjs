import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
// All source and build output must stay in the caller's project scratch directory.
const scratch=process.argv[2];if(!scratch)throw Error('Supply an absolute project scratch directory');
const root=resolve(scratch);if(root!==scratch)throw Error('Use an absolute scratch directory');
await mkdir(root,{recursive:true});
const source=join(root,'ioq3-source'),build=join(root,'ioq3-build');
const revision='52088b9eae247d8e321c8dc1fb49a879652854f9';
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status)throw Error(command+' failed');}
run('git',['init',source]);run('git',['-C',source,'fetch','--depth','1','https://github.com/ioquake/ioq3.git',revision]);run('git',['-C',source,'checkout','--detach',revision]);
run('cmake',['-S',source,'-B',build,'-DBUILD_CLIENT=OFF','-DBUILD_GAME_LIBRARIES=OFF','-DBUILD_GAME_QVMS=OFF','-DUSE_HTTP=OFF','-DUSE_VOIP=OFF','-DUSE_INTERNAL_LIBS=ON']);
run('cmake',['--build',build,'-j4']);console.log('Dedicated server: '+join(build,'Release/ioq3ded'));
