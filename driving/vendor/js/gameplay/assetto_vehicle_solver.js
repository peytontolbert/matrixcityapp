import {curveValue} from '../../nexus_extensions/rendering/physics-curves-acc07f04ed55.js';
import {automaticClutchEngagement} from '../../nexus_extensions/rendering/burnout-audit-18989975d8dd.js';
import {liveWetContact} from '../../nexus_extensions/rendering/rain-water-ced407c3d74d.js';
export const ASSETTO_CONTACT_REVISION='matrix-assetto-combined-v14-live-1';
export const ASSETTO_CONTACT_SETTINGS=Object.freeze({combined:true,elastic:true,physicalRelaxation:true,postPeak:true,conditions:false,geometry:true,vertical:false,unified:false,sharedRig:false,couplingSubsteps:1,iterations:160});
import {solveUnifiedContacts} from './unified_contact.js';
import {stepTyreCondition,wetContact,experimentalTyreParameters,steeringGeometry,roadWater} from './tyre_environment.js';
import {solveCombinedContacts} from './combined_contact.js';
import {stepVertical} from './vertical_dynamics.js';
import { solveLongitudinalContact, solveLateralContact, roadGravity } from './tyre_contact_dynamics.js';
import { viscousCenterTorque } from './assetto_foundation.js';
import { transmissionInput } from './driver_transmission.js';
import { limitCombustion } from './gearbox_limits.js';
import { solveRotation } from './assetto_rotational.js';
import { stepAero, brakeTorqueForWheel, updateBrakeHeat } from './assetto_car_systems.js';
const finite = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

import {tireWaterForce} from '../../nexus_extensions/rendering/tire-water-force-v1.js';
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value)));
const lerp = (a, b, t) => a + (b - a) * t;

const curve = curveValue;

function axleValue(profile, axle, key, fallback) {
    return finite(profile?.[axle]?.[key], fallback);
}

function tyre(profile, axle, key, fallback) {
    return finite(profile?.tyres?.[axle]?.[key], fallback);
}

function wheelKey(front, left) {
    return front ? (left ? '27922' : '26418') : (left ? '27902' : '26398');
}

const WHEEL_KEYS = Object.freeze(['27922', '26418', '27902', '26398']);

function wheelMap(value = 0) {
    return Object.fromEntries(WHEEL_KEYS.map((key) => [key, value]));
}

const rpmToOmega = (rpm) => finite(rpm) * (2 * Math.PI / 60);
const omegaToRpm = (omega) => finite(omega) * (60 / (2 * Math.PI));

function differentialPair(profile, state, axle, totalTorque) {
    const front = axle === 'front';
    const leftKey = wheelKey(front, true);
    const rightKey = wheelKey(front, false);
    const config = profile?.differential?.[axle] || {};
    const applyingPower = totalTorque >= 0;
    const authoredLock = config[applyingPower ? 'powerLock' : 'coastLock']
        ?? profile?.[applyingPower ? 'differentialPower' : 'differentialCoast'];
    const baseLock = clamp(finite(authoredLock, applyingPower ? 0.28 : 0.14), 0, 1);
    const preloadNm = clamp(finite(config.preloadNm ?? profile?.differentialPreloadNm, 35), 0, 500);
    const torqueMagnitude = Math.abs(finite(totalTorque));
    const lock = clamp(baseLock + (preloadNm / Math.max(1, torqueMagnitude + preloadNm)) * 0.12, 0, 0.9);
    const leftSpeed = Math.abs(finite(state?.wheelOmega?.[leftKey]));
    const rightSpeed = Math.abs(finite(state?.wheelOmega?.[rightKey]));
    const speedScale = Math.max(3, (leftSpeed + rightSpeed) * 0.12);
    const transfer = Math.tanh((leftSpeed - rightSpeed) / speedScale) * lock * 0.42;
    const left = clamp(0.5 - transfer, 0.08, 0.92);
    return { left, right: 1 - left, lock };
}

export function assettoDifferentialTorqueShares(profile, state, totalDriveTorque = 0) {
    const center = profile?.awd2Center;
    if (profile?.driveType === 'AWD2' && center && !center.controllerRequired) {
        const frontOmega = (finite(state.wheelOmega[27922]) + finite(state.wheelOmega[26418])) * 0.5;
        const rearOmega = (finite(state.wheelOmega[27902]) + finite(state.wheelOmega[26398])) * 0.5;
        const coupling = viscousCenterTorque(center, frontOmega, rearOmega);
        const rearTorque = totalDriveTorque - coupling;
        return {
            model: 'awd2-viscous-v1', centerCouplingTorqueNm: coupling,
            frontTorqueNm: coupling, rearTorqueNm: rearTorque,
            driveBiasFront: Math.abs(totalDriveTorque) > 1 ? clamp(coupling / totalDriveTorque, 0, 1) : 0,
            front: differentialPair(profile, state, 'front', coupling),
            rear: differentialPair(profile, state, 'rear', rearTorque),
        };
    }
    const authoredFront = clamp(profile?.driveBiasFront, 0, 1);
    let driveBiasFront = authoredFront;
    const frontMean = (Math.abs(finite(state?.wheelOmega?.[wheelKey(true, true)]))
        + Math.abs(finite(state?.wheelOmega?.[wheelKey(true, false)]))) * 0.5;
    const rearMean = (Math.abs(finite(state?.wheelOmega?.[wheelKey(false, true)]))
        + Math.abs(finite(state?.wheelOmega?.[wheelKey(false, false)]))) * 0.5;
    if (authoredFront > 0.02 && authoredFront < 0.98) {
        const center = profile?.differential?.center || {};
        const applyingPower = totalDriveTorque >= 0;
        const centerLock = clamp(center[applyingPower ? 'powerLock' : 'coastLock'], 0, 1)
            || (applyingPower ? 0.20 : 0.10);
        const speedScale = Math.max(4, (frontMean + rearMean) * 0.12);
        const transfer = Math.tanh((frontMean - rearMean) / speedScale) * centerLock * 0.22;
        driveBiasFront = clamp(authoredFront - transfer, 0.04, 0.96);
    }
    return {
        driveBiasFront,
        front: differentialPair(profile, state, 'front', totalDriveTorque * driveBiasFront),
        rear: differentialPair(profile, state, 'rear', totalDriveTorque * (1 - driveBiasFront)),
    };
}

/**
 * A compact independent road-car solver. It uses Assetto-style data units
 * (kg, m, N/m, N*s/m, Nm, metres, radians) and intentionally does not call
 * the GTA handling equations. Collision/ground probing stays in the host app.
 */
export function createAssettoVehicleState() {
    return {
        longitudinal: 0, lateral: 0, yawRate: 0, rpm: 900, gear: 1, shiftTimer: 0,
        steering: 0, throttle: 0, brake: 0, engineLoad: 0,
        wheelOmega: { 27922: 0, 26418: 0, 27902: 0, 26398: 0 },
        relaxedSlipRatio: wheelMap(0),
        relaxedSlipAngle: wheelMap(0),
        turboBoost: [], limiterPhase: 0,
        driveline: null,
        suspensionOffset: {},
        suspensionRestOffset: {},
        previousLongitudinalAcceleration: 0, previousLateralAcceleration: 0,
    };
}

/**
 * Quasi-static chassis pitch from longitudinal load transfer. Positive is
 * nose-up, matching the GTA drawable's local +Y forward / positive-X render
 * rotation convention. Spring rates are per wheel in Assetto data, hence the
 * two-spring axle stiffness below.
 */
export function assettoLongitudinalPitchDelta(profile, accelerationMetersPerSecondSquared) {
    const mass = clamp(finite(profile?.mass, 1450), 650, 12000);
    const wheelbase = clamp(finite(profile?.wheelbase, 2.65), 2.0, 5.5);
    const cgHeight = clamp(finite(profile?.centerOfGravityHeightM, 0.52), 0.25, 1.0);
    const frontRate = clamp(finite(profile?.suspension?.front?.springRateNpm, 36000), 8000, 250000);
    const rearRate = clamp(finite(profile?.suspension?.rear?.springRateNpm, 32000), 8000, 250000);
    const loadTransfer = mass * finite(accelerationMetersPerSecondSquared) * cgHeight / wheelbase;
    const frontRise = loadTransfer / (frontRate * 2.0);
    const rearSquat = loadTransfer / (rearRate * 2.0);
    return clamp(Math.atan2(frontRise + rearSquat, wheelbase), -0.14, 0.14);
}

export function stepAssettoSuspensionAxis({
    position = 0, velocity = 0, target = 0, targetVelocity = 0, mass = 1450,
    springRate = 136000, progressiveRate = 0,
    bumpDamping = 14000, reboundDamping = 20000,
    grounded = true, dt = 1 / 120,
} = {}) {
    const step = clamp(dt, 0.001, 0.05);
    let nextPosition = finite(position);
    let nextVelocity = finite(velocity);
    if (!grounded) {
        nextVelocity -= 9.81 * step;
        nextPosition += nextVelocity * step;
        return { position: nextPosition, velocity: nextVelocity, acceleration: -9.81, springForce: 0, damperForce: 0 };
    }
    const error = finite(target) - nextPosition;
    const stiffness = clamp(springRate, 10000, 1000000);
    const progressive = clamp(progressiveRate, -4000000, 4000000);
    const relativeVelocity = nextVelocity - finite(targetVelocity);
    const compressing = relativeVelocity <= 0;
    const damping = clamp(compressing ? bumpDamping : reboundDamping, 200, 160000);
    const springForce = stiffness * error + progressive * error * Math.abs(error);
    const damperForce = -damping * relativeVelocity;
    const acceleration = clamp((springForce + damperForce) / clamp(mass, 100, 20000), -35, 35);
    nextVelocity += acceleration * step;
    nextPosition += nextVelocity * step;
    if (Math.abs(error) < 0.0005 && Math.abs(relativeVelocity) < 0.01) {
        nextPosition = finite(target);
        nextVelocity = finite(targetVelocity);
    }
    return { position: nextPosition, velocity: nextVelocity, acceleration, springForce, damperForce };
}

function stepAssettoVehicleSubstep(state, profile, contacts, input, dt) {
    const mass = clamp(finite(profile?.mass, 1450), 650, 12000);
    const wheelbase = clamp(finite(profile?.wheelbase, 2.65), 2.0, 5.5);
    const trackFront = clamp(finite(profile?.trackFront, 1.45), 1.1, 3.0);
    const trackRear = clamp(finite(profile?.trackRear, trackFront), 1.1, 3.0);
    const frontFraction = clamp(finite(profile?.centerOfGravityFrontFraction, 0.52), 0.25, 0.75);
    const cgHeight = profile.centerOfGravityHeightM;
    const yawInertia = profile.inertiaTensor[2];
    const driveFront = clamp(profile?.driveBiasFront, 0, 1);
    const brakeFront = clamp(finite(profile?.runtimeSetup?.brakeBiasFront ?? profile?.brakeBiasFront, 0.60), 0.2, 0.85);
    const finalDrive = profile.finalDrive;
    if (!Number.isFinite(finalDrive) || finalDrive < .1 || finalDrive > 20) throw Error('Authored finalDrive is unresolved');
    const ratios = Array.isArray(profile?.gearRatios) && profile.gearRatios.length ? profile.gearRatios.map((value) => Math.max(0.1, finite(value, 1))) : [3.2, 2.1, 1.45, 1.1, 0.9];
    const redline = clamp(finite(profile?.redlineRpm, 7200), 3000, 12000);
    const idle = clamp(finite(profile?.idleRpm, 850), 650, Math.min(1800, redline * 0.35));
    // AC stores these in milliseconds and some modern DCT profiles genuinely
    // author 5 ms cuts. Keep that value; the fixed-step update naturally
    // resolves it on the next physics tick instead of stretching it to 40 ms.
    const shiftUp = clamp(finite(profile?.shiftTimeUpSec, 0.18), 0.001, 1.2);
    const shiftDown = clamp(finite(profile?.shiftTimeDownSec, 0.16), 0.001, 1.2);
    const reverseRatio = clamp(Math.abs(finite(profile?.reverseRatio, ratios[0] * 0.82)), 0.5, 8.0);
    const controls = transmissionInput(state, input, ratios.length, state.longitudinal);
    const forwardDemand = clamp(input.throttle, 0, 1);
    const reverseDemand = clamp(input.reverse ?? input.brake, 0, 1);
    const reversing = reverseDemand > 0.001 && state.longitudinal <= 0.7 && forwardDemand <= 0.001;
    const throttleTarget = controls.throttle;
    const brakeTarget = controls.brake;
    // Pedals are applied controls, not engine response. Preserve calibrated
    // analog demand; engine/clutch/tyre dynamics provide the physical response.
    // The 20260905 Porsche captures resolve pedal steps within one sample.
    // Keep the legacy ramp only for binary/unspecified input sources.
    if (input.source === 'wheel' || input.source === 'controller') {
        state.throttle = throttleTarget;
        state.brake = brakeTarget;
    } else {
        state.throttle += (throttleTarget - state.throttle) * (1 - Math.exp(-(Math.abs(throttleTarget) > Math.abs(state.throttle) ? 8 : 11) * dt));
        state.brake += (brakeTarget - state.brake) * (1 - Math.exp(-(brakeTarget ? 20 : 13) * dt));
    }
    // Assetto's STEER_LOCK is the physical road-wheel limit. The old 10%
    // speed floor reduced the 350Z to only 4.5 degrees at 30 m/s and 2.8
    // degrees at 50 m/s, making bends impossible before the tyre model could
    // generate physical understeer. Preserve most of the authored authority;
    // modest speed sensitivity keeps binary keyboard input controllable.
    const speedAuthority = 0.58 + 0.42 / (1 + Math.pow(Math.abs(state.longitudinal) / 32, 2));
    const steerTarget = clamp(input.steer, -1, 1) * (input.source === 'wheel' ? 1 : speedAuthority);
    const speedResponseScale = 0.48 + 0.52 / (1 + Math.pow(Math.abs(state.longitudinal) / 34, 2));
    const steeringRate = (Math.abs(steerTarget) > Math.abs(state.steering) ? 5.5 : 8.0) * speedResponseScale;
    if (input.source === 'wheel' || input.steeringFiltered === true) state.steering = steerTarget;
    else state.steering += (steerTarget - state.steering) * (1 - Math.exp(-steeringRate * dt));
    // Some AC suspension conventions encode steering lock with a signed value;
    // the sign describes orientation, not a negative maximum angle.
    const steeringLock = clamp(Math.abs(finite(profile?.steeringLock, 32)), 15, 58) || 32;
    const steerRad = state.steering * steeringLock * Math.PI / 180;

    state.shiftTimer = Math.max(0, state.shiftTimer - dt);
    state.shiftCooldown = Math.max(0, finite(state.shiftCooldown) - dt);
    const reverse = controls.reverse;
    const gearCount = ratios.length;
    state.gear = clamp(state.gear, 1, gearCount) | 0;
    if (controls.manual) state.gear = Math.max(1, controls.selected);
    if (controls.changed && controls.manual) state.shiftTimer = controls.selected < controls.previous ? shiftDown : shiftUp;
    state.displayGear = controls.neutral ? 0 : reverse ? -1 : state.gear;
    const frontDrivenOmega = (state.wheelOmega[27922] + state.wheelOmega[26418]) * 0.5;
    const rearDrivenOmega = (state.wheelOmega[27902] + state.wheelOmega[26398]) * 0.5;
    const drivenOmega = profile?.driveType === 'AWD2' && profile.awd2Center && !profile.awd2Center.controllerRequired
        ? rearDrivenOmega
        : frontDrivenOmega * driveFront + rearDrivenOmega * (1 - driveFront);
    if (!Number.isFinite(state.driveline?.engineOmega)) state.rpm = clamp(finite(state.rpm, idle), idle, redline * 1.04);
    const automaticUpRpm = clamp(profile.autoShiftUpRpm > 0 ? profile.autoShiftUpRpm : redline * .975,
        idle * 1.5, redline - Math.max(100, redline * .015));
    const automaticDownRpm = clamp(profile.autoShiftDownRpm > 0 ? profile.autoShiftDownRpm : Math.max(idle * 1.5, redline * .48), idle * 1.1, redline * .9);
    // Shift from road speed as well as engine speed: free revving during a
    // clutch cut or wheelspin must not ratchet through all gears at low speed.
    const rollingRadius = profile.driveType === 'AWD2' ? profile.tyres.rear.radius
        : 1 / (driveFront / profile.tyres.front.radius + (1 - driveFront) / profile.tyres.rear.radius);
    const roadRpm = Math.abs(state.longitudinal) / rollingRadius * finalDrive * ratios[state.gear - 1] * 30 / Math.PI;
    if (!controls.manual && !controls.neutral && !reverse && state.shiftTimer <= 0 && state.shiftCooldown <= 0
        && state.throttle > .2 && state.rpm > automaticUpRpm && roadRpm > automaticUpRpm * .85 && state.gear < gearCount) {
        state.gear++;
        state.shiftTimer = shiftUp;
        state.shiftCooldown = shiftUp + .25;
    } else if (!controls.manual && !controls.neutral && !reverse && state.shiftTimer <= 0 && state.shiftCooldown <= 0
        && state.gear > 1 && roadRpm < automaticDownRpm && roadRpm * ratios[state.gear - 2] / ratios[state.gear - 1] < automaticUpRpm * .9) {
        state.gear--;
        state.shiftTimer = shiftDown;
        state.shiftCooldown = shiftDown + .25;
    }

    const frontDistance = wheelbase * (1 - frontFraction);
    const ratio = controls.neutral ? 0 : reverse ? -reverseRatio : ratios[state.gear - 1];
    state.displayGear = controls.neutral ? 0 : reverse ? -1 : state.gear;
    const rearDistance = wheelbase - frontDistance;
    const longTransfer = mass * state.previousLongitudinalAcceleration * cgHeight / wheelbase;
    const frontRollStiffness = Math.max(1, finite(profile?.suspension?.front?.antiRollBarNm)
        + finite(profile?.suspension?.front?.springRateNpm, 34000) * trackFront * trackFront * 0.18);
    const rearRollStiffness = Math.max(1, finite(profile?.suspension?.rear?.antiRollBarNm)
        + finite(profile?.suspension?.rear?.springRateNpm, 32000) * trackRear * trackRear * 0.18);
    const rollFrontFraction = frontRollStiffness / (frontRollStiffness + rearRollStiffness);
    const lateralTransfer = mass * state.previousLateralAcceleration * cgHeight / ((trackFront + trackRear) * 0.5);
    const latTransferFront = lateralTransfer * rollFrontFraction;
    const latTransferRear = lateralTransfer * (1 - rollFrontFraction);
    const gravity = roadGravity(contacts);
    const staticFront = mass * 9.81 * gravity.normalScale * frontFraction;
    const staticRear = mass * 9.81 * gravity.normalScale * (1 - frontFraction);
    const aero = stepAero(state, profile, contacts, input, dt);
    const frontAeroLoad = aero.front;
    const rearAeroLoad = aero.rear;
    const wheels = [
        { key: wheelKey(true, true), front: true, left: true, x: trackFront * 0.5, y: frontDistance },
        { key: wheelKey(true, false), front: true, left: false, x: -trackFront * 0.5, y: frontDistance },
        { key: wheelKey(false, true), front: false, left: true, x: trackRear * 0.5, y: -rearDistance },
        { key: wheelKey(false, false), front: false, left: false, x: -trackRear * 0.5, y: -rearDistance },
    ];
    const torquePoints = Array.isArray(profile?.engineTorqueCurveNm) ? profile.engineTorqueCurveNm : [];
    const curvePeak = torquePoints.reduce((peak, point) => Math.max(peak, Array.isArray(point) ? finite(point[1]) : 0), 0);
    const peakEngineTorque = Math.max(80, finite(profile?.peakEngineTorqueNm, curvePeak || mass * 0.17));
    const curveTorque = curve(torquePoints, state.rpm, Number.NaN);
    if (!Number.isFinite(curveTorque) || curveTorque < 0) throw Error('Authored engine torque curve is invalid');
    // Throttle sign selects the transmission direction; engine output itself is
    // a positive magnitude. Clamping signed reverse throttle to zero left only
    // coast torque, which the negative reverse ratio then turned into a small
    // forward wheel torque.
    // Pedal travel is not engine torque. A progressive road-car pedal
    // map can be supplied explicitly. Without calibration, preserve proportional
    // pedal demand instead of imposing the old arbitrary 2.20 exponent.
    const pedalExponent = clamp(finite(profile.physicsDebug?.pedalExponent, 1), 1, 3);
    const pedalTorque = Math.pow(Math.abs(state.throttle), pedalExponent);
    state.turboBoost ||= [];
    let boostMultiplier = 1;
    for (const [index, turbo] of (Array.isArray(profile?.turbos) ? profile.turbos : []).entries()) {
        const referenceRpm = Math.max(idle + 1, finite(turbo.referenceRpm, redline * 0.45));
        const rpmFactor = clamp((state.rpm - idle) / (referenceRpm - idle), 0, 1);
        const targetBoost = Math.max(0, finite(turbo.maxBoost)) * rpmFactor
            * Math.pow(Math.abs(state.throttle), clamp(finite(turbo.gamma, 1), 0.2, 4));
        const previousBoost = finite(state.turboBoost[index]);
        const lag = clamp(targetBoost >= previousBoost ? turbo.lagUp : turbo.lagDown, 0, 0.9999);
        const response = 1 - Math.pow(lag, dt * 60);
        state.turboBoost[index] = previousBoost + (targetBoost - previousBoost) * response;
        boostMultiplier += state.turboBoost[index];
    }
    const limiterHz = clamp(finite(profile?.limiterHz, 50), 1, 500);
    const engineTorque = limitCombustion(state, {rpm: state.rpm, redline, inertia: profile.engineInertia,
        requestedTorque: state.shiftTimer > 0 ? 0 : curveTorque * pedalTorque * boostMultiplier, dt, frequency: limiterHz});
    // Engine braking dissipates coupled shaft motion; it cannot motor a
    // stationary car backwards in a forward gear (or vice versa).
    const coastTorque = Math.max(0, curve(profile?.engineBrakingCurveNm, state.rpm, 0))
        * clamp(1 - Math.abs(state.throttle) * 1.5, 0, 1)
        * clamp(state.rpm / idle, 0, 4);
    let forceX = 0; let forceY = 0; let yawMoment = 0; let maxSlip = 0;
    const telemetryWheels = {};
    const driveCandidates = wheels.filter((wheel) => wheel.front ? driveFront > 0.02 || profile.driveType === 'AWD2' : driveFront < 0.98);
    const drivenSlip = driveCandidates.length ? driveCandidates.reduce((sum, wheel) => sum + Math.abs(finite(state._lastSlipRatio?.[wheel.key])), 0) / driveCandidates.length : 0;
    const tcSlipLimit = clamp(finite(profile?.assists?.tractionControlSlipRatioLimit, 0.13), 0.03, 0.5);
    const tcMinimumSpeed = Math.max(0, finite(profile?.assists?.tractionControlMinimumSpeedKmh)) / 3.6;
    const tcFactor = profile.assists?.tractionControlPresent === true && input.assists?.tractionControl !== false && Math.abs(state.longitudinal) >= tcMinimumSpeed
        && drivenSlip > tcSlipLimit && Math.abs(state.throttle) > 0.01
        ? clamp(1 - (drivenSlip - tcSlipLimit) * 2.5, 0.2, 1) : 1;
    state.relaxedSlipRatio ||= wheelMap(0);
    state.relaxedSlipAngle ||= wheelMap(0);
    state.suspensionOffset ||= {};
    state.suspensionRestOffset ||= {};
    const nextSlipRatio = {};
    const nextSlipAngle = {};

    // Sequential contact impulses share the current chassis state. Alternating
    // sweep order avoids a persistent left/right preference from splitting.
    const debug=profile.physicsDebug||{};
    let vertical=debug.unified?state.vertical:debug.vertical?stepVertical(state,profile,contacts,dt,{longAcceleration:state.previousLongitudinalAcceleration,
        latAcceleration:state.previousLateralAcceleration,frontAero:frontAeroLoad,rearAero:rearAeroLoad}):null;
    const combinedWheels=[];
    state.tyreConditions||={};
    state.environmentTime=(state.environmentTime??0)+dt;
    let waterResistance=0,waterForceX=0,waterForceY=0,waterYaw=0;
    let contactLong = state.longitudinal, contactLat = state.lateral, contactYaw = state.yawRate;
    state.contactSweep = !state.contactSweep;
    for (const wheel of (state.contactSweep ? wheels : [...wheels].reverse())) {
        const axle = wheel.front ? 'front' : 'rear';
        const contact = contacts?.contacts?.[wheel.key] || {};
        const grounded = contact.grounded === true;
        const grip = clamp(finite(contact.grip, 1), 0.15, 1.5);
        const staticLoad = wheel.front ? staticFront * 0.5 : staticRear * 0.5;
        const longLoad = wheel.front ? -longTransfer * 0.5 : longTransfer * 0.5;
        const lateralLoad = (wheel.front ? latTransferFront : latTransferRear) * (wheel.left ? -1 : 1);
        const hasSuspensionSample = Number.isFinite(Number(state.suspensionOffset[wheel.key]));
        const suspensionTarget = finite(contact.suspensionOffset, hasSuspensionSample ? state.suspensionOffset[wheel.key] : 0);
        const priorSuspensionOffset = hasSuspensionSample ? Number(state.suspensionOffset[wheel.key]) : suspensionTarget;
        const suspensionFilter = grounded ? (1 - Math.exp(-32 * dt)) : (1 - Math.exp(-12 * dt));
        const suspensionOffset = lerp(priorSuspensionOffset, suspensionTarget, suspensionFilter);
        if (!Number.isFinite(Number(state.suspensionRestOffset[wheel.key]))) {
            state.suspensionRestOffset[wheel.key] = suspensionOffset;
        }
        const suspensionDeflection = suspensionOffset - finite(state.suspensionRestOffset[wheel.key]);
        const suspensionVelocity = (suspensionOffset - priorSuspensionOffset) / Math.max(0.001, dt);
        state.suspensionOffset[wheel.key] = suspensionOffset;
        const springRate = clamp(finite(profile?.suspension?.[axle]?.springRateNpm, 34000), 8000, 250000);
        const progressiveRate = clamp(finite(profile?.suspension?.[axle]?.progressiveSpringRateNpm2), -1000000, 1000000);
        const bumpDamping = clamp(finite(profile?.suspension?.[axle]?.bumpDampingNsPm, 3600), 100, 30000);
        const reboundDamping = clamp(finite(profile?.suspension?.[axle]?.reboundDampingNsPm, 5200), 100, 40000);
        const fastBumpThreshold = Math.max(0, finite(profile?.suspension?.[axle]?.fastBumpThresholdMps, Infinity));
        const fastReboundThreshold = Math.max(0, finite(profile?.suspension?.[axle]?.fastReboundThresholdMps, Infinity));
        const damperRate = suspensionVelocity >= 0
            ? (suspensionVelocity > fastBumpThreshold ? clamp(finite(profile?.suspension?.[axle]?.fastBumpDampingNsPm, bumpDamping), 100, 40000) : bumpDamping)
            : (-suspensionVelocity > fastReboundThreshold ? clamp(finite(profile?.suspension?.[axle]?.fastReboundDampingNsPm, reboundDamping), 100, 50000) : reboundDamping);
        let springLoad = springRate * suspensionDeflection
            + progressiveRate * suspensionDeflection * Math.abs(suspensionDeflection);
        const bumpStopUp = Math.max(0.005, finite(profile?.suspension?.[axle]?.bumpStopUpM, 0.10));
        const bumpStopDown = Math.max(0.005, finite(profile?.suspension?.[axle]?.bumpStopDownM, 0.10));
        const bumpStopRate = Math.max(0, finite(profile?.suspension?.[axle]?.bumpStopRateNpm));
        if (suspensionDeflection > bumpStopUp) springLoad += (suspensionDeflection - bumpStopUp) * bumpStopRate;
        else if (suspensionDeflection < -bumpStopDown) springLoad += (suspensionDeflection + bumpStopDown) * bumpStopRate;
        const damperLoad = damperRate * suspensionVelocity;
        const dynamicSuspensionLoad = grounded
            ? clamp(springLoad + damperLoad, -staticLoad * 0.72, staticLoad * 1.20)
            : 0;
        const aeroLoad = wheel.front ? frontAeroLoad * 0.5 : rearAeroLoad * 0.5;
        const normal = Number.isFinite(contact.normalForceN) ? Math.max(0,contact.normalForceN) : vertical ? vertical.normal[wheel.key] : grounded
            ? Math.max(0, staticLoad + longLoad + lateralLoad + dynamicSuspensionLoad + aeroLoad)
            : 0;
        const radius = profile.tyres[axle].radius;
        const inertia = profile.tyres[axle].angularInertia + (profile.systems?.shaftInertias?.halfShaftKgM2?.[WHEEL_KEYS.indexOf(wheel.key)] ?? 0);
        const geometry=steeringGeometry({steer:wheel.front?steerRad:0,wheelbase,track:wheel.front?trackFront:trackRear,left:wheel.left,toeDeg:finite(profile.suspension?.[axle]?.toeDeg),camberDeg:finite(profile.suspension?.[axle]?.staticCamberDeg),travelM:suspensionDeflection,kinematics:profile.suspension?.[axle]?.kinematics});
        const steer = Number.isFinite(contact.steerRad)?contact.steerRad:debug.geometry?geometry.steer:(wheel.front ? steerRad : 0);
        const conditionConfig={...experimentalTyreParameters,...debug.tyreParameters,coldPressurePa:finite(profile.tyres[axle].authoredParameters?.PRESSURE_STATIC,32)*6894.757};
        const wetness=clamp(contact.wetness??debug.wetness??0,0,1),waterDepthM=Math.max(0,contact.waterDepthM??roadWater({initialDepthM:debug.waterDepthM??0,rainMps:debug.rainMps??0,drainMps:debug.drainMps??0,elapsedSec:state.environmentTime}));
        const condition=debug.conditions?stepTyreCondition(state.tyreConditions[wheel.key],conditionConfig,{dt,heatJ:state.elasticTyres?.[wheel.key]?.heatJ??0,wearWorkJ:Math.max(0,state.elasticTyres?.[wheel.key]?.energyLedger?.slidingWorkJ??state.elasticTyres?.[wheel.key]?.heatJ??0),speed:Math.hypot(state.longitudinal,state.lateral),wetness,punctureAreaM2:debug.puncturedWheel===wheel.key?1e-5:0}):null;
        if(condition)state.tyreConditions[wheel.key]=condition;
        const waterLong=contactLong-contactYaw*wheel.x-(contact.waterCurrentLongMps||0),waterLat=contactLat+contactYaw*wheel.y-(contact.waterCurrentLatMps||0);const environment=condition?wetContact(condition,conditionConfig,{load:normal,speed:Math.hypot(waterLong,waterLat),width:finite(profile.tyres[axle].width,.25),waterDepthM,wetness,macrotextureDepthM:contact.macrotextureDepthM??debug.macrotextureDepthM??.001}):liveWetContact(profile.tyres[axle],{load:normal,speed:Math.hypot(waterLong,waterLat),width:finite(profile.tyres[axle].width,.25),waterDepthM,wetness,macrotextureDepthM:contact.macrotextureDepthM??.0007});
        waterResistance+=environment.waterDragN;const waterForce=tireWaterForce(contact,wheel,waterLong,waterLat,environment.waterDragN,mass,yawInertia,dt);waterForceX+=waterForce.x;waterForceY+=waterForce.y;waterYaw+=waterForce.yaw;
        const patchLong = contactLong - contactYaw * wheel.x;
        const patchLat = contactLat + contactYaw * wheel.y;
        const tireLong = patchLong * Math.cos(steer) + patchLat * Math.sin(steer);
        const tireLat = -patchLong * Math.sin(steer) + patchLat * Math.cos(steer);
        const omega = finite(state.wheelOmega[wheel.key]);
        const rawSlipRatio = (radius * omega - tireLong) / Math.max(3, Math.abs(tireLong));
        const rawSlipAngle = Math.atan2(tireLat, Math.max(1.0, Math.abs(tireLong)));
        const relaxationLength = clamp(tyre(profile, axle, 'relaxationLength', 0.18), 0.04, 1.5);
        const relaxationSpeed = Math.max(0.75, Math.abs(tireLong), Math.abs(radius * omega));
        const relaxationBlend = 1 - Math.exp(-(relaxationSpeed / relaxationLength) * dt);
        let slipRatio = lerp(
            finite(state.relaxedSlipRatio[wheel.key]),
            grounded ? rawSlipRatio : 0,
            relaxationBlend,
        );
        let slipAngle = lerp(
            finite(state.relaxedSlipAngle[wheel.key]),
            grounded ? rawSlipAngle : 0,
            relaxationBlend,
        );
        nextSlipRatio[wheel.key] = slipRatio;
        nextSlipAngle[wheel.key] = slipAngle;
        const refLoad = Math.max(300, tyre(profile, axle, 'referenceLoadN', staticLoad));
        const speedSensitivity = clamp(1 - tyre(profile, axle, 'speedSensitivity', 0) * Math.abs(tireLong), 0.62, 1);
        const camberGain = 1 + Math.abs(Number.isFinite(contact.camberDeg)?contact.camberDeg:debug.geometry?geometry.camberDeg:finite(profile?.suspension?.[axle]?.staticCamberDeg)) * (Math.PI / 180)
            * Math.max(0, tyre(profile, axle, 'camberGain', 0));
        const muLong = Math.max(0.35, tyre(profile, axle, 'peakLongitudinalMu', 1.05) * (1 + tyre(profile, axle, 'longitudinalLoadSensitivity', -0.04) * ((normal - refLoad) / refLoad))) * grip * speedSensitivity;
        const muLat = Math.max(0.35, tyre(profile, axle, 'peakLateralMu', 1.08) * (1 + tyre(profile, axle, 'lateralLoadSensitivity', -0.04) * ((normal - refLoad) / refLoad))) * grip * speedSensitivity * camberGain;
        // Shape lateral force from the imported AC peak-slip angle. The old
        // fixed 0.105 rad denominator made every tire respond identically.
        const peakSlipAngle = clamp(tyre(profile, axle, 'peakSlipAngleDeg', 8.5) * (Math.PI / 180), 0.06, 0.35);
        const lateralShape = peakSlipAngle / 1.82;
        if(debug.combined){
            const wheelBrakeTorque=brakeTorqueForWheel(state,profile,wheel.key,state.brake,brakeFront,
                clamp(finite(profile?.runtimeSetup?.brakePowerMultiplier,1),.5,1.5),clamp(Number(input.handbrake),0,1));
            const absLimit=clamp(finite(profile?.assists?.absSlipRatioLimit,.16),.03,.5);
            const absEnabled=profile.assists?.absPresent===true&&input.assists?.abs!==false&&state.brake>.05;
            // Signed slip reverses when travelling backwards; ABS responds to locking, not wheelspin.
            const brakingSlip = -slipRatio * Math.sign(tireLong);
            const absDemand=clamp((brakingSlip-absLimit)/absLimit,0,1);
            const absFactor=absEnabled?(debug.unified||debug.sharedRig?1-.64*absDemand*absDemand*(3-2*absDemand):(brakingSlip > absLimit?.36:1)):1;
            combinedWheels.push({...wheel,steer,omega,radius,inertia,brakeTorque:wheelBrakeTorque*absFactor,
                normalReference:normal,frictionLongPerN:muLong*environment.gripScale*(normal>0?environment.solidLoadN/normal:1),frictionLatPerN:muLat*environment.gripScale*(normal>0?environment.solidLoadN/normal:1),capLong:muLong*environment.solidLoadN*environment.gripScale,capLat:muLat*environment.solidLoadN*environment.gripScale,shape:lateralShape,relaxationLength,
                falloffLevel:profile.tyres[axle].falloffLevel,falloffSpeed:profile.tyres[axle].falloffSpeed});
            telemetryWheels[wheel.key]={steerRad:steer,condition,environment,geometry,normal,grounded,grip,rawSlipAngle,relaxationLength,
                suspensionOffset,suspensionVelocity,springLoad,damperLoad,dynamicSuspensionLoad,
                brakeTorque:wheelBrakeTorque*absFactor,absActive:absFactor<1,differentialShare:.5,
                lateralCapacity:muLat*normal,longitudinalCapacity:muLong*normal};
            continue;
        }

        let fx = 0;
        const cosSteer = Math.cos(steer), sinSteer = Math.sin(steer);
        const lateralArm = wheel.y * cosSteer + wheel.x * sinSteer;
        const longitudinalArm = wheel.y * sinSteer - wheel.x * cosSteer;
        const lateralStep = solveLateralContact({speed:tireLat,longSpeed:tireLong,
            previousSlip:finite(state.relaxedSlipAngle[wheel.key]),relaxationLength,
            capacity:muLat*normal,shape:lateralShape,inverseMass:1/mass+lateralArm*lateralArm/yawInertia,dt});
        const fy = lateralStep.force;
        slipAngle = lateralStep.slip;
        nextSlipAngle[wheel.key] = slipAngle;
        contactLong -= fy*sinSteer*dt/mass;
        contactLat += fy*cosSteer*dt/mass;
        contactYaw += fy*lateralArm*dt/yawInertia;
        const coupledTireLong = (contactLong-contactYaw*wheel.x)*cosSteer
            + (contactLat+contactYaw*wheel.y)*sinSteer;
        const lateralUsage = Math.min(1, Math.abs(fy) / Math.max(1e-12, muLat * normal));
        const longitudinalCapacity = muLong * normal * Math.sqrt(Math.max(0, 1 - lateralUsage * lateralUsage));
        // Contact/braking and coupled shaft constraints are operator-split.
        // Drivetrain impulses below own wheel acceleration, never duplicated here.
        const wheelDriveTorque = 0;
        const wheelBrakeTorque = brakeTorqueForWheel(state, profile, wheel.key, state.brake, brakeFront,
            clamp(finite(profile?.runtimeSetup?.brakePowerMultiplier, 1), .5, 1.5), clamp(Number(input.handbrake), 0, 1));
        const absSlipLimit = clamp(finite(profile?.assists?.absSlipRatioLimit, 0.16), 0.03, 0.5);
        const absFactor = profile.assists?.absPresent === true && input.assists?.abs !== false && state.brake > 0.05 && -slipRatio * Math.sign(tireLong) > absSlipLimit ? 0.36 : 1;
        const contactStep = solveLongitudinalContact({
            omega, radius, inertia, driveTorque: wheelDriveTorque,
            brakeTorque: wheelBrakeTorque * absFactor, speed: coupledTireLong,
            inverseMass:1/mass+longitudinalArm*longitudinalArm/yawInertia,
            previousSlip: finite(state.relaxedSlipRatio[wheel.key]),
            relaxationLength, capacity: longitudinalCapacity, dt,
        });
        fx = contactStep.force;
        contactLong += fx*cosSteer*dt/mass;
        contactLat += fx*sinSteer*dt/mass;
        contactYaw += fx*longitudinalArm*dt/yawInertia;
        slipRatio = contactStep.slip;
        nextSlipRatio[wheel.key] = slipRatio;
        state.wheelOmega[wheel.key] = contactStep.nextOmega;
        const brakeThermal = updateBrakeHeat(state, profile, wheel.key, contactStep.brakeApplied,
            omega, contactStep.nextOmega, state.longitudinal, dt, input.assists?.damage !== false);
        const bodyFx = fx * Math.cos(steer) - fy * Math.sin(steer);
        const bodyFy = fx * Math.sin(steer) + fy * Math.cos(steer);
        forceX += bodyFx; forceY += bodyFy; yawMoment += wheel.y * bodyFy - wheel.x * bodyFx;
        maxSlip = Math.max(maxSlip, Math.abs(slipRatio), Math.abs(slipAngle) / 0.35);
        telemetryWheels[wheel.key] = {
            steerRad: steer,
            normal, fx: bodyFx, fy: bodyFy, slipRatio, slipAngle,
            rawSlipRatio: contactStep.rawSlip, rawSlipAngle, relaxationLength,
            tyreReactionTorque: contactStep.reactionTorque, appliedBrakeTorque: contactStep.brakeApplied,
            contactSolveResidual: contactStep.residual, lateralSolveResidual:lateralStep.residual,
            tyreLongForce:fx, tyreLatForce:fy, longitudinalCapacity, lateralCapacity:muLat*normal,
            suspensionOffset, suspensionVelocity, springLoad, damperLoad, dynamicSuspensionLoad,
            driveTorque: wheelDriveTorque, brakeTorque: wheelBrakeTorque * absFactor,
            absActive: absFactor < 1, differentialShare: .5, brakeThermal,
            omega: state.wheelOmega[wheel.key], grounded, grip,
        };
    }
    const autoClutch = input.autoClutch !== false;
    const clutchMin = profile.systems?.autoClutch?.minRpm > 0 ? profile.systems.autoClutch.minRpm : idle * 1.05;
    const clutchMax = Math.max(clutchMin + 100, profile.systems?.autoClutch?.maxRpm > 0 ? profile.systems.autoClutch.maxRpm : idle * 2);
    const engagement = automaticClutchEngagement(state, profile, controls, input, idle);
    const idleGovernor = Math.min(Math.max(40, curve(torquePoints, idle, peakEngineTorque) * .35),
        Math.max(0, rpmToOmega(idle - state.rpm)) * profile.engineInertia / dt);
    const rotationInput={ratio,finalDrive,clutch:engagement,shiftOpen:state.shiftTimer>0,engineTorqueNm:engineTorque*tcFactor-coastTorque+idleGovernor,maximumRpm:redline*1.04,controls:input};
    if(debug.combined){
        combinedWheels.sort((a,b)=>WHEEL_KEYS.indexOf(a.key)-WHEEL_KEYS.indexOf(b.key));
        const result=debug.sharedRig?{tyreState:state.elasticTyres??{},longitudinal:state.longitudinal,lateral:state.lateral,yawRate:state.yawRate,projectedResidual:0,iterations:0,wheels:combinedWheels.map(w=>({omega:w.omega,fx:0,fy:0,brakeApplied:0,slipRatio:state._lastSlipRatio?.[w.key]??0,slipAngle:state.relaxedSlipAngle?.[w.key]??0,postPeakScale:1,utilization:0}))}:(debug.unified?solveUnifiedContacts:solveCombinedContacts)({longitudinal:state.longitudinal,lateral:state.lateral,yawRate:state.yawRate,
            mass,yawInertia,wheels:combinedWheels,dt,postPeak:debug.postPeak===true,iterations:debug.iterations??160,elastic:debug.elastic===true,convectiveOnly:debug.physicalRelaxation===true,tyreState:state.elasticTyres??{},unified:{state,profile,rotation:rotationInput,contacts,frontAero:frontAeroLoad,rearAero:rearAeroLoad}});
        if(debug.unified){vertical=state.vertical;for(const w of combinedWheels)if(vertical)telemetryWheels[w.key].normal=vertical.normal[w.key];}
        state.elasticTyres=result.tyreState;
        contactLong=result.longitudinal;contactLat=result.lateral;contactYaw=result.yawRate;
        state.combinedContact={elasticEnergyJ:result.elasticEnergyJ,totalContactEnergyDeltaJ:result.totalContactEnergyDeltaJ,dissipationJ:result.dissipationJ,passiveEnergyDeltaJ:result.totalContactEnergyDeltaJ,projectedResidual:result.projectedResidual,iterations:result.iterations};
        for(let i=0;i<4;i++){
            const w=combinedWheels[i],r=result.wheels[i],c=Math.cos(w.steer),sn=Math.sin(w.steer);
            const bodyFx=r.fx*c-r.fy*sn,bodyFy=r.fx*sn+r.fy*c;
            forceX+=bodyFx;forceY+=bodyFy;yawMoment+=w.y*bodyFy-w.x*bodyFx;
            state.wheelOmega[w.key]=r.omega;nextSlipRatio[w.key]=r.slipRatio;nextSlipAngle[w.key]=r.slipAngle;
            const heat=debug.sharedRig?state.brakeThermal?.[w.key]:updateBrakeHeat(state,profile,w.key,r.brakeApplied,w.omega,r.omega,state.longitudinal,dt,input.assists?.damage!==false);
            Object.assign(telemetryWheels[w.key],{fx:bodyFx,fy:bodyFy,tyreLongForce:r.fx,tyreLatForce:r.fy,slipRatio:r.slipRatio,
                slipAngle:r.slipAngle,rawSlipRatio:r.slipRatio,omega:r.omega,tyreReactionTorque:-r.fx*w.radius,
                appliedBrakeTorque:r.brakeApplied,brakeThermal:heat,contactSolveResidual:result.projectedResidual,
                lateralSolveResidual:result.projectedResidual,postPeakScale:r.postPeakScale,utilization:r.utilization});
            maxSlip=Math.max(maxSlip,Math.abs(r.slipRatio),Math.abs(r.slipAngle)/.35);
        }
    }
    const driveline = debug.sharedRig?{...state.driveline,wheelTorquesNm:[0,0,0,0],centerCouplingTorqueNm:0,centerLimitNm:null}:debug.unified?state.driveline:solveRotation(state, profile, {
        ratio, finalDrive, clutch: engagement, shiftOpen: state.shiftTimer > 0,
        engineTorqueNm: engineTorque * tcFactor - coastTorque + idleGovernor,
        maximumRpm: redline * 1.04, controls: input,
    }, dt);
    WHEEL_KEYS.forEach((key, i) => {
        telemetryWheels[key].omega = state.wheelOmega[key];
        telemetryWheels[key].driveTorque = driveline.wheelTorquesNm[i];
    });
    const differential = {driveBiasFront: driveFront, centerCouplingTorqueNm: driveline.centerCouplingTorqueNm,
        centerLimitNm: driveline.centerLimitNm, model: 'passive-rotational-constraints'};
    driveline.selectedGear = state.displayGear;
    driveline.totalRatio = ratio * finalDrive;
    driveline.gearRedlineSpeedMps = ratio ? redline * Math.PI / 30 * rollingRadius / Math.abs(ratio * finalDrive) : null;
    state.revLimiter.actualCombustionTorqueNm = engineTorque * tcFactor;
    state._lastSlipRatio = nextSlipRatio;
    state.relaxedSlipRatio = nextSlipRatio;
    state.relaxedSlipAngle = nextSlipAngle;
    const speedSquared = state.longitudinal * Math.abs(state.longitudinal);
    const rollingConstant = tyre(profile, 'front', 'rollingResistanceN', 12) + tyre(profile, 'rear', 'rollingResistanceN', 12);
    const rollingQuadratic = tyre(profile, 'front', 'rollingResistanceSpeedSquared', 0) + tyre(profile, 'rear', 'rollingResistanceSpeedSquared', 0);
    const onGround = Object.values(telemetryWheels).some(w => w.normal > 0);
    const rollingMagnitude = onGround ? Math.max(0, rollingConstant + rollingQuadratic * state.longitudinal * state.longitudinal) : 0;
    const rolling = -Math.sign(state.longitudinal) * Math.min(rollingMagnitude, mass * Math.abs(state.longitudinal) / dt);
    const speed = Math.hypot(state.longitudinal, state.lateral);
    const totalDrag=Math.min(aero.drag,mass*speed/dt);
    const drag = (speed > 0 ? -totalDrag * state.longitudinal / speed : 0)+waterForceX;
    const lateralDrag = (speed > 0 ? -totalDrag * state.lateral / speed : 0)+waterForceY;
    // Inertial acceleration expressed in the current body basis. A change of
    // coordinates is not a force and must not cancel steady cornering loads.
    const specificAccelerationX = (forceX + rolling + drag) / mass;
    const specificAccelerationY = (forceY + lateralDrag) / mass;
    const accelerationX = specificAccelerationX + gravity.longitudinal;
    const accelerationY = specificAccelerationY + gravity.lateral;
    const yawAcceleration = (yawMoment+waterYaw) / yawInertia;
    state.yawRate = contactYaw+waterYaw/yawInertia*dt;
    // Force kick in the old basis, then an orthogonal basis change using the
    // same updated yaw rate as the host heading step. Unlike explicit Euler
    // on (r*v, -r*u), this cannot create translational energy from yaw alone.
    const kickedLong = contactLong + ((rolling + drag) / mass + gravity.longitudinal) * dt;
    const kickedLat = contactLat + (lateralDrag / mass + gravity.lateral) * dt;
    const headingDelta = state.yawRate * dt;
    const c = Math.cos(headingDelta), s = Math.sin(headingDelta);
    state.longitudinal = c * kickedLong + s * kickedLat;
    state.lateral = -s * kickedLong + c * kickedLat;
    // No arcade yaw/lateral stabilization in the Assetto solver. Tyre forces
    // and their moments own the response, including genuinely unloaded wheels.
    state.engineLoad += ((Math.abs(state.throttle) * tcFactor) - state.engineLoad) * (1 - Math.exp(-10 * dt));
    state.previousLongitudinalAcceleration = specificAccelerationX;
    state.previousLateralAcceleration = specificAccelerationY;
    return {
        longitudinal: state.longitudinal, lateral: state.lateral, yawRate: state.yawRate, steeringRad: steerRad,
        rpm: state.rpm, gear: state.gear, shiftTimer: state.shiftTimer, throttle: state.throttle, brake: state.brake, engineLoad: state.engineLoad,
        driveline: { ...state.driveline },
        revLimiter: {...state.revLimiter},
        components: {curveTorqueNm:curveTorque,pedalExponent,pedalTorque,boostMultiplier,engineTorqueNm:engineTorque,coastTorqueNm:coastTorque,idleGovernorNm:idleGovernor,tractionControlFactor:tcFactor,clutchEngagement:engagement,authoredCoast:profile.physicsDebug?.authoredCoast!==false},
        sharedRequest:debug.sharedRig?{state,wheels:combinedWheels,rotation:rotationInput,drag:rolling+drag,lateralDrag,frontAero:frontAeroLoad,rearAero:rearAeroLoad}:null,sharedSolve:state.sharedSolve,aero, brakes: state.brakeThermal, combinedContact:state.combinedContact, vertical,
        forces: {waterResistance, longitudinal: forceX, lateral: forceY, yawMoment, rolling, drag, accelerationX, accelerationY, yawAcceleration, specificAccelerationX, specificAccelerationY, gravityLongitudinal: gravity.longitudinal, gravityLateral: gravity.lateral, roadNormalScale: gravity.normalScale },
        wheels: telemetryWheels, differential, tireSlip: clamp(maxSlip, 0, 2), tractionControl: tcFactor, reverse,
    };
}

// Debug-only full drivetrain/contact subcycling. Contacts stay fixed over the host step.
export function stepAssettoVehicle(state, profile, contacts, input, dt) {
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('Positive finite physics timestep required');
    profile = {...profile, physicsDebug: {...ASSETTO_CONTACT_SETTINGS, ...profile?.physicsDebug}};
    const requested = profile?.physicsDebug?.couplingSubsteps;
    const count = [1, 2, 4, 8].includes(requested) ? requested : 1;
    let result, headingDelta = 0, passiveEnergyDeltaJ = 0, maxProjectedResidual = 0;
    for (let i = 0; i < count; i++) {
        result = stepAssettoVehicleSubstep(state, profile, contacts, input, dt / count);
        headingDelta += result.yawRate * dt / count;
        passiveEnergyDeltaJ += result.combinedContact?.passiveEnergyDeltaJ ?? 0;
        maxProjectedResidual = Math.max(maxProjectedResidual, result.combinedContact?.projectedResidual ?? 0);
    }
    return {...result, headingDelta, coupling: {substeps:count, passiveEnergyDeltaJ, maxProjectedResidual}};
}
