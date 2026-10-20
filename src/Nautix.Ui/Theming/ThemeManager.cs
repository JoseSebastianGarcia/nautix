namespace Nautix.Ui.Theming;

public sealed class ThemeManager : IThemeManager, IDisposable
{
    private readonly ISystemThemeProbe _probe;

    public ThemeManager(ISystemThemeProbe probe, ThemeMode initial = ThemeMode.System)
    {
        ArgumentNullException.ThrowIfNull(probe);
        _probe = probe;
        Mode = initial;
        Effective = Resolve(initial, probe.Current);
        _probe.Changed += OnSystemChanged;
    }

    public event EventHandler<ThemeChangedEventArgs>? EffectiveChanged;

    public ThemeMode Mode { get; private set; }

    public ThemeVariant Effective { get; private set; }

    public void SetMode(ThemeMode mode)
    {
        Mode = mode;
        Recompute();
    }

    public void Dispose() => _probe.Changed -= OnSystemChanged;

    private static ThemeVariant Resolve(ThemeMode mode, ThemeVariant system) => mode switch
    {
        ThemeMode.Dark => ThemeVariant.Dark,
        ThemeMode.Light => ThemeVariant.Light,
        ThemeMode.System => system,
        _ => throw new ArgumentOutOfRangeException(nameof(mode), mode, null),
    };

    private void OnSystemChanged(object? sender, EventArgs e)
    {
        if (Mode == ThemeMode.System)
        {
            Recompute();
        }
    }

    private void Recompute()
    {
        var next = Resolve(Mode, _probe.Current);
        if (next == Effective)
        {
            return;
        }

        Effective = next;
        EffectiveChanged?.Invoke(this, new ThemeChangedEventArgs(next));
    }
}
