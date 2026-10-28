# 04 — Visual editors

All three editors share: canonical immutable document model · pure `IEditorCommand<TDocument>` · undo/redo · multiple synchronized views (graph / form / text) · diagnostics list · "Show equivalent" (YAML / Dockerfile / CLI).

Shared types (`packages/contracts`):

```ts
export interface Diagnostic { code: string; severity: 'error'|'warning'|'info'; range: TextRange; messageKey: string; args?: readonly unknown[]; fixes?: readonly QuickFix[] }
export interface GraphCanvas { /* nodes, edges, viewport, selection, layout; no React Flow types in signature */ }
```

---

## A. Network graph (live)

> **Status.** Built as the **topology** (section D) rather than as a Networks → Graph tab: networks are boxes and the containers on them live inside. The behaviors below that are not in D (layers, focus mode, SVG/PNG export, undo/redo of the graph) were not built; the rest (connect by drag, create network with CIDR check, actions on nodes, warnings, inspector) were, in the topology's own form.

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

---

## D. Topology and Swarm canvas (as built)

Both are React Flow canvases in `web/src/features/topology`, share the same layout code (`layoutTopology`, generic over containers and services) and save positions in the same `layout` document (services under `svc:<name>`).

### D1. Topology (local engine)
- Each **network is a box** (zone); containers sit in the first user network they belong to and are linked to the others. Containers on no user network sit in an **external** box (published on `127.0.0.1` only). Isolated networks are drawn as such; an overlay is a double line.
- **Palette** of templates (catalog module; built-ins are version-pinned, users add their own, a built-in can be customized as a copy). Drag onto a box to deploy there; the dialog pre-fills ports, environment (placeholder secrets are generated), volumes (named after the container) and command.
- **Folder mappings** (`/host/path:/container/path`, optional read-only). The deploy dialog and the template editor have a *Mounted folders* list; a template can carry mounts of its own (`Template.mounts`). A mount is checked against `mountRisks` (contracts, shared by web and API): the **Docker socket** (`/var/run/docker.sock`, `/run/docker.sock`, the Windows pipe), the **host root** `/`, and **sensitive host paths** (`/etc`, `/root`, `/boot`, `/proc`, `/sys`, `/dev`, `/var/lib/docker`). A risky mount is never silent: the dialog shows a red notice that says what it allows (the socket is root on the host) and the deploy button stays disabled until the person ticks an explicit consent. The API enforces the same rule: a create request with a risky mount must list that risk in `acceptRisks`, otherwise it is refused with `errors.mountRisk` (ADR-058). Recreating a container that already had such a mount keeps it, because the person accepted it when it was made.
- **Cloud emulators** (category *Cloud emulators*): Floci for AWS, Azure, Google Cloud and Oracle Cloud (OCI). They need the Docker socket to run their container-backed services (Lambda, databases, Kubernetes, Event Hubs), so their templates carry that mount and the consent above applies. The Azure template also publishes the AMQP ports 5672 (Event Hubs) and 5673 (Service Bus). The **Floci · Web console** template (`floci/floci-ui`, port 4500, no socket) browses all four clouds; it reaches each emulator by its default container name, so it is deployed in the same box, and the AWS template turns off the console Floci would start by itself (`FLOCI_SERVICES_UI_ENABLED=false`) so the two never fight for port 4500.
- **Move** a container to another box (leave one network, join the other, after confirmation with the commands), **join a second network**, **tunnel** between two boxes (a relay container), **bind** an app to a service by dragging between their dots (`08`), edit a **zone as a YAML document** (`09`), see **drift**.
- Inspector: details, ports with who can reach them (`07`), environment, bindings, networks, history (audit).

### D2. Swarm canvas (ADR-048, 050, 053, 054)
Shown only when the engine is a swarm manager (otherwise a floating **Connect to Swarm** button, ADR-052). **Cluster → Canvas**:
- **Overlay networks are boxes, services are nodes**: logo, copies running (`3/3`), published ports, a **dot per copy in the colour of the server it runs on** (hollow when not well; a legend lists the servers), small icons for pinned / volumes / secrets / rolled back. Copies nobody has taken yet are *waiting*, with Docker's reason, not running on an unknown server.
- **Plan.** Nothing is applied when you edit; each change is drawn dashed and waits in a plan with its `docker service …` command (environment values are never shown). Items: **create** (from a template: copies or global, network, **placement** any/workers/managers/pinned node plus a per-node limit, **volumes**, ports to publish, **secrets**, **configs**, environment, health check, limits, update policy), **scale**, **update** (image, networks by dragging the node to another box, placement, ports, volumes, secrets, configs, environment by name, health check, limits, update policy), **bind / unbind** two services, **remove**.
- **Apply** runs one change at a time and waits for the result: a new service until its copies run; an update until Docker reports the rolling update `completed` (only an update newer than the one seen before the request counts). Docker rolls a failing update back by itself (failure action *rollback*); that is a failure of the plan, with Docker's own cause. **On any failure everything already done is undone in reverse** (created → removed; scaled/updated → previous values; bound → unbound; unbound → bound again). **Environment** changes are undone with the engine's `rollback=previous`, exact only when it is the only update the plan makes to that service; otherwise the dialog says the values cannot be restored automatically. **Removals run last and are never undone** (a removed service's settings cannot be read back); if one fails the earlier removals stay and the dialog says so.
- **Bindings between services** reuse the container strategies (PostgreSQL, MySQL/MariaDB, SQL Server, MongoDB, Redis, RabbitMQ, plain URL): the consumer gets the variables in its environment and joins the provider's overlay if needed; the provider's own environment is read on the server and never returned.
- **Defaults that keep data safe:** a service created with volumes starts **pinned to a node** (a volume lives on the node where a copy runs) and updates **stop the old copy first** when it has volumes or a per-node limit; every service gets an update policy with failure action *rollback* (10 s monitor).
- Roll back to the previous version, move, change image or settings, and remove are all done from the inspector of the selected service.

Not in this version: a canvas over several engines, container↔service bindings, overlay MTU, editing a service's command/user/labels.
