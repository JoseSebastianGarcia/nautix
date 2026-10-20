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

<!-- Pending ADRs required by M0 (filled as spikes complete): rootfs base, graph canvas (S2), terminal control (S4), editor (S5), charts, credential helper, localization formatting. -->
