import { authoredTravel } from './vehicle_contact_helpers.js';
const finite = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value)));

export const VEHICLE_PHYSICS_MODES = Object.freeze({
    gta: Object.freeze({ id: 'gta', label: 'GTA handling', description: 'The existing arcade-oriented GTA handling values.' }),
    assetto: Object.freeze({ id: 'assetto', label: 'Assetto Corsa profile', description: 'A deterministic simulation baseline, optionally calibrated from a local Assetto Corsa data profile.' }),
});

export function normalizeVehiclePhysicsMode(value) {
    return String(value || '').toLowerCase() === 'assetto' ? 'assetto' : 'gta';
}

export function vehiclePhysicsModeLabel(value) {
    return VEHICLE_PHYSICS_MODES[normalizeVehiclePhysicsMode(value)].label;
}

export function validateAssettoProfile(profile, vehicle = null) {
    const errors = [];
    const warnings = [];
    const required = (path, value, min, max) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number < min || number > max) errors.push(`${path} is outside ${min}..${max}`);
        return number;
    };
    if (!profile || typeof profile !== 'object') return { valid: false, errors: ['profile is missing'], warnings };
    required('mass', profile.mass, 650, 12000);
    required('wheelbase', profile.wheelbase, 2.0, 5.5);
    required('trackFront', profile.trackFront, 1.1, 3.0);
    required('trackRear', profile.trackRear, 1.1, 3.0);
    required('steeringLock', Math.abs(Number(profile.steeringLock)), 15, 58);
    required('driveBiasFront', profile.driveBiasFront, 0, 1);
    required('brakeBiasFront', profile.brakeBiasFront, 0.2, 0.85);
    const ratios = Array.isArray(profile.gearRatios) ? profile.gearRatios.map(Number) : [];
    if (!ratios.length || ratios.some((value) => !Number.isFinite(value) || value <= 0)) errors.push('gearRatios are missing or invalid');
    if (Number.isFinite(Number(profile.gears)) && Number(profile.gears) !== ratios.length) errors.push('gear count does not match gearRatios');
    const torque = Array.isArray(profile.engineTorqueCurveNm) ? profile.engineTorqueCurveNm : [];
    if (torque.length < 4 || !torque.some((row) => Array.isArray(row) && Number(row[1]) > 0)) errors.push('engineTorqueCurveNm lacks measured positive samples');
    const frontRadius = required('tyres.front.radius', profile.tyres?.front?.radius, 0.18, 0.65);
    const rearRadius = required('tyres.rear.radius', profile.tyres?.rear?.radius, 0.18, 0.65);
    if (Number.isFinite(frontRadius) && Number.isFinite(rearRadius)) {
        const axleDifference = Math.abs(frontRadius - rearRadius) / Math.max(frontRadius, rearRadius);
        if (axleDifference > 0.10) errors.push(`front/rear tyre radii differ by ${(axleDifference * 100).toFixed(1)}%`);
    }
    const authoredDrive = Number(vehicle?.handling?.driveBiasFront);
    const importedDrive = Number(profile.driveBiasFront);
    if ((authoredDrive <= 0.02 || authoredDrive >= 0.98) && Math.abs(authoredDrive - importedDrive) > 0.80) {
        errors.push(`driveBiasFront conflicts with the vehicle definition (${authoredDrive} vs ${importedDrive})`);
    }
    const renderedRadii = Object.values(vehicle?.wheelRadii || {}).map(Number).filter(Number.isFinite);
    if (renderedRadii.length && Number.isFinite(frontRadius) && Number.isFinite(rearRadius)) {
        const rendered = renderedRadii.reduce((sum, value) => sum + value, 0) / renderedRadii.length;
        for (const [axle, radius] of [['front', frontRadius], ['rear', rearRadius]]) {
            const difference = Math.abs(radius - rendered) / Math.max(radius, rendered);
            if (difference > 0.10) errors.push(`${axle} tyre radius conflicts with measured drawable radius by ${(difference * 100).toFixed(1)}%`);
            else if (difference > 0.04) warnings.push(`${axle} tyre radius differs from measured drawable radius by ${(difference * 100).toFixed(1)}%`);
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}

/**
 * GTA mode returns authored handling unchanged. Assetto mode is an independent
 * solver profile that accepts derived values from a user-owned, plaintext
 * Assetto Corsa data profile; it does not use executable game code.
 */
export function vehiclePhysicsHandling(vehicle) {
    const gtaHandling = vehicle?.handling && typeof vehicle.handling === 'object' ? vehicle.handling : {};
    if (normalizeVehiclePhysicsMode(vehicle?.physicsMode) !== 'assetto') return gtaHandling;
    const imported = vehicle?.assettoHandling && typeof vehicle.assettoHandling === 'object' ? vehicle.assettoHandling : {};
    const mass = clamp(imported.mass ?? gtaHandling.mass, 650, 12000);
    const frontTyre = imported.tyres?.front || {};
    const rearTyre = imported.tyres?.rear || {};
    const frontSuspension = imported.suspension?.front || {};
    const rearSuspension = imported.suspension?.rear || {};
    const axleAverage = (front, rear) => {
        const values = [finite(front, Number.NaN), finite(rear, Number.NaN)].filter(Number.isFinite);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const tyrePeak = axleAverage(frontTyre.peakLateralMu, rearTyre.peakLateralMu);
    const tyrePeakSlip = axleAverage(frontTyre.peakSlipAngleDeg, rearTyre.peakSlipAngleDeg);
    const springRate = axleAverage(frontSuspension.springRateNpm, rearSuspension.springRateNpm);
    const bumpDamping = axleAverage(frontSuspension.bumpDampingNsPm, rearSuspension.bumpDampingNsPm);
    const reboundDamping = axleAverage(frontSuspension.reboundDampingNsPm, rearSuspension.reboundDampingNsPm);
    const antiRollBar = axleAverage(frontSuspension.antiRollBarNm, rearSuspension.antiRollBarNm);
    const derivedSuspensionForce = springRate === null ? null : clamp(springRate / mass / 16, 0.2, 8);
    const derivedBumpDamping = bumpDamping === null ? null : clamp(bumpDamping / mass / 2.5, 0.1, 8);
    const derivedReboundDamping = reboundDamping === null ? null : clamp(reboundDamping / mass / 2.5, 0.1, 8);
    const derivedAntiRoll = antiRollBar === null ? null : clamp(antiRollBar / mass / 14, 0, 4);
    return {
        ...gtaHandling,
        ...imported,
        mass,
        driveBiasFront: clamp(imported.driveBiasFront ?? gtaHandling.driveBiasFront, 0, 1),
        brakeBiasFront: clamp(imported.brakeBiasFront ?? gtaHandling.brakeBiasFront, 0.35, 0.78),
        // This baseline favors a narrower tire peak, stronger load transfer,
        // more damping, and less low-speed steering assistance than GTA mode.
        driveForce: clamp(imported.driveForce ?? finite(gtaHandling.driveForce, 0.3) * 0.82, 0.04, 1),
        brakeForce: clamp(imported.brakeForce ?? finite(gtaHandling.brakeForce, 0.8) * 0.92, 0.1, 4),
        steeringLock: clamp(Math.abs(finite(imported.steeringLock, finite(gtaHandling.steeringLock, 35) * 0.78)), 18, 58),
        tractionMax: clamp(imported.tractionMax ?? tyrePeak ?? finite(gtaHandling.tractionMax, 2.2) * 0.90, 1.1, 4),
        tractionMin: clamp(imported.tractionMin ?? (tyrePeak === null ? finite(gtaHandling.tractionMin, 2.0) * 0.80 : tyrePeak * 0.82), 0.9, 4),
        tractionLateral: clamp(imported.tractionLateral ?? tyrePeakSlip ?? finite(gtaHandling.tractionLateral, 22.5) * 0.72, 8, 45),
        tractionLossMult: clamp(imported.tractionLossMult ?? Math.max(1.08, finite(gtaHandling.tractionLossMult, 1)), 0.35, 4),
        lowSpeedTractionLossMult: clamp(imported.lowSpeedTractionLossMult ?? finite(gtaHandling.lowSpeedTractionLossMult, 1) * 1.15, 0, 5),
        tractionBiasFront: clamp(imported.tractionBiasFront ?? imported.centerOfGravityFrontFraction ?? gtaHandling.tractionBiasFront, 0.1, 0.9),
        suspensionBiasFront: clamp(imported.suspensionBiasFront ?? imported.centerOfGravityFrontFraction ?? gtaHandling.suspensionBiasFront, 0.1, 0.9),
        suspensionForce: clamp(imported.suspensionForce ?? derivedSuspensionForce ?? finite(gtaHandling.suspensionForce, 2) * 1.18, 0.2, 8),
        suspensionCompDamp: clamp(imported.suspensionCompDamp ?? derivedBumpDamping ?? finite(gtaHandling.suspensionCompDamp, 1) * 1.22, 0.1, 8),
        suspensionReboundDamp: clamp(imported.suspensionReboundDamp ?? derivedReboundDamping ?? finite(gtaHandling.suspensionReboundDamp, 1.5) * 1.24, 0.1, 8),
        antiRollBarForce: clamp(imported.antiRollBarForce ?? derivedAntiRoll ?? finite(gtaHandling.antiRollBarForce, 0.7) * 1.12, 0, 4),
    };
}

/**
 * A loaded Assetto profile must be solver-authoritative. GTA handling is used
 * only as a temporary driveable baseline while that profile is unavailable.
 */
export function assettoSolverProfile(vehicle) {
    const imported = vehicle?.assettoHandling && typeof vehicle.assettoHandling === 'object'
        ? vehicle.assettoHandling
        : null;
    return imported && Object.keys(imported).length ? imported : null;
}

export function vehicleSuspensionTravel(vehicle, axle) {
    // Authored bump stops need no GTA compatibility-profile conversion.
    const travel = authoredTravel(vehicle, axle);
    if (travel) return travel;
    const handling = vehiclePhysicsHandling(vehicle) || {};
    const gtaLower = Math.min(-0.04, finite(handling.suspensionLowerLimit, -0.1));
    const gtaUpper = Math.max(0.04, finite(handling.suspensionUpperLimit, 0.1));
    if (normalizeVehiclePhysicsMode(vehicle?.physicsMode) !== 'assetto') {
        return { lower: gtaLower, upper: gtaUpper };
    }
    const key = String(axle || '').toLowerCase() === 'front' ? 'front' : 'rear';
    const suspension = vehicle?.assettoHandling?.suspension?.[key];
    if (!suspension || typeof suspension !== 'object') return { lower: gtaLower, upper: gtaUpper };
    const down = Number(suspension.bumpStopDownM);
    const up = Number(suspension.bumpStopUpM);
    return {
        lower: -clamp(Number.isFinite(down) ? Math.abs(down) : Math.abs(gtaLower), 0.02, 0.30),
        upper: clamp(Number.isFinite(up) ? Math.abs(up) : gtaUpper, 0.02, 0.30),
    };
}
