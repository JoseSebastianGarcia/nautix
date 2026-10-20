namespace Nautix.Ui.Theming;

public sealed class ThemeChangedEventArgs(ThemeVariant variant) : EventArgs
{
    public ThemeVariant Variant { get; } = variant;
}
