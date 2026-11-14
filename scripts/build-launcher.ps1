param(
    [string]$SourceDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'launcher-source'),
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\driving')
)
$ErrorActionPreference = 'Stop'
$expected = 'e46fc7bd541c793308deee2e08a6f177f74ecf24'
$actual = (& git -C $SourceDirectory rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $actual -ne $expected) { throw 'Check out the pinned matrixgameslauncher revision before building.' }
& (Join-Path $SourceDirectory 'build.ps1') -OutputDirectory $OutputDirectory -Test
if ($LASTEXITCODE -ne 0) { throw 'Launcher build or tests failed' }