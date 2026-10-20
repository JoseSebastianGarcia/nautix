using System.Globalization;

namespace Nautix.Ui.Localization;

/// <summary>
/// Plural selection for the supported languages. English and Spanish: exactly 1 is "one", everything else (including 0)
/// is "other". Add a culture here only together with its resource keys; resource tests require both forms.
/// </summary>
public static class PluralRules
{
    public static PluralCategory Select(CultureInfo culture, long count)
    {
        ArgumentNullException.ThrowIfNull(culture);
        return count == 1 ? PluralCategory.One : PluralCategory.Other;
    }

    public static string Suffix(PluralCategory category) => category == PluralCategory.One ? "One" : "Other";
}
