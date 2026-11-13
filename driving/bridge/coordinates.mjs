// Data is in Matrix City's placed, Z-up space. Assetto is Y-up.
// These bases come from the track exporters, not a generic axis swap.
export const TRACKS = Object.freeze({
  'nohesi-110': Object.freeze({ revision: '110-source-z-parity-v1', nativeTrack: 'nohesi_110',
    translation: [-21375.861854495726, 0, 0], basis: [[1,0,0],[0,0,-1],[0,1,0]] }),
  'nohesi-415': Object.freeze({ revision: 'assetto-rh-v2', nativeTrack: 'nohesi_415',
    translation: [-52245.08939414323, 31809.26953125, 607.1390380859375],
    basis: [[-1,0,0],[0,0,1],[0,1,0]] }),
});
function vector(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) throw Error('Invalid pose vector');
  return v;
}
function track(room) { const t=TRACKS[room]; if(!t) throw Error('Unknown track'); return t; }
function multiply(m,v) { return m.map(row=>row.reduce((sum,n,i)=>sum+n*v[i],0)); }
export function nativeVectorToMatrix(room,v) { return multiply(track(room).basis,vector(v)); }
export function matrixVectorToNative(room,v) {
  const b=track(room).basis;
  return multiply([0,1,2].map(i=>b.map(row=>row[i])),vector(v));
}
export function nativePointToMatrix(room,v) {
  return nativeVectorToMatrix(room,v).map((n,i)=>n+track(room).translation[i]);
}
export function matrixPointToNative(room,v) {
  return matrixVectorToNative(room,vector(v).map((n,i)=>n-track(room).translation[i]));
}
export function nativeYawToMatrix(room,yaw) {
  if(!Number.isFinite(yaw))throw Error('Invalid yaw');
  const v=nativeVectorToMatrix(room,[-Math.sin(yaw),0,Math.cos(yaw)]);
  return Math.atan2(v[1],v[0]);
}
export function matrixHeadingToNative(room,heading) {
  if(!Number.isFinite(heading))throw Error('Invalid heading');
  const v=matrixVectorToNative(room,[Math.cos(heading),Math.sin(heading),0]);
  return Math.atan2(v[2],v[0])-Math.PI/2;
}
