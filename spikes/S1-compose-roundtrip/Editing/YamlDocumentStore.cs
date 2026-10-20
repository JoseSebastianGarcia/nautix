using System.Collections.Immutable;
using Nautix.SharedKernel;
using Nautix.Spikes.S1.Yaml;

namespace Nautix.Spikes.S1.Editing;

/// <summary>
/// Position-aware, comment-preserving patches. Every edit is a single contiguous replacement; text outside it is
/// byte-identical by construction, so the open questions are whether the replacement is placed correctly.
/// </summary>
internal sealed class YamlDocumentStore : IYamlDocumentStore
{
    public Result<YamlSyntaxTree> Parse(string text) => YamlTreeParser.Parse(text);

    public string Apply(string text, TextPatch patch) => patch.Apply(text);

    public Result<TextPatch> ToPatch(YamlSyntaxTree tree, ComposeEdit edit)
    {
        ArgumentNullException.ThrowIfNull(tree);
        ArgumentNullException.ThrowIfNull(edit);
        return edit switch
        {
            NoOp => Result.Success(TextPatch.None),
            SetScalar e => SetScalar(tree, e),
            AddKey e => AddKey(tree, e),
            RemoveKey e => RemoveKey(tree, e),
            AppendItem e => AppendItem(tree, e),
            _ => throw new ArgumentOutOfRangeException(nameof(edit), edit, "Unknown edit."),
        };
    }

    private static Result<TextPatch> SetScalar(YamlSyntaxTree tree, SetScalar edit) =>
        edit.Path.Resolve(tree).Bind(node =>
        {
            if (node is YamlAlias)
            {
                return Fail<TextPatch>("alias", "The value is an alias; edit the anchor or override the key.");
            }

            if (node is not YamlScalar scalar)
            {
                return Fail<TextPatch>("not_scalar", "The node is a collection.");
            }

            if (scalar.IsEmpty)
            {
                return Fail<TextPatch>("empty_value", "Null/empty values have no span to replace.");
            }

            if (scalar.Style is YamlScalarStyle.Literal or YamlScalarStyle.Folded)
            {
                return Fail<TextPatch>("block_scalar", "Block scalars are not edited in S1.");
            }

            if (tree.Text.AsSpan(scalar.Start, scalar.End - scalar.Start).Contains('\n'))
            {
                return Fail<TextPatch>("multiline_scalar", "Multi-line flow scalars are not edited in S1.");
            }

            return Result.Success(new TextPatch(scalar.Start, scalar.End - scalar.Start, YamlScalarFormatter.Format(edit.Value, scalar.Style)));
        });

    private static Result<TextPatch> AddKey(YamlSyntaxTree tree, AddKey edit) =>
        edit.Mapping.Resolve(tree).Bind(node =>
        {
            if (node is not YamlMapping mapping)
            {
                return Fail<TextPatch>("not_mapping", "Target is not a mapping.");
            }

            if (mapping.IsFlow)
            {
                return Fail<TextPatch>("flow_collection", "Adding to flow mappings is not implemented in S1.");
            }

            if (mapping.Entries.Length == 0)
            {
                return Fail<TextPatch>("empty_collection", "Empty mapping has no indentation to copy.");
            }

            if (mapping.Entries.Any(e => e.KeyText == edit.Key))
            {
                return Fail<TextPatch>("duplicate_key", "Key already exists.");
            }

            var indent = MarginIndent(tree.Text, mapping);
            if (indent is null)
            {
                return Fail<TextPatch>("no_standalone_key", "No entry starts its own line (explicit '? ' keys only), so the margin is unknown.");
            }

            var line = $"{new string(' ', indent.Value)}{YamlScalarFormatter.FormatKey(edit.Key)}: {YamlScalarFormatter.Format(edit.Value, YamlScalarStyle.Plain)}";
            return Result.Success(InsertLineAfter(tree.Text, YamlExtents.ContentEnd(mapping), line));
        });

    private static Result<TextPatch> AppendItem(YamlSyntaxTree tree, AppendItem edit) =>
        edit.Sequence.Resolve(tree).Bind(node =>
        {
            if (node is not YamlSequence sequence)
            {
                return Fail<TextPatch>("not_sequence", "Target is not a sequence.");
            }

            if (sequence.IsFlow)
            {
                return Fail<TextPatch>("flow_collection", "Appending to flow sequences is not implemented in S1.");
            }

            if (sequence.Items.Length == 0)
            {
                return Fail<TextPatch>("empty_collection", "Empty sequence has no indentation to copy.");
            }

            var dash = DashBefore(tree.Text, sequence.Items[0].Start);
            if (dash < 0)
            {
                return Fail<TextPatch>("dash_not_found", "Could not locate the '-' indicator of the first item.");
            }

            var line = $"{Indent(tree.Text, dash)}- {YamlScalarFormatter.Format(edit.Value, YamlScalarStyle.Plain)}";
            return Result.Success(InsertLineAfter(tree.Text, YamlExtents.ContentEnd(sequence), line));
        });

    private static Result<TextPatch> RemoveKey(YamlSyntaxTree tree, RemoveKey edit)
    {
        if (edit.Entry.Segments.IsDefaultOrEmpty)
        {
            return Fail<TextPatch>("root", "Cannot remove the document root.");
        }

        return edit.Entry.Parent.Resolve(tree).Bind(node =>
        {
            if (node is not YamlMapping mapping)
            {
                return Fail<TextPatch>("not_mapping", "Parent is not a mapping.");
            }

            if (mapping.IsFlow)
            {
                return Fail<TextPatch>("flow_collection", "Removing from flow mappings is not implemented in S1.");
            }

            var entry = mapping.Entries.FirstOrDefault(e => e.KeyText == edit.Entry.Last);
            if (entry is null)
            {
                return Result.Failure<TextPatch>(EditErrors.PathNotFound(edit.Entry));
            }

            if (mapping.Entries.Length < 2)
            {
                return Fail<TextPatch>("only_entry", "Removing the only entry would turn the mapping into null.");
            }

            var lineStart = TextLines.LineStart(tree.Text, entry.Key.Start);
            if (!string.IsNullOrWhiteSpace(tree.Text[lineStart..entry.Key.Start]))
            {
                return Fail<TextPatch>("shares_line", "The key shares its line with a sequence dash or another token.");
            }

            var contentEnd = Math.Max(entry.Key.End, YamlExtents.ContentEnd(entry.Value));
            var end = TextLines.NextLineStart(tree.Text, Math.Max(contentEnd - 1, entry.Key.Start));

            // Removing the last lines of a file that has no final newline must not introduce one:
            // take the previous line's terminator instead, so the file keeps ending on content.
            if (end == tree.Text.Length && tree.Text[^1] != '\n' && lineStart > TextLines.LineStart(tree.Text, 0))
            {
                lineStart -= lineStart >= 2 && tree.Text[lineStart - 2] == '\r' ? 2 : 1;
            }

            return Result.Success(new TextPatch(lineStart, end - lineStart, string.Empty));
        });
    }

    /// <summary>Insert a full line after the line holding the last content character, matching that line's terminator.</summary>
    private static TextPatch InsertLineAfter(string text, int contentEnd, string line)
    {
        var insertAt = TextLines.NextLineStart(text, Math.Max(contentEnd - 1, 0));
        var terminator = TextLines.TerminatorBefore(text, insertAt);
        var endsWithNewline = insertAt > 0 && text[insertAt - 1] == '\n';

        // Last line without a terminator: add one before the new line and keep the file's "no final newline" shape.
        return endsWithNewline
            ? new TextPatch(insertAt, 0, line + terminator)
            : new TextPatch(insertAt, 0, terminator + line);
    }

    /// <summary>
    /// Margin of a block mapping: the column of the last entry whose key starts its own line, where only spaces and
    /// "- " indicators precede it (they become spaces). Explicit "? " keys do not qualify.
    /// </summary>
    private static int? MarginIndent(string text, YamlMapping mapping)
    {
        foreach (var entry in mapping.Entries.Reverse())
        {
            var lineStart = TextLines.LineStart(text, entry.Key.Start);
            var prefix = text.AsSpan(lineStart, entry.Key.Start - lineStart);
            if (prefix.IndexOfAnyExcept(' ', '-') < 0)
            {
                return prefix.Length;
            }
        }

        return null;
    }

    /// <summary>Spaces that align with <paramref name="index"/>; a preceding "- " on the same line becomes spaces.</summary>
    private static string Indent(string text, int index) => new(' ', index - TextLines.LineStart(text, index));

    private static int DashBefore(string text, int index)
    {
        var i = index - 1;
        while (i >= 0 && (text[i] == ' ' || text[i] == '\t'))
        {
            i--;
        }

        return i >= 0 && text[i] == '-' ? i : -1;
    }

    private static Result<T> Fail<T>(string reason, string message) =>
        Result.Failure<T>(EditErrors.NotApplicable(reason, message));
}
