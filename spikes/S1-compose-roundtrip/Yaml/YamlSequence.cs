using System.Collections.Immutable;

namespace Nautix.Spikes.S1.Yaml;

internal sealed record YamlSequence(int Start, int End, string? Anchor, bool IsFlow, ImmutableArray<YamlNode> Items)
    : YamlNode(Start, End);
