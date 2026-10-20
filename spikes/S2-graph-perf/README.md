# S2 — Graph performance (Nodify)

**Gate (docs/spec/07-roadmap.md, M0):** ≥ 30 fps on the reference laptop with 300 nodes / 600 edges during pan, zoom and drag. If it fails, write a custom `Canvas` + `DrawingVisual` renderer behind `IGraphCanvas` (docs/spec/03-ui-wpf.md).

**Status: code written and compiles on Linux; NOT yet run.** No frame-rate number exists yet. Whether Nodify passes is unknown until you run it.

## What it measures

- Synthetic topology, fixed seed: 15 columns × 20 rows = **300 nodes** in the spec's style (220×72, radius 12, 40×40 icon tile tinted by kind, status dot, 10 px ports, theme tokens from `Nautix.Ui.Wpf`), **600 Bézier edges** (1.5 px) between adjacent columns. Window 1600×900.
- Scenarios, each `--seconds` long, at zoom **0.35** (all 300 nodes visible, the worst case) and **1.0** (about 40 visible): **pan**, **zoom**, **drag 20 nodes** (their edges follow). Plus **drag all 300** as an informational stress case, not gated.
- Run twice: Nodify defaults, and with `EnableRenderingContainersOptimizations`, `EnableDraggingContainersOptimizations` and `Connector.EnableOptimizations` on.
- Frame time = gap between consecutive `CompositionTarget.Rendering` callbacks while one animation step is applied per callback, so layout, edge geometry and render all count. First 15 frames discarded.
- **Gate per scenario:** average ≥ 30 fps **and** p95 frame time ≤ 34 ms (≥ 95% of frames inside the 30 fps budget; 34 allows vsync quantisation).
- Also recorded: WPF render tier (3 = full GPU acceleration), DPI scale, working set, CPU/GPU/RAM/display refresh rate/AC power, graph build + first layout time.

## Run it (on your Windows machine)

```powershell
cd spikes\S2-graph-perf
.\run.ps1            # about 4 minutes; -Seconds 3 for a quicker pass
```

Plug the laptop in, use the High performance power mode, close heavy apps, and leave the window alone while it runs.

**Paste back:** everything the script prints (it ends with `Exit code: N`) and `results\graph-300-nodes.png`. The machine line is the "reference laptop" the spec asks to record in DECISIONS.

## What happens next

- **Both variants pass:** ADR "graph canvas" → Nodify (with the optimizations flags if only the optimized variant passes). Minimap and the n8n-style background grid are not in this spike; they get their own measurement in M2.
- **Only drag-all or low zoom fails:** I will report the numbers and propose limits (e.g. cull edges below zoom 0.3) before deciding.
- **Gated scenarios fail:** I write the custom renderer spike and compare it with the same harness.

## Known gaps

- Nodify's own theme dictionaries are not merged; if the screenshot looks unstyled (no grid, no selection colours) tell me — it does not affect frame cost much but I will fix it before M2.
- View models here implement INPC because Nodify binds to them; that is a measurement convenience, not the product pattern (the product wraps the canvas behind `IGraphCanvas`).
