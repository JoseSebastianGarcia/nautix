using System.Text.RegularExpressions;
using System.Xml.Linq;
using Nautix.TestKit;
using Shouldly;

namespace Nautix.Ui.Tests.Resources;

public sealed partial class NoHexColorLiteralsTests
{
    [Fact]
    public void Xaml_outside_themes_uses_tokens_not_hex_literals()
    {
        var violations = Directory.EnumerateFiles(RepositoryLocator.Resolve("src"), "*.xaml", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}Themes{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                && !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .SelectMany(f => FindHex(XDocument.Load(f), f))
            .ToList();

        violations.ShouldBeEmpty();
    }

    [Fact]
    public void Checker_flags_hex_in_attributes_and_text()
    {
        var xaml = XDocument.Parse("""<Border Background="#FF00AA"><SolidColorBrush>#abc</SolidColorBrush><Border Background="{DynamicResource Nx.Bg1}" /></Border>""");

        FindHex(xaml, "s.xaml").Count().ShouldBe(2);
    }

    private static IEnumerable<string> FindHex(XDocument document, string source) =>
        document.Descendants().SelectMany(e =>
            e.Attributes().Where(a => HexPattern().IsMatch(a.Value)).Select(a => $"{source}: {e.Name.LocalName}.{a.Name.LocalName}={a.Value}")
                .Concat(e.Nodes().OfType<XText>().Where(t => HexPattern().IsMatch(t.Value.Trim())).Select(t => $"{source}: {e.Name.LocalName} text={t.Value}")));

    [GeneratedRegex(@"^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex HexPattern();
}
