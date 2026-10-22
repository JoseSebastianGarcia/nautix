<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/logo-dark.png">
    <img src="apps/web/public/brand/logo-light.png" alt="Nautix" width="220">
  </picture>
</p>

# Nautix

Self-hosted web app to manage Docker: containers, images, volumes and networks, with a visual canvas where **networks are boxes** and containers (with their logo) live inside them. SSPL-1.0 · UI in English and Spanish · dark (black, white buttons) and light (white, black buttons) themes with a configurable accent.

> Nautix controls the Docker socket, which is **root-equivalent on the host**. It binds to `127.0.0.1` by default; keep it that way or put a TLS reverse proxy with auth in front.

## Run it

Requires Node 22+, pnpm 10+ and a reachable Docker daemon (`/var/run/docker.sock`).

```bash
pnpm install
pnpm build
pnpm start            # http://127.0.0.1:3737
```

On first start the server prints a **one-time setup token** in its log. Open the URL, paste the token and create the admin account.

Passwords: everyone can change their own (key icon in the top bar; other sessions are signed out), and an admin can set a new one for any user (Settings → Users). If you lose the only admin account, run on the host:

```bash
docker exec nautix node dist/cli.js reset-password admin   # prints a new random password once
docker exec nautix node dist/cli.js create-admin ana        # creates (or promotes) an admin
```

No Docker handy? Try the simulated engine:

```bash
pnpm demo
```

HTTPS: `docker compose` serves `https://localhost:3737`. Nautix creates its own local certificate authority (in the data volume) and signs the server certificate with it. The first time the browser warns; to make it valid, open **Settings → HTTPS certificate**, download the local CA and install it as a trusted root (steps for Windows, macOS, Linux and Firefox are on that page). Add the names or IPs you use to reach Nautix there and it reissues the certificate live, no restart. You can also paste your own certificate and key. `NAUTIX_TLS_CERT` / `NAUTIX_TLS_KEY` (PEM paths) still work for externally managed files. Without HTTPS (`pnpm start`), it serves plain HTTP on 127.0.0.1.

Custom socket / port / data dir: `NAUTIX_DOCKER_SOCKET`, `NAUTIX_PORT`, `NAUTIX_HOST`, `NAUTIX_DATA` (SQLite lives there).

### With Docker

```bash
export DOCKER_GID=$(stat -c %g /var/run/docker.sock)
docker compose up -d --build
docker compose logs nautix     # setup token
```

From the published image (no build): see `compose.hub.yaml` and `docs/PUBLISHING.md`.

Set `DOCKER_GID` to your docker socket's group id (`stat -c %g /var/run/docker.sock`) if it is not 999.

### Updating

Updates are manual. With the published image:

```bash
docker compose -f compose.hub.yaml pull && docker compose -f compose.hub.yaml up -d
```

With the source: `git pull && docker compose up -d --build`. Before upgrading the database schema Nautix keeps a copy in `/data/backups/` (last five). To go back, run the previous image tag and, if the schema changed, restore the backup file over `nautix.db`. Set `NAUTIX_VERSION=0.1.0` in `compose.hub.yaml`'s environment to stay on a version until you choose to move.

### Development

```bash
pnpm dev              # API on :3737 (tsx watch) + web on :5173 with proxy
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration   # needs a Docker daemon: runs the API against the real engine (containers, tunnels, gateways, builds, swarm)
```

## How the canvas works

- **Box = Docker network.** Containers inside a box share its network. Create a box with *New network* (isolated by default: no internet in or out).
- **Drag a template** (Traefik, Nginx, Caddy, HAProxy, Kong, APISIX, WSO2, Postgres, Redis, RabbitMQ, …) onto a box to deploy it there, or onto the empty canvas / *External* frame to deploy it outside any shared network.
- **Outside the boxes is protected too:** published ports bind to `127.0.0.1` only. Exposing `0.0.0.0` needs an explicit checkbox and is flagged in amber.
- **Drag a container** to another box to move it (asks for confirmation and shows the `docker` commands).
- Select a container to see its logs, join it to more networks (a reverse proxy in two boxes bridges them) or open a **web terminal** (`docker exec` inside the container, never on the host).
- **Export as Compose** (whole canvas or one box): networks, loopback port bindings, volumes; env values become `${NAME}` placeholders unless you opt in.
- Data directories of database templates use named volumes (`<name>-data`), so they survive recreating the container.
- The UI updates live from the daemon's event stream.
- **Compose editor** (`Compose` in the top bar): visual canvas and YAML tab in sync, undo/redo, live checks (unknown networks, duplicate ports, public ports, privileged features), and Up / Down / Pull / Validate. Visual edits keep your comments and layout of the file.
- **Your own templates**: *New template* in the panel (or tick *save as template* when deploying) keeps an image with its ports, variables, volumes and command under "My images"; edit or delete them there.
- **Any image**: deploy anything with its ports, environment variables, data volumes, command and restart policy, and save it to the panel to reuse. Also built in: SQL Server, Kafka and n8n.
- **Tunnels between boxes**: drag from one box's connector dot to another's to expose one TCP port of a service across two otherwise isolated networks (a tiny socat forwarder; nothing is published on the host).
- **Port guards** (Resources → Guards): rules such as "port 5432 only from `10.0.0.0/24`" enforced by the host firewall (iptables or nftables) for any protocol. A small privileged helper (this same image run as `node dist/guard-helper.js` with `--network host --cap-add NET_ADMIN`, command shown in the tab with a one-time token) polls Nautix and applies the rules; Nautix itself stays unprivileged. New rules go on a 60-second trial and roll back by themselves unless you keep them, rules that would cut your own address off need an explicit OK, and `--panic` removes everything from the host. Linux hosts only; verified with real traffic on iptables and nftables.
- **Who can use a gateway route**: each route has an allow list (addresses or networks such as `10.0.0.0/24`); Nginx, Caddy, Traefik, HAProxy and Kong render it natively and everyone else gets a 403. The editor offers your own address and warns when the list would lock you out. Checked on real Nginx, Caddy and HAProxy.
- **Zone as a document** (select a network box in the Topology → *Edit as document*): the whole zone (services, images, environment, volumes, published ports and who can reach them, bindings) as one YAML document, read from what is running. As you edit, a live **plan** lists exactly what would change (create, update, replace, remove, bind), with warnings; **Apply** runs it one action at a time through safe apply and stops at the first failure. Apply refuses if reality changed since the plan you reviewed, removals need an explicit tick, and a zone whose running state no longer matches its last applied document shows a **drift** badge in the topology. Admin-only, since environment values are in clear text.
- **Swarm in the topology** (only when the engine is in a swarm; without one nothing changes): a **Local server / Cluster** switch above the diagram. The cluster view is read-only and shows the swarm as its manager sees it, **by network** (each overlay network a double-line box with a bus, services with `3/3` copies and a chip per copy showing the server it runs on) or **by server** (a column per node with its tasks), with a nodes panel (role, availability, leader, high-availability warning under three managers) and an inspector with the task table. **New network** gains a Local/Overlay choice (overlay needs a manager, encrypted by default here, attachable optional; refused with the reason otherwise) and **leaving the swarm** first lists the overlay zones and services affected.
- **Volumes: browse, download, upload** (Resources → Volumes → folder icon): navigate a volume's folders, read text files, download a file or folder as a tar and upload files into the folder you are viewing, through a short-lived helper container with no network. Uploads show what will be replaced, warn when a container uses the volume and when the owner will be root, and are refused for the volume that holds Nautix's own data. Admin-only and recorded in the audit log (volume and folder, never content).
- **Audit with detail**: every change in Settings → Audit log says what it touched, never a value: the variable names added or removed from a container, the ports and who they are open to, bindings, the actions of a zone apply and the port-guard rules. Opening a container's settings or a zone document (where environment values appear in clear text) is recorded too, once every ten minutes per person. Each container has a **History** tab, and the log has a search box.
- **Built-in help**: a **?** next to the settings gear opens a side panel on the topic of the page you are on, with a search box and ten short topics (getting started, topology, bindings, safe apply, zone document, DNS, port guards, templates and builds, Swarm, troubleshooting) in English and Spanish, with screenshots in dark and light. Small **?** buttons in the exposure, environment and binding dialogs open the topic behind them. It is bundled with the app, so it works offline.
- **Bindings** (Topology): drag the dot of an app onto the dot of a service (PostgreSQL, MySQL, MariaDB, Redis, MongoDB, SQL Server, RabbitMQ or any HTTP service) and Nautix joins them to a network, shows the exact variables it will write (passwords masked) and applies them safely: a .NET `ConnectionStrings__Name` or a `NAME_URL`, read from the service's own settings. The line stays on the canvas, **Re-apply** picks up a changed password and **Unbind** removes exactly what it added.
- **Safe apply** (environment editing in the topology inspector, port exposure, and every change that needs a container recreated): the new container has to pass a **health gate** (healthy if it has a health check, otherwise up without restarting for a few seconds) before the old one is dropped; if it does not, the original comes back untouched, with its data and address, and you see why with the last log lines.
- **Port exposure** (System → Exposure, and the Change button on each port in the topology inspector): every published port shows who can reach it (only this machine, one host address such as your LAN or VPN IP, or everyone), open ports first. Changing it recreates the container with the same settings, keeping its data, networks and fixed IP, and puts the original back if the new one cannot start. When deploying, each port has the same three choices.
- **Container IPs**: a container's page shows its address on each network (with a copy button), and the DNS form can fill the IP from any running container. A **fixed IP is optional**: set it when deploying into a network (Advanced) or later with the pin icon on the container page; otherwise Docker assigns it and it may change when the container is recreated.
- **DNS for your own domains** (Resources → DNS): deploy **dnsmasq** or **CoreDNS** from the palette, then point names like `app.home.lab` at an IP address **or at a container by name** (its current IP is looked up each time you apply, so it survives recreating the container). Like the gateways, each DNS server has an adapter that knows how to deliver the records: dnsmasq gets a validated drop-in file and a restart; CoreDNS gets its Corefile written and reloads itself with no downtime. A name also covers its subdomains (the most specific one wins), IPv4 and IPv6 work, and every other name goes to the upstream DNS. The **Test** button asks the server the way a client does, from a short-lived container on its network. The tab needs a DNS container first. AdGuard Home and Pi-hole are in the palette but have no adapter yet (they need login credentials).
- **Docker commands**: most of the 59 top-level commands are covered (see `docs/spec/05-commands.md`, checked by a test against `docker --help`; `bake`, `builder`, `buildx`, `context`, `manifest` and `checkpoint` are not built). Container pages cover inspect/stats/top/diff/rename/update/wait/commit/export/cp and logs with a time window; run has healthcheck, memory/CPU limits and *create only*; the containers list filters by name, state, Compose project and label; images cover tag/history/save/load/import/search/push; volumes can be browsed read-only; **System** has info, disk usage, a prune wizard with preview, live events and plugins.
- **Builds** (Resources → Builds): a **visual Dockerfile editor** (a card per instruction grouped by stage, a form for each kind: FROM, RUN, COPY/ADD, ENV/ARG/LABEL, EXPOSE, CMD/ENTRYPOINT, HEALTHCHECK…, add, delete, move with the arrows or by dragging, undo/redo) next to the plain code view, 15 lint rules with one-click fixes shown on the cards, a clickable stage graph, a **wizard** that asks a few questions and writes a multi-stage Dockerfile for ASP.NET Core APIs and web apps (.NET 10/9/8, Alpine, Debian or chiseled, non-root, health check), .NET workers, Blazor WebAssembly, Node, Python, Go and static sites, **ready-made pieces** (restore, publish, port, non-root, health check…) you can snap in between any two cards, a **project folder** picker that sends your sources as the build context (`.dockerignore` honoured), build args, target and extra context files, with the build output streamed live. Edits only touch the lines of the instruction you change: comments, blank lines and the rest of the file stay exactly as they were.
- **Swarm** (Resources → Swarm): init/join/leave, nodes, services (scale, update, logs, tasks), stacks, secrets and configs, join tokens and autolock.
- **Settings**: users and roles, API tokens, saved registry logins (passwords encrypted with AES-256-GCM), the HTTPS certificate, backup/restore and an audit log of every change.
- **Gateways and proxies** (Resources → Gateways): Kong (gateway) and Nginx, Caddy, Traefik, HAProxy (proxies) are configured from one table, with no config files or curl. Map paths and domains to services in a table (pick a service on a shared network or a tunnel); Nautix saves them and applies them with no config files or curl.
- **Appearance**: flat black or white base with liquid glass only on what floats (top bar, inspector, messages, dialogs). **Settings, Appearance** sets the accent color (red, green and yellow are not offered, contrast is adjusted automatically) and **Reduce transparency**, which also follows the system.
- **Swarm door**: its own entry in the main menu, and a floating **Connect to Swarm** button on the Topology while no swarm is connected (start one or join one); the page then switches to the cluster.
- **Swarm canvas**: with a swarm active, **Topology → Cluster → Canvas** draws overlay networks as boxes and services as nodes. Drag a template onto an overlay or scale a service and the change waits, dashed, in a **plan**; applying it waits for the copies to run and **undoes everything if one change fails**.
- **Brand logos**: files live in `apps/web/public/brand/` (full logo, header emblem) plus the favicon; light and dark variants follow the theme.
- **Nautix is locked**: its own container can't be stopped, restarted, removed or edited from the UI or API.
- Where things are stored: everything lives in the data directory (`/data`, volume `nautix-data` with Docker): `nautix.db` (SQLite) holds users, sessions, API tokens, canvas layout, saved templates, Compose projects, gateway routes, registry logins (encrypted) and the audit log; `.key` is the encryption key and `tls/` the certificates. Back them up together (Settings → Backup).
- Every action has a **Show command** with the equivalent `docker` CLI line.

## Docs

`CLAUDE.md` (rules), `docs/spec/` (product spec), `docs/DECISIONS.md` (ADRs). License: SSPL-1.0 (see `LICENSE` and `NOTICE`). Source-available, not OSI open source: you can use, modify and self-host it freely, but offering Nautix to third parties as a service requires publishing the source of the whole service stack under the SSPL.
