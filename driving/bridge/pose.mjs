// Published model ground offsets. The native companion calibrates the network
// origin against its loaded body/physics transforms; no track elevation guesses.
export const MODEL_GROUND_OFFSETS=Object.freeze({'06_ygt_53_nissan_350z':.25743,'nohesi_traffic_toyota_prius':.50341796875});
export function originFromFeet(car,offset=MODEL_GROUND_OFFSETS[car.model]||0){
 const h=car.heading,p=car.pitch||0,r=car.roll||0,cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);
 const up=[Math.sin(h)*sr-Math.cos(h)*sp*cr,-Math.cos(h)*sr-Math.sin(h)*sp*cr,cp*cr];
 return car.position.map((v,i)=>v+up[i]*offset);
}
