# 02 — Engine (WSL2) and managed connection

## Decision: managed named-pipe relay

Nautix owns the connection. The engine inside WSL2 listens **only** on its unix socket. A relay process on Windows exposes a per-user named pipe and bridges each connection to the engine. No TCP port is opened anywhere.

```
Windows tools (docker.exe, Docker.DotNet, IDEs)
        │  npipe://./pipe/nautix_engine   (ACL: current user SID only)
        ▼
Nautix.EngineRelay.exe  ── per connection ──►  wsl.exe -d nautix-engine --exec docker system dial-stdio
                                                      │ stdio bridge
                                                      ▼
                                              /var/run/docker.sock (dockerd)
```

Why: no ports/firewall prompts, works with the official `docker` CLI via a context, user-scoped ACL, no certificates to manage, survives VPN/proxy changes. `docker system dial-stdio` is the same mechanism Docker uses for `ssh://` contexts, so hijacked streams (exec, attach, logs follow, build sessions) work.

Fallbacks (implement behind `IEngineTransport`, selectable by setting `engine.transport`):
1. `dial-stdio` (default).
2. `socat` fallback: `wsl.exe -d nautix-engine --exec socat - UNIX-CONNECT:/var/run/docker.sock` if `dial-stdio` is unavailable.
3. (Future, do not build now) hvsock/vsock.

## `Nautix.EngineRelay`

- Console subsystem exe, no window, single instance per user (named mutex `Local\Nautix.EngineRelay`).
- Listens on `\\.\pipe\nautix_engine` using `NamedPipeServerStream` with `PipeSecurity` granting `FullControl` to the current user SID only; `PipeOptions.Asynchronous`, `maxNumberOfServerInstances = NamedPipeServerStream.MaxAllowedServerInstances`; always keep ≥ 1 pending listener.
- For each accepted client: spawn transport process, pump bytes both ways with `System.IO.Pipelines`, 64 KB buffers, propagate half-close (client write-shutdown → close child stdin), kill child when either side closes.
- Keeps the distro alive: holds one child `wsl.exe -d nautix-engine --exec sleep infinity` while ≥ 1 client or `engine.keepAlive` setting is true.
- Health endpoint: second pipe `\\.\pipe\nautix_relay_control` (JSON lines): `ping`, `status`, `shutdown`. Same ACL.
- Started by `IEngineRelayControl` on app start; also registered as a per-user logon Scheduled Task (`Nautix Engine Relay`) when setting `engine.autostart` is on, so `docker` works from any terminal without the GUI.
- Logging: rolling file `%LocalAppData%\Nautix\logs\relay-.log`, no payload logging.
- Acceptance tests: see M0/M1 in roadmap (throughput ≥ 200 MB/s local on `docker save`-sized stream; 100 concurrent connections; relay restart does not break new connections).

## Distro provisioning (`IEngineHost`)

Distro name `nautix-engine`. Base: pinned minimal rootfs (Alpine or Debian slim — decide in `DECISIONS.md` at M0, prefer Debian slim for systemd/moby packages). The rootfs tarball is built by CI (`build/engine-rootfs/`) and shipped inside the installer (or downloaded with SHA-256 verification).

Provisioning steps, each idempotent and reported as `ProvisionStep` progress:
1. `CheckPrerequisites`: Windows build ≥ 22000, virtualization enabled, WSL2 present (`wsl --status`).
2. `EnableWindowsFeatures` (elevated, only if missing): `Microsoft-Windows-Subsystem-Linux`, `VirtualMachinePlatform`. May require reboot → persist progress and resume.
3. `ImportDistro`: `wsl --import nautix-engine "%LocalAppData%\Nautix\wsl\engine" <rootfs.tar> --version 2`.
4. `ConfigureDistro`: write `/etc/wsl.conf` (`[boot] systemd=true`, `[automount] enabled=false`, `[interop] enabled=false appendWindowsPath=false`), `/etc/docker/daemon.json` (see below), create `dockerd` systemd unit, enable.
5. `InstallClientTools` (Windows side, per-user): `docker.exe`, `docker-compose.exe`, `docker-buildx.exe` into `%LocalAppData%\Nautix\bin`, add to user PATH, register compose/buildx as CLI plugins in `%USERPROFILE%\.docker\cli-plugins`.
6. `CreateContext`: `docker context create nautix --docker "host=npipe:////./pipe/nautix_engine"` then `docker context use nautix` (respect setting `engine.setDefaultContext`).
7. `SmokeTest`: pull and run `hello-world`, then remove it.

`daemon.json` defaults: `{"hosts":["unix:///var/run/docker.sock"],"features":{"containerd-snapshotter":true},"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}` (remove `hosts` if systemd socket activation is used).

Port publishing: published ports bind inside the VM; WSL2 localhost forwarding exposes them on Windows `127.0.0.1`. Document and test this in M1.

Operations exposed: `StartEngine`, `StopEngine`, `RestartEngine`, `RepairEngine` (re-run idempotent steps), `ExportEngine` (`wsl --export`), `ResetEngine` (destructive, double confirmation), `ShrinkDisk` (`wsl --manage nautix-engine --set-sparse true` / compact vhdx), `SetResourceLimits` (writes `%UserProfile%\.wslconfig` — warn: it affects all distros; show diff before saving).

States (`EngineState`): `NotInstalled → Provisioning → Stopped → Starting → Running → Degraded → Error`. Exposed as a stream and shown in the status bar. The UI is fully usable (read-only banner) when state ≠ Running.

## Docker API access (`IContainerEngine`)

- Client: `Docker.DotNet` using `new DockerClientConfiguration(new Uri("npipe://./pipe/nautix_engine"))`. Pin API version negotiation (`NegotiateApiVersion`). If the library lags (missing endpoints/fields), add an internal typed `HttpClient` for those endpoints; record in `DECISIONS.md`. Do not fork silently.
- Streaming endpoints (logs, stats, events, pull, build, attach, exec) use the multiplexed stream demux (stdcopy) — implement `StdCopyDemuxer` with tests.
- Everything not in the API (compose, buildx, bake, login, context, plugin CLI, trust, manifest) goes through `IDockerCli` / dedicated adapter with `Process`, `--context nautix` explicit, `DOCKER_CONFIG` pointing to the user config, output parsed from JSON formats (`--format json`, `--progress=rawjson`).
- Timeouts: default 30 s for unary calls; none for streams (cancellation only).
- Error mapping: Engine HTTP errors → `EngineError(Code, Message, Hint)`; known cases get user hints (port in use, name conflict, no space, image not found, permission denied).

## Events

`EngineEventPump` (hosted service) subscribes to `/events` with `since=<last seen timestamp>` persisted in memory; on disconnect, reconnect with exponential backoff (250 ms → 8 s). On reconnect do a full reconciliation (`ListContainers/Networks/Volumes/Images`) to repair missed events. Publishes `ContainerStateChanged`, `ImageChanged`, `NetworkChanged`, `VolumeChanged`, `EngineConnectionChanged`.

## Engine constraints the UI must respect

- A published port cannot be added to an existing container: the UI action "Add port" must offer **Recreate container** (shows the diff of config, preserves name/volumes/networks/env/labels) — implemented as `RecreateContainer` command.
- Default `bridge` network has no DNS by container name; user-defined bridges do. The network editor warns when two containers on default bridge are linked by name.
- Connecting/disconnecting a network on a running container is allowed live; changing its ports/mounts/env is not.
