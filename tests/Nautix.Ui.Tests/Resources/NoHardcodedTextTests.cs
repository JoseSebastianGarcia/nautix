using System.Xml.Linq;
using Nautix.TestKit;
using Shouldly;

namespace Nautix.Ui.Tests.Resources;

public sealed class NoHardcodedTextTests
{
    private static readonly string[] _textAttributes =
        ["Text", "Content", "Header", "Title", "ToolTip", "Watermark", "PlaceholderText", "Description", "Label"];

    [Fact]
    public void Xaml_files_contain_no_literal_user_visible_text()
    {
        var violations = XamlFiles().SelectMany(f => FindLiterals(XDocument.Load(f), f)).ToList();

        violations.ShouldBeEmpty();
    }

    [Fact]
    public void Checker_flags_literals_and_accepts_bindings()
    {
        var xaml = XDocument.Parse("""
            <Grid xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">
              <TextBlock Text="Hello" />
              <Button Content="{loc:T Common.Action.Ok}" />
              <TextBlock Text="{Binding Name}" />
              <TextBlock Text="" />
            </Grid>
            """);

        FindLiterals(xaml, "sample.xaml").ShouldBe(["sample.xaml: TextBlock.Text=\"Hello\""]);
    }

    private static IEnumerable<string> XamlFiles() =>
        Directory.EnumerateFiles(RepositoryLocator.Resolve("src"), "*.xaml", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}Themes{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                && !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal));

    private static IEnumerable<string> FindLiterals(XDocument document, string source) =>
        document.Descendants()
            .SelectMany(e => e.Attributes()
                .Where(a => !a.IsNamespaceDeclaration
                    && _textAttributes.Contains(a.Name.LocalName)
                    && !string.IsNullOrWhiteSpace(a.Value)
                    && !a.Value.StartsWith('{'))
                .Select(a => $"{source}: {e.Name.LocalName}.{a.Name.LocalName}=\"{a.Value}\""));
}
