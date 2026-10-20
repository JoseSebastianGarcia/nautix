namespace Nautix.Ui.Theming;

public interface IThemeManager
{
    ThemeMode Mode { get; }

    /// <summary>The palette actually in force: <see cref="Mode"/> resolved against the system theme.</summary>
    ThemeVariant Effective { get; }

    /// <summary>Raised only when <see cref="Effective"/> changes.</summary>
    event EventHandler<ThemeChangedEventArgs>? EffectiveChanged;

    void SetMode(ThemeMode mode);
}
