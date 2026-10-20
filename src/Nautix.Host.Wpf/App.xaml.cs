using System.Globalization;
using System.Windows;
using Nautix.Ui.Localization;
using Nautix.Ui.Theming;
using Nautix.Ui.Wpf.Localization;
using Nautix.Ui.Wpf.Theming;

namespace Nautix.Host.Wpf;

/// <summary>Composition root. In M0 it only wires theme + localization and shows the smoke window.</summary>
public sealed partial class App : Application, IDisposable
{
    private WindowsSystemThemeProbe? _probe;
    private ThemeManager? _theme;
    private WpfThemeApplier? _applier;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Never fail silently: a window that does not appear is the worst possible diagnostic.
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(args.Exception.ToString(), "Nautix - unexpected error", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };

        try
        {
            _probe = new WindowsSystemThemeProbe();
            _theme = new ThemeManager(_probe, Nautix.Ui.Theming.ThemeMode.System);
            _applier = new WpfThemeApplier(this, _theme);

            var localizer = new Localizer(LanguageSetting.Resolve(LanguageSetting.System, CultureInfo.CurrentUICulture));
            LocalizationSource.Instance.Attach(localizer);

            new MainWindow(_theme, localizer).Show();
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            MessageBox.Show(ex.ToString(), "Nautix - startup error", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
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
