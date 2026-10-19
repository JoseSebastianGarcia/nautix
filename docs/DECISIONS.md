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

<!-- Pending ADRs required by M0 (filled as spikes complete): rootfs base, YAML parser, graph canvas, terminal control, editor, charts, credential helper, localization formatting. -->
