using Nautix.TestKit;
using Nautix.Ui.Theming;
using Shouldly;

namespace Nautix.Ui.Tests.Theming;

public sealed class ThemeManagerTests
{
    [Theory]
    [InlineData(ThemeMode.Dark, ThemeVariant.Light, ThemeVariant.Dark)]
    [InlineData(ThemeMode.Light, ThemeVariant.Dark, ThemeVariant.Light)]
    [InlineData(ThemeMode.System, ThemeVariant.Dark, ThemeVariant.Dark)]
    [InlineData(ThemeMode.System, ThemeVariant.Light, ThemeVariant.Light)]
    public void Effective_theme_resolves_mode_against_system(ThemeMode mode, ThemeVariant system, ThemeVariant expected)
    {
        using var manager = new ThemeManager(new FakeSystemThemeProbe(system), mode);

        manager.Effective.ShouldBe(expected);
    }

    [Fact]
    public void System_mode_follows_os_changes_at_runtime()
    {
        var probe = new FakeSystemThemeProbe(ThemeVariant.Dark);
        using var manager = new ThemeManager(probe);
        var seen = new List<ThemeVariant>();
        manager.EffectiveChanged += (_, e) => seen.Add(e.Variant);

        probe.Set(ThemeVariant.Light);
        probe.Set(ThemeVariant.Light);
        probe.Set(ThemeVariant.Dark);

        seen.ShouldBe([ThemeVariant.Light, ThemeVariant.Dark]);
    }

    [Fact]
    public void Explicit_mode_ignores_os_changes()
    {
        var probe = new FakeSystemThemeProbe(ThemeVariant.Dark);
        using var manager = new ThemeManager(probe, ThemeMode.Dark);
        var raised = 0;
        manager.EffectiveChanged += (_, _) => raised++;

        probe.Set(ThemeVariant.Light);

        manager.Effective.ShouldBe(ThemeVariant.Dark);
        raised.ShouldBe(0);
    }

    [Fact]
    public void SetMode_raises_only_when_the_effective_theme_changes()
    {
        using var manager = new ThemeManager(new FakeSystemThemeProbe(ThemeVariant.Dark));
        var seen = new List<ThemeVariant>();
        manager.EffectiveChanged += (_, e) => seen.Add(e.Variant);

        manager.SetMode(ThemeMode.Dark);
        manager.SetMode(ThemeMode.Light);
        manager.SetMode(ThemeMode.System);

        seen.ShouldBe([ThemeVariant.Light, ThemeVariant.Dark]);
        manager.Mode.ShouldBe(ThemeMode.System);
    }

    [Fact]
    public void Disposed_manager_stops_following_the_probe()
    {
        var probe = new FakeSystemThemeProbe(ThemeVariant.Dark);
        var manager = new ThemeManager(probe);
        manager.Dispose();

        probe.Set(ThemeVariant.Light);

        manager.Effective.ShouldBe(ThemeVariant.Dark);
    }

    [Theory]
    [InlineData("dark", ThemeMode.Dark)]
    [InlineData("LIGHT", ThemeMode.Light)]
    [InlineData("system", ThemeMode.System)]
    [InlineData(null, ThemeMode.System)]
    [InlineData("nonsense", ThemeMode.System)]
    public void Setting_parses_with_system_as_default(string? stored, ThemeMode expected)
    {
        ThemeModeSetting.Parse(stored).ShouldBe(expected);
    }

    [Theory]
    [InlineData(ThemeMode.Dark, "dark")]
    [InlineData(ThemeMode.Light, "light")]
    [InlineData(ThemeMode.System, "system")]
    public void Setting_formats_to_the_persisted_value(ThemeMode mode, string expected)
    {
        ThemeModeSetting.Format(mode).ShouldBe(expected);
        ThemeModeSetting.Parse(ThemeModeSetting.Format(mode)).ShouldBe(mode);
    }
}
