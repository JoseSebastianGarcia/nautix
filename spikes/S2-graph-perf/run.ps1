<#
.SYNOPSIS  Runs the S2 graph-performance benchmark (Nodify, 300 nodes / 600 edges) and prints the result to paste back.
.PARAMETER Seconds  Duration of each scenario (default 5; 24 scenarios per variant, two variants: about 4 minutes).
.EXAMPLE   .\run.ps1
#>
[CmdletBinding()]
param([int]$Seconds = 5, [string]$Out = (Join-Path $PSScriptRoot 'results'))

$ErrorActionPreference = 'Stop'
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }

Write-Host 'Close other heavy apps and plug in the laptop (High performance power mode). Do not touch the window while it runs.'
dotnet run -c Release --project (Join-Path $PSScriptRoot 'Nautix.Spikes.S2.csproj') -- --benchmark --screenshot --seconds $Seconds --out $Out
$exit = $LASTEXITCODE

foreach ($file in 's2-summary.txt', 's2-error.txt') {
    $path = Join-Path $Out $file
    if (Test-Path $path) { Write-Host (Get-Content $path -Raw) }
}
Write-Host "`nJSON + screenshot: $Out"
Write-Host "Exit code: $exit (0 = both variants meet the gate)"
exit $exit
