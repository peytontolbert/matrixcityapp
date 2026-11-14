import catalog from './vehicle-catalog.json' with {type:'json'};
export const DEFAULT_MODEL='06_ygt_53_nissan_350z';
export const TRAFFIC_MODEL='nohesi_traffic_toyota_prius';
export const VEHICLES=Object.freeze(catalog.map(v=>Object.freeze(v)));
const byId=new Map(VEHICLES.map(v=>[v.id,v]));
export function vehicle(id=DEFAULT_MODEL){const v=byId.get(id);if(!v)throw Error('Unsupported car');return v;}
export function knownModel(id){return byId.has(id)||id===TRAFFIC_MODEL;}
