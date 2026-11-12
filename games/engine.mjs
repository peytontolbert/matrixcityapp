import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import dgram from 'node:dgram';
const reservedPorts=new Set();
export async function launchEngine(config,{binary,assets,state,portStart=28100,portCount=4}){
 await mkdir(state,{recursive:true,mode:0o700});const home=await mkdtemp(join(state,'room-'));
 // Each native server gets a fixed loopback-only port. Exhaustion fails closed.
 let port;
 for(let candidate=portStart;candidate<portStart+portCount;candidate++){
  if(reservedPorts.has(candidate))continue;
  reservedPorts.add(candidate);
  const probe=dgram.createSocket('udp4');const available=await new Promise(resolve=>{probe.once('error',()=>{probe.close();resolve(false);});probe.bind(candidate,'127.0.0.1',()=>{probe.close();resolve(true);});});
  if(available){port=candidate;break;}reservedPorts.delete(candidate);
 }
 if(!port)throw Error('No game ports available');
 const args=['+set','dedicated','1','+set','net_ip','127.0.0.1','+set','net_port',String(port),'+set','net_enabled','1','+set','fs_basepath',assets,'+set','fs_homepath',home,'+set','sv_hostname','Matrix Games private room','+set','sv_maxclients',String(config.players),'+set','g_gametype',String(config.mode),'+set','fraglimit',String(config.fraglimit),'+set','timelimit',String(config.timelimit),'+set','sv_pure','1','+set','sv_allowDownload','0','+set','sv_master1','','+set','sv_master2','','+set','sv_master3','','+set','sv_master4','','+set','sv_master5','','+set','g_log','','+set','logfile','0','+set','bot_enable','0','+map',config.map];
 const child=spawn(binary,args,{cwd:home,env:{PATH:'/usr/bin:/bin',HOME:home,TMPDIR:state,LANG:'C'},stdio:['ignore','pipe','pipe']});
 // Only remove this invocation's newly created home, after its process exits.
 const cleanup=()=>rm(home,{recursive:true,force:true}).catch(()=>{});
 let exited=false,exitHandlers=[];child.on('exit',()=>{exited=true;reservedPorts.delete(port);cleanup();for(const fn of exitHandlers)fn();});child.on('error',()=>{reservedPorts.delete(port);cleanup();});
 const stop=()=>{if(!exited){child.kill('SIGTERM');const timer=setTimeout(()=>{if(!exited)child.kill('SIGKILL');},3000);timer.unref();}};
 // Consume output without writing account information or game paths to public logs.
 child.stdout.resume();child.stderr.resume();
 await new Promise((resolve,reject)=>{
  const udp=dgram.createSocket('udp4');let done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timeout);clearInterval(poll);udp.close();error?reject(error):resolve();};
  const timeout=setTimeout(()=>{stop();finish(Error('Game server did not become ready'));},15000);
  const poll=setInterval(()=>udp.send(Buffer.concat([Buffer.alloc(4,255),Buffer.from('getinfo matrixgames')]),port,'127.0.0.1'),200);
  udp.on('message',(data,remote)=>{if(remote.port===port&&data.includes(Buffer.from('infoResponse')))finish();});
  udp.on('error',()=>finish(Error('Game server health check failed')));child.once('error',()=>finish(Error('Cannot start game server')));child.once('exit',()=>finish(Error('Game server stopped during startup')));
 });
 return {port,stop,onExit(fn){if(exited)fn();else exitHandlers.push(fn);}};
}
