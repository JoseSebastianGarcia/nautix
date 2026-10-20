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
