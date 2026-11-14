# Matrix Games server directory

The website at `/servers` and desktop launcher share `GET /v1/servers` on the VPS account API. Managed rooms come from the running driving broker. Authenticated community owners can register supported game servers with their own connection details and asset manifests. Heartbeats keep listings online; hosting the actual game server is separate.

The workflow builds the pinned open-source `peytontolbert/matrixgameslauncher` revision. Join links carry only game/server IDs. Assetto car selection follows Join inside its adapter. The launcher requests fresh admission after approved missing assets finish installing.

Set `DRIVING_NATIVE_MANIFESTS_FILE` to a private JSON file mapping managed room IDs to owner-supplied manifests. Include only the deployed track, roster and traffic dependencies. Update this configuration together with future game-server roster releases. Neither launcher nor public repository supplies a CDN or game archives.

Deploy the API as an immutable VPS release after integration tests, a verified database backup and additive migration. Retain previous service configuration for rollback. Deploy the website and pinned launcher through GitHub/Azure. Keep OAuth credentials and service keys in existing root-only environment files.

API and manifest contract: https://github.com/peytontolbert/matrixgameslauncher/blob/main/docs/server-integration.md
