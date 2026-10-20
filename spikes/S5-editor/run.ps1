<#
.SYNOPSIS  Runs the S5 editor self-test on this machine and prints the result to paste back.
.EXAMPLE   .\run.ps1
#>
[CmdletBinding()]
param([string]$Out = (Join-Path $PSScriptRoot 'results'))

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'Nautix.Spikes.S5.csproj'
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }

dotnet run -c Release --project $project -- --selftest --screenshot --out $Out
$exit = $LASTEXITCODE

foreach ($file in 's5-summary.txt', 's5-error.txt') {
    $path = Join-Path $Out $file
    if (Test-Path $path) { Write-Host (Get-Content $path -Raw) }
}
Write-Host "`nScreenshots and JSON: $Out"
Write-Host "Exit code: $exit (0 = every S5 check passed)"
exit $exit
