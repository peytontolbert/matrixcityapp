import {mat4} from 'gl-matrix';
export const WHEEL_TAGS=[27922,26418,27902,26398];
// City renderer's wheel-versus-caliper test, using authored mesh bounds.
export function canRoll(bounds){
 if(!bounds?.min||!bounds?.max)return true;
 const y=Math.abs(bounds.max[1]-bounds.min[1]),z=Math.abs(bounds.max[2]-bounds.min[2]),largest=Math.max(y,z);
 return largest<=1e-5||Math.min(y,z)/largest>=.72;
}
export function wheelMatrix(body,pivot,tag,spin,steer,roll=true){
 const matrix=mat4.clone(body);mat4.translate(matrix,matrix,pivot);
 if(tag===27922||tag===26418)mat4.rotateZ(matrix,matrix,steer);
 if(roll)mat4.rotateX(matrix,matrix,spin);
 mat4.translate(matrix,matrix,pivot.map(v=>-v));return matrix;
}
