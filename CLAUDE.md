# Nautix — Agent Instructions

Nautix is a self-hosted web app to manage Docker (think Coolify/Portainer): start it with one command, open `http://localhost:3737`, manage containers, images, volumes, networks, Compose and builds. It covers **every command in `docker --help`** (visual action or web terminal) and adds visual editors for networks, Compose and Dockerfile.

Product of **patterna.dev** · MIT · UI in **English + Spanish** · **dark + light** theme.

## Stack (fixed)

- **Backend:** NestJS (TypeScript strict) on Node 24 LTS. **Clean/Onion architecture.** `@nestjs/cqrs` for commands/queries/events.
- **Frontend:** React 19 + Vite + TypeScript, Tailwind v4 + shadcn/ui, TanStack Query, Zustand, React Flow (graph), Monaco (editors), xterm.js (terminal), i18next.
- **Shared:** `zod` schemas in `packages/contracts` (via `nestjs-zod` on the server).
- **Storage:** SQLite (better-sqlite3 + Drizzle). No Redis, no brokers.
- **Tooling:** pnpm workspaces, Biome, Vitest, Playwright.
- Verify versions at M0; record in `docs/DECISIONS.md`.

## Spec index
`00-product` · `01-architecture` · `02-docker-and-install` · `03-web` · `04-editors` · `05-commands` · `06-roadmap` (all in `docs/spec/`).

## Rules

1. Read `docs/spec/*` in order before coding. Work milestone by milestone (`06-roadmap.md`); don't start N+1 until N's acceptance criteria pass.
2. Keep it simple. Prefer the plain solution; no abstraction without two real uses. If something is ambiguous or the spec collides with reality, write a short ADR in `docs/DECISIONS.md` and continue.
3. **Onion layers** (see `01-architecture.md`): `domain` ← `application` ← `infrastructure` / `presentation`. Inner layers never import outer ones. Enforced by lint (`no-restricted-imports` / dependency-cruiser).
4. `domain` and `application` import no Nest HTTP, no `node:fs/net/child_process`, no `undici`, no SQLite. They use **interfaces (ports)** implemented in `infrastructure`.
5. Every user-visible string goes through i18n (en + es). Every color/size comes from CSS tokens (dark + light). Tests enforce both.
6. Destructive actions (rm, rmi, prune, volume/network rm) always ask for confirmation listing what will be affected.
7. Security: auth always on, bind `127.0.0.1` by default, secrets never logged or returned, no shell string building (spawn with arg arrays).
8. New dependency → check license (MIT/Apache/BSD/ISC/MPL ok; GPL/AGPL/SSPL/BUSL no).

## Conventions

- TS: `strict`, `noUncheckedIndexedAccess`, ESM, no `any`, no floating promises, kebab-case files, one class per file.
- Nest naming: `*.controller.ts`, `*.gateway.ts`, `*.module.ts`; use-cases as CQRS handlers `*.handler.ts`; ports as `abstract class` tokens named by role (`ContainerEngine`, `ComposeRunner`), adapters by tech (`DockerSocketEngine`).
- Errors: domain errors extend `DomainError`; one exception filter maps them to `application/problem+json`.
- Logs: `nestjs-pino` with redaction.

## Commands

```bash
pnpm install
pnpm dev               # api + web
pnpm build
pnpm lint              # biome + layer rules + license check
pnpm test              # unit (no docker needed)
pnpm test:integration  # needs a Docker daemon
pnpm test:e2e          # playwright
```

## Definition of done

Builds clean · tests green · layer rules green · en+es strings · dark+light OK · keyboard accessible.
