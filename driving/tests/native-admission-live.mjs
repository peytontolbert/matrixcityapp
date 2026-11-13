// Real native TCP protocol; fixture has no Steam ticket and must never enter.
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.DRIVING_STAGE_URL;if(!base||new URL(base).hostname!=='127.0.0.1')throw Error('Loopback stage required');
const config=JSON.parse(await readFile(process.env.MATRIX_DRIVING_CONFIG,'utf8')),authorization='Bearer '+await readFile(config.keyFile,'utf8');
const request=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
function str(s,wide=false,big=false){const bytes=wide?Buffer.from([...s].flatMap(c=>{const b=Buffer.alloc(4);b.writeUInt32LE(c.codePointAt(0));return [...b];})):Buffer.from(s);const length=Buffer.alloc(big?2:1);big?length.writeUInt16LE(s.length):length.writeUInt8(s.length);return Buffer.concat([length,bytes]);}
async function handshake(port,steam,password,features){
 const version=Buffer.alloc(2);version.writeUInt16LE(202);const payload=Buffer.concat([Buffer.from([0x3d]),version,str(steam),str('Admission fixture',true),str(''),str(''),str('06_ygt_53_nissan_350z'),str(password),str(features,false,true),Buffer.alloc(2)]),header=Buffer.alloc(2);header.writeUInt16LE(payload.length);
 return new Promise((resolve,reject)=>{let data=Buffer.alloc(0),settled=false;const socket=net.connect(port,'127.0.0.1',()=>socket.write(Buffer.concat([header,payload])));socket.setTimeout(5000,()=>socket.destroy(Error('Native handshake timed out')));socket.on('error',reject);socket.on('close',()=>{if(!settled)reject(Error('Native closed without response'));});socket.on('data',part=>{data=Buffer.concat([data,part]);if(data.length<2||data.length<data.readUInt16LE(0)+2)return;settled=true;const packet=data.subarray(2,2+data.readUInt16LE(0));let reason='';if(packet[0]===0x6f)for(let i=0;i<packet[1];i++)reason+=String.fromCodePoint(packet.readUInt32LE(2+i*4));socket.destroy();resolve({code:packet[0],reason});});});
}
const reports=[];
for(const [index,room] of ['nohesi-110','nohesi-415'].entries()){
 const details=await(await fetch('http://127.0.0.1:'+(18081+index)+'/JSON%7C0')).json(),features=[...(details.Features||[]),'3424'].join(','),steam='76561198000000000',port=19600+index;
 const anonymous=await handshake(port,steam,'',features);assert.match(anonymous.reason,/Sign in at matrixgames/);
 const grant=await request('/native-ticket',{room,actor:randomUUID()}),credential=await request('/native-redeem',{authorization:grant.authorization,steamId:steam});
 assert.match((await handshake(port,'76561198000000001',credential.password,features)).reason,/Sign in at matrixgames/);
 const accepted=await handshake(port,steam,credential.password,features);assert.match(accepted.reason,/Steam authentication failed/,'Website gate should pass, but missing Steam proof must fail');
 assert.match((await handshake(port,steam,credential.password,features)).reason,/Sign in at matrixgames/);
 reports.push({room,anonymousDenied:true,wrongSteamDenied:true,accountCredentialAccepted:true,steamAuthenticationStillRequired:true,replayDenied:true});
}
console.log(JSON.stringify({passed:true,reports},null,2));
