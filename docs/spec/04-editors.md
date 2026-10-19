# 04 — Visual editors

All three editors share: canonical immutable document model · pure `IEditorCommand<TDocument>` · undo/redo · multiple synchronized views (graph / form / text) · diagnostics list · "Show equivalent" (YAML / Dockerfile / CLI).

Shared contract (`Nautix.SharedKernel` or `Nautix.Ui`, framework-free):

```csharp
public sealed record Diagnostic(string Code, Severity Severity, TextRange Range, string MessageKey, ImmutableArray<object> Args, ImmutableArray<QuickFix> Fixes);
public interface IGraphCanvas { /* nodes, edges, viewport, selection, layout; no WPF types in signature */ }
```

---

## A. Network graph (live)

Module: `Networks`. Screen: Networks → "Graph" tab.

**Model** (`NetworkTopology`): nodes = `ContainerNode`, `NetworkNode`, `VolumeNode`(optional layer); edges = `Attachment(container↔network, aliases, ipv4, ipv6)`, `Mount(container↔volume)`. Built from `ListNetworks`, `ListContainers`, `InspectNetwork` and updated by events.

**Behavior**
- Auto layout: layered left→right (ELK-style). Implement `ILayoutEngine` with a built-in layered algorithm (Sugiyama-style: layering, crossing reduction by barycenter, coordinate assignment); positions saved per context in `ISettingsStore` (`graph.layout.<ctx>`). "Re-layout" action.
- Layers toggles: Containers / Networks / Volumes; filter by compose project; search; "focus" mode dims everything but the selection's neighbors.
- Live: container start/stop/die/health updates node status within 1 s of the event.
- Actions (all through Mediator commands, with confirmation where destructive):
  - Drag from container port to network node → `ConnectNetwork` (with alias/IP dialog on drop).
  - Select edge + Delete → `DisconnectNetwork`.
  - Toolbar "New network" → dialog (driver bridge/overlay/macvlan/ipvlan, subnet, gateway, IP range, internal, attachable, IPv6, labels, options) with live validation of CIDR overlap against existing networks.
  - Context menu on node: Start/Stop/Restart/Logs/Exec/Inspect/Remove; on network: Inspect/Prune/Remove.
  - Warnings (non-blocking diagnostics): two containers linked by name on default bridge; container on `host` network with published ports (ignored); subnet overlaps.
- Inspector side panel: tabs Overview · IPAM · Containers · Raw JSON.
- Export graph as PNG/SVG (`ExportGraphImage`).

**Acceptance**: see M2.

---

## B. Compose editor (graph ⇄ form ⇄ YAML)

Module: `Compose`. Opens `compose.yaml`/`docker-compose.yml` from disk or existing project (`docker compose ls`).

**Canonical model:** `ComposeDocument` = immutable record tree mirroring compose-spec (services, networks, volumes, configs, secrets, x-extensions, `include`, profiles, anchors/aliases tracked as references). Unknown keys preserved as opaque `YamlNode`.

**Text is the source of truth on disk.** Visual edits are applied as **patches on the original text**, never by re-serializing the whole file:

```csharp
public interface IYamlDocumentStore
{
    YamlSyntaxTree Parse(string text);                       // lossless: keeps comments, order, quotes, anchors, positions
    TextPatch ToPatch(YamlSyntaxTree tree, ComposeEdit edit); // minimal text edit (range + replacement)
    string Apply(string text, TextPatch patch);
}
```

Implementation: position-aware parser — evaluate YamlDotNet's parser events with `Mark`s; if comment/anchor round-trip cannot be guaranteed, write a small custom CST parser for the compose subset (block mappings/sequences, flow collections, scalars, anchors, comments). Decide at M0 with the round-trip corpus gate.

**Round-trip invariants** (property + corpus tests, byte-exact):
1. `Apply(text, no-op edit) == text`.
2. Editing one service key changes only the lines of that key (diff touches ≤ the key's range plus necessary indentation of its own value).
3. Comments, blank lines, quoting style, key order, anchors/merge keys (`<<:`) preserved.
4. Round-trip a corpus of ≥ 200 files from `corpus/compose/` (popular projects + synthetic edge cases: anchors, multi-doc, flow style, long strings, tabs/CRLF).
5. Edits through anchors: editing a field inherited from an anchor prompts "Edit anchor / Override here".

**Views (all projections of the same document + text):**
- **Graph:** service nodes (image/build, ports summary, status if project is up), network nodes, volume nodes, config/secret nodes. Edges: `networks`, `volumes`, `depends_on` (condition label), `links`/`extends`/`configs`/`secrets`. Drop from palette to add; drag between ports to connect; delete node = removes references with preview.
- **Form (inspector):** schema-driven forms generated from the compose-spec JSON Schema (embedded, versioned): ports table, environment table (with `.env` and secret masking), volumes table (bind/volume/tmpfs), healthcheck, deploy/resources, depends_on conditions, profiles, labels, build (context/dockerfile/args/target). Each field has help text (resource strings) and validation.
- **YAML:** AvalonEdit with diagnostics squiggles, folding by service, schema-based autocomplete (keys, enums, service/network/volume name references), hover docs.
- Selecting in one view selects in others (by `YamlPath`). Typing in YAML re-parses with 250 ms debounce; invalid YAML keeps last good model and shows error banner (graph read-only until fixed).

**Palette** (drag sources): Service from image search (queries registry via `IContainerEngine.SearchImages` / known templates), Database templates (postgres, mysql, mariadb, mongo, redis), Reverse proxy (traefik, nginx, caddy), Network, Volume, Config, Secret. Templates are data (`templates/*.json`), not code.

**Validation pipeline:** (1) YAML syntax; (2) compose-spec JSON Schema; (3) semantic rules (undefined references, port conflicts within file, duplicate container names, `depends_on` cycles, bind path existence on host, env var interpolation without defaults → info); (4) on demand/save: `docker compose config --format json` via `IComposeRunner` as ground truth, errors mapped back to ranges when possible.

**Operations bar:** Up / Down / Restart / Pull / Build / Logs / Ps / Config / Convert / Top / Events / Stop-Start-Pause (per service or project) — mapped to `IComposeRunner`; streaming output into Operations drawer with per-service coloring; profile selector; env-file selector; project name field.

**Acceptance**: see M3.

---

## C. Dockerfile editor and builds

Module: `Dockerfile` (editing) + `Builds` (running).

**Model** (`DockerfileDocument`): ordered `ImmutableList<Instruction>` with `Stages` derived; each `Instruction` retains original text span, leading comments, line continuations, heredocs, parser directives (`# syntax=`, `# escape=`), `ARG` before `FROM`.

**Parser** (own, lossless, in `Nautix.Dockerfile.Infrastructure`): supports all instructions (FROM, RUN incl. `--mount/--network/--security`, CMD, LABEL, EXPOSE, ENV, ADD, COPY incl. `--from/--chown/--chmod/--link`, ENTRYPOINT, VOLUME, USER, WORKDIR, ARG, ONBUILD, STOPSIGNAL, HEALTHCHECK, SHELL, MAINTAINER), heredocs, JSON-array vs shell forms, line continuation + embedded comments. Same patch strategy and byte-exact round-trip over `corpus/dockerfile/` (≥ 150 files).

**Views**
- **Blocks:** vertical list of instruction cards, draggable to reorder, each with a form (COPY: src/dest/from-stage/chown/chmod; RUN: command editor + mount/cache options; EXPOSE: ports table; HEALTHCHECK: interval/timeout/retries/cmd; etc.). "Add instruction" palette with search.
- **Stage graph:** nodes = stages; edges `FROM` (base stage), `COPY --from` (lime) and external images (dim). Click stage to filter blocks.
- **Text:** AvalonEdit with highlighting and diagnostics.
- **Layer/size hints:** after a build, show per-instruction duration, cache hit/miss, and layer size (from build history).
- **Wizards ("by actions"):** "Containerize my app" — detect project type from folder (dotnet, node, python, go, java, static) and generate a multi-stage Dockerfile + `.dockerignore` from templates (`templates/dockerfile/*.json`), user reviews as blocks.

**Lint (C#, built-in rules, each with code `NX-DF###`, severity, quick fix):** latest tag, missing USER (root), `apt-get update` without install in same layer, missing `--no-install-recommends`, ADD vs COPY, missing HEALTHCHECK (info), `cd` instead of WORKDIR, secrets in ENV/ARG patterns, unpinned package versions (info), `COPY . .` before dependency install (cache order hint), exposed privileged ports, duplicate stages names, unused stage, undefined ARG usage, shell-form ENTRYPOINT/CMD. Optional "Deep lint" runs `hadolint/hadolint` image on demand (explicit user action, image pull shown).

**Builds module**
- Build form: context dir, Dockerfile path, target stage, tags, platforms, build-args, secrets (files/env, never persisted), SSH, cache from/to, output type (image/local/tar/oci), `--pull`, `--no-cache`, builder selection.
- Execution via `IImageBuilder` (`docker buildx build --progress=rawjson --metadata-file`), parse BuildKit `rawjson` into `BuildGraph` (vertex id, digest, name, cached, started, completed, error, logs). UI renders the DAG with live status (queued/running/cached/done/error), per-vertex logs, total timing.
- Builders management: list/create/use/rm/inspect/prune/stop (buildx), `du`. Bake: open `docker-bake.hcl`/compose as targets, run, view groups.
- History: last 50 builds persisted (metadata only) in SQLite.

**Acceptance**: see M4.
