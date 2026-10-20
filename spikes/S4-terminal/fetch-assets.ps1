<#
.SYNOPSIS  Downloads xterm.js (MIT) from the npm registry into Assets/vendor, verifying a pinned SHA-512 for each tarball.
           Third-party files are not committed (see docs/DECISIONS.md, ADR-012 for the same policy on the corpus).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$vendor = Join-Path $PSScriptRoot 'Assets\vendor'
New-Item -ItemType Directory -Force -Path $vendor | Out-Null

$packages = @(
    @{ Name = 'xterm';        Url = 'https://registry.npmjs.org/@xterm/xterm/-/xterm-6.0.0.tgz';              Sha512 = '4d0c037501adc300edfb67202832e7d0845a4b162ed6d4948e029aad20e450cd193624915c5a63c44b2f73f66073992ae68989f95d1af3f908336583dec30e62'; Files = @('package/lib/xterm.js', 'package/css/xterm.css', 'package/LICENSE') },
    @{ Name = 'addon-fit';    Url = 'https://registry.npmjs.org/@xterm/addon-fit/-/addon-fit-0.11.0.tgz';     Sha512 = '8d87204fac6d558867860c61dd08180e79cd3184dc7fc1256f1c45cd7d08668faf69b42a48f0230b7735c09aca079135f55c107a2f3d40289964ff3a0c23c5ee'; Files = @('package/lib/addon-fit.js') },
    @{ Name = 'addon-webgl';  Url = 'https://registry.npmjs.org/@xterm/addon-webgl/-/addon-webgl-0.19.0.tgz'; Sha512 = '6f77cc3acc8b56e09e3495b1a25002114103d2f9bba82d1ccb8c11bdfde85114b30d361542218f8539e1599c081ddbc2e3c63ea0b86f6179d8e170d73e8268e8'; Files = @('package/lib/addon-webgl.js') }
)

foreach ($package in $packages) {
    $tgz = Join-Path ([IO.Path]::GetTempPath()) "$($package.Name).tgz"
    Invoke-WebRequest -Uri $package.Url -OutFile $tgz
    $actual = (Get-FileHash -Algorithm SHA512 $tgz).Hash.ToLowerInvariant()
    if ($actual -ne $package.Sha512) { throw "Hash mismatch for $($package.Name): expected $($package.Sha512), got $actual" }

    $extract = Join-Path ([IO.Path]::GetTempPath()) "nautix-s4-$($package.Name)"
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    New-Item -ItemType Directory -Path $extract | Out-Null
    tar -xzf $tgz -C $extract
    foreach ($file in $package.Files) {
        $target = if ($file -like '*LICENSE') { "LICENSE.$($package.Name).txt" } else { Split-Path $file -Leaf }
        Copy-Item (Join-Path $extract $file) (Join-Path $vendor $target) -Force
    }
    Write-Host "OK  $($package.Name)"
}
Write-Host "xterm.js assets ready in $vendor"
