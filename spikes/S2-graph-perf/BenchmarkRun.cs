using System.Collections.Immutable;
using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Nautix.Spikes.Common;
using Nodify;

namespace Nautix.Spikes.S2;

/// <summary>Runs the S2 matrix: pan / zoom / drag at two zoom levels, with Nodify defaults and with its optimizations on.</summary>
internal sealed class BenchmarkRun(MainWindow window, GraphViewModel graph, string outputDirectory, bool screenshot, TimeSpan scenarioDuration)
{
    private static readonly double[] _zoomLevels = [0.35, 1.0];

    private NodifyEditor Editor => window.GraphEditor;

    public async Task<SpikeReport> RunAsync()
    {
        Directory.CreateDirectory(outputDirectory);
        var checks = ImmutableArray.CreateBuilder<CheckResult>();
        var build = BuildMetrics();

        foreach (var optimized in new[] { false, true })
        {
            Configure(optimized);
            var gated = new List<ScenarioStats>();
            var informational = new List<ScenarioStats>();

            foreach (var zoom in _zoomLevels)
            {
                gated.Add(await Scenario(zoom, "pan", PanStep(zoom)));
                gated.Add(await Scenario(zoom, "zoom", ZoomStep(zoom)));
                gated.Add(await Scenario(zoom, "drag-20-nodes", DragStep(20)));
                informational.Add(await Scenario(zoom, "drag-all-300-nodes", DragStep(graph.Nodes.Count)));
            }

            if (screenshot && optimized)
            {
                Reset(0.35);
                await Idle();
                await Capture("graph-300-nodes.png");
            }

            var metrics = gated.Concat(informational).SelectMany(s => new (string, double)[]
            {
                ($"{s.Name}.avgFps", s.AvgFps),
                ($"{s.Name}.p95FrameMs", s.P95FrameMs),
                ($"{s.Name}.worstFrameMs", s.WorstFrameMs),
            }).Concat(build).ToArray();

            var variant = optimized ? "Nodify optimizations ON" : "Nodify defaults";
            var failing = gated.Where(s => !s.MeetsGate).Select(s => s.Name).ToList();
            checks.Add(CheckResult.Create(
                $"{GraphViewModel.Columns * GraphViewModel.Rows} nodes / {GraphViewModel.EdgeCount} edges, {variant}",
                failing.Count == 0,
                $"avg >= {ScenarioStats.RequiredAvgFps} fps and p95 frame <= {ScenarioStats.MaxP95FrameMs} ms in pan, zoom and drag-20 at zoom 0.35 and 1.0",
                failing.Count == 0 ? "drag-all is informational only" : "below gate: " + string.Join(", ", failing),
                metrics));
        }

        return new SpikeReport("S2-graph-perf", DateTimeOffset.Now, MachineInfo.Capture(), checks.ToImmutable());
    }

    private (string, double)[] BuildMetrics()
    {
        var dpi = VisualTreeHelper.GetDpi(window).DpiScaleX;
        return
        [
            ("renderTier", RenderCapability.Tier >> 16),
            ("dpiScale", dpi),
            ("workingSetMiB", Process.GetCurrentProcess().WorkingSet64 / 1024.0 / 1024),
            ("windowWidth", window.ActualWidth),
            ("windowHeight", window.ActualHeight),
        ];
    }

    private static void Configure(bool optimized)
    {
        NodifyEditor.EnableRenderingContainersOptimizations = optimized;
        NodifyEditor.EnableDraggingContainersOptimizations = optimized;
        Connector.EnableOptimizations = optimized;
    }

    private void Reset(double zoom)
    {
        foreach (var (node, index) in graph.Nodes.Select((n, i) => (n, i)))
        {
            node.Location = new Point((index / GraphViewModel.Rows) * GraphViewModel.ColumnSpacing, (index % GraphViewModel.Rows) * GraphViewModel.RowSpacing);
        }

        Editor.ViewportZoom = zoom;
        Editor.ViewportLocation = new Point(0, 0);
    }

    private async Task<ScenarioStats> Scenario(double zoom, string name, Action<double> step)
    {
        Reset(zoom);
        await Idle();
        return await FrameSampler.RunAsync($"{name}@{zoom:0.##}", scenarioDuration, step);
    }

    private Action<double> PanStep(double zoom)
    {
        var amplitudeX = 1200 * zoom;
        var amplitudeY = 500 * zoom;
        return t => Editor.ViewportLocation = new Point(amplitudeX * (1 + Math.Sin(t * 1.3)), amplitudeY * (1 + Math.Sin(t * 0.9)));
    }

    private Action<double> ZoomStep(double zoom) =>
        t => Editor.ViewportZoom = zoom * (1 + (0.4 * Math.Sin(t * 1.5)));

    private Action<double> DragStep(int count)
    {
        var moving = graph.Nodes.Take(count).Select((node, index) => (node, origin: node.Location, phase: index * 0.3)).ToArray();
        return t =>
        {
            foreach (var (node, origin, phase) in moving)
            {
                node.Location = new Point(origin.X + (40 * Math.Cos((t * 3) + phase)), origin.Y + (40 * Math.Sin((t * 3) + phase)));
            }
        };
    }

    private Task Idle() => window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ContextIdle).Task;

    private async Task Capture(string fileName)
    {
        var bitmap = new RenderTargetBitmap((int)window.ActualWidth, (int)window.ActualHeight, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(window);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        await using var stream = File.Create(Path.Combine(outputDirectory, fileName));
        encoder.Save(stream);
    }
}
