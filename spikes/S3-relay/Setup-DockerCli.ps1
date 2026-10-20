<#
.SYNOPSIS  Downloads docker.exe (pinned SHA-256) and the buildx plugin (checksum from its release) into .\bin, with an isolated DOCKER_CONFIG.
           Your real %USERPROFILE%\.docker is never touched.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$bin = Join-Path $PSScriptRoot 'bin'
$plugins = Join-Path $bin 'cli-plugins'
$config = Join-Path $bin 'docker-config'
New-Item -ItemType Directory -Force -Path $plugins, $config | Out-Null

# Docker CLI static build for Windows; SHA-256 pinned 2026-10-20 (docker-29.9.1.zip, 44.9 MB docker.exe inside).
$zipUrl = 'https://download.docker.com/win/static/stable/x86_64/docker-29.9.1.zip'
$zipSha256 = '5d9b66509390553fd97d590ec2ff0ce10b04c2ac653fa52f2abf2f05c4c197ca'
$dockerExe = Join-Path $bin 'docker.exe'
if (-not (Test-Path $dockerExe)) {
    $zip = Join-Path ([IO.Path]::GetTempPath()) 'docker-cli.zip'
    Invoke-WebRequest -Uri $zipUrl -OutFile $zip
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
    if ($actual -ne $zipSha256) { throw "docker zip hash mismatch: expected $zipSha256, got $actual" }
    $extract = Join-Path ([IO.Path]::GetTempPath()) 'nautix-docker-cli'
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive $zip $extract
    Copy-Item (Join-Path $extract 'docker\docker.exe') $dockerExe   # dockerd.exe (Windows containers) is deliberately not copied
}

# buildx: resolve the latest release and verify against that release's own checksums.txt.
$buildxExe = Join-Path $plugins 'docker-buildx.exe'
if (-not (Test-Path $buildxExe)) {
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/docker/buildx/releases/latest' -Headers @{ 'User-Agent' = 'nautix-spike' }
    $asset = $release.assets | Where-Object { $_.name -like '*.windows-amd64.exe' } | Select-Object -First 1
    $sums = ($release.assets | Where-Object { $_.name -eq 'checksums.txt' } | Select-Object -First 1).browser_download_url
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $buildxExe
    $expected = ((Invoke-WebRequest -Uri $sums).Content -split "`n" | Where-Object { $_ -match [regex]::Escape($asset.name) } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
    $actual = (Get-FileHash -Algorithm SHA256 $buildxExe).Hash.ToLowerInvariant()
    if ($actual -ne $expected.ToLowerInvariant()) { Remove-Item $buildxExe; throw "buildx hash mismatch: expected $expected, got $actual" }
    Write-Host "buildx $($release.tag_name) verified."
}

@{ cliPluginsExtraDirs = @($plugins) } | ConvertTo-Json | Set-Content (Join-Path $config 'config.json') -Encoding ascii
Write-Host "docker CLI ready: $dockerExe  (DOCKER_CONFIG = $config)"
