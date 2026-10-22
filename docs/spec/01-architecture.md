# 01 — Architecture (NestJS, Onion)

## Layers (dependencies point inward)

```
presentation (controllers, gateways)  ─┐
infrastructure (docker, cli, sqlite)  ─┴─►  application (use-cases, ports)  ─►  domain (entities, rules)
```

- **domain:** entities, value objects, domain errors, pure rules (e.g. `ComposeDocument`, `PortMapping`, lint rules). No framework imports.
- **application:** use-cases as `@nestjs/cqrs` command/query/event handlers + **ports** (`abstract class ContainerEngine`, `ComposeRunner`, `ImageBuilder`, `DockerCli`, `YamlStore`, `DockerfileParser`, `SecretStore`, `UserRepository`, `SettingsRepository`, `Clock`). May use Nest decorators for DI/CQRS only.
- **infrastructure:** adapters implementing ports (Docker socket client, child-process runner, SQLite/Drizzle repos, YAML patcher, crypto).
- **presentation:** REST controllers, WebSocket gateways, guards, exception filter, zod validation pipes. Controllers only call `CommandBus`/`QueryBus`.

## Repo layout

```text
apps/
  api/src/
    main.ts  app.module.ts
    shared/            # Result, DomainError, config, logger, auth guard, filters
    modules/<feature>/ # containers, images, volumes, networks, compose, dockerfile,
                       # builds, registries, swarm, system, terminal, auth, settings,
                       # zones, bindings, guard, dns, gateway, tls, layout, catalog,
                       # audit, backup, plugins
      domain/
      application/     # commands/ queries/ events/ ports/
      infrastructure/
      presentation/
      <feature>.module.ts
  web/src/
    app/  features/<feature>/  editors/  i18n/  theme/
packages/
  contracts/           # zod schemas + inferred types (shared api/web)
  ui/                  # tokens, shadcn components, i18n resources
installer/  linux/install.sh  windows/install.ps1  compose.yaml
docs/  corpus/{compose,dockerfile,help}/  e2e/
```

## Rules
- A module talks to another only through that module's **queries/commands/events** (exported from its `application` public index). No deep imports.
- Nest modules wire ports to adapters: `{ provide: ContainerEngine, useClass: DockerSocketEngine }`.
- Tests: domain and handlers tested with in-memory fakes of ports (`test/fakes`). Integration tests hit a real Docker daemon.
- Layer rules checked in CI (dependency-cruiser config, ≤ 20 lines).

## API
- REST `/api/v1/*`, validated with zod (`nestjs-zod`), OpenAPI at `/api/v1/docs`. Long operations return `202 {operationId}`.
- Realtime via **one WebSocket gateway** `/ws` (topics: `events`, `operations`, `logs:<id>`, `stats:<id>`) and a binary gateway `/ws/terminal/:id`. Origin + session checked on connect.
- Errors: `application/problem+json` with `code` and an i18n `hintKey`.
- On (re)connect the client refetches queries (TanStack Query invalidation); server events only say *what changed*.

## Events
`DockerEventsService` (adapter) streams `/events` with `since`, reconnects with backoff (250 ms → 8 s), publishes `ContainerChanged`, `ImageChanged`, `NetworkChanged`, `VolumeChanged` on the event bus; the gateway forwards them.

## Status of the layout (2026-10)
Modules that exist in `apps/api/src/modules`: `audit`, `auth`, `backup`, `bindings`, `catalog` (templates), `compose`, `dns`, `docker` (containers, images, volumes, networks, system, registries, builds), `gateway`, `guard`, `layout` (saved positions), `plugins`, `swarm`, `terminal`, `tls`, `zones`. Web features: `audit`, `auth`, `bindings`, `builds`, `compose`, `containers`, `dns`, `gateway`, `guard`, `resources`, `settings`, `swarm`, `system`, `terminal`, `topology`, `zones`.

Ports added since the first version: `SwarmEngine` (nodes, services, tasks, secrets, configs, rollback, environment read), `SwarmBindingStore`, `BindingStore`, `VolumeHelper` (a throw-away container with no network for browsing, downloading and uploading volume files), `DockerEngine.swarmRole()`. Every port that touches Docker has a **fake** adapter that the demo engine (`NAUTIX_ENGINE=fake`) and the e2e tests use; the fake swarm even schedules (`scheduleTasks`) so placement can be seen without a cluster.

Persistence is SQLite with **numbered migrations** (`shared/db/schema.ts`; v6 `swarm_bindings` is the latest). A copy of the database is taken in `backups/` before any schema upgrade.

**Audit.** Controllers describe what they touched with `setAuditNote(req, { detail, skip?, read? })`; an interceptor records it. Details carry names only, never values (`06-roadmap.md`, security 9; ADR-046). Sensitive reads (environment values, volume downloads, service environment names) are recorded once per person and subject per ten minutes.

**Decisions** that came up while building are numbered in `docs/DECISIONS.md` (ADR-045 onwards cover the help system, audit, volume files, the cluster view, theming, the Swarm canvas and plan, and editing services in place).
