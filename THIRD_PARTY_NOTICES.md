# Third-party notices

Nautix is MIT licensed. Dependencies must be MIT, Apache-2.0, BSD or MS-PL (see `CLAUDE.md`). Verified from package metadata unless noted.

## Test and build-time packages (not redistributed)

| Package | Version | License |
|---|---|---|
| xunit.v3.mtp-off | 4.0.2 | Apache-2.0 |
| xunit.runner.visualstudio | 4.0.1 | Apache-2.0 |
| Microsoft.NET.Test.Sdk | 18.11.0 | MIT |
| Shouldly | 4.3.0 | BSD-3-Clause |
| NetArchTest.Rules | 1.3.2 | MIT (upstream repository; package metadata has no license field, see ADR-004) |
| coverlet.collector | 10.1.0 | MIT |
| Microsoft.CodeAnalysis.CSharp | 4.14.0 | MIT (source generator and its tests; not redistributed) |

## Runtime packages used by spikes (will move into product projects when adopted)

| Package | Version | License |
|---|---|---|
| YamlDotNet | 18.1.0 | MIT |
| AvalonEdit | 6.3.1.120 | MIT |
| Nodify | 7.3.0 | MIT |
| Microsoft.Web.WebView2 (SDK) | 1.0.4258.31 | BSD-3-Clause (Microsoft; verified from the package LICENSE.txt) |
| Docker.DotNet.Enhanced | 4.3.3 | MIT |
| Microsoft.Extensions.Logging.Abstractions | 10.0.13 | MIT |

## Fetched at build/run time, never committed

| Component | Version | License | Where |
|---|---|---|---|
| xterm.js (`@xterm/xterm`, `addon-fit`, `addon-webgl`) | 6.0.0 / 0.11.0 / 0.19.0 | MIT | `spikes/S4-terminal/fetch-assets.ps1` (SHA-512 pinned) |
| Debian 13 slim rootfs | trixie | per-package (mostly DFSG licenses) | engine distro, `Provision-SpikeDistro.ps1` (SHA-256 pinned); not redistributed by Nautix |
| Docker Engine, containerd, buildx (Linux) | latest stable at install | Apache-2.0 | installed by apt inside the user's distro |
| docker CLI for Windows | 29.9.1 | Apache-2.0 | `spikes/S3-relay/Setup-DockerCli.ps1` (SHA-256 pinned) |

## Build tools (approved exception, not redistributed)

| Tool | License | Status |
|---|---|---|
| WiX Toolset v5 | MS-RL | Approved build-time-only (ADR-003); added at M1 |
