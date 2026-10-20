using System.Collections.Immutable;

namespace Nautix.Spikes.S1.Yaml;

/// <summary>Positions-only syntax tree. It never re-serializes: text outside patched ranges is never touched.</summary>
internal sealed record YamlSyntaxTree(string Text, bool HasBom, ImmutableArray<YamlDocument> Documents)
{
    public YamlNode? Root => Documents.IsDefaultOrEmpty ? null : Documents[0].Root;
}
