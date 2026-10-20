using System.Globalization;

namespace Nautix.Ui.Localization;

public interface ILocalizer
{
    CultureInfo Culture { get; }

    event EventHandler? CultureChanged;

    /// <summary>Returns the localized string for <paramref name="key"/>, formatted with the current culture.</summary>
    string Get(string key, params object[] args);

    /// <summary>
    /// Plural-aware lookup: picks <c>&lt;baseKey&gt;.One</c> or <c>&lt;baseKey&gt;.Other</c> for the current culture.
    /// <paramref name="count"/> is always format argument {0}; <paramref name="args"/> follow as {1}, {2}, ...
    /// </summary>
    string GetPlural(string baseKey, long count, params object[] args);

    void SetCulture(CultureInfo culture);
}
