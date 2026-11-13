# Browser/native physics verification

The driving service simulates browser cars with the independent JavaScript
solver. Assetto Corsa simulates native cars. Sharing a car archive establishes
parameter provenance, not equivalent handling.

## Data and shared contacts

`vehicle-profile.mjs` pins the complete 350Z JSON export and its native `data.acd`
identity. Startup rejects changed export bytes, a different car, mismatched tyre
provenance, or invalid dynamics. An intentional profile update must change the
reviewed pins and pass the private source verification again. Do not edit only
the provenance fields in an otherwise modified export.

Both driver types use `vehicleBody()` for shared-contact mass and proxy dimensions.
The mass comes from the loaded profile; native cars no longer use a separate
hardcoded mass. Browser and native contacts against route-following traffic use
the same zero-restitution rule. The existing bounded native target-velocity
protocol remains in place. Its latency and correction cap still distinguish it
from local browser contacts.

The rectangular body proxy is unchanged and is not native `collider.kn5`
geometry. Native/native and native/track contacts remain owned by Assetto Corsa.

## Required private release check

Run with the exact physics export referenced by the deployment's asset catalog
and the car archive used by the native server:

```sh
node driving/tools/verify-physics-profile.mjs /private/350z.json /private/content/cars/06_ygt_53_nissan_350z/data.acd
DRIVING_TEST_PROFILE=/private/350z.json node --test driving/tests/*.test.mjs
```

Use the host's project temporary-storage wrapper for these commands. Keep game
data outside this public repository and outside CI artifacts. The check returns
both SHA-256 identities and fails on a mismatch. `dataIdentityVerified` does not
imply `nativeHandlingParityVerified`. Startup independently verifies export
identity even if an operator omits this private release command.

Build and run the repository tests and public-source scan. Deploy only the tested
commit through the release workflow and the versioned backend release procedure.
Retain the previous backend version and reuse its durable leaderboard database.
Verify the running service's release revision and readiness after activation.
These broker changes do not require a new native companion protocol.

## Remaining handling evidence

The existing authored-profile tests cover finite acceleration, braking, turning,
reverse, wall sweeps and road loss. They are not native-vs-browser differential
tests. The current solver also explicitly leaves native tyre thermal/pressure/
wear behavior, full suspension kinematics and controller calibration unresolved.
Do not describe this release as complete Assetto handling parity.

A handling qualification needs paired native and browser captures with the
same archive, setup, compound, pressures, fuel, assists, track surface, weather,
initial tyre state and timestamped applied controls. At minimum compare:

- Fixed-gear acceleration and coast-down: speed, RPM, wheel angular speeds.
- Braking: distance, deceleration and ABS intervention.
- Steady turns and steering steps: yaw rate, lateral acceleration and tyre slip.
- Gear changes and differential response under power/coast.
- Slopes, bumps and kerbs: loaded wheel contacts and suspension travel.
- Shared impacts: approach velocity, target velocity, acknowledgement and delay.

Retain the native game/CSP versions, source hashes and raw samples with each
capture. Define tolerances before tuning and reserve independent maneuvers for
validation. Matching one acceleration run cannot establish tyre or cornering
equivalence. A reference capture is required before changing the remaining
constitutive models or claiming this outstanding qualification has passed.
