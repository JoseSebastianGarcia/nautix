using System.Globalization;
using System.Resources;

namespace Nautix.Ui.Localization;

public sealed class Localizer : ILocalizer
{
    private readonly ResourceManager _resources;
    private CultureInfo _culture;

    public Localizer(CultureInfo initial)
        : this(new ResourceManager("Nautix.Ui.Resources.Strings", typeof(Localizer).Assembly), initial)
    {
    }

    public Localizer(ResourceManager resources, CultureInfo initial)
    {
        ArgumentNullException.ThrowIfNull(resources);
        ArgumentNullException.ThrowIfNull(initial);
        _resources = resources;
        _culture = initial;
    }

    public event EventHandler? CultureChanged;

    public CultureInfo Culture => _culture;

    public string Get(string key, params object[] args)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        var culture = _culture;
        var format = _resources.GetString(key, culture);
        if (format is null)
        {
            // A missing key is a bug caught by resource tests; never crash the UI for it.
            return key;
        }

        return args is { Length: > 0 } ? string.Format(culture, format, args) : format;
    }

    public string GetPlural(string baseKey, long count, params object[] args)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(baseKey);
        var suffix = PluralRules.Suffix(PluralRules.Select(_culture, count));
        return Get($"{baseKey}.{suffix}", [count, .. args]);
    }

    public void SetCulture(CultureInfo culture)
    {
        ArgumentNullException.ThrowIfNull(culture);
        if (Interlocked.Exchange(ref _culture, culture).Equals(culture))
        {
            return;
        }

        CultureChanged?.Invoke(this, EventArgs.Empty);
    }
}
