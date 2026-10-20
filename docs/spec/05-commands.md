# 05 — Command coverage matrix (53 commands + global options)

**Rule:** every row must be reachable in the UI as a visual action or, when marked `T`, via the web terminal with first-class integration (autocomplete + history). A coverage test (`command-coverage.test.ts`) parses `docs/spec/05-commands.md` and fails if a row lacks `Status=Done` at release, or if a command listed by `docker --help` (captured as `corpus/docker-help.txt`) is absent from this table.

Route: `API` = Docker Engine API via `ContainerEngine`; `CLI` = Docker CLI via `DockerCli`/dedicated adapter; `LOCAL` = Nautix-only logic.
Milestone = first milestone where it must be `Done` (M1…M5, see roadmap).

## Common (13)

| Command | Route | UI placement | M |
|---|---|---|---|
| run | API (create+start; pull if needed) | "Run container" wizard (image, name, ports, env, volumes, network, resources, restart policy, healthcheck); also Images → Run | M1 |
| exec | API | Container → Exec tab (terminal) / one-shot command dialog | M1 |
| ps | API | Containers list (filters: status, label, compose project, name) | M1 |
| build | CLI (buildx) | Builds → New build | M4 |
| bake | CLI (buildx bake) | Builds → Bake | M4 |
| pull | API (stream) | Images → Pull dialog with layer progress | M1 |
| push | API (stream, auth) | Images → Push (registry selector) | M1 |
| images | API | Images list (dangling, digests, tree view) | M1 |
| login | CLI + SecretStore | Registries → Add/Sign in | M1 |
| logout | CLI + SecretStore | Registries → Sign out | M1 |
| search | API | Images → Search Hub (stars, official) | M1 |
| version | API + CLI | About / System → Versions | M1 |
| info | API | System → Info (formatted + raw) | M1 |

## Management (11)

| Command | Route | UI placement | M |
|---|---|---|---|
| builder | CLI | Builds → Builders (alias of image build management: prune, ls) | M4 |
| buildx | CLI | Builds → Builders (create/use/inspect/rm/du/prune/stop) | M4 |
| compose | CLI | Compose editor operations bar + Projects list | M3 |
| container | API | Containers (all subcommands in rows below) | M1 |
| context | CLI + LOCAL | Settings → Targets (list/inspect/create/update/use/export/import/rm; v1 shows the local target, remote post-1.0); top-bar target chip | M1 |
| image | API | Images (all subcommands in rows below) | M1 |
| manifest | CLI | Images → Manifest (inspect/create/annotate/push/rm) | M5 |
| network | API | Networks list + graph | M2 |
| plugin | API | System → Plugins (ls/install/enable/disable/inspect/upgrade/set/rm) | M5 |
| system | API + CLI | System → Disk usage, Prune wizard, Events, Info | M1 |
| volume | API | Volumes (create/ls/inspect/rm/prune/update; browse files via helper container) | M1 |

> `trust`, `model`, `mcp`, `ai` and other plugin-provided top-level commands appear in `docker --help` only on some versions. If present in `corpus/docker-help.txt`, add rows here (Route: CLI, UI: Terminal + dedicated dialog for `trust` in Registries). Do not invent entries.

## Swarm (1)

| Command | Route | UI placement | M |
|---|---|---|---|
| swarm | API | Swarm → Init/Join/Leave/Unlock/Join-token/CA/Update; and nodes/services/stacks/secrets/configs views (`node`, `service`, `stack`, `secret`, `config` subcommands under Swarm) | M5 |

## Individual commands (28)

| Command | Route | UI placement | M |
|---|---|---|---|
| attach | API (hijack) | Container → Attach tab (terminal; detach keys) | M1 |
| commit | API | Container → "Create image from container" | M1 |
| cp | API (archive) | Container → Files (browser upload/download, streamed tar) | M1 |
| create | API | Run wizard "Create only" | M1 |
| diff | API | Container → Changes tab | M1 |
| events | API (stream) | System → Events (filters, pause, export) | M1 |
| export | API | Container → Export filesystem (.tar) | M1 |
| history | API | Image → Layers tab | M1 |
| import | API | Images → Import tarball | M1 |
| inspect | API | Any object → Inspect (tree + raw JSON, copy path) | M1 |
| kill | API | Container → Kill (signal picker) | M1 |
| load | API | Images → Load archive | M1 |
| logs | API (stream) | Container → Logs (follow, since/until, timestamps, search, tail, export) | M1 |
| pause | API | Container → Pause | M1 |
| unpause | API | Container → Unpause | M1 |
| port | API (inspect) | Container → Ports section | M1 |
| rename | API | Container → Rename | M1 |
| restart | API | Container → Restart | M1 |
| rm | API | Container → Remove (force, volumes) | M1 |
| rmi | API | Image → Remove (force, no-prune) | M1 |
| save | API | Image → Save archive | M1 |
| start | API | Container → Start | M1 |
| stats | API (stream) | Container → Stats; Dashboard live charts | M1 |
| stop | API | Container → Stop (timeout/signal) | M1 |
| tag | API | Image → Tag | M1 |
| top | API | Container → Processes tab | M1 |
| update | API | Container → Resources/restart policy editor | M1 |
| wait | API | Container → "Wait until exit" operation | M1 |

(Count check: 13 + 11 + 1 + 28 = 53.)

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
