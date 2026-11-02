<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/logo-dark.png">
    <img src="apps/web/public/brand/logo-light.png" alt="Nautix" width="220">
  </picture>
</p>

# Nautix

Manage Docker from your browser. One command to start, everything stays on your machine.

**https://getnautix.com** · Apache-2.0 · English and Spanish · dark and light themes

Nautix covers containers, images, volumes, networks, Compose, builds and Swarm, and adds visual editors on top: a canvas where **networks are boxes** and containers live inside them, a Compose editor and a Dockerfile editor. Every command in `docker --help` is available as a visual action or in a web terminal, and every action shows the equivalent `docker` command.

> Nautix controls the Docker socket, which is **root-equivalent on the host**. It listens on `127.0.0.1` only by default. Keep it that way, or put a reverse proxy with TLS in front.

## Quick start

```bash
docker run -d --name nautix --restart unless-stopped \
  -p 127.0.0.1:3737:3737 \
  -v /var/run/docker.sock:/var/run/docker.sock -v nautix-data:/data \
  --group-add 0 --cap-drop ALL --security-opt no-new-privileges:true \
  --read-only --tmpfs /tmp -e NAUTIX_TLS=auto \
  josesebastiangarcia/nautix:latest

docker logs nautix     # one-time setup token
```

Open **https://localhost:3737**, paste the token and create the admin account. The browser warns about the certificate the first time (see [HTTPS](#https)). Your data lives in the `nautix-data` volume.

With Compose, from this repo:

```bash
export DOCKER_GID=$(stat -c %g /var/run/docker.sock)   # the socket's group id; the default is 999
docker compose up -d --build
docker compose logs nautix
```

To use the published image instead of building, see `compose.hub.yaml`.

### Docker Desktop (Windows and macOS)

Run the `docker run` command above from PowerShell (or the macOS terminal) **in one line**: `\` does not continue a line in PowerShell. If a `nautix` container already exists, run `docker rm -f nautix` first.

- `--group-add 0` gives the container the socket's group on Docker Desktop. If Nautix says "Engine unreachable", read the group with `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock alpine stat -c %g /var/run/docker.sock` and use that number instead of `0`.
- In Git Bash write the socket path as `//var/run/docker.sock`.
- Do not run Docker commands from the internal `docker-desktop` WSL distribution. Use PowerShell, or a WSL distribution with Docker Desktop's WSL integration enabled.
- Port guards (the host firewall) need a Linux host and are not available on Docker Desktop.

### Try it without Docker

Requires Node 22+ and pnpm 10+. The simulated engine needs no Docker daemon:

```bash
pnpm install && pnpm build
pnpm demo        # simulated engine
pnpm start       # your real Docker daemon, plain HTTP on http://127.0.0.1:3737
```

## What it does

- **Canvas.** A network is a box and a container is a node. Drag a template onto a box to deploy it there, drag a container to another box to move it, drag between boxes to open a tunnel, and drag an app onto a service to bind them (Nautix writes the connection string and applies it safely). Positions are saved. Export a box or the whole canvas as Compose.
- **Templates.** Reverse proxies (Traefik, Nginx, Caddy, HAProxy), API gateways (Kong, APISIX, WSO2), databases, queues, DNS servers and the [Floci](https://floci.io) cloud emulators (AWS, Azure, GCP, Oracle, plus their UI). Deploy any image with its ports, variables, volumes and folder mappings (`/folder:/folder`), and save it as your own template.
- **Safe by default.** Published ports bind to `127.0.0.1` unless you tick a box to open them. Risky mounts (the Docker socket, `/`, sensitive paths) need explicit consent. Changes that recreate a container pass a health gate and roll back on failure. Destructive actions list what they affect, and irreversible ones ask you to type the name.
- **Clean up.** A `docker system prune` wizard with a preview, and multi-select to delete many containers, images, volumes or networks at once.
- **Editors.** A Compose editor (visual canvas and YAML in sync, live checks, up/down/pull) and a visual Dockerfile editor with lint rules, a stage graph and a wizard for .NET, Node, Python, Go and static sites.
- **Networking tools.** Gateway routes with allow lists, DNS for your own domains, port guards enforced by the host firewall (Linux), and container IPs.
- **Zone as a document.** Edit a whole network as one YAML document, review the plan of exactly what will change, then apply it step by step with drift detection.
- **Swarm.** Cluster view by network or by server, overlay networks, services, stacks, secrets and configs, and a canvas where changes wait in a plan and undo themselves if one fails. See `docs/guides/swarm-two-machines.md`.
- **Teams.** Users and roles, API tokens, saved registry logins (AES-256-GCM), backup and restore, and an audit log that records what changed, never the values.
- **Built-in help.** A **?** panel with short topics in English and Spanish that works offline.

Nautix protects itself: its own container cannot be stopped, removed or edited from the UI or the API.

## Configuration

| Variable | Purpose |
| --- | --- |
| `NAUTIX_PORT`, `NAUTIX_HOST` | Port and address to listen on (default `3737`, `127.0.0.1`) |
| `NAUTIX_DOCKER_SOCKET` | Docker socket path |
| `NAUTIX_DATA` | Data directory (`/data` in the image) |
| `NAUTIX_TLS=auto` | HTTPS with a certificate Nautix creates; remove it for plain HTTP behind your own proxy |
| `NAUTIX_TLS_HOSTS` | Extra names or IPs for the certificate |
| `NAUTIX_TLS_CERT`, `NAUTIX_TLS_KEY` | PEM paths for a certificate you manage yourself |

Everything is stored in the data directory: `nautix.db` (SQLite: users, sessions, tokens, canvas layout, templates, projects, routes, logins and the audit log), `.key` (the encryption key) and `tls/`. Back them up together (Settings → Backup).

### HTTPS

Nautix creates its own local certificate authority in the data volume and signs the server certificate with it. To make the browser trust it, open **Settings → HTTPS certificate**, download the local CA and install it as a trusted root (steps for Windows, macOS, Linux and Firefox are on that page). Add the names or IPs you use to reach Nautix there and the certificate is reissued live. You can also paste your own certificate and key.

### Lost password

Anyone can change their own password (key icon in the top bar), and an admin can set one for any user in Settings → Users. If you lose the only admin account:

```bash
docker exec nautix node dist/cli.js reset-password admin   # prints a new random password once
docker exec nautix node dist/cli.js create-admin ana       # creates, or promotes, an admin
```

## Updating

```bash
docker pull josesebastiangarcia/nautix:latest
docker rm -f nautix
# run the same `docker run` command again; your data stays in the volume
```

With Compose: `docker compose -f compose.hub.yaml pull && docker compose -f compose.hub.yaml up -d`, or `git pull && docker compose up -d --build` from source. Before a database schema upgrade Nautix keeps a copy in `/data/backups/` (the last five). To go back, run the previous image tag and, if the schema changed, restore the backup over `nautix.db`. Pin a version with a tag such as `josesebastiangarcia/nautix:1.0.0`.

## Development

```bash
pnpm dev                # API on :3737 (tsx watch) + web on :5173 with proxy
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration   # needs a Docker daemon: runs the API against the real engine
```

Stack: NestJS (onion architecture, CQRS) · React 19 + Vite + Tailwind v4 · SQLite · zod contracts shared by both sides.

## Docs

- `docs/spec/`: product spec
- `docs/DECISIONS.md`: architecture decisions (ADRs)
- `docs/PUBLISHING.md`: publishing the image
- `CLAUDE.md`: project rules
- `CONTRIBUTING.md`, `SECURITY.md` (how to report a problem), `TRADEMARK.md`

License: Apache-2.0 (see `LICENSE` and `NOTICE`). The name and logo are trademarks.
