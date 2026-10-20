<#
.SYNOPSIS  Runs the S3 relay spike: publishes Nautix.EngineRelay, wires an isolated docker context and executes every check.
.PARAMETER Distro   WSL distro created by Provision-SpikeDistro.ps1.
.PARAMETER BigMiB   Size of the incompressible layer used for the save/load throughput check (default 1024 = 1 GiB).
.PARAMETER SkipBig  Skip the throughput check (quick pass).
.EXAMPLE   .\Provision-SpikeDistro.ps1; .\Run-S3.ps1
#>
[CmdletBinding()]
param(
    [string]$Distro = 'nautix-engine-spike',
    [int]$BigMiB = 1024,
    [switch]$SkipBig,
    [string]$Out = (Join-Path $PSScriptRoot 'results')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bin = Join-Path $PSScriptRoot 'bin'
$pipe = 'nautix_engine_spike'

& (Join-Path $PSScriptRoot 'Setup-DockerCli.ps1')
$dockerExe = Join-Path $bin 'docker.exe'
$dockerConfig = Join-Path $bin 'docker-config'

Write-Host 'Publishing Nautix.EngineRelay...'
dotnet publish (Join-Path $root 'src\Nautix.EngineRelay\Nautix.EngineRelay.csproj') -c Release -r win-x64 --self-contained false -o (Join-Path $bin 'relay') --nologo -v quiet
if ($LASTEXITCODE -ne 0) { throw 'Relay publish failed.' }

$env:DOCKER_CONFIG = $dockerConfig
& $dockerExe context rm -f nautix-spike 2>$null | Out-Null
& $dockerExe context create nautix-spike --docker "host=npipe:////./pipe/$pipe" | Out-Null

if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
$arguments = @(
    '--pipe', $pipe, '--control-pipe', 'nautix_relay_control_spike', '--distro', $Distro,
    '--docker', $dockerExe, '--docker-config', $dockerConfig, '--context', 'nautix-spike',
    '--relay-exe', (Join-Path $bin 'relay\Nautix.EngineRelay.exe'), '--out', $Out, '--big-mib', $BigMiB
)
if ($SkipBig) { $arguments += '--skip-big' }

Write-Host 'Running checks (about 10-15 minutes with the 1 GiB image)...'
dotnet run -c Release --project (Join-Path $PSScriptRoot 'Nautix.Spikes.S3.csproj') -- @arguments
$exit = $LASTEXITCODE

& $dockerExe context rm -f nautix-spike 2>$null | Out-Null
Write-Host "`nJSON: $Out"
Write-Host "Exit code: $exit (0 = every check passed; 2 = engine not reachable)"
exit $exit
