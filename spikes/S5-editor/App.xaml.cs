using System.Windows;
using Nautix.Ui.Theming;
using Nautix.Ui.Wpf.Theming;

namespace Nautix.Spikes.S5;

public sealed partial class App : Application, IDisposable
{
    private WindowsSystemThemeProbe? _probe;
    private ThemeManager? _theme;
    private WpfThemeApplier? _applier;
    private EditorController? _controller;

    private void OnStartup(object sender, StartupEventArgs e)
    {
        _probe = new WindowsSystemThemeProbe();
        _theme = new ThemeManager(_probe, Nautix.Ui.Theming.ThemeMode.Dark);
        _applier = new WpfThemeApplier(this, _theme);

        var window = new MainWindow();
        _controller = new EditorController(window.TextEditor);
        Wire(window);
        window.Show();

        if (e.Args.Contains("--selftest", StringComparer.Ordinal))
        {
            var outIndex = Array.IndexOf(e.Args, "--out");
            var directory = outIndex >= 0 && outIndex + 1 < e.Args.Length ? e.Args[outIndex + 1] : Path.Combine(AppContext.BaseDirectory, "results");
            var screenshots = e.Args.Contains("--screenshot", StringComparer.Ordinal);
            _ = RunSelfTestAsync(window, directory, screenshots);
        }
        else
        {
            window.TextEditor.Text = SampleLoader.Load("valid-with-warnings.yaml");
        }
    }

    private void Wire(MainWindow window)
    {
        window.DarkToggle.Click += (_, _) => SetTheme(Nautix.Ui.Theming.ThemeMode.Dark);
        window.LightToggle.Click += (_, _) => SetTheme(Nautix.Ui.Theming.ThemeMode.Light);
        window.ValidSample.Click += (_, _) => window.TextEditor.Text = SampleLoader.Load("valid-with-warnings.yaml");
        window.BrokenSample.Click += (_, _) => window.TextEditor.Text = SampleLoader.Load("broken.yaml");
        window.BigSample.Click += (_, _) => window.TextEditor.Text = SampleLoader.BigDocument(5000);
    }

    private void SetTheme(Nautix.Ui.Theming.ThemeMode mode)
    {
        _theme!.SetMode(mode);
        _controller!.ApplyTheme();
    }

    private async Task RunSelfTestAsync(MainWindow window, string directory, bool screenshots)
    {
        var exitCode = 1;
        try
        {
            var test = new SelfTest(window, _controller!, SetTheme, directory, screenshots);
            var report = await test.RunAsync();
            await report.SaveAsync(directory, CancellationToken.None);
            await File.WriteAllTextAsync(Path.Combine(directory, "s5-summary.txt"), report.ToConsoleText());
            exitCode = report.AllPassed ? 0 : 1;
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            Directory.CreateDirectory(directory);
            await File.WriteAllTextAsync(Path.Combine(directory, "s5-error.txt"), ex.ToString());
        }
        finally
        {
            Shutdown(exitCode);
        }
    }

    public void Dispose()
    {
        _controller?.Dispose();
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
