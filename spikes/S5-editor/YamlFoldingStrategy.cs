using ICSharpCode.AvalonEdit.Document;
using ICSharpCode.AvalonEdit.Folding;

namespace Nautix.Spikes.S5;

/// <summary>Indentation-based folding: a line that is followed by deeper-indented lines folds those lines.</summary>
internal static class YamlFoldingStrategy
{
    public static void Update(FoldingManager manager, TextDocument document)
    {
        ArgumentNullException.ThrowIfNull(manager);
        ArgumentNullException.ThrowIfNull(document);
        manager.UpdateFoldings(Compute(document), -1);
    }

    public static IReadOnlyList<NewFolding> Compute(TextDocument document)
    {
        ArgumentNullException.ThrowIfNull(document);
        var lines = Enumerable.Range(1, document.LineCount).Select(document.GetLineByNumber).ToList();
        var indents = lines.Select(l => IsContent(document, l) ? Indent(document, l) : -1).ToArray();
        var foldings = new List<NewFolding>();

        for (var i = 0; i < lines.Count; i++)
        {
            if (indents[i] < 0)
            {
                continue;
            }

            var last = -1;
            for (var j = i + 1; j < lines.Count; j++)
            {
                if (indents[j] < 0)
                {
                    continue;
                }

                if (indents[j] <= indents[i])
                {
                    break;
                }

                last = j;
            }

            if (last > i)
            {
                foldings.Add(new NewFolding(lines[i].EndOffset, lines[last].EndOffset) { Name = "…" });
            }
        }

        return [.. foldings.OrderBy(f => f.StartOffset)];
    }

    private static bool IsContent(TextDocument document, DocumentLine line)
    {
        var text = document.GetText(line).AsSpan().TrimStart();
        return text.Length > 0 && text[0] != '#';
    }

    private static int Indent(TextDocument document, DocumentLine line)
    {
        var text = document.GetText(line);
        return text.Length - text.TrimStart().Length;
    }
}
