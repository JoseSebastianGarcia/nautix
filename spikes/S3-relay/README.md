# S3 — Relay (`Nautix.EngineRelay` + Docker.DotNet + docker.exe)

**Gate (docs/spec/07-roadmap.md, M0):** 100 concurrent connections · `docker save` of 1 GB at ≥ 100 MB/s · `exec -it` interactive resize works · relay restart does not break new connections. (`02-engine.md` additionally aims for ≥ 200 MB/s.)

**Status: relay implemented and unit-tested on Linux; the harness compiles; NOTHING has run against a real WSL2 engine yet.** No S3 gate number exists until you run it.

## What exists

| Piece | Where | Verified how |
|---|---|---|
| Production relay: accept loops, message-mode pipes with user-only ACL, `dial-stdio`/`socat` transports, byte pump with half-close, control pipe (`ping`/`status`/`shutdown`), distro keep-alive, single instance, rolling log | `src/Nautix.EngineRelay` | 25 unit tests on Linux (in-memory engine, real named pipes, 100 concurrent clients, restart, engine failure, control) |
| ACL, FirstPipeInstance and message-mode zero-length-write semantics | `tests/Nautix.EngineRelay.Tests/WindowsPipeTests.cs` | **Skipped on Linux; they run on the `windows-latest` CI job** |
| Throw-away engine distro: pinned Debian 13 slim rootfs + systemd + Docker Engine | `Provision-SpikeDistro.ps1`, `provision-engine.sh` | Not run. Rootfs URL, size (29.8 MB) and SHA-256 verified from here |
| Harness: 12 checks via Docker.DotNet.Enhanced, `docker.exe`, ConPTY | this folder | Compiles only |

## Design points you should know (and the risks they carry)

1. **Message-mode pipe.** Go's `go-winio` implements `CloseWrite` (used by `docker run -i`/`exec -i` when stdin ends) as a zero-length write, which only exists on message-type pipes. The relay therefore creates message-mode pipes, and treats a zero-length read as write-shutdown (it completes the engine's stdin so `docker system dial-stdio` half-closes the socket, while still delivering the response). This is my reading of go-winio, **not yet observed**: the check "stdin half-close" below is the proof. If it fails, `docker run -i` with piped stdin will hang.
2. **Keep-alive defaults to ON.** WSL stops a distro that has no process started from Windows; detached containers would die with it. The spec only says "while ≥ 1 client or `engine.keepAlive`"; I defaulted the setting to true. Decide in M1 (ADR-014 proposed).
3. **Docker.DotNet.** The original `Docker.DotNet` 3.125.15 (nuget, 2023) is unmaintained. I use the maintained fork **Docker.DotNet.Enhanced 4.3.3** (MIT, testcontainers). It is a different API (`DockerClientBuilder`, pluggable NPipe/Unix transports, built-in docker-context resolution, demultiplexed `MultiplexedStream`), not a drop-in; the spec's `DockerClientConfiguration` snippet does not exist there. Recorded in ADR-015.
4. **WSL specifics not modelled:** `[interop] enabled=false` and `[automount] enabled=false` are applied by the provisioning script exactly as the spec says; if `wsl.exe --exec` misbehaves with them, the check output will show it.

## Checks (`Program.cs` order)

| Check | Pass condition | Spec gate it covers |
|---|---|---|
| docker.exe version / ps / info | exit 0 | — |
| Docker.DotNet: version, pull, create/start/wait/logs/remove | all succeed over the pipe | — |
| `logs -f` (CLI and API) | ≥ 12 lines in 10 s each | streaming |
| stdin half-close: `docker run -i … cat`, 1 line and 1.1 MB | exact echo, exits within 30/60 s | **half-close design** |
| `exec -it` via ConPTY: prompt, `stty size` = 24 80, resize console to 100×30, `stty size` = 30 100, clean exit | all true | **exec -it resize** |
| multi-stage `docker build` and `buildx build` | builds, runs, both stages present; reports whether BuildKit was used | build sessions |
| `docker save` ~1 GiB (CLI, API) and `save \| load` | CLI save ≥ 100 MB/s (also reports ≥ 200) | **throughput** |
| 100 clients, each with an events stream + a unary call | 0 failures, relay reports ≥ 100 active | **100 connections** |
| No TCP LISTENING socket owned by the relay PID | none | security 1 |
| Engine pipe ACL: exactly one Allow ACE for the current user | true (second-user denial is manual) | security 2 |
| socat fallback transport | ping + list through a second relay | fallback |
| Relay graceful stop, kill -9, restart | `docker ps` and API ping work after each; `docker ps` fails fast while down | **restart** |

## Run it (on your Windows 11 machine)

Prerequisites: WSL2 working (`wsl --status`), .NET 10 SDK, internet. Docker Desktop may stay installed; this uses its own pipe name (`nautix_engine_spike`), docker context and an isolated `DOCKER_CONFIG` under `spikes\S3-relay\bin`, and a separate distro.

```powershell
cd spikes\S3-relay
.\Provision-SpikeDistro.ps1      # one-time, ~5-10 min: creates distro nautix-engine-spike
.\Run-S3.ps1                     # ~10-15 min; add -SkipBig for a quick pass
```

**Paste back:** everything `Run-S3.ps1` prints (the `s3-summary.txt` content) and, if anything failed, the last 30 lines of `%LOCALAPPDATA%\Nautix\logs\relay-*.log`. If provisioning fails, paste its output; I expect to iterate on `provision-engine.sh` at least once.

Cleanup afterwards: `wsl --unregister nautix-engine-spike` (keep it if you will run S4 next: `.\run.ps1 -Distro nautix-engine-spike -DockerContext nautix-spike` needs the context, which `Run-S3.ps1` removes at the end; recreate it with `$env:DOCKER_CONFIG="$PWD\bin\docker-config"; .\bin\docker.exe context create nautix-spike --docker "host=npipe:////./pipe/nautix_engine_spike"` and start a relay with `.\bin\relay\Nautix.EngineRelay.exe --pipe nautix_engine_spike --control-pipe nautix_relay_control_spike --distro nautix-engine-spike --mutex-name Local\Nautix.EngineRelay.Spike.Manual`).
