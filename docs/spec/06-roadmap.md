# 06 — Quality, security, roadmap

## Quality
- Unit (Vitest): domain, handlers with fakes, editor commands, parsers, lint rules.
- Corpus: byte-exact round-trip for `corpus/compose` (≥ 200 files) and `corpus/dockerfile` (≥ 150).
- Integration: real Docker daemon (engine adapter, exec hijack, compose, buildx).
- E2E (Playwright + axe): login, run container, logs, terminal, compose edit → up, network connect; both themes and languages.
- Resource tests: i18n parity, theme token parity, contrast, no literal JSX text.
- `command-coverage.test.ts`: every command in `corpus/docker-help.txt` appears in `05-commands.md`; at release all rows are Done.
- CI (GitHub Actions): lint → unit → integration → e2e → multi-arch image (SBOM + vulnerability scan).

## Security (minimum for v1)
1. Auth always on: first run needs the one-time setup token from the logs → create admin. argon2id hashes, login rate limit.
2. Session cookie `HttpOnly; SameSite=Strict` (+ `Secure` behind HTTPS), CSRF token on mutations, WS/SSE check session and `Origin`.
3. API tokens: hashed at rest, shown once, revocable. Roles: `admin`, `viewer` (read-only, no terminal, no env values).
4. Default bind `127.0.0.1`; remote only via user's reverse proxy (doc with Caddy/Traefik/nginx); strict CSP, no CDN assets.
5. Secrets: AES-256-GCM in SQLite, key in `/data/.key` (0600); never logged (pino redaction + test), never returned after write, never in process args.
6. Inputs validated by zod; `spawn` with arg arrays only; path inputs under the projects root with `realpath`; uploads streamed with size limits.
7. Privileged containers, host network, socket/host-path mounts show a risk dialog (admin only).
8. Web terminal = `docker exec/attach` only (no host shell); sessions audit-logged.
9. Audit log of mutating requests. Telemetry off by default.
10. Lockfile, `pnpm audit` and license check in CI; non-root image, read-only root FS, `no-new-privileges`.

## Updates and backup
Updates are **manual** (ADR-031): `docker compose pull && docker compose up -d`, or `git pull` and `docker compose up -d --build`. Nautix cannot restart or replace its own container (it is locked), and the database is backed up automatically before every schema upgrade. Backup/restore of `/data` (SQLite online backup + key) is in Settings.

---

## Status (2026-10-22)

The roadmap below is the original plan. Work did not follow its milestones one by one; this is what exists, with the decision record that explains each part.

| Area | State | Where |
|---|---|---|
| Core management, auth, settings, backup, terminal | Built | `05-commands.md` |
| Topology (networks as boxes), templates, tunnels, DNS, gateways | Built | `04-editors.md` D1 |
| Port exposure and guards (levels 1–3) | Built | `07-port-guards.md` |
| Folder mappings with risk consent, cloud emulators, type-the-name confirmations (v1.0) | Built | `04-editors.md` D1, `07-port-guards.md` D, `03-web.md`, ADR-058 |
| Safe apply, bindings | Built | `08-bindings-and-safe-apply.md`, ADR-043 |
| Zone spec (read, plan, apply, drift) | Built | `09-zone-spec.md`, ADR-044 |
| In-app help (en/es, screenshots) | Built | ADR-045 |
| Audit trail with detail; History tab; search | Built | ADR-046 |
| Volume browser: download and upload | Built | ADR-047 |
| Swarm: cluster view, overlays, canvas, plan with undo, services with volumes/placement/secrets/configs/health/limits/policy, rollback, bindings, edit in place | Built | ADR-048, 050, 052, 053, 054 |
| Theming: flat base, liquid glass on floating layers, accent, reduced transparency | Built | ADR-049, `03-web.md` |
| Compose editor, Dockerfile editor and builds | Built to the level listed in `05-commands.md` (classic builder, no BuildKit DAG) | `05-commands.md` |
| Graph export SVG/PNG, graph undo/redo, layers/focus filters (M2) | **Not built** | `04-editors.md` A |
| Corpus byte-exact round-trip targets, S1–S5 spikes (M0), 24 h soak (M6) | Not verified in this repository | — |
| Signed multi-arch image, release workflow | The workflow publishes on a pushed tag; no tag has been published from this repository | `.github/workflows/release.yml` |

**How it is tested today.** Unit tests (`pnpm test`: compose, dockerfile, web, api), a real-daemon integration suite (`pnpm test:integration`: containers, networks, volumes, a single-node swarm with volumes/secrets/configs/health check/limits, rolling update, manual rollback, a bad image rolled back by the engine, bindings between services, overlay) and the API end-to-end suite (`apps/api/src/test/app.e2e.test.ts`, against the fake engine). The Playwright/axe browser suite described under *Quality* is **not in this repository**; the screenshots of the help were taken with Playwright by `scripts/help-screenshots.mjs`, which also exercised the main flows by hand. A real **two-node swarm** (two daemons on one host) was exercised by hand for spreading, role constraints, pinning, global services, per-node limits, drain and a dead node (`docs/guides/swarm-two-machines.md`). **Not exercised:** an overlay network between two real machines (both daemons would create the same VXLAN interface on one host).

**Known risks** (also in `docs/releases/0.4.0.md`): Swarm across machines is unproven; removing a service from the canvas cannot be undone; a Swarm volume lives on one node; Elasticsearch/Kibana template versions were not checked against the registry.

**Next candidates** (not committed): a canvas over several engines, container↔service bindings, overlay MTU, Swarm multi-machine test in CI, BuildKit builds, the Post-1.0 list below.

---

## Roadmap (rough person-weeks, ±40%)

### M0 — Skeleton and spikes (≈ 2 pw)
Tasks: monorepo, Nest app with layers + lint rule, health, SQLite, auth setup/login; React shell, theme/i18n with parity tests; CI.
Spikes: **S1** Compose round-trip with the `yaml` package on 50 files · **S2** React Flow 300 nodes/600 edges · **S3** Docker socket client: list/events/logs + exec hijack to xterm with resize · **S4** compose project run from projects root (identical-path rule) · **S5** Windows `install.ps1` on a clean VM (*manual*).
AC: S1 ≥ 98% byte-exact · S2 ≥ 30 fps · S3 interactive `sh`/`vim` work, logs latency < 200 ms · S4 relative bind mounts work, out-of-root refused · layer lint + tests green · e2e "setup → login → engine info".

### M1 — Core management (≈ 7 pw)
containers, images, volumes, system, registries, terminal, settings, auth; dashboard; operations drawer; palette; Show-command; WS events with refetch; installers; image pipeline; backup.
AC: Linux clean VM install → run `hello-world` and `nginx` with reachable port (scripted); Windows same (*manual*); all M1 rows done; external `docker kill` visible in UI < 1 s; axe clean; idle API < 150 MB.

### M2 — Networks (≈ 3 pw)
Network CRUD + live graph (connect by drag, disconnect by Delete), layers/filters, saved positions, export SVG/PNG, CIDR validation and warnings.
AC: 300 nodes ≥ 30 fps · engine state == graph after actions · undo works · keyboard flow works.

### M3 — Compose (≈ 6 pw)
YAML patch store (comments/order/anchors preserved), schema validation + `docker compose config`, graph + form + Monaco views in sync, palette/templates, up/down/logs/ps/build/pull operations bar, projects list.
AC: corpus no-op 100% byte-exact; single edit touches only expected ranges ≥ 99%; edit → other views < 250 ms; `up/down` on a 3-service sample shows right statuses.

### M4 — Dockerfile and builds (≈ 4 pw)
Parser + patches (corpus 100% no-op), block editor, stage graph, lint rules `NX-DF###` with quick fixes, "Containerize my app" templates, buildx rawjson → live DAG, builders, bake, history.
AC: each lint rule has positive/negative tests · multi-stage sample shows DAG, cache hits, timings · cancel leaves no orphan processes · build secrets absent from logs and args.

### M5 — Completeness (≈ 4 pw)
Swarm (delivered as the cluster canvas, see Status), plugins, manifest, volume browser (delivered), remaining rows of `05-commands.md`, optional Windows CLI bridge, accessibility pass, security checklist (*manual*: CSRF, WS origin, traversal, injection, secret leakage).
AC: 100% of rows done · coverage test green.

### M6 — v1.0
Docs en/es, reverse-proxy guide, signed image, trademark/domain check for "Nautix", 24 h soak test with no leaks.

### Post-1.0
Remote servers over SSH, SSO, teams, Git deploys, AI assistant ("explain this error", "generate Compose").
