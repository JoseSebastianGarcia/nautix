# 03 — UI (WPF, MVU, theming, i18n)

## Technology

- WPF on .NET 10, `net10.0-windows10.0.22000.0`.
- Shell/controls base: **WPF-UI** (lepoco, MIT) for Fluent window chrome, Mica backdrop, navigation view. Wrap behind own styles; do not leak WPF-UI types into feature code.
- Node/graph canvas: **Nodify** (MIT) behind port `IGraphCanvas`. If it fails the M0 performance gate (300 nodes ≥ 30 fps, 600 edges), write a custom `Canvas` + `DrawingVisual` renderer behind the same port.
- Code editor (YAML, Dockerfile): **AvalonEdit** (MIT) with custom `IHighlightingDefinition` and `IBackgroundRenderer` for diagnostics. Alternative evaluated at M0: Monaco in WebView2 (only if AvalonEdit can't meet folding/diagnostics needs; record in DECISIONS).
- Terminal: ConPTY (`CreatePseudoConsole`) via `ConPtyTerminalAdapter` + a terminal control. Evaluate `Microsoft.Terminal.Wpf` (MIT) first; fallback: custom VT renderer (use a maintained VT parser library). Decide at M0.
- Charts (stats): LiveCharts2 or ScottPlot (both MIT) — choose at M1, behind `IChartHost` if used in more than one view.
- Icons: Segoe Fluent Icons for system affordances + SVG set in `Assets/Icons` (MIT-compatible, e.g. Fluent UI System Icons) rendered via `SharpVectors` or converted to `DrawingImage` at build.

## MVU runtime (`Nautix.Ui`)

```csharp
public interface IMsg;                       // marker for messages
public interface IEffect;                    // marker for side-effect descriptors

public delegate (TState State, ImmutableArray<IEffect> Effects) Update<TState>(TState state, IMsg msg);

public sealed class Store<TState> : IObservable<TState>
{
    public TState Current { get; }
    public void Dispatch(IMsg msg);          // thread-safe; reduces on a single serial queue
}

public interface IEffectHandler<in TEffect> where TEffect : IEffect
{
    Task HandleAsync(TEffect effect, Action<IMsg> dispatch, CancellationToken ct);
}
```

Rules:
- `State` is an immutable `record` tree. `Update` is a pure static function: no I/O, no clock, no random, no `Task`. It returns the new state and **effects** (e.g. `RunCommandEffect(IRequest)`), executed by `IEffectHandler`s that call `IMediator` and dispatch result `Msg`s.
- One `Store<TState>` per feature screen (`ContainersScreen`, `ComposeEditorScreen`, …) plus a root `AppState` (navigation, theme, language, engine status, toasts).
- Views bind to `State` via a thin `StateBinding` helper: a view model *projection* class generated per screen is **allowed** only as a read-only adapter implementing `INotifyPropertyChanged` from the store's observable (generate with a source generator `[GenerateViewState]`; do not hand-write). User input is expressed as `Dispatch(new Msg)` through `ICommand` adapters (`MsgCommand<T>`) — the "adapter" is the only MVVM-looking artifact and contains no logic.
- Time-travel / undo: editors keep `History<TDocument>` (past/present/future) in their state. Max 500 entries, coalescing consecutive text edits within 500 ms.
- Collections shown in `ItemsControl`/`DataGrid` are diffed into `ObservableCollection` by a keyed `CollectionSync` helper (avoid full resets; keep scroll/selection).
- Testing: reducers are tested with plain xUnit (`Update(state, msg)`), no WPF. A `UiSmokeTests` project may launch views with `STA` threads for binding errors (fail on `BindingFailure` trace events).

Editor command pattern (shared by Network/Compose/Dockerfile editors):

```csharp
public interface IEditorCommand<TDocument>
{
    TDocument Apply(TDocument document);
}
public sealed record AddService(string Name, string Image) : IEditorCommand<ComposeDocument>
{
    public ComposeDocument Apply(ComposeDocument d) =>
        d with { Services = d.Services.Add(new ServiceNode(Name, Image)) };
}
```

## Navigation and layout

Main window (`MainWindow`): custom title bar (Mica), left `NavigationView`, content host, bottom status bar (engine state, context, CPU/RAM of the VM, active operations), right-hand collapsible "Operations & Logs" drawer.

Navigation items (order): Dashboard · Containers · Images · Volumes · Networks (list + graph) · Compose · Dockerfile · Builds · Registries · Swarm · Terminal · System · Settings.

Global affordances:
- Command palette (`Ctrl+K`): fuzzy search over actions and objects.
- "Show command" button/`Ctrl+Shift+C` on every action: displays the equivalent CLI line (from `ICommandPreview`).
- Toasts for completion/failure; failures expand to show engine message + hint.
- Everything keyboard-navigable; `AutomationProperties.Name` set from resources; high-contrast theme falls back to system colors.

## Theming (dark, light, system)

- Two `ResourceDictionary` files: `Themes/Dark.xaml`, `Themes/Light.xaml`, both defining the **same keys**. Components use `DynamicResource` only. Switching = swap the merged dictionary + set WPF-UI `ApplicationTheme`. A test asserts both dictionaries contain identical key sets.
- `System` mode follows `AppsUseLightTheme` registry value and reacts to `SystemEvents.UserPreferenceChanged`.
- Persist in `ISettingsStore` key `ui.theme` = `dark|light|system`. Default `system`; first-run screenshot/branding uses dark.

### Tokens

| Key | Dark | Light |
|---|---|---|
| `Nx.Bg0` (canvas/app) | `#07090B` | `#F4F7F9` |
| `Nx.Bg1` (panels) | `#0D1114` | `#FFFFFF` |
| `Nx.Bg2` (raised/hover) | `#141A1F` | `#EAF0F3` |
| `Nx.Line` | `#1F2A31` | `#D5DFE5` |
| `Nx.Text` | `#E6EEF2` | `#0E1A21` |
| `Nx.TextDim` | `#8A9BA6` | `#55677A` |
| `Nx.Lime` (accent 1 / fills) | `#B6FF3B` | `#B6FF3B` |
| `Nx.LimeStrong` (text/lines on surface) | `#B6FF3B` | `#4C8A00` |
| `Nx.Cyan` (accent 2) | `#38D5FF` | `#0089B8` |
| `Nx.Violet` (volumes) | `#A78BFA` | `#7C5CE0` |
| `Nx.Amber` (config/secret/warn) | `#FFB020` | `#B86E00` |
| `Nx.Danger` | `#FF4D6A` | `#D6204A` |
| `Nx.OnLime` (text over lime fill) | `#07090B` | `#07090B` |

Contrast requirement: text vs its background ≥ 4.5:1, UI boundaries ≥ 3:1; add a unit test computing WCAG ratios for token pairs in both themes.

Typography: UI `Segoe UI Variable`; mono `Cascadia Code`, fallback `Consolas`. Sizes: 12 / 13 (body) / 16 / 20 / 28.
Shape: radius 12 (cards/nodes), 8 (controls); 1 px borders `Nx.Line`; focus ring 2 px `Nx.Cyan` (dark) / `Nx.Cyan` (light).
Effects: subtle glow on selected nodes only (`DropShadowEffect` color = accent at 35% opacity, blur 16); disable when `SystemParameters.ClientAreaAnimation == false` or in high contrast.
Motion: 120–180 ms ease-out; respect reduced-motion.

### Canvas style (n8n-like)

- Background: grid drawn with a tiled `DrawingBrush` — minor 24 px dots/lines at 6% opacity of `Nx.Text`, major every 120 px at 12%. Pan/zoom keeps the grid aligned (brush transform bound to viewport). Snap-to-grid 12 px.
- Node: 220×72, corner radius 12, `Nx.Bg1` fill, 1 px `Nx.Line` border; 40×40 icon tile tinted by kind — service `Nx.Lime`, network `Nx.Cyan`, volume `Nx.Violet`, config/secret `Nx.Amber`; title (13, semibold) + subtitle (12, dim); status dot (running = lime, restarting = amber, exited/error = danger, stopped = dim).
- Ports: 10 px circles on left (inputs) / right (outputs), hover enlarges to 14 px. Edges: cubic Bézier, 1.5 px, color by relation (network = cyan, volume = violet, depends_on = dim dashed, `COPY --from` = lime). Selected edge 2.5 px with glow. Animated dash flow on edges only for active traffic/in-progress build steps.
- Minimap bottom-right, zoom controls bottom-left, toolbar floating top-center.

## Internationalization (en, es)

- Resources: `Nautix.Ui/Resources/Strings.resx` (neutral = English), `Strings.es.resx`. Keys: `Area.Component.Purpose` (e.g. `Containers.Action.Start`).
- XAML access via markup extension `{loc:T Containers.Action.Start}`; code access via `ILocalizer.Get(key, args)`. Pluralization/ICU-style via `SmartFormat`-like minimal formatter or `string.Format` with separate keys (`.One`/`.Other`); decide at M1 and keep consistent.
- Runtime switch: `ILocalizer.SetCulture(CultureInfo)` raises a change notification; `T` extension re-evaluates (binding on `LocalizationSource.Instance[key]`). No restart needed. Persist `ui.language` = `system|en|es`; default `system` (fallback `en`).
- Dates/numbers/sizes formatted with `CurrentUICulture`; byte sizes via `ByteSize` helper (IEC: KiB/MiB/GiB).
- Engine/CLI output is **not** translated; app-owned hints and errors are.
- Tests: (1) every key exists in both files; (2) no `Text="..."`/`Content="..."` literals in XAML (regex test over `*.xaml`, excluding `Themes/`); (3) format placeholders match across languages.
- Installer UI: WiX localization `en-US` and `es-ES`.
- Docs (`README.md`, `docs/`) in English; `README.es.md` in Spanish.

## Accessibility

Screen reader names for all controls, keyboard operable graph (arrow keys move selection between nodes, `Enter` opens inspector, `Del` removes with confirmation, `Ctrl+Z/Y` undo/redo), visible focus, no color-only status (status dots also carry icon/shape + text in tooltip).
