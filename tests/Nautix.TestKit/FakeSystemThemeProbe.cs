using Nautix.Ui.Theming;

namespace Nautix.TestKit;

public sealed class FakeSystemThemeProbe(ThemeVariant current = ThemeVariant.Dark) : ISystemThemeProbe
{
    public ThemeVariant Current { get; private set; } = current;

    public event EventHandler? Changed;

    public void Set(ThemeVariant variant)
    {
        Current = variant;
        Changed?.Invoke(this, EventArgs.Empty);
    }
}
