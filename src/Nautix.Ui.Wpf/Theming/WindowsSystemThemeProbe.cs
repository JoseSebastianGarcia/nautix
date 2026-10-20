using Microsoft.Win32;
using Nautix.Ui.Theming;

namespace Nautix.Ui.Wpf.Theming;

/// <summary>Reads <c>AppsUseLightTheme</c> and raises <see cref="Changed"/> on user preference changes (any thread).</summary>
public sealed class WindowsSystemThemeProbe : ISystemThemeProbe, IDisposable
{
    private const string PersonalizeKey = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    private const string ValueName = "AppsUseLightTheme";

    public WindowsSystemThemeProbe() => SystemEvents.UserPreferenceChanged += OnPreferenceChanged;

    public event EventHandler? Changed;

    public ThemeVariant Current
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(PersonalizeKey);
            return key?.GetValue(ValueName) is int light && light == 0 ? ThemeVariant.Dark : ThemeVariant.Light;
        }
    }

    public void Dispose() => SystemEvents.UserPreferenceChanged -= OnPreferenceChanged;

    private void OnPreferenceChanged(object sender, UserPreferenceChangedEventArgs e)
    {
        if (e.Category is UserPreferenceCategory.General or UserPreferenceCategory.Color or UserPreferenceCategory.VisualStyle)
        {
            Changed?.Invoke(this, EventArgs.Empty);
        }
    }
}
