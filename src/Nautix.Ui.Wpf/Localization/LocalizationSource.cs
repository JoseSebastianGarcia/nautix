using System.ComponentModel;
using Nautix.Ui.Localization;

namespace Nautix.Ui.Wpf.Localization;

/// <summary>
/// Binding source for <c>{loc:T key}</c>. XAML markup extensions cannot receive constructor injection, so the
/// composition root attaches the localizer once at startup (spec: <c>LocalizationSource.Instance[key]</c>).
/// </summary>
public sealed class LocalizationSource : INotifyPropertyChanged
{
    private ILocalizer? _localizer;

    private LocalizationSource()
    {
    }

    public static LocalizationSource Instance { get; } = new();

    public event PropertyChangedEventHandler? PropertyChanged;

    public string this[string key] => _localizer?.Get(key) ?? key;

    public void Attach(ILocalizer localizer)
    {
        ArgumentNullException.ThrowIfNull(localizer);
        if (_localizer is not null)
        {
            _localizer.CultureChanged -= OnCultureChanged;
        }

        _localizer = localizer;
        localizer.CultureChanged += OnCultureChanged;
        Raise();
    }

    private void OnCultureChanged(object? sender, EventArgs e) => Raise();

    // "Item[]" tells WPF that every indexer binding on this source must be re-evaluated.
    private void Raise() => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs("Item[]"));
}
