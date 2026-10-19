# 01 — Architecture

## Style

Hexagonal (ports & adapters) inside a **modular monolith**. Communication between and within modules via **Mediator** (source-generator implementation, MIT: `martinothamar/Mediator`; do **not** use MediatR — commercial license). Pipeline behaviors: logging, validation, confirmation (destructive commands), timing.

```
 WPF Views ──► MVU Store ──► IMediator ──► Application handlers ──► Ports ──► Adapters ──► Docker / WSL / FS
                  ▲                              │
                  └──────── Notifications ◄──────┘  (engine events, progress)
```

## Solution layout (create exactly this)

```text
Nautix.sln
Directory.Build.props
Directory.Packages.props
.editorconfig
LICENSE                      # MIT, "Copyright (c) patterna.dev"
THIRD_PARTY_NOTICES.md
src/
  Nautix.SharedKernel/       # Result<T>, Error, IClock, base abstractions, IConfirmationPolicy
  Nautix.Host.Wpf/           # App.xaml, composition root (DI), windows, tray, startup
  Nautix.Ui/                 # MVU runtime, theming, i18n, shared controls, canvas controls
  Nautix.EngineRelay/        # Console/tray-less background exe: named pipe <-> WSL engine relay
  Nautix.Installer/          # WiX v5 project(s) + provisioning scripts
  Modules/
    Containers/   Images/   Networks/   Volumes/   Compose/
    Dockerfile/   Builds/   Registries/ Swarm/     EngineHost/
    System/       Terminal/ Settings/
      Nautix.<Module>.Domain/
      Nautix.<Module>.Application/
      Nautix.<Module>.Infrastructure/
      Nautix.<Module>.Contracts/
tests/
  Nautix.ArchitectureTests/
  Nautix.<Module>.Tests/            # unit
  Nautix.IntegrationTests/          # Category=Integration, real engine
  Nautix.Ui.Tests/                  # MVU reducers, string/theme completeness
  Nautix.TestKit/                   # fakes, builders, corpus loader
docs/
  spec/  DECISIONS.md
corpus/
  compose/  dockerfile/             # real-world files for round-trip tests
```

Module with UI: view code lives in `Nautix.Host.Wpf/Features/<Module>/` (XAML) and state in `Nautix.Ui` or the module's `Application` layer **only if framework-free**. MVU `State`/`Msg`/`Update` for a feature live in `Nautix.<Module>.Application/Ui/` (pure, no WPF types). XAML views bind to that state through the MVU runtime.

## Dependency rules (enforced by NetArchTest)

- `Domain` → `SharedKernel` only.
- `Application` → `Domain`, `SharedKernel`, own `Contracts`, other modules' `Contracts`.
- `Infrastructure` → `Application`, `Domain`, `SharedKernel`, third-party I/O libs.
- `Contracts` → `SharedKernel` only (DTO records, request/notification types).
- No module references another module's `Domain`/`Application`/`Infrastructure`.
- `Nautix.Host.Wpf` is the only project that references `Infrastructure` assemblies (composition root).
- No project except `Host.Wpf`/`Ui` references `PresentationFramework`.

## Ports (interfaces in `Application`) and adapters (in `Infrastructure`)

| Port | Adapter | Notes |
|---|---|---|
| `IContainerEngine` | `DockerDotNetEngineAdapter` | Engine API over `npipe://./pipe/nautix_engine` |
| `IEngineEvents` | `EngineEventStreamAdapter` | `/events` with `since`, reconnect with backoff |
| `IComposeRunner` | `DockerCliComposeAdapter` | spawns `docker compose` (stdout parsed with `--progress=json` when available) |
| `IImageBuilder` | `BuildxCliAdapter` | `docker buildx build/bake`, progress `rawjson` |
| `IDockerCli` | `ProcessDockerCliAdapter` | generic passthrough for commands without API |
| `IYamlDocumentStore` | `YamlPatchAdapter` | position-aware, comment-preserving patches |
| `IDockerfileParser` | `DockerfileParserAdapter` | own lossless parser |
| `IEngineHost` | `WslEngineHostAdapter` | install/start/stop/repair distro |
| `IEngineRelayControl` | `RelayProcessAdapter` | start/stop/health of `Nautix.EngineRelay` |
| `ITerminalHost` | `ConPtyTerminalAdapter` | pseudo console |
| `IWindowsShell` | `TrayAndToastAdapter` | tray, toasts, autostart |
| `ISettingsStore` | `SqliteSettingsAdapter` | `%LocalAppData%\Nautix\nautix.db` |
| `ICredentialStore` | `WindowsCredentialAdapter` | Credential Manager (`CredRead/CredWrite`) |
| `IClock`, `IFileSystem` | system adapters | testability |

Every port has an in-memory fake in `Nautix.TestKit`. Application tests use fakes only.

## Mediator conventions

- Commands: `record StartContainer(ContainerId Id) : ICommand<Result>`.
- Queries: `record ListContainers(ContainerFilter Filter) : IQuery<Result<IReadOnlyList<ContainerSummary>>>`.
- Notifications: `record ContainerStateChanged(...) : INotification` published by `EngineEventPump` (hosted service).
- Handlers are `sealed`, one per file, named `<Request>Handler`.
- A behavior `DestructiveCommandBehavior` intercepts requests implementing `IDestructive` and asks `IConfirmationPolicy`.
- Cross-module reads use queries from the other module's `Contracts`.

## Concurrency and state

- Engine events → `Channel<EngineEvent>` (bounded, `DropOldest` for stats; `Wait` for lifecycle events) → `EngineEventPump` → Mediator notifications → MVU `Msg` dispatch.
- UI thread: only the MVU runtime marshals to `Dispatcher`. Handlers never touch the Dispatcher.
- Long operations (pull, build, up) report progress via `IProgress<OperationProgress>` mapped to notifications `OperationProgressed`.
- Cancellation: every handler accepts the request `CancellationToken`; UI exposes cancel for long operations.

## Composition root

`Nautix.Host.Wpf/Composition/ServiceRegistration.cs` registers every module through an `AddXxxModule(this IServiceCollection)` extension defined in that module's `Infrastructure`. Use `Microsoft.Extensions.Hosting` (Generic Host) for DI, logging, hosted services, configuration.
