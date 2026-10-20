using System.Windows;
using Nautix.Ui.Theming;

namespace Nautix.Ui.Wpf.Theming;

/// <summary>Swaps the merged theme dictionary on the application when the effective theme changes.</summary>
public sealed class WpfThemeApplier : IDisposable
{
    private readonly Application _application;
    private readonly IThemeManager _manager;
    private ResourceDictionary? _current;

    public WpfThemeApplier(Application application, IThemeManager manager)
    {
        ArgumentNullException.ThrowIfNull(application);
        ArgumentNullException.ThrowIfNull(manager);
        _application = application;
        _manager = manager;
        _manager.EffectiveChanged += OnEffectiveChanged;
        Apply(manager.Effective);
    }

    public void Dispose() => _manager.EffectiveChanged -= OnEffectiveChanged;

    private static Uri SourceFor(ThemeVariant variant) =>
        new($"pack://application:,,,/Nautix.Ui.Wpf;component/Themes/{variant}.xaml", UriKind.Absolute);

    private void OnEffectiveChanged(object? sender, ThemeChangedEventArgs e) =>
        _application.Dispatcher.Invoke(() => Apply(e.Variant));

    private void Apply(ThemeVariant variant)
    {
        var next = new ResourceDictionary { Source = SourceFor(variant) };
        var merged = _application.Resources.MergedDictionaries;
        if (_current is not null)
        {
            merged.Remove(_current);
        }

        merged.Add(next);
        _current = next;
    }
}
