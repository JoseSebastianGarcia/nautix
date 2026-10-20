using System.Globalization;
using System.Windows;
using Nautix.Ui.Localization;
using Nautix.Ui.Theming;

namespace Nautix.Host.Wpf;

/// <summary>M0 smoke window: view wiring only. All behaviour lives in ThemeManager and Localizer.</summary>
public sealed partial class MainWindow : Window
{
    public MainWindow(IThemeManager theme, ILocalizer localizer)
    {
        ArgumentNullException.ThrowIfNull(theme);
        ArgumentNullException.ThrowIfNull(localizer);
        InitializeComponent();
        DarkButton.Click += (_, _) => theme.SetMode(Nautix.Ui.Theming.ThemeMode.Dark);
        LightButton.Click += (_, _) => theme.SetMode(Nautix.Ui.Theming.ThemeMode.Light);
        SystemThemeButton.Click += (_, _) => theme.SetMode(Nautix.Ui.Theming.ThemeMode.System);
        EnglishButton.Click += (_, _) => localizer.SetCulture(LanguageSetting.English);
        SpanishButton.Click += (_, _) => localizer.SetCulture(LanguageSetting.Spanish);
    }
}
