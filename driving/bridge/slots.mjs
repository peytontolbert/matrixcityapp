// Native AC fixes a car model at each entry slot. Never substitute a different
// model silently and never use a native-player slot for a relayed vehicle.
export class ExternalSlots {
  #slots; #leases = new Map();
  constructor(slots) {
    const ids=new Set();
    for(const s of slots) {
      if(!Number.isInteger(s.slot)||s.slot<0||s.slot>254||ids.has(s.slot)
        ||!['browser','traffic'].includes(s.kind)||!/^[a-zA-Z0-9_-]{1,80}$/.test(s.model))throw Error('Invalid external slots');
      ids.add(s.slot);
    }
    this.#slots=slots.map(s=>Object.freeze({...s}));
  }
  assign(vehicles) {
    const ids=new Set();
    for(const v of vehicles) {
      if(!/^[a-zA-Z0-9:_-]{1,96}$/.test(v.id)||ids.has(v.id))throw Error('Invalid or duplicate entity');
      ids.add(v.id);
    }
    for(const [id,slot] of this.#leases) {
      const v=vehicles.find(v=>v.id===id);
      if(!v||v.kind!==slot.kind||v.model!==slot.model)this.#leases.delete(id);
    }
    const assigned=[],rejected=[];
    for(const v of vehicles) {
      let slot=this.#leases.get(v.id);
      if(!slot) {
        const occupied=new Set([...this.#leases.values()].map(s=>s.slot));
        slot=this.#slots.find(s=>s.kind===v.kind&&s.model===v.model&&!occupied.has(s.slot));
        if(slot)this.#leases.set(v.id,slot);
      }
      if(slot)assigned.push({...v,slot:slot.slot});
      else rejected.push({id:v.id,reason:'No matching external slot'});
    }
    return {assigned,rejected};
  }
  clear() { this.#leases.clear(); }
}
