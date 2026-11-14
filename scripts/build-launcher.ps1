param(
    [string]$SourceDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'launcher-source'),
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\driving')
)
$ErrorActionPreference = 'Stop'
$expected = '92518cf94f735adb6c7889111929269f5f9d8bc5'
$actual = (& git -C $SourceDirectory rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $actual -ne $expected) { throw 'Check out the pinned matrixgameslauncher revision before building.' }
& (Join-Path $SourceDirectory 'build.ps1') -OutputDirectory $OutputDirectory -Test
if ($LASTEXITCODE -ne 0) { throw 'Launcher build or tests failed' }