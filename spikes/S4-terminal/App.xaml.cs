using System.Windows;
using Nautix.Ui.Theming;
using Nautix.Ui.Wpf.Theming;

namespace Nautix.Spikes.S4;

public sealed partial class App : Application, IDisposable
{
    private WindowsSystemThemeProbe? _probe;
    private ThemeManager? _theme;
    private WpfThemeApplier? _applier;
    private TerminalBridge? _bridge;

    private void OnStartup(object sender, StartupEventArgs e)
    {
        _probe = new WindowsSystemThemeProbe();
        _theme = new ThemeManager(_probe, Nautix.Ui.Theming.ThemeMode.Dark);
        _applier = new WpfThemeApplier(this, _theme);

        var window = new MainWindow();
        window.Show();
        _ = StartAsync(window, e.Args);
    }

    private static string? Option(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    private async Task StartAsync(MainWindow window, string[] args)
    {
        var selfTest = args.Contains("--selftest", StringComparer.Ordinal);
        var directory = Option(args, "--out") ?? Path.Combine(AppContext.BaseDirectory, "results");
        var exitCode = 1;
        try
        {
            var assets = Path.Combine(AppContext.BaseDirectory, "Assets");
            if (!File.Exists(Path.Combine(assets, "vendor", "xterm.js")))
            {
                throw new FileNotFoundException("xterm.js assets are missing. Run fetch-assets.ps1 first, then rebuild.");
            }

            _bridge = new TerminalBridge(window.WebView);
            await _bridge.InitializeAsync(assets);
            _bridge.ApplyTheme(TerminalTheme.FromTokens());

            if (!selfTest)
            {
                _bridge.Start(Option(args, "--cmd") ?? "cmd.exe");
                return;
            }

            var options = new SelfTestOptions(
                Option(args, "--distro"),
                Option(args, "--docker-context"),
                Option(args, "--docker") ?? "docker",
                directory,
                args.Contains("--screenshot", StringComparer.Ordinal));
            var report = await new SelfTest(_bridge, mode => _theme!.SetMode(mode), options).RunAsync();
            await report.SaveAsync(directory, CancellationToken.None);
            await File.WriteAllTextAsync(Path.Combine(directory, "s4-summary.txt"), report.ToConsoleText());
            await _bridge.CaptureAsync(Path.Combine(directory, "final.png"));
            exitCode = report.AllPassed ? 0 : 1;
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            Directory.CreateDirectory(directory);
            await File.WriteAllTextAsync(Path.Combine(directory, "s4-error.txt"), ex.ToString());
        }
        finally
        {
            if (selfTest)
            {
                Shutdown(exitCode);
            }
        }
    }

    public void Dispose()
    {
        _bridge?.Dispose();
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
