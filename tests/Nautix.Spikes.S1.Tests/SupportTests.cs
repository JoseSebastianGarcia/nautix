using Nautix.Spikes.S1.Editing;
using Nautix.Spikes.S1.Verification;
using Shouldly;

namespace Nautix.Spikes.S1.Tests;

public sealed class SupportTests
{
    [Fact]
    public void TextPatch_applies_replacement_in_range()
    {
        new TextPatch(2, 3, "XY").Apply("ab123cd").ShouldBe("abXYcd");
        TextPatch.None.Apply("same").ShouldBe("same");
    }

    [Theory]
    [InlineData("a\nb\nc", "a\nB\nc", 1, 1, 1, 1)]
    [InlineData("a\nb", "a\nb\nc", 2, 0, 2, 1)]
    [InlineData("a\nb\nc", "a\nc", 1, 1, 1, 0)]
    [InlineData("same", "same", 1, 0, 1, 0)]
    public void LineDiff_reports_the_changed_region(string a, string b, int os, int oc, int ns, int nc)
    {
        LineDiff.Compute(a, b).ShouldBe(new LineDiff(os, oc, ns, nc));
    }

    [Fact]
    public void LineDiff_keeps_carriage_returns_attached_so_terminator_changes_are_visible()
    {
        LineDiff.Compute("a\r\nb\r\n", "a\nb\r\n").OriginalCount.ShouldBe(1);
    }

    [Fact]
    public void Site_finder_is_deterministic_and_covers_all_kinds()
    {
        var tree = new YamlDocumentStore().Parse("a:\n  b: 1\n  c: 2\n  d:\n    - x\n    - y\n").Value;

        var first = EditSiteFinder.Find(tree).Select(s => $"{s.Kind}{s.Path}").ToList();
        var second = EditSiteFinder.Find(tree).Select(s => $"{s.Kind}{s.Path}").ToList();

        first.ShouldBe(second);
        first.ShouldContain("add-key/a");
        first.ShouldContain("append-item/a/d");
        first.ShouldContain("remove-key/a/d");
    }

    [Fact]
    public void Latency_probe_workload_is_over_a_thousand_lines()
    {
        LatencyProbe.Synthesize1000Lines().Count(c => c == '\n').ShouldBeGreaterThan(1000);
    }
}
