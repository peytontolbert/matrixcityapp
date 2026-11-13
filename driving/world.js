import {CollisionWorld} from './vendor/js/gameplay/collision_world.js';
import {Exact110Collision} from './vendor/nexus_extensions/nexus_110_exact_collision_v2.js';
import {TRACKS} from './bridge/coordinates.mjs';
import {CollisionStream} from './collision-stream.mjs';
export const ASSET_BASE='https://matrixgames-assets.invalid/assets/';
export const TRACK_FILES={
 'nohesi-110':{root:'matrix-universe/world-packages/nohesi-110/',scene:'exact-v2/scene/scene.json',collision:'exact-v2/collision/index.json',network:'gameplay/traffic-network.json',visualY:-1},
 'nohesi-415':{root:'matrix-universe/world-packages/nohesi-415-island-v2/',scene:'scene.json',collision:'collision.json',network:'matrixgames/415-network.json',visualY:1},
};
export async function jsonAsset(path){const r=await fetch(new URL(path,ASSET_BASE));if(!r.ok)throw Error('Asset unavailable: '+path);return r.json();}
export async function loadWorld(room) {
 const cfg=TRACK_FILES[room];if(!cfg)throw Error('Unknown track');
 const translation=TRACKS[room].translation;
 let network=await jsonAsset(room==='nohesi-110'?cfg.root+cfg.network:cfg.network),spawn;
 if(room==='nohesi-110'){
  spawn={position:[network.spawn.x+translation[0],network.spawn.y,network.spawn.feetZ],heading:network.spawn.headingRad};
  network=structuredClone(network);for(const lane of network.lanes)for(const point of lane.points)for(let k=0;k<3;k++)point[k]+=translation[k];
 }else{const p=await jsonAsset(cfg.root+'placement.json');if(p.coordinateRevision!==TRACKS[room].revision)throw Error('Track revision mismatch');spawn={position:[p.spawn.x,p.spawn.y,p.spawn.feetZ],heading:p.spawn.headingRad};}
 const cw=new CollisionWorld({}),collision=new Exact110Collision(cw,{minX:-100000,minY:-100000,minZ:-10000,maxX:100000,maxY:100000,maxZ:10000},translation);
 const stream=new CollisionStream(collision,async entry=>{
   const loader=Object.create(collision.query);loader.derivedTrackGround=null;
   const world=await loader.loadDerivedTrackGround(new URL(entry.file,collision.url).href);
   if(!world)throw Error(loader.derivedTrackGroundError||'Collision tile unavailable');
   return world;
 });collision.focus=point=>stream.focus(point);
 await collision.load(new URL(cfg.root+cfg.collision,ASSET_BASE).href,spawn.position);
 const road=collision.ground(...spawn.position,{maxRise:2,maxDrop:12});
 if(!road)throw Error('No safe road under the authored pit');spawn.position[2]=road.z;
 return {room,spawn,network,collision,ground:collision.ground.bind(collision),wall:collision.wall.bind(collision),focus:collision.focus.bind(collision),readyAt:p=>stream.ready(p),trim:points=>stream.trim(points)};
}
