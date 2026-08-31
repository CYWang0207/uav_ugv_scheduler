[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',
    [string]$SdkRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$vsDevCmd = 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat'
if (-not (Test-Path -LiteralPath $vsDevCmd)) { throw "Visual Studio developer shell not found: $vsDevCmd" }

& (Join-Path $PSScriptRoot 'generate_types.ps1') -SdkRoot $SdkRoot
$buildDir = Join-Path $projectRoot 'build'
$command = "call `"$vsDevCmd`" -arch=x64 -host_arch=x64 && cmake -S `"$projectRoot`" -B `"$buildDir`" -G `"Visual Studio 17 2022`" -A x64 -DZRDDS_ROOT=`"$SdkRoot`" && cmake --build `"$buildDir`" --config $Configuration"
cmd.exe /d /s /c $command
if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }

Write-Host "Built: $buildDir\\$Configuration\\scheduler_demo.exe"
