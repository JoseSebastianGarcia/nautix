using System.Collections.Immutable;
using Nautix.SharedKernel;
using Nautix.Spikes.S1.Yaml;

namespace Nautix.Spikes.S1.Editing;

/// <summary>Address of a node: mapping keys as-is, sequence positions as <c>[n]</c>.</summary>
internal sealed record YamlPath(ImmutableArray<string> Segments)
{
    public static YamlPath Root { get; } = new([]);

    public string Last => Segments[^1];

    public YamlPath Parent => new(Segments.RemoveAt(Segments.Length - 1));

    public YamlPath Key(string key) => new(Segments.Add(key));

    public YamlPath At(int index) => new(Segments.Add($"[{index}]"));

    public override string ToString() => Segments.Length == 0 ? "/" : "/" + string.Join('/', Segments);

    public Result<YamlNode> Resolve(YamlSyntaxTree tree)
    {
        ArgumentNullException.ThrowIfNull(tree);
        var current = tree.Root;
        foreach (var segment in Segments)
        {
            current = Step(current, segment);
            if (current is null)
            {
                return Result.Failure<YamlNode>(EditErrors.PathNotFound(this));
            }
        }

        return current is null ? Result.Failure<YamlNode>(EditErrors.PathNotFound(this)) : Result.Success(current);
    }

    private static YamlNode? Step(YamlNode? node, string segment) => node switch
    {
        YamlMapping mapping => mapping.Entries.FirstOrDefault(e => e.KeyText == segment)?.Value,
        YamlSequence sequence when segment.StartsWith('[') && int.TryParse(segment.AsSpan(1, segment.Length - 2), out var i)
            && i >= 0 && i < sequence.Items.Length => sequence.Items[i],
        _ => null,
    };
}
