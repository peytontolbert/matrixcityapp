# Matrix Games shared driving

Matrix Games is independent of Matrix City. It reuses selected driving/rendering
modules (see `vendor/provenance.json`) and published Cloudflare R2 assets. It does
not import City accounts, pages, deployment configuration, or private services.

## Asset delivery

The browser obtains the catalog revision and batches of at most 64 descriptors
from `/v1/driving/asset-catalog` and `/v1/driving/asset-proofs`. Asset bytes come
directly from `https://assets.peytontolbert.com`; no local-file fallback is used.
The development service exposes these metadata routes without the API prefix.

`client/r2-cache.js` checks memory and IndexedDB before downloading. Persistent
chunks are keyed by SHA-256, verified before use, and shared by assets that refer
to the same pack chunk. Descriptors are cached by catalog revision. Corrupt
chunks are removed and fetched again; invalid network bytes are never saved.
Duplicate requests are coalesced, with cross-tab locks where the browser supports
Web Locks. LAN HTTP uses a worker SHA-256 implementation when Web Crypto is absent.

Downloads are limited to two concurrent requests with starts spaced at least
125 ms apart per page. Temporary failures use up to three attempts, respecting
`Retry-After`; waits over 30 seconds surface a retry-later error. Permanent
403/404 responses are not retried. Downloads have time and byte limits. A 96 MiB
memory cache and quota-aware IndexedDB LRU eviction bound retained source bytes.
Unavailable browser storage falls back to memory, so later visits may download
again. The cache belongs to the Matrix Games origin; it cannot read Matrix City's
IndexedDB. Only required nearby scenery and car assets are loaded.

The R2 CORS allowlist must contain each page origin, including its scheme and
nondefault port: for example `https://matrixgames.app` and the explicit LAN preview
origin. CORS on R2 does not replace the account API's separate origin policy.

`scripts/export-driving-catalog.py` selects public descriptors from the published
City index. `scripts/merge-driving-packs.mjs` adds hash-verified track pack
manifests. These scripts do not upload assets or change the bucket. The generated
catalog is runtime data and must remain outside Git. Set `assets.indexFile` in
the private service configuration. `assets.extraRoot` holds the server-only 415
traffic network; it is not a browser asset fallback.

## Service and launcher

Run Node 22+ with `MATRIX_DRIVING_CONFIG` pointing to private runtime JSON. The
service defaults to loopback port 4192. Configure `assets`, `keyFile`, and the two
sessions, each with its room, native join details, fixed loopback bridge endpoint,
private bridge token file, and reserved browser/traffic slots. The account API
uses `DRIVING_SERVICE_ORIGIN` and `DRIVING_SERVICE_KEY`. Guest admission is not
supported. Use the project's temporary-directory wrapper for remote builds.

The open-source Windows launcher builds from `native/MatrixGamesLauncher.cs`
using `scripts/build-launcher.ps1`. Run it once and choose **Enable browser joins**.
It copies itself to `%LOCALAPPDATA%/MatrixGames/Launcher` and registers the
`matrixgames://` URI handler for the current Windows user without administrator
access. Later website joins open the launcher directly; the browser may show its
normal external-application prompt. The launcher automatically
checks the installed game and required content, backs up the race configuration,
and starts Assetto Corsa through the user's Steam installation. Content Manager
is not required. Native players still need the licensed game and matching content.

## Accounts and traffic control

Browser tickets and native join links require a current Matrix Games account.
Identity comes from the account session, never the request body. Both join paths
share a 12/minute account quota; admissions are also limited to 30/minute per IP.
WebSocket admissions have account/IP quotas and control messages are bounded.
An account can hold one active or pending driving seat across both tracks and
client types. Browser logout/expiry disconnects the driving socket within the
15-second session check interval.

Native links carry only a 43-character authorization code; no server address,
password, Steam ID or executable path is accepted from the URI. The launcher
redeems only against the fixed HTTPS Matrix Games API and obtains validated
server/content details from that response. Legacy `.mgjoin.json` files remain
supported through the optional file button. Join capabilities expire after 90 seconds and redeem
once. The launcher exchanges one for a room/account/Steam-bound HMAC credential.
The native TCP handshake validates it before normal Steam authentication. Native
account identity stays in the private relay and is omitted from public snapshots.
Account logout revokes browser sockets; it does not currently kick a native game
that already completed admission. Existing native-server kick/ban controls remain
available. Do not describe this as a completed account moderation dashboard.

Traffic recycles in place, keeping the entity, model, and reserved native slot.
Cars relocate outside nearby player interest; if no safe location is available,
they remain stopped. Lane-end cars stop until safely recyclable. Fixed reserved
capacity prevents a preset change from causing join/leave churn. `trafficPreset`
selects `light`, `heavy`, or `rush`; the same presets can be changed at runtime via
service-key-only `POST /traffic-settings` with `{room,preset}`. Never expose that
private route or its service key to browsers. With eight reserved traffic slots,
these presets change spacing/speed/spawn behavior, not the native slot budget.

## Driving and rendering ports

The server runs the exported 350Z drivetrain/tyre/contact solver at 120 Hz, with
four-wheel authored road contact, swept chassis barriers and car collision
response. Spawn positions are grounded and checked for walls and occupied seats.
Road tiles load separately from the 20 Hz relay, coalesce concurrent requests,
retain all active player regions, and evict distant tiles. Cars wait safely if
nearby collision geometry is not ready. Pit recovery keeps player identity and
input sequence, requires stopping (or being airborne), and has a ten-second
successful-recovery cooldown.

The browser uses bounded snapshot interpolation, keyboard, standard gamepad and
touch controls. Lost focus, stale state and relay interruption release inputs.
Graphics include City track/sky rendering, camera-relative coordinates, carried
chase camera with server collision-distance checks, authored wheel pivots and
caliper handling, normal maps, roughness/F0 highlights and authored light masks.
Opaque texture alpha is not treated as transparency. Contact shadows, depth haze,
bloom, edge filtering and tone mapping have a Basic graphics fallback. Frustum
culling, transparent-car sorting, scenery eviction, bounded source caches and
hysteretic resolution scaling limit rendering cost. Sound is user-activated
procedural engine/road/tyre audio adapted from City, with mute/pause/disposal.
It is not an authored native engine sound bank.

## Validation and release status

Run `npm run build`, `npm test`, `npm run check:public`, and
`node --test driving/tests/*.test.mjs`. Set `DRIVING_TEST_PROFILE` to a private
exported 350Z physics JSON to include the asset-derived solver cases. Account API
tests require an isolated PostgreSQL database whose name ends in `_test`.
`multiplayer-live.mjs` requires `DRIVING_STAGE_URL` on loopback and a private
`MATRIX_DRIVING_CONFIG`; it uses trusted test actors, never a public guest bypass.
`world-live.mjs` checks four real-road spawns with an occupied native pit.
`native-admission-live.mjs` checks the real native TCP admission protocol.
`render-browser.js` is an opt-in, separately built diagnostic: it renders fixture
cars and never requests a gameplay ticket. It is not included in the app bundle.

Verified in isolated staging on 2026-11-13: matching two-client snapshots, movement,
traffic/native listings and reconnects on both tracks; real published collision
spawn stability; account quotas and active-browser logout revocation; native
account/Steam/replay gates; R2 cold/warm rendering and authored brake lights.
A real Steam-authenticated launcher join was verified before the new account gate;
the final website-to-launcher-to-Steam flow awaits the approved API release.

This is not a production release or a claim of complete Matrix City/Assetto parity.
Native and traffic vehicles remain kinematic participants in browser collisions;
exact native pose/suspension calibration and coupled bidirectional impulses are
not verified. City temporal/HDR rendering, full world shadow maps, authored audio
banks, weather/time synchronization and exact native wheel/suspension telemetry
are not provided by these standalone ports. Production deployment requires the
repository release pipeline and approval. Matrix City production is unchanged.

## Persistent highscores

Use Node 22.13 or newer and set `leaderboardDb` to an absolute private path such
as `/var/lib/matrixgames-driving/leaderboard.sqlite`. The SQLite database belongs
to the driving service user, outside versioned releases and outside the web root.
The service refuses to start without durable score storage. No database port is
required: Node uses its bundled SQLite driver.

Each new personal best is committed immediately in WAL mode with synchronous
FULL durability. Rankings are indexed and cached; unchanged simulation updates
perform no database reads. Rows are keyed by authenticated account and room;
public snapshots contain generated driver labels, scores and pass counts only.
Scoring runs in the authoritative simulation for both browser and coupled native
players. Client inputs cannot supply a score. Lower scores never replace a best.

The first start imports a sibling `leaderboard.json` transactionally if present,
keeps that file intact, and records a migration marker. Old `leaderboardFile`
configuration remains accepted and switches `.json` to `.sqlite`. An invalid
legacy file stops startup instead of silently discarding scores.

The release workflow produces `matrixgames-driving-storage` after checks pass.
Initialize its schema as the service user with:

```
node driving/tools/init-leaderboard.mjs /var/lib/matrixgames-driving/leaderboard.sqlite
```

Keep the database and its WAL/SHM sidecars together. Use SQLite's online backup
API for live backups, or stop the driving service before copying its database.
Do not copy only the main file while writes are active. Restarts and release
rollbacks must reuse the same data directory. Database initialization alone does
not deploy or start the driving service.
