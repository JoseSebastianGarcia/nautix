# Nautix — Agent Instructions

Nautix is a Windows 11+ desktop app (WPF, .NET 10) that installs and manages its own Docker Engine inside a dedicated WSL2 distro and exposes **every Docker CLI command** as a visual action or via an integrated terminal. Includes visual editors for networks, Compose and Dockerfile.

Product of **patterna.dev**. License: **MIT**. UI languages: **English (default) + Spanish**. Themes: **dark + light** (+ follow system).

## How to work in this repo

1. Read this file, then the spec files in `docs/spec/` in numeric order before writing code.
2. Work **milestone by milestone** (`docs/spec/07-roadmap.md`). Do not start milestone N+1 until every acceptance criterion of N passes in CI.
3. Every task: write the failing test first when the logic is pure (domain, parsers, patches, commands), then implement.
4. Keep PRs/commits small and scoped to one module. Commit messages: Conventional Commits.
5. If a spec statement is ambiguous or contradicts reality (API changed, library unavailable), **stop and record it in `docs/DECISIONS.md`** (ADR style: context, decision, consequences) instead of improvising silently.
6. Never add a dependency without checking its license is MIT/Apache-2.0/BSD/MS-PL. Record each in `THIRD_PARTY_NOTICES.md`.

## Spec index

| File | Content |
|---|---|
| `docs/spec/00-product.md` | Scope, non-goals, decisions fixed |
| `docs/spec/01-architecture.md` | Modulith, hexagonal, Mediator, solution layout, ports |
| `docs/spec/02-engine.md` | WSL2 engine, managed pipe relay, Docker API access, events |
| `docs/spec/03-ui-wpf.md` | MVU pattern, WPF structure, theming (dark/light), i18n, design tokens |
| `docs/spec/04-editors.md` | Network graph, Compose editor, Dockerfile editor |
| `docs/spec/05-commands.md` | Coverage matrix of all 53 Docker commands |
| `docs/spec/06-quality-security-distribution.md` | Tests, security, installer, updates |
| `docs/spec/07-roadmap.md` | Milestones with acceptance criteria |

## Hard rules (non-negotiable)

- **Architecture:** modular monolith; each module = `Domain` / `Application` / `Infrastructure` / `Contracts`. Dependencies point inward only. Modules talk **only** through `Contracts` (Mediator requests/notifications). Enforced by `NetArchTest` in `Nautix.ArchitectureTests`; a failing architecture test blocks merge.
- **Domain and Application never reference** WPF, Docker.DotNet, YamlDotNet, System.IO.Pipes, Process, or any I/O type. Only ports (interfaces) defined in Application.
- **No message broker, no Redis, no SQL cache.** In-process `System.Threading.Channels` and in-memory state only. SQLite is allowed only for local settings/history (`ISettingsStore`).
- **UI pattern is MVU** (see `03-ui-wpf.md`): immutable `record` state, pure `Update`, side effects as returned `Effect`s. **No MVVM frameworks, no `INotifyPropertyChanged` boilerplate in feature code, no code-behind logic** beyond view wiring (`InitializeComponent`, control-specific interop).
- **Every user-visible string** comes from resources (`Strings.resx` / `Strings.es.resx`). A unit test fails if a key is missing in either language. No hardcoded text in XAML or C#.
- **Every color/brush/size** comes from theme tokens (`DynamicResource`). No hex literals in XAML outside `Themes/*.xaml`.
- **Destructive operations** (rm, prune, rmi, volume rm, network rm, system prune, swarm leave) go through `IConfirmationPolicy` and show the exact objects affected before executing.
- **Secrets** (registry credentials, tokens) only in Windows Credential Manager via `ICredentialStore`. Never in logs, settings, or telemetry.
- **Nothing listens on a TCP port.** Engine access is a per-user named pipe only.

## C# conventions

- .NET 10, C# 14, `<Nullable>enable</Nullable>`, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, `<ImplicitUsings>enable</ImplicitUsings>`, `AnalysisLevel=latest-all`.
- Microsoft naming: `PascalCase` types/members, `_camelCase` private fields, `I` prefix on interfaces, `Async` suffix on async methods, `CancellationToken ct` last parameter and always passed through.
- File-scoped namespaces; one top-level type per file; file name = type name.
- Prefer `record`/`record struct` for data, `sealed` by default, primary constructors for DI, collection expressions, pattern matching. Immutable collections in state (`ImmutableList<T>`, `ImmutableDictionary<K,V>`).
- No `async void` except WPF event handlers. No `.Result`/`.Wait()`. No `static` mutable state. No service locator.
- Errors: expected failures return `Result<T>` (in `SharedKernel`); exceptions only for programmer errors/infrastructure faults, translated at adapter boundary.
- Logging: `Microsoft.Extensions.Logging` with source-generated `[LoggerMessage]`. No string interpolation in log calls.
- `.editorconfig` + `Directory.Build.props` + `Directory.Packages.props` (central package management) at repo root. `dotnet format --verify-no-changes` must pass.

## Commands

```powershell
dotnet restore
dotnet build -warnaserror
dotnet test --filter "Category!=Integration"        # fast loop
dotnet test --filter "Category=Integration"          # needs WSL2 + engine (Windows runner)
dotnet format --verify-no-changes
```

## Definition of done (every task)

Builds with zero warnings · tests added/updated and green · architecture tests green · strings present in en+es · works in dark and light theme · no new analyzer suppressions without a comment · `docs/spec` updated if behavior diverged.
