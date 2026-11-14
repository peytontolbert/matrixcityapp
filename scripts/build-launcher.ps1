param(
    [string]$SourceDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'launcher-source'),
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\driving')
)
$ErrorActionPreference = 'Stop'
$expected = 'f6026a9e304d53c0abd7a958c996a76b35daca52'
$actual = (& git -C $SourceDirectory rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $actual -ne $expected) { throw 'Check out the pinned matrixgameslauncher revision before building.' }
& (Join-Path $SourceDirectory 'build.ps1') -OutputDirectory $OutputDirectory -Test
if ($LASTEXITCODE -ne 0) { throw 'Launcher build or tests failed' }