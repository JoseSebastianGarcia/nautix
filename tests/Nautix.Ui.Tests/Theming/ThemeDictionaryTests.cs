using System.Xml.Linq;
using Nautix.TestKit;
using Nautix.Ui.Theming;
using Shouldly;

namespace Nautix.Ui.Tests.Theming;

public sealed class ThemeDictionaryTests
{
    private static readonly XNamespace _x = "http://schemas.microsoft.com/winfx/2006/xaml";

    private static readonly string[] _surfaces = ["Nx.Bg0", "Nx.Bg1", "Nx.Bg2"];
    private static readonly string[] _textTokens = ["Nx.Text", "Nx.TextDim"];
    private static readonly string[] _accentTokens = ["Nx.LimeStrong", "Nx.Cyan", "Nx.Violet", "Nx.Amber", "Nx.Danger"];

    public static TheoryData<ThemeVariant> Variants => new() { ThemeVariant.Dark, ThemeVariant.Light };

    [Fact]
    public void Dark_and_light_dictionaries_define_identical_keys()
    {
        Keys(ThemeVariant.Dark).ShouldBe(Keys(ThemeVariant.Light), ignoreOrder: true);
    }

    [Fact]
    public void Token_tables_define_identical_names()
    {
        ThemeTokens.Dark.Keys.ShouldBe(ThemeTokens.Light.Keys, ignoreOrder: true);
    }

    [Theory]
    [MemberData(nameof(Variants))]
    public void Every_token_has_a_color_and_a_brush_matching_the_spec_table(ThemeVariant variant)
    {
        var colors = Colors(variant);

        foreach (var (name, hex) in ThemeTokens.For(variant))
        {
            colors.ShouldContainKey(name + ".Color");
            string.Equals(colors[name + ".Color"], hex, StringComparison.OrdinalIgnoreCase).ShouldBeTrue($"{variant} {name}: xaml has {colors[name + ".Color"]}, spec table has {hex}");
            Keys(variant).ShouldContain(name);
        }

        colors.Count.ShouldBe(ThemeTokens.For(variant).Count);
    }

    [Theory]
    [MemberData(nameof(Variants))]
    public void Text_tokens_reach_4_5_to_1_on_every_surface(ThemeVariant variant)
    {
        var tokens = ThemeTokens.For(variant);

        foreach (var text in _textTokens)
        {
            foreach (var surface in _surfaces)
            {
                Wcag.ContrastRatio(tokens[text], tokens[surface])
                    .ShouldBeGreaterThanOrEqualTo(Wcag.NormalTextRatio, $"{variant}: {text} on {surface}");
            }
        }
    }

    [Theory]
    [MemberData(nameof(Variants))]
    public void Accents_reach_4_5_to_1_on_every_surface_so_they_are_safe_as_text(ThemeVariant variant)
    {
        var tokens = ThemeTokens.For(variant);

        foreach (var accent in _accentTokens)
        {
            foreach (var surface in _surfaces)
            {
                Wcag.ContrastRatio(tokens[accent], tokens[surface])
                    .ShouldBeGreaterThanOrEqualTo(Wcag.NormalTextRatio, $"{variant}: {accent} on {surface}");
            }
        }
    }

    [Theory]
    [MemberData(nameof(Variants))]
    public void Interactive_control_borders_reach_3_to_1_on_every_surface(ThemeVariant variant)
    {
        var tokens = ThemeTokens.For(variant);

        foreach (var surface in _surfaces)
        {
            Wcag.ContrastRatio(tokens["Nx.LineStrong"], tokens[surface])
                .ShouldBeGreaterThanOrEqualTo(Wcag.NonTextRatio, $"{variant}: Nx.LineStrong on {surface}");
        }
    }

    [Theory]
    [MemberData(nameof(Variants))]
    public void Text_over_lime_fill_reaches_4_5_to_1(ThemeVariant variant)
    {
        var tokens = ThemeTokens.For(variant);

        Wcag.ContrastRatio(tokens["Nx.OnLime"], tokens["Nx.Lime"]).ShouldBeGreaterThanOrEqualTo(Wcag.NormalTextRatio);
    }

    private static string PathFor(ThemeVariant variant) =>
        RepositoryLocator.Resolve("src", "Nautix.Ui.Wpf", "Themes", $"{variant}.xaml");

    private static HashSet<string> Keys(ThemeVariant variant) =>
        XDocument.Load(PathFor(variant)).Descendants()
            .Select(e => e.Attribute(_x + "Key")?.Value)
            .OfType<string>()
            .ToHashSet(StringComparer.Ordinal);

    private static Dictionary<string, string> Colors(ThemeVariant variant) =>
        XDocument.Load(PathFor(variant)).Descendants()
            .Where(e => e.Name.LocalName == "Color" && e.Attribute(_x + "Key") is not null)
            .ToDictionary(e => e.Attribute(_x + "Key")!.Value, e => e.Value.Trim(), StringComparer.Ordinal);
}
