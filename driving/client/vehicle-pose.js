import {mat4} from 'gl-matrix';
export function vehicleMatrix(car,lift=0){
 const m=mat4.fromTranslation(mat4.create(),car.position);
 mat4.rotateZ(m,m,car.heading-Math.PI/2);mat4.rotateX(m,m,car.pitch||0);mat4.rotateY(m,m,car.roll||0);
 mat4.translate(m,m,[0,0,lift]);return m;
}
