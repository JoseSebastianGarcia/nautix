using Nautix.Spikes.S1.Editing;
using Nautix.Spikes.S1.Yaml;

namespace Nautix.Spikes.S1.Verification;

/// <summary>Deterministically picks edit sites (first, middle, last candidate per kind) so runs are reproducible.</summary>
internal static class EditSiteFinder
{
    public const string SetScalarKind = "set-scalar";
    public const string AddKeyKind = "add-key";
    public const string AppendItemKind = "append-item";
    public const string RemoveKeyKind = "remove-key";
    public const string NewValue = "nautix-edited";
    public const string NewKey = "x-nautix-s1";

    public static IReadOnlyList<EditSite> Find(YamlSyntaxTree tree)
    {
        ArgumentNullException.ThrowIfNull(tree);
        var scalars = new List<EditSite>();
        var mappings = new List<EditSite>();
        var sequences = new List<EditSite>();
        var removals = new List<EditSite>();

        if (tree.Root is not null)
        {
            Walk(tree.Root, YamlPath.Root, tree.Text, scalars, mappings, sequences, removals);
        }

        return [.. Spread(scalars), .. Spread(mappings), .. Spread(sequences), .. Spread(removals)];
    }

    private static IEnumerable<EditSite> Spread(List<EditSite> candidates)
    {
        if (candidates.Count == 0)
        {
            return [];
        }

        return new[] { 0, candidates.Count / 2, candidates.Count - 1 }.Distinct().Select(i => candidates[i]);
    }

    private static void Walk(
        YamlNode node,
        YamlPath path,
        string text,
        List<EditSite> scalars,
        List<EditSite> mappings,
        List<EditSite> sequences,
        List<EditSite> removals)
    {
        switch (node)
        {
            case YamlMapping mapping:
                if (!mapping.IsFlow && mapping.Entries.Length > 0 && mapping.Entries.All(e => e.KeyText != NewKey))
                {
                    mappings.Add(new EditSite(AddKeyKind, path, new AddKey(path, NewKey, NewValue)));
                }

                var seenKeys = new HashSet<string>(StringComparer.Ordinal);
                foreach (var entry in mapping.Entries)
                {
                    if (entry.KeyText is not { } key || !seenKeys.Add(key))
                    {
                        continue;
                    }

                    var child = path.Key(key);
                    if (entry.Value is YamlScalar { IsEmpty: false, Style: not (YamlScalarStyle.Literal or YamlScalarStyle.Folded) } scalar
                        && !text.AsSpan(scalar.Start, scalar.End - scalar.Start).Contains('\n'))
                    {
                        scalars.Add(new EditSite(SetScalarKind, child, new SetScalar(child, NewValue)));
                    }

                    Walk(entry.Value, child, text, scalars, mappings, sequences, removals);
                }

                if (!mapping.IsFlow && mapping.Entries.Length >= 2 && mapping.Entries[^1].KeyText is { } last
                    && mapping.Entries.Count(e => e.KeyText == last) == 1)
                {
                    removals.Add(new EditSite(RemoveKeyKind, path.Key(last), new RemoveKey(path.Key(last))));
                }

                break;
            case YamlSequence sequence:
                if (!sequence.IsFlow && sequence.Items.Length > 0)
                {
                    sequences.Add(new EditSite(AppendItemKind, path, new AppendItem(path, NewValue)));
                }

                for (var i = 0; i < sequence.Items.Length; i++)
                {
                    var child = path.At(i);
                    if (sequence.Items[i] is YamlScalar { IsEmpty: false, Style: not (YamlScalarStyle.Literal or YamlScalarStyle.Folded) } item
                        && !text.AsSpan(item.Start, item.End - item.Start).Contains('\n'))
                    {
                        scalars.Add(new EditSite(SetScalarKind, child, new SetScalar(child, NewValue)));
                    }

                    Walk(sequence.Items[i], child, text, scalars, mappings, sequences, removals);
                }

                break;
            default:
                break;
        }
    }
}
