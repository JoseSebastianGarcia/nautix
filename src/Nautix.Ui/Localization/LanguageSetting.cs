using System.Globalization;

namespace Nautix.Ui.Localization;

/// <summary>The persisted <c>ui.language</c> value: <c>system</c>, <c>en</c> or <c>es</c>.</summary>
public static class LanguageSetting
{
    public const string System = "system";

    public static readonly CultureInfo English = CultureInfo.GetCultureInfo("en");

    public static readonly CultureInfo Spanish = CultureInfo.GetCultureInfo("es");

    /// <summary>Maps the stored setting to a supported culture; unknown values and unsupported system cultures fall back to English.</summary>
    public static CultureInfo Resolve(string? setting, CultureInfo systemCulture)
    {
        ArgumentNullException.ThrowIfNull(systemCulture);
        var code = string.Equals(setting?.Trim(), System, StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(setting)
            ? systemCulture.TwoLetterISOLanguageName
            : setting.Trim();

        return string.Equals(code, "es", StringComparison.OrdinalIgnoreCase) ? Spanish : English;
    }

    public static string Format(CultureInfo? culture) => culture?.TwoLetterISOLanguageName switch
    {
        "es" => "es",
        "en" => "en",
        _ => System,
    };
}
