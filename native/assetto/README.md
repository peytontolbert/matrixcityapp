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

Native contacts use the v2 companion protocol: the broker sends a resolved target
velocity, and CSP applies only the remaining correction along the contact normal,
at most 8 m/s per packet. Repeated delayed reports cannot keep accelerating or
reverse the driver past that target. Telemetry timestamps identify actual physics
samples rather than bridge polls. Roll out the broker and native server together;
connected native drivers must rejoin to receive the v2 companion.

The HUD returns CSP's `apps` mode so ComfyMap and app controls remain available.
For native teleports, use `driving/tools/native-teleports.mjs` to generate
`cfg/csp_extra_options.ini` from reviewed, collision-grounded private destinations
and enable teleport permission only for human slots in `cfg/entry_list.ini`.
Include both files in every native release. The helper preserves existing driver
flags; reserved external slots must not receive this capability. ComfyMap reads
the server destinations automatically and CSP checks destination occupancy.
