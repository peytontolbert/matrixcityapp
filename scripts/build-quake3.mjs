import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export async function buildQuake3(output){
 let source=await readFile('third_party/quake3/ioquake3.js','utf8');
 if(createHash('sha256').update(source).digest('hex')!=='e60021a505d1c0d4fb1eb75abb53cd4c3d59b0c401d94d0980e97f905d056572')throw Error('Unexpected QuakeJS engine source');
 // Replace only the platform filesystem startup. Retail PK3 archives are supplied
 // by the player; no CDN, installer, or game-data download is used.
 const start=source.indexOf('function _Sys_FS_Startup(context) {');
 const end=source.indexOf('function _llvm_uadd_with_overflow_i32',start);
 if(start<0||end<0)throw Error('QuakeJS filesystem hook changed');
 source=source.slice(0,start)+`function _Sys_FS_Startup(context) {
   try {
     if (!Module.localFilesMounted) {
       FS.createPath('/', 'base/baseq3', true, true);
       if (!Module.localPaks || Module.localPaks.length !== 9) throw Error('Select your Quake III PK3 files first');
       Module.localPaks.forEach(function(pak) {
         if (!/^pak[0-8]\\.pk3$/.test(pak.name)) throw Error('Unsupported game archive');
         FS.writeFile('/base/baseq3/' + pak.name, pak.bytes, {encoding:'binary',canOwn:true});
       });
       Module.localPaks = null;
       if (typeof Module.localProfile === 'string' && Module.localProfile.length <= 65536) {
         FS.writeFile('/base/baseq3/q3config.cfg', Module.localProfile, {encoding:'utf8'});
       }
       Module.localFilesMounted = true;
     }
     setTimeout(function(){SYSC.ProxyCallback(context);},0);
   } catch (error) { SYSC.Error('fatal', String(error)); }
 }
 `+source.slice(end);
 source+=`\nModule.readLocalProfile = function(){try{return FS.readFile('/base/baseq3/q3config.cfg',{encoding:'utf8'});}catch(e){return null;}};\n`;
 const transport="var url = 'ws://' + addr + ':' + port;";
 if(!source.includes(transport))throw Error('QuakeJS network hook changed');
 source=source.replace(transport,"if (!Module.gameSocketUrl) throw Error('Join a Matrix Games room first'); var url = Module.gameSocketUrl;");
 source=source.replace("var opts = ENVIRONMENT_IS_NODE ? {headers: {'websocket-protocol': ['binary']}} : ['binary'];","var opts = ['binary', 'mg-ticket.' + Module.gameTicket];");
 const closeHook='function handleClose() {';
 if(!source.includes(closeHook))throw Error('QuakeJS disconnect hook changed');
 source=source.replace(closeHook,closeHook+" if (Module.gameSocketUrl && !Module.gameDisconnected) { Module.gameDisconnected = true; Browser.mainLoop.pause(); if (Module.onGameDisconnect) Module.onGameDisconnect(); } ");
 // Refuse all original content-server requests, including in-engine download menus.
 const xhr='DoXHR:function (url, opts) {';
 const xhrAt=source.indexOf(xhr);if(xhrAt<0)throw Error('QuakeJS download hook changed');
 source=source.slice(0,xhrAt)+source.slice(xhrAt).replace(xhr,xhr+" return opts.onload(new Error('Automatic game downloads are disabled. Use your local game files.')); ");
 await mkdir(join(output,'assets'),{recursive:true});
 await writeFile(join(output,'assets/quake3-engine.js'),source);
 for(const file of ['COPYING.txt','quakejs-LICENSE','source.tar.gz'])await copyFile('third_party/quake3/'+file,join(output,'assets/quake3-'+file));
 console.log('Built reviewed Quake III engine adapter; no game data bundled');
}
