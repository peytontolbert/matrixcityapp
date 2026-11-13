# Matrix Games AssettoServer source

Corresponding source for the Matrix Games native server changes is supplied as
`matrix-games.patch`, under AGPL-3.0, against the public upstream repository
https://github.com/compujuckel/AssettoServer at commit
`6ce86addc1b1c70caf018a7b39f6d7bc9aa9493f`.

Clone that repository, check out that commit, and run:

```
git apply /path/to/matrix-games.patch
dotnet test AssettoServer.Tests/AssettoServer.Tests.csproj -c Release
lua AssettoServer.Tests/matrix_physics_test.lua AssettoServer/Server/Lua/matrix_physics.lua
lua AssettoServer.Tests/matrix_hud_test.lua
dotnet publish AssettoServer/AssettoServer.csproj -c Release -r linux-x64 --self-contained true -o publish
```

The upstream SDK requirement is in `global.json`. A normal licensed server
installation supplies Steam runtime and matching private track/car checksums.
These game data and credentials are not distributed with the source.
Set `MATRIX_ASSETTO_BRIDGE_CONFIG` to a private JSON file with room, revision,
tokenFile and reserved slot numbers. Bind the broker to loopback. Keep
`allowPoseCalibration` false in production; any measured model offsets belong
in the operator-controlled `poseOffsets` map. UseSteamAuth remains enabled.
Native welcome messages link here so connected users can obtain the source.
