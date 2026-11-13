// Occupancy transitions already stop cars in Matrix City. Keep the solver and
// controls consistent with that policy without cooling or repairing the car.
export function stopOccupiedVehicle(controller) {
    const vehicle = controller.vehicle;
    if (!vehicle) return;
    for (const key of ['speed', 'yawRate', 'throttle', 'brake', 'engineLoad',
        'longitudinalAcceleration', 'lateralAcceleration', 'tireSlip', 'shiftTimer']) vehicle[key] = 0;
    vehicle.velocityLocal = [0, 0];
    const solver = vehicle.assettoSolver;
    if (solver) {
        for (const key of ['longitudinal', 'lateral', 'yawRate', 'throttle', 'brake',
            'engineLoad', 'shiftTimer', 'previousLongitudinalAcceleration', 'previousLateralAcceleration']) solver[key] = 0;
        for (const key of ['wheelOmega', 'relaxedSlipRatio', 'relaxedSlipAngle']) {
            if (solver[key]) for (const wheel of Object.keys(solver[key])) solver[key][wheel] = 0;
        }
        // Reinitialize shaft velocities on the next tick, retaining clutch damage.
        const thermal = solver.driveline?.thermal;
        solver.driveline = thermal ? {thermal} : null;
    }
    controller._assettoTimeDebt = 0;
    controller._assettoClockVehicle = vehicle;
    controller.driverInput?.reset();
}

let visibilityGeneration = 0;
globalThis.document?.addEventListener?.('visibilitychange', () => { visibilityGeneration++; });

export function stepFixedAssetto(controller, elapsed, keys) {
    if (!Number.isFinite(elapsed) || elapsed < 0) return;
    if (controller._assettoVisibilityGeneration !== undefined && controller._assettoVisibilityGeneration !== visibilityGeneration) {
        controller._assettoTimeDebt = 0;
        elapsed = 0;
    }
    controller._assettoVisibilityGeneration = visibilityGeneration;
    if (globalThis.document?.hidden) {
        controller._assettoTimeDebt = 0;
        return;
    }
    if (controller._assettoClockVehicle !== controller.vehicle) {
        controller._assettoClockVehicle = controller.vehicle;
        controller._assettoTimeDebt = 0;
    }
    const dt = 1 / 480, maxSteps = 96;
    const priorDebt = Number.isFinite(controller._assettoTimeDebt) ? Math.max(0, controller._assettoTimeDebt) : 0;
    const requested = priorDebt + elapsed;
    // Preserve normal fixed-step accumulation, but never replay seconds of old
    // wall time with newly sampled controls after a stall (spiral of death).
    const budget = maxSteps * dt;
    const droppedSeconds = Math.max(0, requested - budget);
    const available = Math.min(requested, budget);
    const count = Math.min(maxSteps, Math.floor((available + 1e-10) / dt));
    // Steering slew, pedal handoff and selector timers use simulation time.
    // Reusing a frame's final input throughout catch-up applies future steering
    // to earlier ticks and repeats one-shot transmission requests after a stall.
    for (let i = 0; i < count; i++) {
        const input = controller.driverInput.sample(keys || {}, dt, 'assetto');
        controller._stepAssettoDriving(dt, input, {processFrameInteractions: i === count - 1});
    }
    controller._assettoTimeDebt = Math.max(0, available - count * dt);
    controller._lastPhysicsStats = {substeps: count, stepSeconds: count * dt, fixedStep: dt,
        backlogSeconds: controller._assettoTimeDebt, droppedSeconds,
        backend: 'matrix-assetto-combined-v14-live-1'};
}
