namespace Nautix.Spikes.S1.Yaml;

/// <summary>Line arithmetic over raw text. A line includes its terminator; '\r' is just a character before '\n'.</summary>
internal static class TextLines
{
    /// <summary>Start of the line holding <paramref name="index"/>. A leading BOM is zero-width: the first line starts after it.</summary>
    public static int LineStart(string text, int index)
    {
        var i = Math.Min(index, text.Length);
        var start = i == 0 ? 0 : text.LastIndexOf('\n', i - 1) + 1;
        return start == 0 && text.Length > 0 && text[0] == '\uFEFF' ? 1 : start;
    }

    public static int NextLineStart(string text, int index)
    {
        var newline = text.IndexOf('\n', Math.Min(index, text.Length));
        return newline < 0 ? text.Length : newline + 1;
    }

    /// <summary>Zero-based line number containing <paramref name="index"/>.</summary>
    public static int LineNumber(string text, int index)
    {
        var line = 0;
        for (var i = 0; i < Math.Min(index, text.Length); i++)
        {
            if (text[i] == '\n')
            {
                line++;
            }
        }

        return line;
    }

    /// <summary>The terminator of the line that ends just before <paramref name="nextLineStart"/>, else the file's first terminator, else LF.</summary>
    public static string TerminatorBefore(string text, int nextLineStart)
    {
        if (nextLineStart > 0 && nextLineStart <= text.Length && text[nextLineStart - 1] == '\n')
        {
            return nextLineStart >= 2 && text[nextLineStart - 2] == '\r' ? "\r\n" : "\n";
        }

        var first = text.IndexOf('\n', StringComparison.Ordinal);
        return first > 0 && text[first - 1] == '\r' ? "\r\n" : "\n";
    }
}
