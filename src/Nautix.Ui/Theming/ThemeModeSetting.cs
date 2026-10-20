namespace Nautix.Ui.Theming;

public static class ThemeModeSetting
{
    /// <summary>Unknown or missing values fall back to <see cref="ThemeMode.System"/>, the documented default.</summary>
    public static ThemeMode Parse(string? value) => value?.Trim().ToUpperInvariant() switch
    {
        "DARK" => ThemeMode.Dark,
        "LIGHT" => ThemeMode.Light,
        _ => ThemeMode.System,
    };

    public static string Format(ThemeMode mode) => mode switch
    {
        ThemeMode.Dark => "dark",
        ThemeMode.Light => "light",
        ThemeMode.System => "system",
        _ => throw new ArgumentOutOfRangeException(nameof(mode), mode, null),
    };
}
