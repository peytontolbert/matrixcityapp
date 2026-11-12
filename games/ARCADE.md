# Four community browser adaptations

`/games.html` links to Duck Game, Broforce, Nuclear Throne and Enter the Gungeon.
These are authored JavaScript adaptations with selected mechanics, not the
complete original retail engines. Quake III remains the separate original-engine
integration.

## Local files

Duck Game decodes selected uncompressed Windows XNB textures, WAVs and binary
deathmatch levels in the browser. The other games use the downloadable source
importers under `web/arcade/importers`. UnityPy/Pillow extract selected Broforce
and Gungeon graphics. The Nuclear Throne helper uses an independently installed
official UndertaleModCli, with private copies of its input files so that the
installation remains read-only. Generated packs must not be redistributed.

No retail assets, assemblies, decompiled source, private import directories,
audio banks, API secrets or conversion output belong in Git or Azure. The static
build contains only the browser code and source importers. File selection builds
browser Blob URLs; neither the API nor broker has an asset-upload endpoint.
No new third-party runtime code is vendored for these four games. The source
adapters were brought from the owner's existing LANParty implementation; unused
legacy relays, import catalogs, serialized dumps and extracted assets were omitted.

Compatible importer evidence: Duck 90 textures/17 sounds/147 maps; Broforce 13
images; Gungeon 178 atlas frames; Nuclear Throne 159 selected sprite sets.
Other installed game versions can require importer updates. Keyboard/mouse are
required. Users reselect their local files after reopening a page.

## Multiplayer

The existing account API exposes `/v1/arcade/{game}/{action}` and a corresponding
`socket` endpoint. Allowed games are fixed in both services. Google session
identity supplies the actor; request bodies cannot choose another identity.
Exact origins, JSON/body bounds, per-account action quotas, per-IP socket quotas
and the existing global request quotas apply. Creation allows four requests per
ten minutes across all four games.

The isolated game broker reuses its existing scoped key and loopback port. Each
game has a separate pool with three rooms, four players per room, one hosted
room per account per game, membership checks, host-only closure and single-use
60-second player-bound tickets. Tickets cannot cross games. Frames have size,
message-rate, byte-rate and backpressure limits. Idle inputs are cleared.

Gungeon and Nuclear Throne simulate at 30 Hz in the broker and publish at 15 Hz.
Duck Game and Broforce use the lobby owner's browser as authority, with the
broker relaying sanitized guest inputs and owner-only world snapshots. Broforce
shares enemies, terrain, projectiles, rescues and player states instead of the
old avatar-only relay. This is a trusted-friends mode, not competitive anti-cheat.
Host browser departure closes browser-hosted matches; there is no host migration.
Hidden/throttled host browser tabs can pause those two games.

## Release

Deploy `api`, `games`, and the four simulation dependency files below together:

- `web/arcade/gungeon/shared-game.js` and `gungeon-rules.js`
- `web/arcade/nuclear-throne/shared-game.js` and `weapon-catalogue.js`

The release root needs `package.json` with `type: module` for shared `.js` files.
Keep the existing native Quake III binary, private asset paths, service identity,
environment and security restrictions. No database migration, new OAuth secret,
DNS record, public port or Cloudflare route is required.

Run the account suite on an isolated `_test` database, broker tests (including
Quake III regressions), the static build, frontend tests and public-source check.
Verify local import and two-browser play for each game. Back up the production
database and both service units before activation. Update both services to the
same immutable release only after production approval; merge through the Azure
workflow. Roll back both service units and the website together if needed.
