namespace Nautix.Ui.Theming;

/// <summary>Reads the OS app theme (Windows: <c>AppsUseLightTheme</c>) and signals when it changes.</summary>
public interface ISystemThemeProbe
{
    ThemeVariant Current { get; }

    event EventHandler? Changed;
}
