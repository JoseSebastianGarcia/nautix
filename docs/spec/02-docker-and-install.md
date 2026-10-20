# 02 — Docker access and install

## Deployment
One container with the Docker socket and a data volume:

```yaml
# installer/compose.yaml
services:
  nautix:
    image: ghcr.io/patterna-dev/nautix:latest      # placeholder, confirm registry in ADR
    restart: unless-stopped
    ports: ["127.0.0.1:3737:3737"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - nautix-data:/data                           # sqlite + encryption key
      - /srv/nautix/projects:/srv/nautix/projects   # SAME path inside and outside
volumes: { nautix-data: {} }
```

`docker.sock` is root-equivalent on the host: say so in README and on the setup screen. The image bundles the `docker` CLI + `compose` + `buildx` plugins (pinned, checksum-verified), runs as non-root.

## Docker adapter (`DockerSocketEngine`)
- Thin client over `undici` with `socketPath`; types from `openapi-typescript` for a pinned Engine API version (negotiate via `/version`). ADR: own client vs `dockerode` — pick whichever is typed and maintained.
- Streams (logs, stats, events, pull, push, build): read body as stream; demux multiplexed output (`stdcopy`, unit-tested); raw when `Tty=true`.
- **Exec/attach (hijack):** use `node:http` with `Connection: Upgrade` on the socket; bridge to the terminal WebSocket; support resize and detach.
- `cp`/`save`/`load`/`export`/`import`: stream tar, never buffer.
- Registry auth: `X-Registry-Auth` built from `SecretStore`.
- Engine errors → `AppError{code, hintKey}` (port in use, name conflict, no space, image not found, daemon unreachable).

## CLI adapters
`ProcessRunner` (spawn, no shell, arg arrays, `AbortSignal`, output cap) runs `docker compose`, `buildx build/bake` (`--progress=rawjson`), `login/logout` (`--password-stdin`, temp `DOCKER_CONFIG` removed after), `manifest`, `plugin`, `trust`, `context`. Parse `--format json` when available.

## Compose paths (critical)
Compose inside the Nautix container resolves bind mounts and `build.context` as the **host daemon** sees them. So:
1. Projects live under a **projects root** (default `/srv/nautix/projects`) mounted at the identical path in container and host (on Windows: inside the WSL distro).
2. Projects outside the root are refused with a clear error.
3. File browsing is limited to the root (`realpath` check, no traversal/symlink escape).

## Install
**Linux `install.sh`** (idempotent; `--port --bind --data-dir --projects-dir --no-engine --yes`): detect distro → install Docker Engine from official repos if missing (asks first) → create dirs → write compose → `up -d` → wait for `/api/v1/health` → print URL and one-time **setup token**.

**Windows `install.ps1`** (idempotent, resumable, elevates only to enable WSL features): check Windows ≥ 22000 and virtualization → enable WSL/VM Platform (reboot if needed) → `wsl --import nautix-engine …` from a CI-built rootfs (systemd + Docker Engine + CLI; SHA-256 verified) → configure `wsl.conf` (`systemd=true`, `automount` and `interop` off) → first boot starts Nautix → reachable at `http://localhost:3737` → optional logon task to keep the distro alive + Start-menu shortcut. Mode *client-only* skips WSL and uses an existing engine.
Optional later (M5): Windows `docker.exe` bridge via named pipe → `wsl docker system dial-stdio`.

## Engine rules the UI must respect
- Can't add a published port to an existing container → offer **Recreate** with a diff.
- Default `bridge` has no DNS by name → warn in the network editor.
- Nautix won't stop/remove itself without a typed confirmation.
