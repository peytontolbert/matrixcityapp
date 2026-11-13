$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output = Join-Path $project 'dist\driving'
New-Item -ItemType Directory -Force -Path $output | Out-Null
& $compiler /nologo /target:exe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/out:$output\MatrixGamesLauncher.exe" (Join-Path $project 'native\MatrixGamesLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed' }
& (Join-Path $output 'MatrixGamesLauncher.exe') --self-test
if ($LASTEXITCODE -ne 0) { throw 'Launcher self-test failed' }
