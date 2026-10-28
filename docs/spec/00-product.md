# 00 — Product

## Goal
Free, Apache-2.0, self-hosted web UI for Docker. One command to start, browser to use. Works on Linux and on Windows 11+ (private WSL2 engine, no Docker Desktop).

## Positioning
A **Docker client with steroids**: it manages the engine you already have and makes it visual and safe (changes are shown as a command first, applied with a health gate and undone when they fail). It is **not** a deployment platform: no Git builds, no domains or certificates as a service, no multi-tenant projects. Swarm is supported as an engine feature (services and replicas, one or several machines), not as an orchestrator of its own.

## Scope (v1)
1. Install: `install.sh` (Linux), `install.ps1` (Windows/WSL2), reference `compose.yaml`.
2. Dashboard + CRUD: containers, images, volumes, networks, builds, registries, swarm, system, plugins.
3. Visual **network graph**, **Compose editor** (graph ⇄ form ⇄ YAML), **Dockerfile editor** (blocks ⇄ text) + builds.
4. Web terminal (exec/attach). All 53 commands covered (`05-commands.md`).
5. Login (users + API tokens), settings, backup of `/data`.
6. **Topology** (the main screen): the machine drawn as boxes — each Docker network is a box (a *zone*) and the containers on it live inside — with templates, move/join/tunnel by drag, a zone as a YAML document (`09-zone-spec.md`), bindings between an app and the service it uses and safe apply (`08-bindings-and-safe-apply.md`), port exposure and guards (`07-port-guards.md`), DNS and gateway routes.
7. **Swarm in the topology**: when the engine is in a swarm, a cluster canvas where overlay networks are boxes and services are nodes; every change waits in a *plan* that applies one change at a time and undoes itself when one fails (`04-editors.md`, section D).
8. **Audit trail** that names what was touched and never a value, volume browser (download/upload), in-app **help** in English and Spanish, and a theming system with a configurable accent (`03-web.md`).

## Non-goals (before 1.0)
Kubernetes, Windows containers, Git deploys, domains/TLS as a hosting service, a single canvas across several Docker engines (each Nautix manages the engine it is connected to; a swarm is seen through its manager), remote servers over SSH, SSO, 2FA, brokers/Redis, default telemetry.

## Success criteria
- Linux: install → first container in < 3 min. Windows: < 10 min.
- 100% of `05-commands.md` rows done.
- Compose round-trip: ≥ 200 real files, no-op edit byte-exact.
- Graph: 300 nodes ≥ 30 fps.
- API idle memory < 150 MB; initial JS < 300 KB gzip.

## UX rule
Every action has a "Show command" button revealing the equivalent `docker` CLI line.
