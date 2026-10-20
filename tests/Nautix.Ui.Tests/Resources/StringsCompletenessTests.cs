using System.Text.RegularExpressions;
using Shouldly;

namespace Nautix.Ui.Tests.Resources;

public sealed partial class StringsCompletenessTests
{
    private static readonly IReadOnlyDictionary<string, string> _en = ResxFile.Load("Strings.resx");
    private static readonly IReadOnlyDictionary<string, string> _es = ResxFile.Load("Strings.es.resx");

    [Fact]
    public void Every_key_exists_in_both_languages()
    {
        _en.Keys.Except(_es.Keys).ShouldBeEmpty("missing in Strings.es.resx");
        _es.Keys.Except(_en.Keys).ShouldBeEmpty("missing in Strings.resx");
    }

    [Fact]
    public void Keys_follow_the_Area_Component_Purpose_convention()
    {
        _en.Keys.Where(k => !KeyPattern().IsMatch(k)).ShouldBeEmpty();
    }

    [Fact]
    public void No_value_is_empty()
    {
        _en.Where(p => string.IsNullOrWhiteSpace(p.Value)).Select(p => p.Key).ShouldBeEmpty();
        _es.Where(p => string.IsNullOrWhiteSpace(p.Value)).Select(p => p.Key).ShouldBeEmpty();
    }

    [Fact]
    public void Format_placeholders_match_across_languages()
    {
        var mismatches = _en.Keys.Intersect(_es.Keys)
            .Where(k => !Placeholders(_en[k]).SetEquals(Placeholders(_es[k])))
            .ToList();

        mismatches.ShouldBeEmpty();
    }

    [Fact]
    public void Placeholder_check_detects_a_mismatch()
    {
        Placeholders("{0} of {1}").SetEquals(Placeholders("{0} de")).ShouldBeFalse();
    }

    private static HashSet<string> Placeholders(string value) =>
        PlaceholderPattern().Matches(value).Select(m => m.Groups["index"].Value).ToHashSet(StringComparer.Ordinal);

    [GeneratedRegex(@"^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*){2,}$", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex KeyPattern();

    [GeneratedRegex(@"\{(?<index>\d+)(?:,[^:}]*)?(?::[^}]*)?\}", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex PlaceholderPattern();
}
