using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using Nautix.Ui.Theming;
using Nautix.Ui.Wpf.Theming;

namespace Nautix.Spikes.S2;

public sealed partial class App : Application, IDisposable
{
    private WindowsSystemThemeProbe? _probe;
    private ThemeManager? _theme;
    private WpfThemeApplier? _applier;

    // Async void is allowed for WPF event handlers. Awaiting (instead of blocking with .Wait()) lets the dispatcher keep pumping.
    private async void OnStartup(object sender, StartupEventArgs e)
    {
        _probe = new WindowsSystemThemeProbe();
        _theme = new ThemeManager(_probe, Nautix.Ui.Theming.ThemeMode.Dark);
        _applier = new WpfThemeApplier(this, _theme);

        var build = Stopwatch.StartNew();
        var graph = GraphViewModel.Generate(name => (Brush)FindResource(name));
        var window = new MainWindow { DataContext = graph };
        window.Show();
        await window.Dispatcher.InvokeAsync(() => { }, System.Windows.Threading.DispatcherPriority.ContextIdle);
        var buildMs = build.Elapsed.TotalMilliseconds;

        if (!e.Args.Contains("--benchmark", StringComparer.Ordinal))
        {
            return;
        }

        var outIndex = Array.IndexOf(e.Args, "--out");
        var directory = outIndex >= 0 && outIndex + 1 < e.Args.Length ? e.Args[outIndex + 1] : Path.Combine(AppContext.BaseDirectory, "results");
        var secondsIndex = Array.IndexOf(e.Args, "--seconds");
        var seconds = secondsIndex >= 0 && secondsIndex + 1 < e.Args.Length ? double.Parse(e.Args[secondsIndex + 1], System.Globalization.CultureInfo.InvariantCulture) : 5;
        _ = RunAsync(window, graph, directory, e.Args.Contains("--screenshot", StringComparer.Ordinal), TimeSpan.FromSeconds(seconds), buildMs);
    }

    private async Task RunAsync(MainWindow window, GraphViewModel graph, string directory, bool screenshot, TimeSpan duration, double buildMs)
    {
        var exitCode = 1;
        try
        {
            var report = await new BenchmarkRun(window, graph, directory, screenshot, duration).RunAsync();
            var text = $"graph build + first layout: {buildMs:0} ms{Environment.NewLine}{report.ToConsoleText()}";
            await report.SaveAsync(directory, CancellationToken.None);
            await File.WriteAllTextAsync(Path.Combine(directory, "s2-summary.txt"), text);
            exitCode = report.AllPassed ? 0 : 1;
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            Directory.CreateDirectory(directory);
            await File.WriteAllTextAsync(Path.Combine(directory, "s2-error.txt"), ex.ToString());
        }
        finally
        {
            Shutdown(exitCode);
        }
    }

    public void Dispose()
    {
        _applier?.Dispose();
        _theme?.Dispose();
        _probe?.Dispose();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        Dispose();
        base.OnExit(e);
    }
}
