# Quake III private rooms

The Azure site runs the original Quake III engine through pinned QuakeJS compiled
JavaScript. Players select retail `pak0.pk3` through `pak8.pk3` locally. The game
files are mounted in browser memory and are never uploaded by the launcher.
The current adapter uses asm.js, not a new WASM compilation.

Google accounts authorize room actions through the existing account API. A
separate loopback game service manages one native ioquake3 process per private
room. It must run as a different OS user from the OAuth service. Its scoped
shared key grants game-service access only; it receives no Google or database
credentials. The account API proxies authenticated WebSockets to it. Native UDP
ports bind only to loopback; desktop cross-play is not exposed.

## Release prerequisites

- Build the pinned native server with `node scripts/build-quake3-server.mjs
  /absolute/project/scratch/directory`. Revision:
  `52088b9eae247d8e321c8dc1fb49a879652854f9` from `ioquake/ioq3`.
- Install a private, authorized server copy of the original `baseq3/pak0.pk3`
  through `pak8.pk3`. Keep all PK3s outside the repository and static build.
- Run `npm ci --prefix api --ignore-scripts` and the same command for `games`.
- Run frontend/build/public-source checks, `games` tests, and account tests using
  an isolated PostgreSQL database whose name ends in `_test`.
- Back up the production account database, service unit and environment before
  activation. There is no database schema migration in this release.

## Private service configuration

Create `/etc/matrixgames-quake3/production.env` as root-only 0600 with:

    PORT=4191
    QUAKE3_SERVICE_KEY=<generated random 32-byte base64url value>
    QUAKE3_BINARY=/opt/matrixgames/current/bin/ioq3ded
    QUAKE3_ASSETS=/var/lib/matrixgames-quake3/assets
    QUAKE3_STATE=/var/lib/matrixgames-quake3/rooms

Set the same scoped `QUAKE3_SERVICE_KEY` and
`QUAKE3_SERVICE_ORIGIN=http://127.0.0.1:4191` in the root-only account environment.
Do not put either environment file in GitHub or the website. Install the service
template with paths replaced by the immutable tested release, then activate only
through the approved release procedure. Existing Cloudflare routing to account
port 4190 carries the HTTP and WebSocket game endpoints; no new public DNS or
public UDP firewall rule is needed.

## Limits and behavior

- One hosted room per account, four concurrent rooms total, two to eight players.
- Invite codes contain 64 random bits; every member signs in independently.
- Host-only closure; all active connections end when a room closes.
- Tickets last 60 seconds, are hashed, single-use, and bound to the account.
- Room creation and joins are rate-limited through the account API. The game
  relay has binary-size, message-rate, backpressure, idle and capacity limits.
- Only bounded, allowlisted map and game-mode settings reach the native process.
- Native downloads and RCON through the browser relay are disabled.
- Rooms end after ten minutes with no active connections or four hours total.
  Membership and rooms are ephemeral; a game-service restart closes them.
- Exit Game disconnects that player. A host can return to the page and reopen
  their active lobby. Close Lobby stops the match for everyone.
- The engine's small q3config profile (settings and solo progress) is saved in
  browser local storage when available. Retail PK3s are not stored there.
  Reopening the page requires selecting game files again.

## Rollback

Stop the new game service, restore the previous account unit and environment,
restart only the account service, and deploy the previous static-site commit via
Azure's GitHub workflow. Existing Google accounts and sessions are unchanged.
Retain the backup and immutable release for investigation.
