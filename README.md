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
docker compose -f installer/compose.yaml up -d --build
docker compose -f installer/compose.yaml logs nautix     # setup token
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
- Every action has a **Show command** with the equivalent `docker` CLI line.

## Docs

`CLAUDE.md` (rules), `docs/spec/` (product spec), `docs/DECISIONS.md` (ADRs). License: MIT.
