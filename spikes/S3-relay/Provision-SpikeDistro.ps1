<#
.SYNOPSIS  Creates the throw-away WSL2 distro used by the S3 and S4 spikes: pinned Debian slim rootfs + Docker Engine under systemd.
.DESCRIPTION
  Prototype of the EngineHost provisioning steps ImportDistro + ConfigureDistro (docs/spec/02-engine.md). It does NOT touch
  your existing distros or Docker Desktop. Remove it afterwards with:  wsl --unregister nautix-engine-spike
.EXAMPLE   .\Provision-SpikeDistro.ps1
#>
[CmdletBinding()]
param(
    [string]$Name = 'nautix-engine-spike',
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Nautix\spikes\wsl\$Name")
)

$ErrorActionPreference = 'Stop'

# Debian 13 (trixie) slim rootfs published by the Debian Docker-images maintainers; SHA-256 pinned 2026-10-20.
$rootfsUrl = 'https://raw.githubusercontent.com/debuerreotype/docker-debian-artifacts/dist-amd64/trixie/slim/oci/blobs/rootfs.tar.gz'
$rootfsSha256 = 'ecc510c1e359bdc007b39802570bb7e4dec7d6ebccf357c3201a74299113e05e'

if ((wsl.exe --list --quiet) -contains $Name) { throw "A distro named '$Name' already exists. Remove it first: wsl --unregister $Name" }

$tar = Join-Path ([IO.Path]::GetTempPath()) 'nautix-debian-trixie-slim-rootfs.tar.gz'
Write-Host "Downloading rootfs..."
Invoke-WebRequest -Uri $rootfsUrl -OutFile $tar
$actual = (Get-FileHash -Algorithm SHA256 $tar).Hash.ToLowerInvariant()
if ($actual -ne $rootfsSha256) {
    throw "Rootfs hash mismatch: expected $rootfsSha256, got $actual. The upstream file changed; do not continue until it is reviewed and re-pinned."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Host "Importing as WSL2 distro '$Name'..."
wsl.exe --import $Name $InstallDir $tar --version 2
if ($LASTEXITCODE -ne 0) { throw 'wsl --import failed.' }

# The distro must be running to be reachable through \\wsl.localhost.
wsl.exe -d $Name --exec true
$share = "\\wsl.localhost\$Name\tmp"
Copy-Item (Join-Path $PSScriptRoot 'provision-engine.sh') (Join-Path $share 'provision-engine.sh') -Force

Write-Host "Installing systemd and Docker Engine inside the distro (a few minutes)..."
wsl.exe -d $Name --user root --exec bash /tmp/provision-engine.sh
if ($LASTEXITCODE -ne 0) { throw 'Provisioning script failed; see the output above.' }

wsl.exe --terminate $Name
Start-Sleep -Seconds 3
Write-Host "Starting the distro with systemd..."
wsl.exe -d $Name --exec true
Start-Sleep -Seconds 8

$state = wsl.exe -d $Name --exec systemctl is-active docker.service
Write-Host "docker.service: $state"
$version = wsl.exe -d $Name --exec docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'dockerd is not answering inside the distro. Check: wsl -d ' + $Name + ' --exec journalctl -u docker -n 50' }
Write-Host "Docker Engine $version is running in '$Name'."
Write-Host "Next: .\Run-S3.ps1 -Distro $Name"
