using System.Collections.Frozen;

namespace Nautix.Ui.Theming;

/// <summary>
/// The design tokens of docs/spec/03-ui-wpf.md as data. <c>Themes/Dark.xaml</c> and <c>Themes/Light.xaml</c>
/// must match these values exactly; tests enforce it, so the table is the single reviewable source.
/// </summary>
public static class ThemeTokens
{
    public static readonly FrozenDictionary<string, string> Dark = new Dictionary<string, string>
    {
        ["Nx.Bg0"] = "#07090B",
        ["Nx.Bg1"] = "#0D1114",
        ["Nx.Bg2"] = "#141A1F",
        ["Nx.Line"] = "#1F2A31",
        ["Nx.LineStrong"] = "#4F6B7D",
        ["Nx.Text"] = "#E6EEF2",
        ["Nx.TextDim"] = "#8A9BA6",
        ["Nx.Lime"] = "#B6FF3B",
        ["Nx.LimeStrong"] = "#B6FF3B",
        ["Nx.Cyan"] = "#38D5FF",
        ["Nx.Violet"] = "#A78BFA",
        ["Nx.Amber"] = "#FFB020",
        ["Nx.Danger"] = "#FF4D6A",
        ["Nx.OnLime"] = "#07090B",
    }.ToFrozenDictionary();

    public static readonly FrozenDictionary<string, string> Light = new Dictionary<string, string>
    {
        ["Nx.Bg0"] = "#F4F7F9",
        ["Nx.Bg1"] = "#FFFFFF",
        ["Nx.Bg2"] = "#EAF0F3",
        ["Nx.Line"] = "#D5DFE5",
        ["Nx.LineStrong"] = "#698CA2",
        ["Nx.Text"] = "#0E1A21",
        ["Nx.TextDim"] = "#55677A",
        ["Nx.Lime"] = "#B6FF3B",
        ["Nx.LimeStrong"] = "#427900",
        ["Nx.Cyan"] = "#00749C",
        ["Nx.Violet"] = "#7452DE",
        ["Nx.Amber"] = "#9B5D00",
        ["Nx.Danger"] = "#D11F48",
        ["Nx.OnLime"] = "#07090B",
    }.ToFrozenDictionary();

    public static FrozenDictionary<string, string> For(ThemeVariant variant) => variant switch
    {
        ThemeVariant.Dark => Dark,
        ThemeVariant.Light => Light,
        _ => throw new ArgumentOutOfRangeException(nameof(variant), variant, null),
    };
}
