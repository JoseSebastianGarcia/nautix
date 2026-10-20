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
                       # builds, registries, swarm, system, terminal, auth, settings
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
