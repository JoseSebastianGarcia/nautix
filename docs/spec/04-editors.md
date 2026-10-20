# 04 — Visual editors

All three editors share: canonical immutable document model · pure `IEditorCommand<TDocument>` · undo/redo · multiple synchronized views (graph / form / text) · diagnostics list · "Show equivalent" (YAML / Dockerfile / CLI).

Shared types (`packages/contracts`):

```ts
export interface Diagnostic { code: string; severity: 'error'|'warning'|'info'; range: TextRange; messageKey: string; args?: readonly unknown[]; fixes?: readonly QuickFix[] }
export interface GraphCanvas { /* nodes, edges, viewport, selection, layout; no React Flow types in signature */ }
```

---

## A. Network graph (live)

Nest module `networks` + web `features/networks`. Screen: Networks → "Graph" tab.

**Model** (`NetworkTopology`): nodes = `ContainerNode`, `NetworkNode`, `VolumeNode`(optional layer); edges = `Attachment(container↔network, aliases, ipv4, ipv6)`, `Mount(container↔volume)`. Built from `ListNetworks`, `ListContainers`, `InspectNetwork` and updated by events.

**Behavior**
- Auto layout: layered left→right via `LayoutEngine` port (default adapter: dagre; must be deterministic); positions saved per target in `SettingsRepository` (`graph.layout.<target>`). "Re-layout" action.
- Layers toggles: Containers / Networks / Volumes; filter by compose project; search; "focus" mode dims everything but the selection's neighbors.
- Live: container start/stop/die/health updates node status within 1 s of the event.
- Actions (all through CQRS commands, with confirmation where destructive):
  - Drag from container port to network node → `connectNetwork` (with alias/IP dialog on drop).
  - Select edge + Delete → `disconnectNetwork`.
  - Toolbar "New network" → dialog (driver bridge/overlay/macvlan/ipvlan, subnet, gateway, IP range, internal, attachable, IPv6, labels, options) with live validation of CIDR overlap against existing networks.
  - Context menu on node: Start/Stop/Restart/Logs/Exec/Inspect/Remove; on network: Inspect/Prune/Remove.
  - Warnings (non-blocking diagnostics): two containers linked by name on default bridge; container on `host` network with published ports (ignored); subnet overlaps.
- Inspector side panel: tabs Overview · IPAM · Containers · Raw JSON.
- Export graph as PNG/SVG (`exportGraphImage` (client-side SVG/PNG)).

**Acceptance**: see M2.

---

## B. Compose editor (graph ⇄ form ⇄ YAML)

Module: `compose`. Opens `compose.yaml`/`docker-compose.yml` from the projects root (see `02-docker-and-install.md`) or an existing project (`docker compose ls`). Files are read/written by the server; the browser never touches the filesystem.

**Canonical model:** `ComposeDocument` = readonly object tree mirroring compose-spec (services, networks, volumes, configs, secrets, x-extensions, `include`, profiles, anchors/aliases tracked as references). Unknown keys preserved as opaque `YamlNode`.

**Text is the source of truth on disk.** Visual edits are applied as **patches on the original text**, never by re-serializing the whole file:

```ts
export interface YamlDocumentStore {
  parse(text: string): YamlSyntaxTree;                         // lossless: comments, order, quotes, anchors, ranges
  toPatch(tree: YamlSyntaxTree, edit: ComposeEdit): TextPatch; // minimal text edit (range + replacement)
  apply(text: string, patch: TextPatch): string;
}
```

Implementation: the `yaml` package (eemeli) `parseDocument` / `Document` with node `range`s and comment fields, computing **text patches from ranges** (never `doc.toString()` of the whole file). If comment/anchor round-trip cannot be guaranteed on the corpus, add a small custom CST layer for the compose subset. Decide at M0 with the round-trip corpus gate (ADR).

**Round-trip invariants** (property + corpus tests, byte-exact):
1. `Apply(text, no-op edit) == text`.
2. Editing one service key changes only the lines of that key (diff touches ≤ the key's range plus necessary indentation of its own value).
3. Comments, blank lines, quoting style, key order, anchors/merge keys (`<<:`) preserved.
4. Round-trip a corpus of ≥ 200 files from `corpus/compose/` (popular projects + synthetic edge cases: anchors, multi-doc, flow style, long strings, tabs/CRLF).
5. Edits through anchors: editing a field inherited from an anchor prompts "Edit anchor / Override here".

**Views (all projections of the same document + text):**
- **Graph:** service nodes (image/build, ports summary, status if project is up), network nodes, volume nodes, config/secret nodes. Edges: `networks`, `volumes`, `depends_on` (condition label), `links`/`extends`/`configs`/`secrets`. Drop from palette to add; drag between ports to connect; delete node = removes references with preview.
- **Form (inspector):** schema-driven forms generated from the compose-spec JSON Schema (embedded, versioned; validated with `ajv`): ports table, environment table (with `.env` and secret masking), volumes table (bind/volume/tmpfs), healthcheck, deploy/resources, depends_on conditions, profiles, labels, build (context/dockerfile/args/target). Each field has help text (resource strings) and validation.
- **YAML:** Monaco (`monaco-yaml`) with diagnostics squiggles, folding by service, schema-based autocomplete (keys, enums, service/network/volume name references), hover docs.
- Selecting in one view selects in others (by `YamlPath`). Typing in YAML re-parses with 250 ms debounce; invalid YAML keeps last good model and shows error banner (graph read-only until fixed).

**Palette** (drag sources): Service from image search (queries registry via `ContainerEngine.searchImages` / known templates), Database templates (postgres, mysql, mariadb, mongo, redis), Reverse proxy (traefik, nginx, caddy), Network, Volume, Config, Secret. Templates are data (`templates/*.json`), not code.

**Validation pipeline:** (1) YAML syntax; (2) compose-spec JSON Schema; (3) semantic rules (undefined references, port conflicts within file, duplicate container names, `depends_on` cycles, bind path existence on host, env var interpolation without defaults → info); (4) on demand/save: `docker compose config --format json` via `ComposeRunner` as ground truth, errors mapped back to ranges when possible.

**Operations bar:** Up / Down / Restart / Pull / Build / Logs / Ps / Config / Convert / Top / Events / Stop-Start-Pause (per service or project) — mapped to `ComposeRunner`; streaming output into Operations drawer with per-service coloring; profile selector; env-file selector; project name field.

**Acceptance**: see M3.

---

## C. Dockerfile editor and builds

Modules: `dockerfile` (editing) + `builds` (running).

**Model** (`DockerfileDocument`): ordered `readonly Instruction[]` with `Stages` derived; each `Instruction` retains original text span, leading comments, line continuations, heredocs, parser directives (`# syntax=`, `# escape=`), `ARG` before `FROM`.

**Parser** (evaluate `dockerfile-ast` (MIT) first; fall back to own lossless parser; ADR at M0; adapter `DockerfileParser` port): supports all instructions (FROM, RUN incl. `--mount/--network/--security`, CMD, LABEL, EXPOSE, ENV, ADD, COPY incl. `--from/--chown/--chmod/--link`, ENTRYPOINT, VOLUME, USER, WORKDIR, ARG, ONBUILD, STOPSIGNAL, HEALTHCHECK, SHELL, MAINTAINER), heredocs, JSON-array vs shell forms, line continuation + embedded comments. Same patch strategy and byte-exact round-trip over `corpus/dockerfile/` (≥ 150 files).

**Views**
- **Blocks:** vertical list of instruction cards, draggable to reorder, each with a form (COPY: src/dest/from-stage/chown/chmod; RUN: command editor + mount/cache options; EXPOSE: ports table; HEALTHCHECK: interval/timeout/retries/cmd; etc.). "Add instruction" palette with search.
- **Stage graph:** nodes = stages; edges `FROM` (base stage), `COPY --from` (lime) and external images (dim). Click stage to filter blocks.
- **Text:** Monaco (Dockerfile language) with diagnostics.
- **Layer/size hints:** after a build, show per-instruction duration, cache hit/miss, and layer size (from build history).
- **Wizards ("by actions"):** "Containerize my app" — detect project type from folder (dotnet, node, python, go, java, static) and generate a multi-stage Dockerfile + `.dockerignore` from templates (`templates/dockerfile/*.json`), user reviews as blocks.

**Lint (TypeScript, built-in rules, each with code `NX-DF###`, severity, quick fix):** latest tag, missing USER (root), `apt-get update` without install in same layer, missing `--no-install-recommends`, ADD vs COPY, missing HEALTHCHECK (info), `cd` instead of WORKDIR, secrets in ENV/ARG patterns, unpinned package versions (info), `COPY . .` before dependency install (cache order hint), exposed privileged ports, duplicate stages names, unused stage, undefined ARG usage, shell-form ENTRYPOINT/CMD. Optional "Deep lint" runs the `hadolint/hadolint` image on demand (explicit user action, image pull shown).

**Builds module**
- Build form: context dir, Dockerfile path, target stage, tags, platforms, build-args, secrets (files/env, never persisted), SSH, cache from/to, output type (image/local/tar/oci), `--pull`, `--no-cache`, builder selection.
- Execution via `ImageBuilder` (`docker buildx build --progress=rawjson --metadata-file`), parse BuildKit `rawjson` into `BuildGraph` (vertex id, digest, name, cached, started, completed, error, logs). UI renders the DAG with live status (queued/running/cached/done/error), per-vertex logs, total timing.
- Builders management: list/create/use/rm/inspect/prune/stop (buildx), `du`. Bake: open `docker-bake.hcl`/compose as targets, run, view groups.
- History: last 50 builds persisted (metadata only) in SQLite.

**Acceptance**: see M4.
