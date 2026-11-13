import {originFromFeet} from './pose.mjs';
import {nativeEnvironment} from '../environment.js';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {TRACKS,matrixPointToNative,matrixVectorToNative,matrixHeadingToNative,nativePointToMatrix,nativeVectorToMatrix,nativeYawToMatrix} from './coordinates.mjs';
import {ExternalSlots} from './slots.mjs';
import {nativePassword} from '../native-joins.mjs';

// Runs in a trusted server process, never the browser. Reach a remote native
// server through a private SSH/WireGuard path ending on its loopback interface.
export class AssettoRelay {
  #room; #endpoint; #token; #slots; #stream=randomUUID(); #sequence=0;
  #impacts=new Map();
  #busy=false; #lastSuccess=0; #native=[];
  constructor({room,endpoint,tokenFile,slots}) {
    if(!TRACKS[room])throw Error('Unsupported room');
    const url=new URL(endpoint);
    if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password
      ||url.pathname!=='/_matrix/bridge/v1/exchange'||url.search||url.hash)throw Error('Bridge requires a fixed loopback endpoint');
    this.#room=room;this.#endpoint=url.href;
    this.#token=readFileSync(tokenFile,'utf8').trim();
    if(this.#token.length<43||this.#token.length>128)throw Error('Private bridge token required');
    this.#slots=new ExternalSlots(slots);
  }
  nativeVehicles(now=Date.now()) { return now-this.#lastSuccess<1500?this.#native.map(v=>({...v,position:[...v.position],velocity:[...v.velocity]})):[]; }
  impact(car,delta){if(!car.coupled||!car.account)return;const previous=this.#impacts.get(car.id);const sum=delta.map((v,i)=>v+(previous?.delta[i]||0));if(Math.hypot(...sum)<=80)this.#impacts.set(car.id,{slot:Number(car.id.split(':')[1]),account:car.account,delta:sum,targetVelocity:[...car.velocity]});}
  nativePassword(actor,steamId){return nativePassword(this.#room,actor,steamId,this.#token);}
  async exchange(vehicles,scores=[]) {
    if(this.#busy)return {ready:false,reason:'busy'};
    this.#busy=true;
    try {
      const {assigned,rejected}=this.#slots.assign(vehicles);
      const impacts=[...this.#impacts.values()];this.#impacts.clear();
      const frame={scores,impacts:impacts.map(v=>({...v,delta:matrixVectorToNative(this.#room,v.delta),targetVelocity:matrixVectorToNative(this.#room,v.targetVelocity)})),schema:1,room:this.#room,revision:TRACKS[this.#room].revision,stream:this.#stream,
        sequence:++this.#sequence,issuedAt:Date.now(),vehicles:assigned.map(v=>({
          slot:v.slot,entity:v.id,name:v.kind==='traffic'?'Traffic':'Browser driver',
          position:matrixPointToNative(this.#room,originFromFeet(v,this.poseOffsets?.[v.model])),
          rotation:[matrixHeadingToNative(this.#room,v.heading),v.pitch||0,v.roll||0],
          velocity:matrixVectorToNative(this.#room,v.velocity),
          rpm:Math.max(0,Math.min(16000,Math.round(v.rpm||800))),gear:Math.max(0,Math.min(15,(v.gear||0)+1)),
          gas:Math.round(Math.max(0,Math.min(1,v.throttle||0))*255),steer:Math.round((Math.max(-1,Math.min(1,v.steer||0))+1)*127.5),
          brake:v.brake>.01,lights:v.lights===true,
        }))};
      const response=await fetch(this.#endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(750),
        headers:{'content-type':'application/json',authorization:`Bearer ${this.#token}`},body:JSON.stringify(frame)});
      if(!response.ok)throw Error(`Bridge refused frame (${response.status})`);
      const reader=response.body.getReader();let size=0;const chunks=[];
      try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072)throw Error('Bridge response too large');chunks.push(value);} }
      finally { await reader.cancel(); }
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(data.schema!==1||data.room!==this.#room||data.revision!==TRACKS[this.#room].revision
        ||!Number.isSafeInteger(data.serverTime)||Math.abs(Date.now()-data.serverTime)>2000
        ||!Number.isSafeInteger(data.appliedSequence)||data.appliedSequence>frame.sequence
        ||!Array.isArray(data.vehicles)||data.vehicles.length>255)throw Error('Invalid native snapshot');
      const ids=new Set();
      const native=data.vehicles.map(v=>{
        if(!Number.isInteger(v.slot)||v.slot<0||v.slot>254||ids.has(v.slot)
          ||!/^[a-zA-Z0-9_-]{1,80}$/.test(v.model)||!Array.isArray(v.rotation)||v.rotation.length!==3
          ||!v.rotation.every(Number.isFinite))throw Error('Invalid native car');
        ids.add(v.slot);
        return {id:`native:${v.slot}`,account:v.account,collision:v.collision===true,model:v.model,coupled:v.coupled===true,sampleTime:Number.isSafeInteger(v.physicsTime)&&v.physicsTime>0?v.physicsTime:data.serverTime,position:nativePointToMatrix(this.#room,v.feet||v.position),
          velocity:nativeVectorToMatrix(this.#room,v.velocity),heading:nativeYawToMatrix(this.#room,v.rotation[0]),pitch:v.rotation[1],roll:v.rotation[2],
          rpm:Math.max(0,Math.min(16000,Number(v.rpm)||800)),gear:Math.max(-1,Math.min(14,(Number(v.gear)||0)-1)),throttle:Math.max(0,Math.min(1,(Number(v.gas)||0)/255)),brake:v.brake===true?1:0,lights:v.lights===true,steer:Math.max(-1,Math.min(1,((Number.isFinite(v.steer)?v.steer:127)-127.5)/127.5))};
      });
      this.poseOffsets=Object.fromEntries(Object.entries(data.poseOffsets||{}).filter(([model,value])=>['06_ygt_53_nissan_350z','nohesi_traffic_toyota_prius'].includes(model)&&Number.isFinite(value)&&value>.05&&value<2));this.environment=nativeEnvironment(data.environment);this.#native=native;this.#lastSuccess=Date.now();
      return {ready:true,appliedSequence:data.appliedSequence,rejected};
    } catch(error) { return {ready:false,reason:error.message}; }
    finally { this.#busy=false; }
  }
}
