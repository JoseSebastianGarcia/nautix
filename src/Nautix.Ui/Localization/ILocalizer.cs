using System.Globalization;

namespace Nautix.Ui.Localization;

public interface ILocalizer
{
    CultureInfo Culture { get; }

    event EventHandler? CultureChanged;

    /// <summary>Returns the localized string for <paramref name="key"/>, formatted with the current culture.</summary>
    string Get(string key, params object[] args);

    void SetCulture(CultureInfo culture);
}
