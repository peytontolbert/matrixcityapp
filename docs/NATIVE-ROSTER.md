# Native Assetto car roster

The launcher lists cars advertised by the running native session. A configured native seat is required for each offered model; adding names only to the website is insufficient. The reviewed catalog contains 21 native Assetto cars and excludes GTA imports and incomplete exports.

This release preserves the current 350Z browser handling, traffic behavior, physics identity verification, and native contact fixes. Native players can select all configured cars. The browser lazily loads their actual models into the shared scene. Expanding browser-drivable car selection is a separate integration.

A coordinated VPS release must pair the model-bound admission signature in driving/native-joins.mjs with native/assetto/matrix-games.patch. Prepare 21 native seats (one per model), the existing four browser 350Z seats, and 96 traffic Prius seats: 121 total entries, 100 reserved bridge seats. Native capacity in the server directory is 21. Preserve the existing measured pose offsets for already deployed models; use reviewed catalog offsets for newly added models.

The server-owner manifest must include every offered car, traffic Prius and 110 track. Keep physics hashes and required model/collider checks. Optional UI metadata and Windows shortcuts are not installed compatibility requirements. The launcher uses owner-supplied URLs only after asset review, and reuses verified local content and archives.

Deployment uses the GitHub/Azure release pipeline and a versioned VPS release. Back up active configs and overrides; stage the CI-built native artifact, private checksum files, owner manifest and merged asset index before switching services. Restart only the account API, driving relay and native 110 service together after release approval. Preserve existing databases, OAuth credentials, service keys, ports and tunnel. Roll back by restoring those service overrides and restarting the same three services.

Validation: 68 launcher checks; current driving regressions plus 21-car seat, signature, directory and native-contact tests; 19 native tests and companion/HUD Lua tests. Isolated native server advertises all 21 entries and every model passes native grant/redeem validation. No authenticated player game is launched by these checks.
