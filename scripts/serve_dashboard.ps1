[CmdletBinding()]
param([int]$Port = 8765)

$dashboard = (Resolve-Path (Join-Path $PSScriptRoot '..\\dashboard')).Path
Push-Location $dashboard
try {
    & python -m http.server $Port
}
finally {
    Pop-Location
}
