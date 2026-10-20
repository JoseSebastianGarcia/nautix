using System.Collections.Immutable;

namespace Nautix.Spikes.S1.Yaml;

internal sealed record YamlMapping(int Start, int End, string? Anchor, bool IsFlow, ImmutableArray<YamlMappingEntry> Entries)
    : YamlNode(Start, End);
