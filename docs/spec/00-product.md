# 00 — Product

## Goal
Free, MIT, self-hosted web UI for Docker. One command to start, browser to use. Works on Linux and on Windows 11+ (private WSL2 engine, no Docker Desktop).

## Scope (v1)
1. Install: `install.sh` (Linux), `install.ps1` (Windows/WSL2), reference `compose.yaml`.
2. Dashboard + CRUD: containers, images, volumes, networks, builds, registries, swarm, system, plugins.
3. Visual **network graph**, **Compose editor** (graph ⇄ form ⇄ YAML), **Dockerfile editor** (blocks ⇄ text) + builds.
4. Web terminal (exec/attach). All 53 commands covered (`05-commands.md`).
5. Login (users + API tokens), settings, backup of `/data`.

## Non-goals (before 1.0)
Kubernetes, Windows containers, Git deploys/domains/TLS proxy, remote servers over SSH, SSO, 2FA, brokers/Redis, default telemetry.

## Success criteria
- Linux: install → first container in < 3 min. Windows: < 10 min.
- 100% of `05-commands.md` rows done.
- Compose round-trip: ≥ 200 real files, no-op edit byte-exact.
- Graph: 300 nodes ≥ 30 fps.
- API idle memory < 150 MB; initial JS < 300 KB gzip.

## UX rule
Every action has a "Show command" button revealing the equivalent `docker` CLI line.
