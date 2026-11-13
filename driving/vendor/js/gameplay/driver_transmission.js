const clampPedal=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):0));
/** Stateful selector; this is a browser drivetrain approximation, not the AC executable. */
export function transmissionInput(state,input,gearCount,speed) {
    const manual=input.transmission==='sequential'||input.transmission==='h-pattern';
    const explicit=input.autoReverse===false;
    const throttle=clampPedal(input.throttle,0,1),brake=clampPedal(input.brake,0,1);
    let selected=manual||explicit ? Math.trunc(clampPedal(input.gearRequest??1,-1,gearCount)) : state.gear||1;
    const old=state.selectedGear??1;
    // No forward/reverse direction swaps at speed. Neutral remains available.
    if((selected<0&&speed>.7)||(selected>0&&speed<-.7))selected=old;
    const pedalClutch=clampPedal(input.clutch??0,0,1);
    if(manual&&!input.autoClutch&&selected!==old&&Math.abs(speed)>.5&&pedalClutch<.8)selected=old;
    const changed=selected!==old;
    state.selectedGear=selected;
    if(input.automaticLaunch && !manual && selected>0 && old<=0 && Math.abs(speed)<.7) state.gear=1;
    const legacyReverse=!explicit&&!manual&&clampPedal(input.reverse??brake,0,1)>.001&&speed<=.7&&throttle<=.001;
    const reverse=manual||explicit ? selected<0 : legacyReverse || (speed<-.5&&throttle<=.001&&brake>0);
    const neutral=(manual||explicit)&&selected===0;
    const clutch=neutral?0:input.autoClutch===false?1-pedalClutch:1;
    return {manual,explicit,selected,previous:old,changed,reverse,neutral,clutch,
        throttle:neutral?throttle:reverse?-(explicit||manual?throttle:.82*brake):throttle,
        brake:explicit||manual||throttle>.001&&brake>.001?brake:(speed>.15?brake:speed<-.7?throttle:0)};
}
