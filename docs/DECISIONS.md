# Decisions (ADR log)

Short records of choices that depart from, or fill gaps in, `docs/spec/*`.

## ADR-001 — Web-only, NestJS + React
The earlier native (.NET/WPF) direction is dropped. Nautix is a web app: NestJS API + React SPA served by the API on one port. Supersedes the WPF spike history in git.

## ADR-002 — Versions (verified at M0, Oct 2026)
Node 22 LTS (CI target; Node 24 works too), NestJS 11, Vite 8, React 19, Tailwind 4, TanStack Query 5, Zustand 5, React Flow (`@xyflow/react`) 12, i18next, Vitest 3, TypeScript 5.9, Biome 2. Nest 12 / TS 7 exist but were left out to avoid early-adopter breakage.

## ADR-003 — One `docker` module for the engine resources
Containers, networks, images, volumes and engine info share one port (`DockerEngine`) and one module for now; the spec's per-feature modules split when a feature gets its own port (compose, builds). No abstraction without two real uses.

## ADR-004 — Own thin Docker client over `node:http` + unix socket
No `dockerode`/`undici`: the surface used is small and a mock-daemon test covers it. Engine API pinned to `v1.43`.

## ADR-005 — Dependency injection by explicit `@Inject(Token)`
Ports are abstract classes used as tokens; every constructor parameter uses `@Inject`, so the code runs under `tsx`/esbuild (no `emitDecoratorMetadata`) and under `tsc`.

## ADR-006 — Auth: scrypt, SQLite sessions, no Drizzle yet
`argon2id` needs a native build; Node's built-in `scrypt` (N=16384, r=8, p=1) is used instead. Sessions store only the SHA-256 of the cookie token. `better-sqlite3` is used directly; Drizzle arrives with a schema big enough to need it. CSRF: mutations require `x-nautix-csrf: 1` (not settable cross-site) and a same-host `Origin` when present, on top of `SameSite=Strict`.

## ADR-007 — "Boxes" security model for the topology canvas
- A **network box** is a Docker network; containers inside share it. New boxes default to **isolated** (`--internal`): no route to the internet and none from it.
- **Outside every box** a container is "external": it only sits on the default bridge, and published ports always bind to `127.0.0.1`.
- Binding to `0.0.0.0` needs an explicit per-port checkbox with a warning; the canvas flags such ports in amber.
- Moving a container into a box also disconnects it from the default bridge, otherwise it would keep an outbound route and the box's isolation would be fake.
- The intended public entry is a reverse proxy (Traefik/Nginx/Caddy template) that the user exposes deliberately.

## ADR-008 — Theme tokens
The spec's lime/cyan palette is replaced by a violet accent (matches the approved reference). Dark and light define identical token sets (unit-tested).

## ADR-009 — Server-sent events instead of a WebSocket for engine events
`GET /api/v1/events` (SSE, same session cookie) streams `{kind}` messages from the daemon's `/events` (reconnect backoff 250 ms → 8 s). The client coalesces bursts (150 ms) and invalidates queries; 30 s polling stays as a safety net. SSE is one-way and needs no extra dependency; WebSockets are reserved for the terminal.

## ADR-010 — No shadcn/ui yet
Small hand-written components (`components/ui.tsx`) cover M1. Adopt shadcn when the component count justifies it.

## ADR-011 — Web terminal
`/ws/terminal/:containerId` (library `ws`, MIT). Binary frames carry stdin/stdout, text frames carry JSON control (`resize`). The server requires the session cookie and a same-host `Origin` (browsers always send it; its absence is refused). The adapter creates a Docker exec with `Tty:true` running `bash` or `sh` *inside the container* and hijacks the connection; there is no host shell. Every open/close is written as a JSON audit line. Output arriving before the WebSocket subscribes is buffered, so the first prompt isn't lost.

## ADR-012 — Roles and API tokens
Two roles: `admin` and `viewer`. Viewers are read-only (any non-GET is refused with `errors.readOnly`), cannot open terminals and never receive env values (`includeEnv` on the Compose export). Role is read live from the user row, so demoting/deleting takes effect immediately. API tokens (`nx_…`, 256 bit) are stored as SHA-256, shown once, revocable, and authenticate via `Authorization: Bearer`; bearer requests skip the CSRF header check because they can't be forged cross-site. Nobody can delete themselves or the last admin. The UI hides write controls for viewers as a convenience; the server is the enforcement point.

## ADR-013 — Saved canvas layout
One JSON document in SQLite (`layout` table, row 1), read and written whole: `zones` (absolute position, keyed by network name or `external`) and `nodes` (position relative to the box, keyed by container name). Names are stable across recreation, ids are not. Boxes are draggable and their containers are React Flow children, so they move together; a box grows to keep moved containers inside. Saved positions override the automatic flow only for what the user moved. "Auto layout" clears the saved document after confirmation. Writing the layout is a mutation, so viewers can't. The database helper moved to `shared/sqlite-database.ts` because several modules now open the same file (WAL mode).

## ADR-014 — Compose editor
- **One source of truth: the YAML text.** The visual editor never keeps its own model; every visual edit is a patch applied to the parsed `yaml` Document (`@nautix/compose`), so comments, order, anchors and untouched lines survive byte-for-byte (tested: a no-op edit is identical, a single field change adds exactly one line). A file with syntax errors is never rewritten by the visual editor.
- **Shared pure package** `@nautix/compose` (parse, read model, patches, validation, port parsing) is used by the API (to refuse invalid files and unacknowledged risks) and by the web (live checks), so both always agree.
- **Reuses the canvas.** Services map onto the same container/network shapes as the live topology, so boxes, logos, loopback/public port badges and layout are identical; services naming no network sit in the implicit `default` box, as Compose does. Dragging a service into another box rewrites its `networks`.
- **Undo/redo** is whole-text snapshots (max 200, typing coalesced within 500 ms) shared by visual and YAML edits.
- **YAML view uses CodeMirror 6 (MIT), not Monaco**: far smaller, no web workers or CDN loading, which keeps the strict CSP (`script-src 'self'`). Monaco can replace it if schema autocompletion becomes a priority.
- **Execution** goes through `docker compose -f -` (file on stdin, argument array, no shell, minimal env, 10 min timeout, 512 KB output cap) from the API container, which therefore bundles the docker CLI and compose plugin. One operation per project at a time. `up` is refused when the file has errors, and when it uses privileged mode, host network/PID, the Docker socket or powerful capabilities unless the request acknowledges the risks (the UI asks). `down` works even for an invalid file. Relative bind mounts cannot work (the daemon resolves paths on the host), the editor warns about them; use absolute paths or named volumes.
- Projects are stored in SQLite. Importing a directory of existing compose files (the spec's "projects root") is not implemented yet.

## ADR-015 — The Nautix container is locked (replaces the typed confirmation)
The container running Nautix (matched by hostname = container id, or `NAUTIX_SELF_NAME`) cannot be stopped, killed, restarted, paused, removed, attached to or detached from networks, or opened in a terminal through Nautix, for any role or API token (`403 errors.selfLocked`). Starting it is still allowed (harmless). There is deliberately no override flag: if it must change, use the Docker CLI on the host. The UI shows a lock note and does not offer those actions. The earlier "type the name to confirm" flow was removed.

## ADR-016 — Saved templates and storage
Built-in templates live in code (`@nautix/contracts`); templates users save from the deploy dialog (image, ports, env values, data paths, command) are JSON rows in the SQLite database and are merged into `GET /api/v1/catalog`. All server-side configuration is in the data directory (`/data` in the container, the `nautix-data` volume): `nautix.db` holds users, hashed sessions and tokens, the canvas layout, saved templates and Compose projects.

## ADR-017 — Tunnels between network boxes
Docker networks can't talk to each other, and bridging them by attaching a service to both exposes everything it listens on. A **tunnel** is instead a `alpine/socat` container (pinned tag) attached to the source network at creation and to the destination right after; it listens on one port in the source network and relays that TCP port to `target:port` in the destination. Only that port crosses; nothing is published on the host; the target must be a (non-tunnel) container on the destination network. It is labelled `nautix.tunnel*` so the UI draws it as a line between boxes (dragging from one box's connector dot to another's) instead of as a node, and it is removed like any container. Every container on the source network can reach the tunnel port, not just one — the dialog says so. TCP only for now (UDP would need a second socat).

## ADR-018 — API gateway routes (Kong, DB-less)
Mappings (path and/or domain → upstream URL, strip-path flag) are edited in the **Gateway** page, stored in SQLite per gateway container name, and pushed as a Kong declarative config to `POST :8001/config`. Nautix's own container is locked and not on the gateway's network, and Kong's image can't be assumed to ship curl, so a short-lived helper (`curlimages/curl`, pinned) joins the gateway's user network, posts the YAML (passed in an environment variable and only expanded as a quoted shell value, so route data never becomes shell syntax) and is removed again. Upstreams are chosen from containers sharing a network with the gateway, tunnels included, or typed as any http(s) URL without credentials. DB-less Kong keeps its config in memory, so after a restart the saved routes are re-sent with "Apply again". Only Kong is detected (by image); other gateways would add a builder next to `kong-config.ts`.

## ADR-019 — One gateway strategy per kind (Kong, Nginx, Caddy, Traefik)
The Gateway page works with any supported gateway or reverse proxy. The kind is detected from the image (`gatewayKind`) and a `GatewayStrategy` (abstract base: `plan(routes)` rejects duplicate routes, then `build`) produces the plan: Kong posts declarative YAML through the helper container (ADR-018); Nginx and Caddy get a generated config written next to the live one, validated and reloaded inside the container; Traefik gets a file-provider YAML in `/etc/traefik/dynamic` (watched, no reload). Proxies other than Kong take upstreams without a URL path. Adding a kind = one strategy class plus an entry in `GATEWAY_INFO`. HAProxy, APISIX and WSO2 are not supported yet. The Traefik template now uses the file provider, so existing Traefik containers must be redeployed.

## ADR-020 — Simplified navigation
Five top-level entries: Topology, Resources (containers, images, volumes, networks as a secondary tab bar), Compose, Gateways, System. Settings is a gear next to logout (admin only).

## ADR-021 — Native HTTPS
`NAUTIX_TLS=auto` makes the API serve HTTPS itself with an ECDSA self-signed certificate (`selfsigned`, MIT) stored in `<data>/tls`, valid for localhost, 127.0.0.1, ::1 and `NAUTIX_TLS_HOSTS`; it is reissued when it expires within 30 days or a requested host is missing. `NAUTIX_TLS_CERT` + `NAUTIX_TLS_KEY` use the operator's own PEM files instead. Either way session cookies become `Secure` (the same-host Origin checks and `wss://` for the terminal already follow the page scheme). No HSTS is sent, so a browser warning on a self-signed certificate can still be bypassed. Default for `pnpm start` stays plain HTTP on 127.0.0.1; the compose file enables `auto`.

## ADR-022 — Certificates managed from Nautix (local CA)
A public CA (Let's Encrypt) cannot issue for `localhost` or private names, so a "valid" certificate for local use means one signed by a CA the operator trusts. Nautix keeps a local root CA (EC P-256, 10 years, `<data>/tls/ca.pem` + 0600 key) and issues the server certificate from it (825 days, SANs: localhost, 127.0.0.1, ::1 and the names/IPs saved in the UI). The CA's public part is downloadable from Settings and must be installed once per machine. Hosts changes and custom certificates are applied to the live listener with `setSecureContext`, no restart. Custom PEM pairs are validated (key matches, not expired). ACME for public domains is not implemented. Replaces the env-only self-signed flow of ADR-021.
