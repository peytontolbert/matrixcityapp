import {matrixPointToNative,matrixHeadingToNative} from '../bridge/coordinates.mjs';

// Positions are reviewed, grounded Matrix-space feet anchors. Keep private
// track coordinates in operator data, not in this public source repository.
export function teleportOptions(room,destinations){
 if(!Array.isArray(destinations)||!destinations.length||destinations.length>32)throw Error('Expected 1–32 reviewed destinations');
 const lines=['[TELEPORT_DESTINATIONS]'];
 for(const [i,d] of destinations.entries()){
  if(!d||typeof d.name!=='string'||!/^[A-Za-z0-9 ()-]{1,48}$/.test(d.name)||!Number.isFinite(d.heading))throw Error('Invalid destination');
  const p=matrixPointToNative(room,d.position);
  // CSP/ComfyMap destinations are car origins. ComfyMap's own point exporter
  // uses road height + 0.5 m so the chassis never starts inside the road.
  p[1]+=.5;
  if(p.some(v=>Math.abs(v)>100000))throw Error('Invalid destination position');
  const heading=matrixHeadingToNative(room,d.heading)*180/Math.PI;
  lines.push(`POINT_${i}=${d.name}`,`POINT_${i}_POS=${p.map(v=>v.toFixed(4)).join(',')}`,`POINT_${i}_HEADING=${heading.toFixed(4)}`,`POINT_${i}_GROUP=Matrix Games`);
 }
 return lines.join('\n')+'\n';
}

// Preserve every existing driver option when adding CSP's teleport bit.
// Reserved traffic/browser slots are never granted player capabilities.
export function enablePlayerTeleports(entryList,playerSlots){
 const slots=new Set(playerSlots);let slot=null;const found=new Set();
 const result=entryList.split(/\r?\n/).map(line=>{
  const section=/^\s*\[CAR_(\d+)\]\s*$/.exec(line);if(section)slot=Number(section[1]);
  else if(/^\s*\[/.test(line))slot=null;
  const skin=/^(\s*SKIN\s*=\s*)(\S+)(\s*)$/i.exec(line);
  if(!skin||!slots.has(slot))return line;
  let name=skin[2],flags=0;const separator=name.lastIndexOf('/');
  if(separator>=0){
   const encoded=name.slice(separator+1),data=Buffer.from(encoded,'base64');
   if(data.length!==3||data[0]!==0||data[2] !== (data[1]^0x17)||data.toString('base64')!==encoded)throw Error('Unrecognized CSP skin options');
   flags=data[1];name=name.slice(0,separator);
  }
  flags|=0x20;found.add(slot);
  return skin[1]+name+'/'+Buffer.from([0,flags,flags^0x17]).toString('base64')+skin[3];
 }).join('\n');
 if(found.size!==slots.size)throw Error('Missing player skin entry');
 return result;
}
