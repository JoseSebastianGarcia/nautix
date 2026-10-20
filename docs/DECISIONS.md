# Architecture Decision Records

Format: context, decision, consequences. Status: Accepted · Proposed (pending data or owner decision) · Superseded.
New entries go at the end; never edit an accepted ADR, supersede it.

---

## ADR-001 — `Nautix.Ui` is split into a framework-free core and a WPF part

- **Status:** Accepted (owner approved the split during M0 planning).
- **Context:** `docs/spec/01-architecture.md` forbids PresentationFramework outside `Host.Wpf`/`Ui`, while `03-ui-wpf.md` puts the MVU runtime, localizer and theme tokens in `Nautix.Ui`. Pure logic (Store, reducers, Localizer, token parity, WCAG maths) must be testable on Linux CI and agents without WPF.
- **Decision:** `Nautix.Ui` targets `net10.0` and holds everything framework-free. WPF-specific code (theme dictionaries applied to `Application`, markup extensions, controls, canvas) lives in `Nautix.Ui.Wpf` (`net10.0-windows10.0.22000.0`), created when first needed (M0 block 3). The `[GenerateViewState]` generator lives in `Nautix.Ui.Generators` (`netstandard2.0`, Roslyn requirement).
- **Consequences:** Architecture rule becomes "only `Nautix.Host.Wpf` and `Nautix.Ui.Wpf` may use WPF/Windows targets" (enforced in `LayerRules`). `01-architecture.md` solution layout gains two projects; update spec when M0 closes.

## ADR-002 — xUnit v3 runs on VSTest (`xunit.v3.mtp-off`)

- **Status:** Accepted.
- **Context:** `xunit.v3` 4.x defaults to Microsoft.Testing.Platform. On .NET 10 SDK, `dotnet test` then refuses VSTest-style invocation, and the `--filter "Category!=Integration"` commands in `CLAUDE.md` stop working.
- **Decision:** Use the `xunit.v3.mtp-off` package (Apache-2.0, same version) with `Microsoft.NET.Test.Sdk` and `xunit.runner.visualstudio`. `CLAUDE.md` commands stay valid.
- **Consequences:** Revisit when moving to MTP (needs `global.json` `test.runner` opt-in and `--filter-not-trait`). All test projects must use this package, centrally versioned.

## ADR-003 — WiX Toolset v5 is MS-RL; Installer project deferred

- **Status:** Accepted — owner approved option (a) on 2026-10-19; WiX is allowed as a build-time-only exception.
- **Context:** `CLAUDE.md` allows only MIT / Apache-2.0 / BSD / MS-PL dependencies. `WixToolset.Sdk` 5.0.2 declares `MS-RL` in its nuspec (Microsoft Reciprocal License, file-level copyleft). `01-architecture.md` and `06-...` mandate WiX v5 for the MSI. WiX is a build-time tool and its output (MSI) is not a derivative work, but the rule as written excludes it.
- **Options:** (a) approve MS-RL as a build-time-only exception (nothing from WiX is redistributed in the app; record in `THIRD_PARTY_NOTICES.md` under "Build tools"); (b) switch to another packager (MSIX needs signing/trust story; Inno Setup is not MSI and has its own license; `dotnet`-based zip + winget portable).
- **Recommendation:** (a). It is the standard path for MSI on Windows and the exception is narrow.
- **Consequences:** WiX may be added in M1 (installer task) as a build-only dependency, listed under "Build tools" in `THIRD_PARTY_NOTICES.md`; nothing from it ships inside the app. Until then `src/Nautix.Installer/` contains only a README and is not in `Nautix.sln`.

## ADR-004 — Test dependency licenses and pins

- **Status:** Accepted.
- **Decision:** Verified against nuspec metadata on 2026-10-19: `xunit.v3.mtp-off`, `xunit.runner.visualstudio` (Apache-2.0); `Microsoft.NET.Test.Sdk`, `coverlet.collector` (MIT); `Shouldly` 4.3.0 (BSD-3-Clause, pinned below the 5.0 previews whose license is not yet evaluated); `NetArchTest.Rules` 1.3.2 (nuspec carries no license metadata; upstream repository `BenMorris/NetArchTest` is MIT).
- **Consequences:** Before upgrading Shouldly to 5.x, re-check its license; fallback is AwesomeAssertions (Apache-2.0). NetArchTest's missing metadata means automated license scanning in CI needs an allowlist entry for it.

## ADR-005 — Architecture tests check project graph, not just assembly references

- **Status:** Accepted.
- **Context:** The C# compiler drops references that are never used, so on an empty skeleton `Assembly.GetReferencedAssemblies()` proves nothing, and NetArchTest alone would pass vacuously.
- **Decision:** `Nautix.ArchitectureTests` combines (1) static analysis of every `src/**/*.csproj` (project and package references, WPF usage) with (2) NetArchTest type rules on the loaded Domain/Application assemblies, plus negative-control tests that feed forbidden references and a deliberately violating fixture type to prove both detect violations.
- **Consequences:** Rules live in `LayerRules` and `TypeRules`; adding a module requires adding its name to `ProjectGraph.Modules` and the tests fail until the four layer projects exist and are wired in `Nautix.Host.Wpf`.

## ADR-006 — Static-analysis profile

- **Status:** Accepted.
- **Decision:** `AnalysisLevel=latest-all` with warnings as errors. Disabled globally with reasons recorded in `.editorconfig`: CA1303 (literals localized at UI layer), CA2007 (no ConfigureAwait in app code), CA1014 (no CLS compliance), CA1515 (public contracts by design), CS1591 (no mandatory XML docs). Tests additionally disable CA1707, CA1812, CA1861, CA1062.
- **Consequences:** Any new suppression needs a comment and ADR mention if global.

## ADR-007 — WPF builds on Linux via `EnableWindowsTargeting`

- **Status:** Accepted.
- **Context:** Agents and contributors on Linux must still compile `Nautix.Host.Wpf`.
- **Decision:** `EnableWindowsTargeting=true` in `Directory.Build.props`. Verified that XAML compilation and analyzers run on Linux with SDK 10.0.113. Running and UI smoke tests remain Windows-only.
- **Consequences:** Linux build success does not prove WPF runtime behavior; Windows CI is authoritative for anything under `Nautix.Host.Wpf` / `Nautix.Ui.Wpf`.

## ADR-008 — MVU runtime details that refine the spec

- **Status:** Accepted.
- **Decision:** (1) `Store<TState>` is constrained to `class` (state is an immutable record; lock-free `Volatile` publication of a reference). (2) Effects are dispatched through `EffectRunner`, built from explicit handler registrations (`EffectRunnerBuilder`), not a service locator; an unregistered effect surfaces as an `EffectFailed` message. (3) Handler exceptions never escape: the store turns them into `EffectFailed` so `Update` decides what the user sees. (4) Observers are notified through an optional `SynchronizationContext`, so only the runtime marshals to the Dispatcher. (5) `History<T>` (undo/redo) and `CollectionSync` are deferred to the first editor that needs them (M2/M3); `MsgCommand<T>` goes with the first WPF view. (6) WPF-UI (`ApplicationTheme`, Mica) is deferred to M1 with the main window; `ThemeManager` is independent of it.
- **Consequences:** Marker interfaces `IMsg`/`IEffect` stay empty by spec (CA1040 disabled with reason).

## ADR-009 — Theme contrast findings (measured against `03-ui-wpf.md` tokens)

- **Status:** Accepted — owner chose options (a) + (c) on 2026-10-20; see Resolution.
- **Context:** The spec requires text ≥ 4.5:1 and UI boundaries ≥ 3:1 and asks for a unit test. Measured with WCAG 2.x maths (`Wcag`, tested against the 21:1 and 4.48:1 reference values):
  - **Pass:** `Nx.Text` (≥ 14.9) and `Nx.TextDim` (≥ 5.06) on all three surfaces in both themes; `Nx.OnLime` on `Nx.Lime` (16.48); every accent ≥ 3:1 on all surfaces in both themes (lowest: light `Nx.Cyan` on `Nx.Bg2` 3.46) — fine for icons, lines, status dots and the focus ring.
  - **Fail as body text (light theme only):** `Nx.LimeStrong` 3.69–4.25, `Nx.Cyan` 3.46–3.98, `Nx.Amber` 3.47–3.99, `Nx.Violet` on Bg0/Bg2 4.37/4.09, `Nx.Danger` on Bg2 4.38. The spec describes `LimeStrong` as "text/lines on surface"; as text it does not reach 4.5.
  - **Borders:** `Nx.Line` is 1.18–1.36:1 against surfaces in both themes. Fine for decorative dividers, but an input or button defined *only* by a 1 px `Nx.Line` border fails WCAG 1.4.11 (3:1).
- **Decision (interim):** `Accent_as_text_known_gaps_are_exactly_the_documented_ones` pins the failing set so any token change forces an update here. Rule until decided: do not use accents as text colour in the light theme except `Nx.Violet` on Bg1 and `Nx.Danger` on Bg0/Bg1; use `Nx.Text`/`Nx.TextDim` for text next to a coloured dot or icon.
- **Options for the owner:** (a) darken light-theme `LimeStrong` to about `#3F7300`, `Cyan` to about `#006E94`, `Amber` to about `#9A5C00` so they work as text (spec change, small); (b) keep tokens and enforce the rule above in code review; (c) add a `Nx.LineStrong` token (≥ 3:1) for interactive-control borders in both themes. Recommended: (a) + (c).
- **Resolution:** Light theme `LimeStrong` `#4C8A00`→`#427900`, `Cyan` `#0089B8`→`#00749C`, `Amber` `#B86E00`→`#9B5D00`; also `Violet` `#7C5CE0`→`#7452DE` and `Danger` `#D6204A`→`#D11F48`, which failed on some surfaces too (same hue, minimal lightness change). All accents now ≥ 4.56:1 on Bg0/Bg1/Bg2 in both themes. New token `Nx.LineStrong` (dark `#4F6B7D`, light `#698CA2`, ≥ 3.11:1 on all surfaces) for borders of interactive controls; `Nx.Line` stays decorative. `docs/spec/03-ui-wpf.md` updated. The pinned known-gaps test was replaced by strict 4.5:1 / 3:1 tests.
- **Consequences:** Changing tokens requires updating `ThemeTokens`, both XAML dictionaries and the pinned test together.

## ADR-010 — Static `LocalizationSource.Instance`

- **Status:** Accepted (spec-mandated).
- **Context:** `{loc:T key}` is a XAML markup extension and cannot receive constructor injection; `03-ui-wpf.md` specifies `LocalizationSource.Instance[key]`.
- **Decision:** Keep the singleton but make it a thin holder: the composition root calls `Attach(ILocalizer)` at startup; all logic lives in the injectable `Localizer`. Everything outside XAML uses `ILocalizer`.
- **Consequences:** This is the only sanctioned static in UI code; do not add others.

## ADR-011 — YAML strategy for Compose: YamlDotNet parser events + marks, patch-based

- **Status:** Accepted (evidence: spike S1, `spikes/S1-compose-roundtrip/README.md`).
- **Context:** `04-editors.md` asks to evaluate YamlDotNet's parser events with `Mark`s and fall back to a custom CST only if comment/anchor round-trip cannot be guaranteed. Edits must be patches on the original text.
- **Decision:** Use `YamlDotNet` (MIT, 18.1.0) at the **parser-event level only** to obtain node positions; never its serializer. Build a positions-only tree and emit single contiguous `TextPatch`es. No custom CST for M3's start. Comments need no parsing for patching: they live in text the patch never touches.
- **Evidence:** 67/67 real files (24 repos) and 16/16 synthetic edge cases pass semantic-oracle + diff-range + mark-fidelity checks over 914 edits; latency p95 patch+apply ≤ 0.19 ms, parse ≤ 7.1 ms for 2000 lines. Gate (≥ 98%) passed.
- **Known YamlDotNet facts the design depends on (v18):** `Mark.Index` is `long` and counts UTF-16 units (CRLF = 2, surrogate pairs = 2); the scanner folds a BOM into the first scalar (strip and offset); scalar spans include anchor/tag properties (skip them); block-collection end marks point at the next token (derive content end from the last child); flow collection end marks point *at* the closing bracket; block scalar spans include trailing blank lines.
- **Consequences:** `YamlDotNet` is referenced only from `Nautix.Compose.Infrastructure` (architecture tests forbid it in Domain/Application). M3 must still implement flow-collection add/remove/append, block-scalar edits, alias/anchor edit prompts, and grow the corpus to ≥ 200 files including real CRLF files. **Re-open this ADR if** the 200-file corpus shows > 1% no-op/edit failures attributable to the parser rather than the patcher, or if features needing comment positions (for example comment-aware folding or reordering with attached comments) are scheduled.

## ADR-012 — Third-party corpus is fetched by pinned hash, not committed

- **Status:** Accepted, **deviates from `01-architecture.md` (`corpus/compose/` "real-world files")** — flag for owner review.
- **Context:** The 67 real compose files come from repositories licensed CC0, Apache-2.0, MIT, MPL-2.0, GPL-3.0, AGPL-3.0, FSL, BUSL and custom terms. Committing them to an MIT repository would redistribute files under incompatible or unclear terms.
- **Decision:** Commit `corpus/compose/manifest.json` (URL, sha256, size, upstream license per file) and a `fetch` command; downloaded files go to `corpus/compose/downloaded/` (git-ignored). Synthetic files authored for this project are committed (MIT) with `-text` in `.gitattributes` so their exact bytes (CRLF, BOM, missing final newline) survive checkout. CI fetches before running the gate; a hash mismatch excludes the file and is reported.
- **Consequences:** Corpus tests need network (CI has it; offline runs use the synthetic set). Pins must be refreshed deliberately when upstream changes. If the owner wants the permissive subset (CC0 `docker/awesome-compose`) committed, that is a one-line change plus notices.

## ADR-013 — Terminal control: xterm.js in WebView2 over our own ConPTY (not `Microsoft.Terminal.Wpf`)

- **Status:** Proposed — **needs owner approval; confirmed or rejected by S4 results.**
- **Context:** `03-ui-wpf.md` says to evaluate `Microsoft.Terminal.Wpf` first and fall back to "a custom VT renderer (use a maintained VT parser library)". Checked 2026-10-20: nuget.org lists `Microsoft.Terminal.Wpf` 1.0 with no license metadata, and its `.nupkg` returns `404 BlobNotFound`; it is unusable. A custom renderer means writing selection, scrollback, alternate screen, mouse reporting, wide glyphs, IME and accessibility ourselves.
- **Decision (proposed):** Render with **xterm.js 6.0.0** (MIT; used by VS Code) inside **WebView2** (SDK is BSD-3-Clause; the runtime ships with Windows 11), fed by our own ConPTY wrapper (`ConPtySession`, the prototype of `ConPtyTerminalAdapter`). Theme colours come from the `Nx.*` tokens. Assets are fetched by pinned SHA-512, not committed.
- **Evidence so far:** spike S4 compiles; behaviour unverified (see `spikes/S4-terminal/README.md`). Gate: shell + vim + `docker exec -it` + resize render correctly, asserted from xterm's buffer.
- **Consequences:** Adds WebView2 processes (extra memory while a terminal is open; to measure in M1 against the 250 MB idle budget). The spec's "custom VT renderer" remains the fallback if S4 fails or the owner rejects the WebView dependency. `03-ui-wpf.md` must be updated if approved.

## ADR-014 — The engine distro keep-alive defaults to ON

- **Status:** Proposed — owner decision (M1).
- **Context:** WSL stops a distro with no process started from Windows. `02-engine.md` says the relay holds `sleep infinity` "while ≥ 1 client or `engine.keepAlive` is true" without a default. With the default off, running `docker run -d …` and closing every terminal would stop the VM and kill the container.
- **Decision (proposed):** `engine.keepAlive` defaults to **true**; the relay releases the keep-alive 30 s after the last client only when the user turned it off. Cost: the WSL VM stays resident (its memory is bounded by `.wslconfig`, and is outside the GUI's 250 MB budget).
- **Consequences:** The Settings module exposes the toggle with this explanation; `RelayOptions.KeepAlive` already defaults to true.

## ADR-015 — Docker API client: `Docker.DotNet.Enhanced`, not `Docker.DotNet`

- **Status:** Proposed — validated by the S3 run.
- **Context:** `Docker.DotNet` 3.125.15 (nuget, 2023) is unmaintained. `02-engine.md` says "if the library lags, add a typed `HttpClient`; do not fork silently". A maintained fork exists: **Docker.DotNet.Enhanced 4.3.3** (MIT, `testcontainers/Docker.DotNet`, net8–net10 targets). Its API is **different**: `DockerClientBuilder` (`WithEndpoint`, `WithTimeout`, `WithTransportOptions(NPipe|Unix|NativeHttp|LegacyHttp)`), built-in docker-context resolution (`WithContext`), `MultiplexedStream` that already demultiplexes stdcopy, `SaveImageAsync`. The spec's `DockerClientConfiguration` example does not exist in it.
- **Decision (proposed):** Use the Enhanced fork behind `IContainerEngine`; no private fork is created. Still wrap everything behind our port so the library can be replaced.
- **Consequences:** `StdCopyDemuxer` may become unnecessary for API streams (re-evaluate in M1); the S3 harness exercises logs follow, pull, save, events and 100 concurrent clients through the relay. If the npipe transport misbehaves with the message-mode relay pipe, S3 will show it.

## ADR-016 — Plural formatting: `.One`/`.Other` keys, no extra library

- **Status:** Accepted.
- **Decision:** Plural-sensitive strings use two keys, `<Base>.One` and `<Base>.Other`, with the count as `{0}`. `ILocalizer.GetPlural(baseKey, count, args…)` selects the form through `PluralRules` (English and Spanish: exactly 1 is "one"; 0 and everything else "other"). A resource test requires both forms in both languages and the count in the text. No SmartFormat dependency.
- **Consequences:** Adding a language with more plural categories means extending `PluralCategory`/`PluralRules` and the resource tests together.

## ADR-017 — Root filesystem of the engine distro: Debian 13 (trixie) slim

- **Status:** Accepted for the start of M1, subject to the S3 provisioning run.
- **Context:** `02-engine.md` prefers Debian slim for systemd and moby packages over Alpine.
- **Decision:** Base the distro on Debian 13 slim, taken from the Debian Docker-images maintainers' repository (`debuerreotype/docker-debian-artifacts`, branch `dist-amd64`, `trixie/slim/oci/blobs/rootfs.tar.gz`; 29,843,350 bytes; SHA-256 `ecc510c1e359bdc007b39802570bb7e4dec7d6ebccf357c3201a74299113e05e`, verified 2026-10-20). Its content is a plain gzip tar that `wsl --import` accepts. It does **not** contain systemd, so provisioning installs `systemd`, `systemd-sysv`, `dbus`, `iptables`, then Docker Engine from Docker's official apt repository (`docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`). `daemon.json` omits `hosts` (the packaged unit already passes `-H fd://`; both together stop dockerd).
- **Consequences:** M1's CI job `build/engine-rootfs/` must re-pin the hash on every rootfs refresh and keep the Docker apt repository key fingerprint pinned; the first-run wizard needs network for apt unless the rootfs is pre-built with Docker inside (recommended before v1.0 to meet the "< 10 min" criterion and to avoid depending on live apt mirrors).

## ADR-018 — Credential helper for registries

- **Status:** Proposed — owner decision (needed before M1 registries work).
- **Context:** `06-...` requires credentials only in Windows Credential Manager, never plaintext in `config.json`, and leaves "wincred vs a Nautix helper" to M1. The standalone Windows `docker.exe` zip contains no credential helper (`docker-credential-wincred.exe` ships with Docker Desktop), so Nautix must supply one.
- **Options:** (a) ship the upstream `docker-credential-wincred.exe` (MIT, `docker/docker-credential-helpers`), pinned and checksum-verified, with `credsStore: "wincred"` in Nautix's `DOCKER_CONFIG`; (b) write `docker-credential-nautix.exe` (about 150 lines, `get`/`store`/`erase`/`list`) that uses target names `Nautix/registry/<host>`.
- **Recommendation:** (a). It is smaller attack surface on a security path, battle-tested, and other docker tools can share the entries. Cost: the Credential Manager target is the registry URL, not `Nautix/registry/<host>` as the spec wrote; `ICredentialStore` talks to the helper protocol instead of calling `CredRead` directly. Choose (b) only if namespacing under `Nautix/` is a hard requirement.
- **Consequences:** Needs the helper's checksum in `build/checksums.json` and a download step in `InstallClientTools`.

## ADR-019 — Charts: start with an in-house lightweight control; decide LiveCharts2 vs ScottPlot only if needed

- **Status:** Proposed — final choice at M1 as the spec says.
- **Context:** Facts checked 2026-10-20: `ScottPlot.WPF` 5.1.59 (MIT) depends on `SkiaSharp.Views.WPF` 3.119 **and** OpenTK + OpenTK.GLWpfControl; `LiveChartsCore.SkiaSharpView.WPF` 2.0.5 (MIT) depends on `SkiaSharp.Views.WPF` 3.119 and `SkiaSharp.HarfBuzz`. Both therefore ship SkiaSharp native binaries. The Dashboard needs a few small live line/area charts (CPU, memory, network, disk), a handful of series with a few hundred points at 1 Hz.
- **Decision (proposed):** Build a small `Sparkline`/`AreaChart` control (StreamGeometry, theme tokens, no dependency) behind `IChartHost`, and adopt LiveCharts2 or ScottPlot only if the Stats view needs zoom, axes and tooltips beyond it. In M1 measure all three on 12 series × 300 points at 1 Hz (working set and CPU) before committing.
- **Consequences:** If rejected, pick ScottPlot for raw speed or LiveCharts2 for animated styling; both are MIT and already vetted for license.

## ADR-020 — Pending evidence: graph canvas (S2) and editor (S5)

- **Status:** Proposed — **no decision possible without the S2 and S5 runs.**
- **Graph canvas:** Nodify 7.3.0 (MIT) is the spec's first choice. S2 measures frame pacing (pan, zoom, drag at zoom 0.35 and 1.0, with and without Nodify's optimization flags). If a gated scenario fails, the custom `DrawingVisual` renderer behind `IGraphCanvas` becomes an M0 task.
- **Editor:** AvalonEdit 6.3.1.120 (MIT) is the spec's first choice; Monaco in WebView2 only if S5 fails folding/diagnostics/latency needs. If ADR-013 (WebView2) is approved, WebView2 is no longer an extra dependency for Monaco, which makes that fallback cheaper.

<!-- M0 ADR checklist: rootfs ✔ (ADR-017) · YAML parser ✔ (ADR-011) · graph canvas (S2) ADR-020 pending data · terminal ADR-013 proposed · editor (S5) ADR-020 pending data · charts ADR-019 proposed · credential helper ADR-018 proposed · localization formatting ✔ (ADR-016). -->
