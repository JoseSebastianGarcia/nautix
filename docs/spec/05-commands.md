# 05 — Command coverage matrix (53 commands + global options)

**Rule:** every row must be reachable in the UI as a visual action or, when marked `T`, via the web terminal with first-class integration (autocomplete + history). A coverage test (`command-coverage.test.ts`) parses `docs/spec/05-commands.md` and fails if a row lacks `Status=Done` at release, or if a command listed by `docker --help` (captured as `corpus/docker-help.txt`) is absent from this table.

Route: `API` = Docker Engine API via `ContainerEngine`; `CLI` = Docker CLI via `DockerCli`/dedicated adapter; `LOCAL` = Nautix-only logic.
Milestone = first milestone where it must be `Done` (M1…M5, see roadmap).

## Status legend

`Done` = reachable in the UI with the flags people use daily. `Partial` = works, with gaps named in the table below. `Planned` = not built yet (milestone in the M column).

Gaps in `Partial` rows: **swarm** has no `ca` rotation or `update` beyond autolock · **node** has no inspect/ps · **service** creates and updates replicas, image, ports, env and networks only (no rollout policy, placement, secrets or configs attach, `rollback`) · **stack** deploys and removes; listing is derived from service labels · **build** uses the engine's classic builder: no BuildKit DAG, secrets, buildx or bake, and the context is the typed Dockerfile plus small text files (no directory upload) · **attach** opens a shell with exec rather than attaching to the main process · **logs** polls and has a since-window but no until.

## Common (13)

| Command | Route | UI placement | M | Status |
|---|---|---|---|---|
| run | API (create+start; pull if needed) | "Run container" wizard (image, name, ports, env, volumes, network, resources, restart policy, healthcheck); also Images → Run | M1 | Done |
| exec | API | Container → Exec tab (terminal) / one-shot command dialog | M1 | Done |
| ps | API | Containers list (filters: status, label, compose project, name) | M1 | Done |
| build | API (classic builder) | Resources → Builds (Dockerfile editor, lint, stage graph, args, target, context files) | M4 | Partial |
| bake | CLI (buildx bake) | Builds → Bake | M4 | Planned |
| pull | API (stream) | Images → Pull dialog with layer progress | M1 | Done |
| push | API (stream, auth) | Images → Push (registry selector) | M1 | Done |
| images | API | Images list (dangling, digests, tree view) | M1 | Done |
| login | CLI + SecretStore | Registries → Add/Sign in | M1 | Done |
| logout | CLI + SecretStore | Registries → Sign out | M1 | Done |
| search | API | Images → Search Hub (stars, official) | M1 | Done |
| version | API + CLI | About / System → Versions | M1 | Done |
| info | API | System → Info (formatted + raw) | M1 | Done |

## Management (11)

| Command | Route | UI placement | M | Status |
|---|---|---|---|---|
| builder | CLI | Builds → Builders (alias of image build management: prune, ls) | M4 | Planned |
| buildx | CLI | Builds → Builders (create/use/inspect/rm/du/prune/stop) | M4 | Planned |
| compose | CLI | Compose editor operations bar + Projects list | M3 | Done |
| container | API | Containers (all subcommands in rows below) | M1 | Done |
| context | CLI + LOCAL | Settings → Targets (list/inspect/create/update/use/export/import/rm; v1 shows the local target, remote post-1.0); top-bar target chip | M1 | Planned |
| image | API | Images (all subcommands in rows below) | M1 | Done |
| manifest | CLI | Images → Manifest (inspect/create/annotate/push/rm) | M5 | Planned |
| network | API | Networks list + graph | M2 | Done |
| plugin | API | System → Plugins (ls/install/enable/disable/inspect/upgrade/set/rm) | M5 | Planned |
| system | API + CLI | System → Disk usage, Prune wizard, Events, Info | M1 | Done |
| volume | API | Volumes (create/ls/inspect/rm/prune/update; browse files via helper container) | M1 | Done |

> `trust`, `model`, `mcp`, `ai` and other plugin-provided top-level commands appear in `docker --help` only on some versions. If present in `corpus/docker-help.txt`, add rows here (Route: CLI, UI: Terminal + dedicated dialog for `trust` in Registries). Do not invent entries.

## Swarm (1)

| Command | Route | UI placement | M | Status |
|---|---|---|---|---|
| swarm | API | Swarm → Init/Join/Leave/Unlock/Join-token/CA/Update | M5 | Partial |
| node | API | Swarm → Nodes | M5 | Partial |
| service | API | Swarm → Services | M5 | Partial |
| stack | CLI | Swarm → Stacks | M5 | Partial |
| secret | API | Swarm → Secrets | M5 | Done |
| config | API | Swarm → Configs | M5 | Done |
| checkpoint | API (experimental) | Container → Checkpoints, shown only when the daemon has experimental features on | M5 | Planned |

## Individual commands (28)

| Command | Route | UI placement | M | Status |
|---|---|---|---|---|
| attach | API (hijack) | Container → Attach tab (terminal; detach keys) | M1 | Partial |
| commit | API | Container → "Create image from container" | M1 | Done |
| cp | API (archive) | Container → Files (browser upload/download, streamed tar) | M1 | Done |
| create | API | Run wizard "Create only" | M1 | Done |
| diff | API | Container → Changes tab | M1 | Done |
| events | API (stream) | System → Events (filters, pause, export) | M1 | Done |
| export | API | Container → Export filesystem (.tar) | M1 | Done |
| history | API | Image → Layers tab | M1 | Done |
| import | API | Images → Import tarball | M1 | Done |
| inspect | API | Any object → Inspect (tree + raw JSON, copy path) | M1 | Done |
| kill | API | Container → Kill (signal picker) | M1 | Done |
| load | API | Images → Load archive | M1 | Done |
| logs | API (stream) | Container → Logs (follow, since/until, timestamps, search, tail, export) | M1 | Partial |
| pause | API | Container → Pause | M1 | Done |
| unpause | API | Container → Unpause | M1 | Done |
| port | API (inspect) | Container → Ports section | M1 | Done |
| rename | API | Container → Rename | M1 | Done |
| restart | API | Container → Restart | M1 | Done |
| rm | API | Container → Remove (force, volumes) | M1 | Done |
| rmi | API | Image → Remove (force, no-prune) | M1 | Done |
| save | API | Image → Save archive | M1 | Done |
| start | API | Container → Start | M1 | Done |
| stats | API (stream) | Container → Stats; Dashboard live charts | M1 | Done |
| stop | API | Container → Stop (timeout/signal) | M1 | Done |
| tag | API | Image → Tag | M1 | Done |
| top | API | Container → Processes tab | M1 | Done |
| update | API | Container → Resources/restart policy editor | M1 | Done |
| wait | API | Container → "Wait until exit" operation | M1 | Done |

(Count check: 13 + 11 + 1 + 28 = 53 from the original spec. `docker --help` on Docker 29 lists 59 commands: the extra six are the swarm sub-areas and `checkpoint`, now rows of their own.)

## Subcommand coverage

For each management command, `docs/commands/<name>.md` (generated at M1 from `docker <name> --help` captured into `corpus/help/<name>.txt`) lists every subcommand and flag; `command-coverage.test.ts` fails when a subcommand present in the corpus is neither implemented as a UI action nor routed to the terminal passthrough. Terminal passthrough counts as `T` and is acceptable only for rarely used flags/subcommands, never for the commands in the Common list.

## Global options

| Option | Handling |
|---|---|
| `--config` | Not exposed; each CLI run uses a private temporary `DOCKER_CONFIG` |
| `-c, --context` | Targets/contexts screen (Settings); every CLI call sets the target explicitly; v1 = local socket only |
| `-D, --debug` | Settings → Advanced → Debug logging toggle |
| `-H, --host` | Not exposed (targets replace it); blocked in web terminal |
| `-l, --log-level` | Settings → Advanced → Docker log level (CLI calls) |
| `--tls*` | Post-1.0 (remote targets) |
| `-v, --version` | About dialog |

## Cross-cutting action requirements

- Multi-select + bulk actions on all lists (start/stop/restart/kill/rm/pause/unpause/tag/save).
- Every action shows equivalent CLI (`CommandPreview`) and writes an entry in the Operations history (command, params without secrets, duration, result).
- Prune wizards (`container|image|volume|network|builder|system prune`) first compute and show what would be removed (dry-run via list+filters) and the reclaimable size, then require explicit confirmation.
