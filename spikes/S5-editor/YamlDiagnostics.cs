using System.Collections.Immutable;
using System.Text.RegularExpressions;
using YamlDotNet.Core;

namespace Nautix.Spikes.S5;

/// <summary>Cheap diagnostics for the spike: YAML syntax errors (YamlDotNet) and floating image tags.</summary>
internal static partial class YamlDiagnostics
{
    public static ImmutableArray<EditorDiagnostic> Analyze(string text)
    {
        var syntax = SyntaxError(text);
        return syntax is null ? FloatingImageTags(text) : [syntax];
    }

    private static EditorDiagnostic? SyntaxError(string text)
    {
        try
        {
            var parser = new Parser(new StringReader(text));
            while (parser.MoveNext())
            {
            }

            return null;
        }
        catch (YamlException ex)
        {
            var offset = OffsetOf(text, (int)ex.Start.Line, (int)ex.Start.Column);
            var lineEnd = text.IndexOf('\n', offset);
            var length = Math.Max(1, (lineEnd < 0 ? text.Length : lineEnd) - offset);
            return new EditorDiagnostic("NX-YAML001", DiagnosticSeverity.Error, offset, length, ex.Message);
        }
    }

    private static ImmutableArray<EditorDiagnostic> FloatingImageTags(string text)
    {
        var result = ImmutableArray.CreateBuilder<EditorDiagnostic>();
        foreach (Match match in ImageValue().Matches(text))
        {
            var value = match.Groups["value"];
            var reference = value.Value;
            var lastSegment = reference[(reference.LastIndexOf('/') + 1)..];
            var hasTag = lastSegment.Contains(':', StringComparison.Ordinal) || reference.Contains('@', StringComparison.Ordinal);
            if (!hasTag || reference.EndsWith(":latest", StringComparison.Ordinal))
            {
                result.Add(new EditorDiagnostic("NX-IMG001", DiagnosticSeverity.Warning, value.Index, value.Length, "Image uses the floating 'latest' tag; pin a version."));
            }
        }

        return result.ToImmutable();
    }

    /// <summary>1-based line/column (YamlDotNet marks) to a document offset.</summary>
    private static int OffsetOf(string text, int line, int column)
    {
        var offset = 0;
        for (var current = 1; current < line; current++)
        {
            var next = text.IndexOf('\n', offset);
            if (next < 0)
            {
                return text.Length;
            }

            offset = next + 1;
        }

        return Math.Min(text.Length, offset + Math.Max(0, column - 1));
    }

    [GeneratedRegex(@"^\s*image:\s*(?<value>[^\s#]+)", RegexOptions.Multiline, matchTimeoutMilliseconds: 1000)]
    private static partial Regex ImageValue();
}
