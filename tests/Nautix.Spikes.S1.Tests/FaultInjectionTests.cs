using Nautix.SharedKernel;
using Nautix.Spikes.S1.Editing;
using Nautix.Spikes.S1.Verification;
using Nautix.Spikes.S1.Yaml;
using Shouldly;

namespace Nautix.Spikes.S1.Tests;

/// <summary>
/// The gate is only meaningful if the checks can fail. Each test corrupts a correct patch in a plausible way
/// (off-by-one, wrong indent, over-deletion, wrong value) and requires the checker to flag it.
/// </summary>
public sealed class FaultInjectionTests
{
    private const string Text = "# header\nservices:\n  web:\n    image: nginx # pinned\n    ports:\n      - \"80:80\"\n      - \"443:443\"\n  db:\n    image: postgres\n    environment:\n      A: 1\n      B: 2\nvolumes:\n  data:\n    driver: local\n";

    private static EditOutcome Run(Func<TextPatch, TextPatch> corrupt, string kind)
    {
        var inner = new YamlDocumentStore();
        var tree = inner.Parse(Text).Value;
        var site = EditSiteFinder.Find(tree).First(s => s.Kind == kind);
        return EditChecker.Check(new FaultyStore(inner, corrupt), tree, site);
    }

    [Fact]
    public void Uncorrupted_store_passes_every_site_of_every_kind()
    {
        var inner = new YamlDocumentStore();
        var tree = inner.Parse(Text).Value;

        var outcomes = EditSiteFinder.Find(tree).Select(s => EditChecker.Check(inner, tree, s)).ToList();

        outcomes.Count.ShouldBeGreaterThan(8);
        outcomes.ShouldAllBe(o => o.Status == EditStatus.Pass);
        outcomes.Select(o => o.Kind).Distinct().Count().ShouldBe(4);
    }

    // A shift only counts as a fault when it changes the result: moving a patch by one character inside a run of
    // identical characters (indentation) is the same edit, so structural edits are shifted backwards over a newline.
    [Theory]
    [InlineData(EditSiteFinder.SetScalarKind, 1)]
    [InlineData(EditSiteFinder.AddKeyKind, -1)]
    [InlineData(EditSiteFinder.AppendItemKind, -1)]
    public void Patch_shifted_by_one_character_is_detected(string kind, int delta)
    {
        var outcome = Run(p => p with { Start = p.Start + delta }, kind);

        outcome.Status.ShouldBe(EditStatus.Fail, $"{outcome.Kind} {outcome.Path} {outcome.Detail}");
    }

    [Fact]
    public void Removal_that_leaves_a_blank_line_behind_is_detected_by_the_diff_range_check()
    {
        // Semantically identical YAML, so only the "touch exactly the key's lines" assertion can catch it.
        var outcome = Run(p => p with { Length = p.Length - 1 }, EditSiteFinder.RemoveKeyKind);

        outcome.Status.ShouldBe(EditStatus.Fail);
        outcome.Detail!.ShouldContain("diff range");
    }

    [Theory]
    [InlineData(EditSiteFinder.AddKeyKind)]
    [InlineData(EditSiteFinder.AppendItemKind)]
    public void Wrong_indentation_of_inserted_line_is_detected(string kind)
    {
        Run(p => p with { Replacement = " " + p.Replacement }, kind).Status.ShouldBe(EditStatus.Fail);
    }

    [Fact]
    public void Insertion_one_line_too_early_is_detected()
    {
        // Inserting before the last entry's line instead of after it changes the data order.
        Run(p => p with { Start = Math.Max(0, Text.LastIndexOf('\n', Math.Max(0, p.Start - 2)) + 1) }, EditSiteFinder.AddKeyKind)
            .Status.ShouldBe(EditStatus.Fail);
    }

    [Fact]
    public void Deleting_one_character_too_many_is_detected()
    {
        Run(p => p with { Length = p.Length + 1 }, EditSiteFinder.SetScalarKind).Status.ShouldBe(EditStatus.Fail);
        Run(p => p with { Length = p.Length + 1 }, EditSiteFinder.RemoveKeyKind).Status.ShouldBe(EditStatus.Fail);
    }

    [Fact]
    public void Wrong_replacement_value_is_detected_by_the_semantic_oracle()
    {
        var outcome = Run(p => p with { Replacement = "something-else" }, EditSiteFinder.SetScalarKind);

        outcome.Status.ShouldBe(EditStatus.Fail);
        outcome.Detail!.ShouldContain("oracle");
    }

    [Fact]
    public void A_patch_that_does_nothing_is_detected()
    {
        Run(_ => TextPatch.None, EditSiteFinder.SetScalarKind).Detail!.ShouldContain("no effect");
    }

    [Fact]
    public void A_patch_that_breaks_the_syntax_is_detected()
    {
        Run(p => p with { Replacement = p.Replacement + "\n  : : [" }, EditSiteFinder.AddKeyKind).Status.ShouldBe(EditStatus.Fail);
    }

    [Fact]
    public void Off_by_one_marks_are_reported_by_the_fidelity_check()
    {
        var tree = new YamlDocumentStore().Parse("a: 'q'\nb: [x]\n").Value;
        var root = (YamlMapping)tree.Root!;
        var skewed = tree with
        {
            Documents = [new YamlDocument(root with { Entries = [root.Entries[0] with { Value = root.Entries[0].Value with { Start = 4 } }, root.Entries[1]] }, 0, tree.Text.Length)],
        };

        MarkFidelity.Check(tree).ShouldBeEmpty();
        MarkFidelity.Check(skewed).ShouldNotBeEmpty();
    }

    private sealed class FaultyStore(IYamlDocumentStore inner, Func<TextPatch, TextPatch> corrupt) : IYamlDocumentStore
    {
        public Result<YamlSyntaxTree> Parse(string text) => inner.Parse(text);

        public string Apply(string text, TextPatch patch) => inner.Apply(text, patch);

        public Result<TextPatch> ToPatch(YamlSyntaxTree tree, ComposeEdit edit) => inner.ToPatch(tree, edit).Map(corrupt);
    }
}
