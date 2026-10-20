<#
.SYNOPSIS  Runs the S4 terminal self-test (ConPTY + xterm.js in WebView2) and prints the result to paste back.
.PARAMETER Distro         WSL distro used for the vim and flood checks (for example the one created by S3's Provision-SpikeDistro.ps1; it needs vim-tiny).
.PARAMETER DockerContext  Docker context that points at the relay (for example nautix-spike); enables the docker exec -it check.
.PARAMETER Docker         Path to docker.exe if it is not on PATH.
.EXAMPLE   .\run.ps1 -Distro nautix-engine-spike -DockerContext nautix-spike
#>
[CmdletBinding()]
param(
    [string]$Distro,
    [string]$DockerContext,
    [string]$Docker = 'docker',
    [string]$Out = (Join-Path $PSScriptRoot 'results')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $PSScriptRoot 'Assets\vendor\xterm.js'))) { & (Join-Path $PSScriptRoot 'fetch-assets.ps1') }
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }

$arguments = @('--selftest', '--screenshot', '--out', $Out, '--docker', $Docker)
if ($Distro) { $arguments += @('--distro', $Distro) }
if ($DockerContext) { $arguments += @('--docker-context', $DockerContext) }

dotnet run -c Release --project (Join-Path $PSScriptRoot 'Nautix.Spikes.S4.csproj') -- @arguments
$exit = $LASTEXITCODE

foreach ($file in 's4-summary.txt', 's4-error.txt') {
    $path = Join-Path $Out $file
    if (Test-Path $path) { Write-Host (Get-Content $path -Raw) }
}
Write-Host "`nScreenshots and JSON: $Out"
Write-Host "Exit code: $exit (0 = every non-skipped check passed)"
exit $exit
