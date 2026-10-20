using Nautix.SharedKernel;
using Nautix.Spikes.S1.Editing;
using Nautix.Spikes.S1.Yaml;

namespace Nautix.Spikes.S1.Verification;

/// <summary>Runs one edit end to end: patch, apply, re-parse, semantic oracle, and the diff-range assertion.</summary>
internal static class EditChecker
{
    public static EditOutcome Check(IYamlDocumentStore store, YamlSyntaxTree tree, EditSite site)
    {
        var patch = store.ToPatch(tree, site.Edit);
        if (patch.IsFailure)
        {
            return patch.Error.Code.StartsWith(EditErrors.NotApplicablePrefix, StringComparison.Ordinal)
                ? Outcome(site, EditStatus.NotApplicable, patch.Error.Code[EditErrors.NotApplicablePrefix.Length..])
                : Outcome(site, EditStatus.Fail, $"{patch.Error.Code}: {patch.Error.Message}");
        }

        var patched = store.Apply(tree.Text, patch.Value);
        if (patched == tree.Text)
        {
            return Outcome(site, EditStatus.Fail, "edit had no effect on the text");
        }

        var oracle = RepresentationOracle.Verify(tree.Text, patched, site.Edit);
        if (oracle.IsFailure)
        {
            return Outcome(site, EditStatus.Fail, $"{oracle.Error.Code}: {oracle.Error.Message}");
        }

        var reparsed = store.Parse(patched);
        if (reparsed.IsFailure)
        {
            return Outcome(site, EditStatus.Fail, "patched text does not parse with the position parser: " + reparsed.Error.Message);
        }

        var fidelity = MarkFidelity.Check(reparsed.Value);
        if (fidelity.Count > 0)
        {
            return Outcome(site, EditStatus.Fail, "marks wrong after edit: " + fidelity[0]);
        }

        var range = CheckRange(tree, site, LineDiff.Compute(tree.Text, patched));
        return range is null ? Outcome(site, EditStatus.Pass, null) : Outcome(site, EditStatus.Fail, "diff range: " + range);
    }

    private static EditOutcome Outcome(EditSite site, EditStatus status, string? detail) =>
        new(site.Kind, site.Path.ToString(), status, detail);

    private static string? CheckRange(YamlSyntaxTree tree, EditSite site, LineDiff diff)
    {
        var text = tree.Text;
        var node = site.Path.Resolve(tree);
        if (node.IsFailure)
        {
            return "target disappeared";
        }

        switch (site.Edit)
        {
            case SetScalar:
                var first = TextLines.LineNumber(text, node.Value.Start);
                var last = TextLines.LineNumber(text, Math.Max(node.Value.End - 1, node.Value.Start));
                return diff.OriginalCount == 0 || (diff.OriginalStart >= first && diff.OriginalStart + diff.OriginalCount - 1 <= last)
                    ? null
                    : $"changed lines {diff.OriginalStart}..{diff.OriginalStart + diff.OriginalCount - 1} outside scalar lines {first}..{last}";
            case AddKey or AppendItem:
                var containerFirst = TextLines.LineNumber(text, node.Value.Start);
                var containerLast = TextLines.LineNumber(text, Math.Max(YamlExtents.ContentEnd(node.Value) - 1, node.Value.Start));
                if (diff.OriginalCount != 0 || diff.NewCount != 1)
                {
                    return $"expected one inserted line, got -{diff.OriginalCount}/+{diff.NewCount}";
                }

                return diff.NewStart >= containerFirst && diff.NewStart <= containerLast + 1
                    ? null
                    : $"inserted at line {diff.NewStart}, container lines {containerFirst}..{containerLast}";
            case RemoveKey remove:
                var parent = remove.Entry.Parent.Resolve(tree);
                var entry = (parent.Value as YamlMapping)?.Entries.First(e => e.KeyText == remove.Entry.Last);
                if (entry is null)
                {
                    return "entry disappeared";
                }

                var firstLine = TextLines.LineNumber(text, entry.Key.Start);
                var lastLine = TextLines.LineNumber(text, Math.Max(Math.Max(entry.Key.End, YamlExtents.ContentEnd(entry.Value)) - 1, entry.Key.Start));
                return diff.OriginalCount == lastLine - firstLine + 1 && diff.NewCount == 0
                    ? null
                    : $"expected to remove lines {firstLine}..{lastLine}, diff was -{diff.OriginalCount}/+{diff.NewCount}";
            default:
                return null;
        }
    }
}
