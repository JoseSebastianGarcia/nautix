using Nautix.Spikes.S1.Yaml;

namespace Nautix.Spikes.S1.Verification;

/// <summary>Checks that every node span points at the text it claims to describe (catches off-by-one marks).</summary>
internal static class MarkFidelity
{
    public static IReadOnlyList<string> Check(YamlSyntaxTree tree)
    {
        ArgumentNullException.ThrowIfNull(tree);
        var violations = new List<string>();
        foreach (var document in tree.Documents)
        {
            if (document.Root is not null)
            {
                Visit(document.Root, tree.Text, violations);
            }
        }

        return violations;
    }

    private static void Visit(YamlNode node, string text, List<string> violations)
    {
        if (node.Start < 0 || node.End > text.Length || node.End < node.Start)
        {
            violations.Add($"{Describe(node)} span [{node.Start},{node.End}) outside text of length {text.Length}");
            return;
        }

        var span = text.AsSpan(node.Start, node.End - node.Start);
        switch (node)
        {
            case YamlScalar { IsEmpty: true }:
                break;
            case YamlScalar { Style: YamlScalarStyle.SingleQuoted } when span is not ['\'', .., '\'']:
            case YamlScalar { Style: YamlScalarStyle.DoubleQuoted } when span is not ['"', .., '"']:
                violations.Add($"{Describe(node)} quoted scalar span is not delimited: {Preview(span)}");
                break;
            case YamlScalar { Style: YamlScalarStyle.Literal } when span is not ['|', ..]:
            case YamlScalar { Style: YamlScalarStyle.Folded } when span is not ['>', ..]:
                violations.Add($"{Describe(node)} block scalar span does not start at its header: {Preview(span)}");
                break;
            case YamlScalar { Style: YamlScalarStyle.Plain } plain when !span.Contains('\n') && !span.SequenceEqual(plain.Value):
                violations.Add($"{Describe(node)} plain scalar span '{Preview(span)}' != value '{plain.Value}'");
                break;
            case YamlAlias when span is not ['*', ..]:
                violations.Add($"{Describe(node)} alias span does not start with '*': {Preview(span)}");
                break;
            case YamlMapping { IsFlow: true } when span is not ['{', .., '}']:
            case YamlSequence { IsFlow: true } when span is not ['[', .., ']']:
                violations.Add($"{Describe(node)} flow collection span is not delimited: {Preview(span)}");
                break;
            default:
                break;
        }

        switch (node)
        {
            case YamlMapping mapping:
                foreach (var entry in mapping.Entries)
                {
                    Visit(entry.Key, text, violations);
                    Visit(entry.Value, text, violations);
                }

                break;
            case YamlSequence sequence:
                foreach (var item in sequence.Items)
                {
                    Visit(item, text, violations);
                }

                break;
            default:
                break;
        }
    }

    private static string Describe(YamlNode node) => $"{node.GetType().Name}@{node.Start}";

    private static string Preview(ReadOnlySpan<char> span) =>
        (span.Length > 40 ? span[..40].ToString() + "…" : span.ToString()).Replace("\n", "\\n", StringComparison.Ordinal).Replace("\r", "\\r", StringComparison.Ordinal);
}
