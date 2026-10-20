<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/logo-dark.png">
    <img src="apps/web/public/brand/logo-light.png" alt="Nautix" width="220">
  </picture>
</p>

# Nautix

Self-hosted web app to manage Docker: containers, images, volumes and networks, with a visual canvas where **networks are boxes** and containers (with their logo) live inside them. MIT · UI in English and Spanish · dark and light themes.

> Nautix controls the Docker socket, which is **root-equivalent on the host**. It binds to `127.0.0.1` by default; keep it that way or put a TLS reverse proxy with auth in front.

## Run it

Requires Node 22+, pnpm 10+ and a reachable Docker daemon (`/var/run/docker.sock`).

```bash
pnpm install
pnpm build
pnpm start            # http://127.0.0.1:3737
```

On first start the server prints a **one-time setup token** in its log. Open the URL, paste the token and create the admin account.

No Docker handy? Try the simulated engine:

```bash
pnpm demo
```

Custom socket / port / data dir: `NAUTIX_DOCKER_SOCKET`, `NAUTIX_PORT`, `NAUTIX_HOST`, `NAUTIX_DATA` (SQLite lives there).

### With Docker

```bash
export DOCKER_GID=$(stat -c %g /var/run/docker.sock)
docker compose up -d --build
docker compose logs nautix     # setup token
```

Set `DOCKER_GID` to your docker socket's group id (`stat -c %g /var/run/docker.sock`) if it is not 999.

### Development

```bash
pnpm dev              # API on :3737 (tsx watch) + web on :5173 with proxy
pnpm lint && pnpm typecheck && pnpm test
```

## How the canvas works

- **Box = Docker network.** Containers inside a box share its network. Create a box with *New network* (isolated by default: no internet in or out).
- **Drag a template** (Traefik, Nginx, Caddy, Kong, APISIX, WSO2, Postgres, Redis, RabbitMQ, …) onto a box to deploy it there, or onto the empty canvas / *External* frame to deploy it outside any shared network.
- **Outside the boxes is protected too:** published ports bind to `127.0.0.1` only. Exposing `0.0.0.0` needs an explicit checkbox and is flagged in amber.
- **Drag a container** to another box to move it (asks for confirmation and shows the `docker` commands).
- Select a container to see its logs, join it to more networks (a reverse proxy in two boxes bridges them) or open a **web terminal** (`docker exec` inside the container, never on the host).
- **Export as Compose** (whole canvas or one box): networks, loopback port bindings, volumes; env values become `${NAME}` placeholders unless you opt in.
- Data directories of database templates use named volumes (`<name>-data`), so they survive recreating the container.
- The UI updates live from the daemon's event stream.
- **Compose editor** (`Compose` in the top bar): visual canvas and YAML tab in sync, undo/redo, live checks (unknown networks, duplicate ports, public ports, privileged features), and Up / Down / Pull / Validate. Visual edits keep your comments and layout of the file.
- **Any image**: deploy anything with its ports, environment variables, data volumes, command and restart policy, and save it to the panel to reuse. Also built in: SQL Server, Kafka and n8n.
- **Tunnels between boxes**: drag from one box's connector dot to another's to expose one TCP port of a service across two otherwise isolated networks (a tiny socat forwarder; nothing is published on the host).
- **DNS for your own domains**: AdGuard Home, Pi-hole and dnsmasq are in the palette (53/udp and 53/tcp supported; any image can publish UDP ports).
- **Docker commands**: 36 of the 59 top-level commands are fully covered and 8 partly (see `docs/spec/05-commands.md`, checked by a test against `docker --help`). Container pages cover inspect/stats/top/diff/rename/update/wait/commit/export/cp; images cover tag/history/save/load/import/search/push; **System** has info, disk usage, a prune wizard with preview, and live events.
- **Brand logos**: drop `logo-light.png` and `logo-dark.png` in `apps/web/public/brand/`; the login screen picks one by theme.
- **Nautix is locked**: its own container can't be stopped, restarted, removed or edited from the UI or API.
- Where things are stored: everything lives in the data directory (`/data`, volume `nautix-data` with Docker): `nautix.db` (SQLite) holds users, sessions, API tokens, canvas layout, saved templates and Compose projects.
- Every action has a **Show command** with the equivalent `docker` CLI line.

## Docs

`CLAUDE.md` (rules), `docs/spec/` (product spec), `docs/DECISIONS.md` (ADRs). License: MIT.
