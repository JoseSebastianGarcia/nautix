# 07 — Roadmap and acceptance criteria

Estimates are rough planning figures (person-weeks, ±40%), not commitments. **M0 is a go/no-go gate**: if a gate fails, write an ADR with the alternative chosen before proceeding.

Legend: `[ ]` task · **AC** = acceptance criterion (must be automated unless marked *manual*).

---

## M0 — Foundations and risk spikes (≈ 3 pw)

Tasks
- [ ] Create solution layout, `Directory.Build.props`, central packages, `.editorconfig`, CI skeleton, `LICENSE`, `CLAUDE.md` copy, `docs/DECISIONS.md`.
- [ ] `Nautix.SharedKernel`: `Result<T>`, `Error`, `IClock`, `IConfirmationPolicy`.
- [ ] `Nautix.Ui`: MVU runtime (`Store`, `Update`, effects), `[GenerateViewState]` source generator, theme manager, localizer, resource tests.
- [ ] Spike S1 — **Compose round-trip**: parser + patch on 50-file corpus.
- [ ] Spike S2 — **Graph perf**: Nodify with 300 nodes / 600 edges, pan/zoom/drag.
- [ ] Spike S3 — **Relay**: `Nautix.EngineRelay` + `Docker.DotNet` + `docker.exe` against a manually imported distro: `ps`, `logs -f`, `exec -it`, `build`, `save | load`.
- [ ] Spike S4 — **Terminal**: ConPTY + `Microsoft.Terminal.Wpf` (or fallback) running `docker exec -it sh` and `vim`.
- [ ] Spike S5 — **Editor**: AvalonEdit with YAML highlighting + diagnostics squiggles + folding.
- [ ] ADRs for: rootfs base, YAML parser strategy, graph canvas, terminal control, editor, charts, credential helper, localization formatting.

AC (gate)
- S1: no-op edit and single-key edit are byte-exact on ≥ 98% of 50 files, remaining cases understood and listed.
- S2: ≥ 30 fps on the reference laptop (record spec in DECISIONS) with 300 nodes / 600 edges.
- S3: 100 concurrent connections, `docker save` 1 GB at ≥ 100 MB/s, `exec -it` interactive resize works, relay restart does not break new connections.
- S4: interactive shell + full-screen app render correctly.
- Architecture tests exist and pass on the empty skeleton; CI green.

---

## M1 — Base: engine, installer, core object management (≈ 8 pw)

Tasks
- [ ] `EngineHost` module: provisioning steps 1–7, `EngineState` stream, repair/reset/export, `.wslconfig` editor.
- [ ] Installer (WiX) + first-run wizard (Full/Client-only), resumable.
- [ ] `Containers`, `Images`, `Volumes`, `System`, `Registries`, `Settings`, `Terminal` modules with all rows marked M1 in `05-commands.md`.
- [ ] Dashboard (counts, disk usage, live stats), Operations drawer, Command palette, Show-command affordance.
- [ ] Event pump with reconciliation; tray + toasts; theme + language switching.
- [ ] `CommandCoverageTests`, `ThemeTokenParityTests`, `LocalizationTests`, `NoHardcodedTextTests`.

AC
- Clean Windows 11 VM → wizard completes → `docker run hello-world` works from Nautix and from a new PowerShell window using context `nautix` (*manual + scripted in integration*).
- Every M1 row in `05-commands.md` is `Done`; coverage test green.
- Killing a container via CLI is reflected in the UI < 1 s; engine restart triggers reconciliation without duplicates.
- Switching theme and language updates all open views without restart; zero binding failures in smoke tests.
- Idle memory of GUI < 250 MB; startup to first paint < 2 s (benchmarked).
- Security tests 1, 2, 3, 11 from `06-...` pass.

---

## M2 — Networks (≈ 5 pw)

Tasks
- [ ] `Networks` module: list/inspect/create/connect/disconnect/rm/prune.
- [ ] `IGraphCanvas` adapter, built-in layered layout, saved positions, layers/filters/focus, minimap, export PNG/SVG.
- [ ] IPAM/CIDR validator, diagnostics (default-bridge DNS, overlap).

AC
- 300 nodes ≥ 30 fps (benchmarked); layout deterministic (same input → same output).
- Create network, connect container by drag, disconnect by Delete: engine state matches the graph; undo of connect issues a disconnect.
- Live events update node status < 1 s.
- Keyboard-only flow can select, connect (dialog), delete; screen-reader names present.

---

## M3 — Compose (≈ 8 pw)

Tasks
- [ ] `IYamlDocumentStore` (parser + patch), compose-spec schema embedded, semantic validator.
- [ ] Canonical `ComposeDocument`, commands for every editable construct, history.
- [ ] Graph view, schema-driven form view, YAML view (completion, hover, diagnostics), synchronized selection.
- [ ] Palette + templates, `docker compose config` validation, operations bar (up/down/logs/ps/build/pull/restart/…), projects list.
- [ ] Anchors/merge-key aware editing; `include`/`extends` navigation (read-only follow).

AC
- Corpus round-trip: no-op byte-exact on 100% of ≥ 200 files; single-field edit touches only expected lines (verified with diff-range assertions) on ≥ 99%.
- Any graph/form edit updates YAML text in < 50 ms for a 1000-line file; any YAML edit updates graph in < 250 ms debounced.
- Comments, key order, quoting preserved after 50 random edit sequences (FsCheck).
- `docker compose config` agrees with Nautix validator for ≥ 95% of corpus cases (differences documented).
- `up` / `down` on a 3-service sample produces correct statuses on nodes.

---

## M4 — Dockerfile and Builds (≈ 6 pw)

Tasks
- [ ] Lossless Dockerfile parser + patches; corpus round-trip.
- [ ] Block editor, stage graph, text view, lint rules NX-DF001…, quick fixes, "Containerize my app" wizard with templates.
- [ ] `Builds` module: build form, buildx rawjson → `BuildGraph`, DAG view, history, builders management, bake.

AC
- Corpus (≥ 150) no-op byte-exact 100%.
- Each lint rule has positive and negative unit tests and a quick fix where applicable.
- Build of a multi-stage sample shows correct DAG, cache hit/miss, timings; cancel works and leaves no orphan processes.
- Secrets passed to build are absent from logs and history (seeded-secret test).

---

## M5 — Extras and completeness (≈ 6 pw)

Tasks
- [ ] `Swarm` module (init/join/leave, nodes, services, stacks, secrets, configs, scale, update, rollback).
- [ ] Plugins, manifest, context management advanced, trust (if present in help), volume file browser.
- [ ] Image dependency/layer view, vulnerability scan hook (optional: runs `docker scout` if installed; otherwise absent, not emulated).
- [ ] winget manifest, auto-update, crash bundle, accessibility audit, ARM64 investigation (ADR only).

AC
- 100% of rows in `05-commands.md` `Done`; coverage test green against `corpus/docker-help.txt` and per-command help corpus.
- Axe-style accessibility checklist (*manual*) passes for main flows; high-contrast mode usable.
- Update flow tested: upgrade, failed-start rollback, downgrade refused.

---

## M6 — Release v1.0

- [ ] Docs (en/es), landing assets, signed MSI, winget, SECURITY/PRIVACY, trademark/domain check recorded.
- [ ] Soak test: 24 h with event churn, no leaks (memory growth < 5%), relay stable.

AC: all earlier ACs green on `main`; zero open Sev1/Sev2; v1.0 tag published.

---

## Post-1.0 backlog (do not build before M6)

AI assistant ("explain this error / generate Compose from description"), vsock transport, ARM64, remote engine provisioning, extension API.
