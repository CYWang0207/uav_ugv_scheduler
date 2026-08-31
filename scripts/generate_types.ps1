[CmdletBinding()]
param(
    [string]$SdkRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$generator = Join-Path $SdkRoot 'bin\ZRDDSGen\zrddsgen.exe'
$idl = Join-Path $projectRoot 'idl\mission.idl'
$output = Join-Path $projectRoot 'generated'

if (-not (Test-Path -LiteralPath $generator)) { throw "ZRDDS generator not found: $generator" }
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path $output | Out-Null

& $generator -i $idl -d $output -l C++
if ($LASTEXITCODE -ne 0) { throw "zrddsgen failed with exit code $LASTEXITCODE" }

Write-Host "Generated DDS type support in $output"
